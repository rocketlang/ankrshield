// HanumanG — Attestation issuance routes
// @rule:HNG-S-005 — attestation = witnessed, signed summary of 7-axis posture over a period
// @rule:HNG-S-015 — attestation maps to NIST MS-3, EU AI Act Art. 14, ISO 42001 controls
// @rule:HNG-P2-001 — attestations notarized via Evidence Notary (Ed25519), best-effort (FP-010)
// @rule:HNG-P2-002 — attestations independently verifiable via /verify + notary pubkey
// @rule:CA-001 — large attestation bundles > 50KB return overflow_granthx_ref
// @rule:CA-004 — _meta on all responses

import type { FastifyInstance } from 'fastify';

import { computePostureScore } from '../axes/scorer.js';
import type { Axis } from '../axes/scorer.js';
import { isRevoked } from '../core/containment.js';
import {
  issueAttestation,
  getAttestation,
  getNotarization,
  listAttestations,
  getAxisHistory,
  saveNotarization,
} from '../core/db.js';
import type { Attestation } from '../core/db.js';
import { canonical, notarizePack, notaryBase, verifyPack } from '../core/notary.js';

const GRANTHX_URL = process.env['GRANTHX_URL'] ?? 'http://localhost:4130';
const OVERFLOW_THRESHOLD_BYTES = 50 * 1024;

const FRAMEWORK_MAPPINGS: Record<string, Record<string, string>> = {
  mudrika_integrity: { NIST_MS3: 'MS-3.1', EU_AI_Act: 'Art.14(1)', ISO_42001: '6.1.2' },
  identity_broadcast: { NIST_MS3: 'MS-3.2', EU_AI_Act: 'Art.13(1)', ISO_42001: '8.3' },
  mandate_bounds: { NIST_MS3: 'MS-3.3', EU_AI_Act: 'Art.14(4)', ISO_42001: '6.1.3' },
  proportional_force: { NIST_MS3: 'MS-3.4', EU_AI_Act: 'Art.14(5)', ISO_42001: '8.4' },
  return_with_proof: { NIST_MS3: 'MS-3.5', EU_AI_Act: 'Art.12(1)', ISO_42001: '9.1' },
  no_overreach: { NIST_MS3: 'MS-3.6', EU_AI_Act: 'Art.14(4)', ISO_42001: '6.1.3' },
  truthful_report: { NIST_MS3: 'MS-3.7', EU_AI_Act: 'Art.12(2)', ISO_42001: '9.2' },
};

// @rule:HNG-P2-001 — the notarized pack is canonical({schema, attestation}): the
// immutable attestation row IS the signed fact (axis_scores/frameworks ride inside it),
// so the pack is rebuildable byte-identically from the row for late notarization.
function buildNotaryPack(att: Attestation): string {
  return canonical({ schema: 'hanumang-attestation-v1', attestation: att });
}

