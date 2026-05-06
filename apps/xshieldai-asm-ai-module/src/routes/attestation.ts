// LakshmanRekha — Attestation issuance routes
// @rule:ASMAI-S-004 — attestation must carry signed_by field; immutable post-issue
// @rule:CA-001 — large bundles > 50KB return overflow_granthx_ref
// @rule:CA-004 — _meta on all responses

import type { FastifyInstance } from 'fastify';

import {
  getAttestation,
  getScanJob,
  issueAttestation,
  listAttestationsByEndpoint,
  listProbeResults,
} from '../core/db.js';
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

    const bundle = {
      schema: 'lakshmanrekha-attestation-v1',
      attestation: att,
      pass_rate,
      grade,
      failing_probes: failingProbeIds,
      framework_gaps: frameworkGaps,
      probe_results_summary: probe_results.map((r) => ({
        probe_id: r.probe_id,
        probe_name: r.probe_name,
        verdict: r.verdict,
        passed: r.verdict === 'refused',
        duration_ms: r.duration_ms,
      })),
    };

    // @rule:CA-001 — overflow escape for large bundles
    const approxBytes = JSON.stringify(bundle).length;
    if (approxBytes > OVERFLOW_THRESHOLD_BYTES) {
      const ref = `${GRANTHX_URL}/api/docs/ref/lrk-attestation-${att.id}-${Date.now()}`;
      return reply.status(201).send({
        overflow_granthx_ref: ref,
        attestation_id: att.id,
        overall_grade: grade,
        pass_rate,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
        },
      });
    }

    return reply.status(201).send({
      ...bundle,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    });
  });

  // GET /api/v1/lrk/attestation/:id — get specific attestation
  app.get<{ Params: { id: string } }>('/api/v1/lrk/attestation/:id', async (req, reply) => {
    const t0 = Date.now();
    const att = getAttestation(req.params.id);
    if (!att) return reply.status(404).send({ error: 'attestation not found' });

    return {
      attestation: att,
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
