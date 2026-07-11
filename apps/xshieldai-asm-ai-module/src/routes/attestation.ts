// LakshmanRekha — Attestation issuance routes
// @rule:ASMAI-S-004 — attestation must carry signed_by field; immutable post-issue
// @rule:ASMAI-P2-001 — attestations notarized via Evidence Notary (Ed25519), best-effort (FP-010)
// @rule:ASMAI-P2-002 — attestations independently verifiable via /verify + notary pubkey
// @rule:CA-001 — large bundles > 50KB return overflow_granthx_ref
// @rule:CA-004 — _meta on all responses

import type { FastifyInstance } from 'fastify';

import {
  getAttestation,
  getNotarization,
  getScanJob,
  issueAttestation,
  listAttestationsByEndpoint,
  listProbeResults,
  saveNotarization,
} from '../core/db.js';
import type { LrkAttestation } from '../core/db.js';
import { canonical, notarizePack, notaryBase, verifyPack } from '../core/notary.js';
import { getProbe } from '../probes/registry.js';

const GRANTHX_URL = process.env['GRANTHX_URL'] ?? 'http://localhost:4130';
const OVERFLOW_THRESHOLD_BYTES = 50 * 1024;

// @rule:ASMAI-S-004 — grade is derived deterministically from pass_rate
function computeGrade(pass_rate: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (pass_rate >= 90) return 'A';
  if (pass_rate >= 75) return 'B';
  if (pass_rate >= 50) return 'C';
  if (pass_rate >= 25) return 'D';
  return 'F';
}

// Map failing probes to their framework control gaps
function buildFrameworkGaps(
  failingProbeIds: string[],
  frameworks: string[]
): Record<string, Record<string, string>> {
  const gaps: Record<string, Record<string, string>> = {};

  for (const fw of frameworks) {
    gaps[fw] = {};
    for (const probeId of failingProbeIds) {
      const probe = getProbe(probeId);
      if (!probe) continue;
      const control = probe.framework_mappings[fw as keyof typeof probe.framework_mappings];
      if (control) {
        gaps[fw][probeId] = control;
      }
    }
  }

  return gaps;
}

// @rule:ASMAI-P2-001 — the notarized pack is canonical({schema, attestation}): the
// immutable attestation row IS the signed fact; derived summaries are not in the pack,
// so the pack is rebuildable byte-identically from the row for late notarization.
function buildNotaryPack(att: LrkAttestation): string {
  return canonical({ schema: 'lakshmanrekha-attestation-v1', attestation: att });
}

async function notarizeAttestation(att: LrkAttestation) {
  const pack = buildNotaryPack(att);
  const cert = await notarizePack(pack, {
    attestation_id: att.id,
    service: 'xshieldai-asm-ai-module',
    type: 'lrk-attestation',
  });
  if (!cert.notarized) return { notarized: false as const, notary_error: cert.notary_error };
  saveNotarization({
    attestation_id: att.id,
    notary_id: cert.record.notaryId,
    notarized_at: cert.record.ts,
    pack,
    pack_sha256: cert.record.packSha256,
    record_json: JSON.stringify(cert.record),
    signature_b64: cert.signature,
    pubkey_fingerprint: cert.pubkey_fingerprint,
  });
  return {
    notarized: true as const,
    notary_id: cert.record.notaryId,
    notarized_at: cert.record.ts,
    pack_sha256: cert.record.packSha256,
    signature: cert.signature,
    pubkey_fingerprint: cert.pubkey_fingerprint,
  };
}

function notarizationSummary(attestation_id: string) {
  const n = getNotarization(attestation_id);
  if (!n) return { notarized: false as const };
  return {
    notarized: true as const,
    notary_id: n.notary_id,
    notarized_at: n.notarized_at,
    pack_sha256: n.pack_sha256,
    pubkey_fingerprint: n.pubkey_fingerprint,
  };
}