async function notarizeAttestation(att: Attestation) {
  const pack = buildNotaryPack(att);
  const cert = await notarizePack(pack, {
    attestation_id: att.id,
    service: 'xshieldai-hanumang',
    type: 'hanumang-attestation',
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
  // Issue an attestation for an agent over a period
  app.post<{
    Body: {
      agent_id: string;
      customer_id: string;
      period_start: string;
      period_end: string;
      frameworks?: string[];
      signed_by?: string;
    };
  }>('/api/v1/hanumang/attestation/issue', async (req, reply) => {
    const t0 = Date.now();
    const { agent_id, customer_id, period_start, period_end, frameworks, signed_by } = req.body;
    if (!agent_id || !customer_id || !period_start || !period_end) {
      return reply
        .status(400)
        .send({ error: 'agent_id, customer_id, period_start, period_end required' });
    }
    // @rule:HNG — a Shatru-revoked agent cannot be attested: its delegation identity is gone.
    if (isRevoked(agent_id)) {
      return reply.status(409).send({
        attested: false,
        revoked: true,
        agent_id,
        reason: 'delegation revoked (Shatru capability-kill) — no attestation can be issued',
      });
    }

    // Compute posture from observations in the period
    const history = getAxisHistory(agent_id, undefined, 500);
    const inPeriod = history.filter(
      (o) => o.observed_at >= period_start && o.observed_at <= period_end
    );

    if (!inPeriod.length) {
      return reply.status(422).send({ error: 'no observations found in the specified period' });
    }

    // Latest per axis within period
    const latestPerAxis = new Map<string, (typeof inPeriod)[0]>();
    for (const obs of inPeriod) {
      if (!latestPerAxis.has(obs.axis)) latestPerAxis.set(obs.axis, obs);
    }

    const axisScores = Array.from(latestPerAxis.values()).map((obs) => ({
      axis: obs.axis as Axis,
      score: obs.score,
      outcome: obs.outcome as 'PASS' | 'WARN' | 'FAIL',
      rule_id: obs.rule_id,
      notes: [],
    }));

    const posture = computePostureScore(axisScores);

    // Build framework evidence
    const frameworkCoverage: Record<string, unknown> = {};
    if (frameworks?.length) {
      for (const fw of frameworks) {
        frameworkCoverage[fw] = Object.fromEntries(
          axisScores.map((a) => [a.axis, FRAMEWORK_MAPPINGS[a.axis]?.[fw] ?? 'N/A'])
        );
      }
    }

    const att = issueAttestation({
      agent_id,
      customer_id,
      period_start,
      period_end,
      overall_grade: posture.overall_grade,
      overall_score: posture.overall_score,
      axis_scores: JSON.stringify(
        Object.fromEntries(axisScores.map((a) => [a.axis, { score: a.score, outcome: a.outcome }]))
      ),
      violation_count: posture.violation_count,
      frameworks: frameworks ? JSON.stringify(frameworkCoverage) : null,
      signed_by: signed_by ?? 'hanumang-auto',
    });

    // @rule:HNG-P2-001 — notarize best-effort; issuance is the floor (FP-010).
    // Failure is loud (_meta.notarized:false + notary_error), never a 5xx.
    const notarization = await notarizeAttestation(att);

    const bundle = {
      schema: 'hanumang-attestation-v1',
      attestation: att,
      posture,
      framework_coverage: frameworkCoverage,
      observation_count: inPeriod.length,
      axes_covered: axisScores.length,
      notarization,
    };

    const notaryMeta = notarization.notarized
      ? { notarized: true }
      : { notarized: false, notary_error: notarization.notary_error };

    // @rule:CA-001 — overflow escape for large bundles
    const approxBytes = JSON.stringify(bundle).length;
    if (approxBytes > OVERFLOW_THRESHOLD_BYTES) {
      const ref = `${GRANTHX_URL}/api/docs/ref/hanumang-attestation-${att.id}-${Date.now()}`;
      return reply.status(201).send({
        overflow_granthx_ref: ref,
        attestation_id: att.id,
        overall_grade: att.overall_grade,
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

  // POST /api/v1/hanumang/attestation/:id/notarize — late notarization (notary-down recovery)
  // @rule:HNG-P2-001 — insert-once; 409 if already notarized
  app.post<{ Params: { id: string } }>(
    '/api/v1/hanumang/attestation/:id/notarize',
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

  // GET /api/v1/hanumang/attestation/:id/verify — cryptographic re-verification
  // @rule:HNG-P2-002 — compute/quote/null: verdict null when notary unreachable or
  // never notarized; verify_independently lets a third party check without trusting us.
  app.get<{ Params: { id: string } }>(
    '/api/v1/hanumang/attestation/:id/verify',
    async (req, reply) => {
      const t0 = Date.now();
      const att = getAttestation(req.params.id);
      if (!att) return reply.status(404).send({ error: 'attestation not found' });

      const n = getNotarization(att.id);
      if (!n) {
        return {
          attestation_id: att.id,
          verdict: null,
          reasons: ['never notarized'],
          retry: `POST /api/v1/hanumang/attestation/${att.id}/notarize`,
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
    }
  );

  // Get a specific attestation
  app.get<{ Params: { id: string } }>('/api/v1/hanumang/attestation/:id', async (req, reply) => {
    const t0 = Date.now();
    const att = getAttestation(req.params.id);
    if (!att) return reply.status(404).send({ error: 'attestation not found' });
    return {
      attestation: att,
      // @rule:HNG-P2-002 — the fingerprint always rides with the attestation
      notarization: notarizationSummary(att.id),
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });

  // List attestations for an agent
  app.get<{
    Params: { agent_id: string };
    Querystring: { customer_id: string };
  }>('/api/v1/hanumang/attestation/agent/:agent_id', async (req, reply) => {
    const t0 = Date.now();
    const { customer_id } = req.query;
    if (!customer_id) return reply.status(400).send({ error: 'customer_id required' });
    const attestations = listAttestations(req.params.agent_id);
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