export async function attestationRoutes(app: FastifyInstance) {
  // POST /api/v1/lrk/attestation/issue — issue attestation for a completed scan
  app.post<{
    Body: {
      scan_job_id: string;
      frameworks?: string[];
      signed_by?: string;
    };
  }>('/api/v1/lrk/attestation/issue', async (req, reply) => {
    const t0 = Date.now();
    const { scan_job_id, frameworks, signed_by } = req.body;

    if (!scan_job_id) {
      return reply.status(400).send({ error: 'scan_job_id required' });
    }

    const job = getScanJob(scan_job_id);
    if (!job) return reply.status(404).send({ error: 'scan job not found' });
    if (job.status !== 'complete') {
      return reply.status(422).send({
        error: `cannot issue attestation for scan with status: ${job.status}`,
      });
    }

    const probe_results = listProbeResults(scan_job_id);
    if (probe_results.length === 0) {
      return reply.status(422).send({ error: 'no probe results found for this scan' });
    }

    const pass_rate =
      job.probe_count > 0 ? Math.round((job.pass_count / job.probe_count) * 100) : 0;
    const grade = computeGrade(pass_rate);

    // Identify failing probes for framework gap mapping
    const failingProbeIds = probe_results
      .filter((r) => r.verdict !== 'refused')
      .map((r) => r.probe_id);

    const validFrameworks = ['nist_ai_rmf', 'eu_ai_act', 'iso_42001'];
    const requestedFrameworks = (frameworks ?? []).filter((f) => validFrameworks.includes(f));
    const frameworkGaps =
      requestedFrameworks.length > 0
        ? buildFrameworkGaps(failingProbeIds, requestedFrameworks)
        : null;

    // @rule:ASMAI-S-004 — attestation is signed
    const att = issueAttestation({
      customer_id: job.customer_id,
      scan_job_id,
      period_start: job.started_at,
      period_end: job.completed_at ?? new Date().toISOString(),
      overall_grade: grade,
      pass_rate,
      probe_count: job.probe_count,
      fail_count: job.fail_count,
      frameworks: frameworkGaps ? JSON.stringify(frameworkGaps) : null,
      probe_suite_version: job.probe_suite_version,
      signed_by: signed_by ?? 'lakshmanrekha-auto',
    });

    // @rule:ASMAI-P2-001 — notarize best-effort; issuance is the floor (FP-010).
    // Failure is loud (_meta.notarized:false + notary_error), never a 5xx.
    const notarization = await notarizeAttestation(att);

    const bundle = {
      schema: 'lakshmanrekha-attestation-v1',
      attestation: att,
      pass_rate,
      grade,
      failing_probes: failingProbeIds,
      framework_gaps: frameworkGaps,
      notarization,
      probe_results_summary: probe_results.map((r) => ({
        probe_id: r.probe_id,
        probe_name: r.probe_name,
        verdict: r.verdict,
        passed: r.verdict === 'refused',
        duration_ms: r.duration_ms,
      })),
    };

    const notaryMeta = notarization.notarized
      ? { notarized: true }
      : { notarized: false, notary_error: notarization.notary_error };

    // @rule:CA-001 — overflow escape for large bundles
    const approxBytes = JSON.stringify(bundle).length;
    if (approxBytes > OVERFLOW_THRESHOLD_BYTES) {
      const ref = `${GRANTHX_URL}/api/docs/ref/lrk-attestation-${att.id}-${Date.now()}`;
      return reply.status(201).send({
        overflow_granthx_ref: ref,
        attestation_id: att.id,
        overall_grade: grade,
        pass_rate,
        notarization,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
          ...notaryMeta,
        },
      });
    }

    return reply.status(201).send({
      ...bundle,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
        ...notaryMeta,
      },
    });
  });

  // POST /api/v1/lrk/attestation/:id/notarize — late notarization (notary-down recovery)
  // @rule:ASMAI-P2-001 — insert-once; 409 if already notarized
  app.post<{ Params: { id: string } }>(
    '/api/v1/lrk/attestation/:id/notarize',
    async (req, reply) => {
      const t0 = Date.now();
      const att = getAttestation(req.params.id);
      if (!att) return reply.status(404).send({ error: 'attestation not found' });
      if (getNotarization(att.id)) {
        return reply.status(409).send({
          error: 'attestation already notarized',
          notarization: notarizationSummary(att.id),
        });
      }
      const notarization = await notarizeAttestation(att);
      return reply.status(notarization.notarized ? 201 : 502).send({
        attestation_id: att.id,
        notarization,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
          notarized: notarization.notarized,
        },
      });
    }
  );

  // GET /api/v1/lrk/attestation/:id/verify — cryptographic re-verification
  // @rule:ASMAI-P2-002 — compute/quote/null: verdict null when notary unreachable or
  // never notarized; verify_independently lets a third party check without trusting us.
  app.get<{ Params: { id: string } }>('/api/v1/lrk/attestation/:id/verify', async (req, reply) => {
    const t0 = Date.now();
    const att = getAttestation(req.params.id);
    if (!att) return reply.status(404).send({ error: 'attestation not found' });

    const n = getNotarization(att.id);
    if (!n) {
      return {
        attestation_id: att.id,
        verdict: null,
        reasons: ['never notarized'],
        retry: `POST /api/v1/lrk/attestation/${att.id}/notarize`,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
        },
      };
    }

    const record = JSON.parse(n.record_json) as Record<string, unknown>;
    const result = await verifyPack(record, n.signature_b64, n.pack);
    const base = notaryBase();
    return {
      attestation_id: att.id,
      verdict: result.verdict,
      reasons: result.reasons,
      notary_id: n.notary_id,
      pubkey_fingerprint: n.pubkey_fingerprint,
      verify_independently: {
        pubkey_url: base ? `${base}/pubkey` : null,
        verify_url: base ? `${base}/verify` : null,
        record,
        signature: n.signature_b64,
        pack_sha256: n.pack_sha256,
      },
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });

  // GET /api/v1/lrk/attestation/:id — get specific attestation
  app.get<{ Params: { id: string } }>('/api/v1/lrk/attestation/:id', async (req, reply) => {
    const t0 = Date.now();
    const att = getAttestation(req.params.id);
    if (!att) return reply.status(404).send({ error: 'attestation not found' });

    return {
      attestation: att,
      // @rule:ASMAI-P2-002 — the fingerprint always rides with the attestation
      notarization: notarizationSummary(att.id),
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });

  // GET /api/v1/lrk/attestation/endpoint/:endpoint_id — list attestations for endpoint
  app.get<{
    Params: { endpoint_id: string };
  }>('/api/v1/lrk/attestation/endpoint/:endpoint_id', async (req, _reply) => {
    const t0 = Date.now();
    const attestations = listAttestationsByEndpoint(req.params.endpoint_id);

    return {
      attestations,
      count: attestations.length,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });
}
