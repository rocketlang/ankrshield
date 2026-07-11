// LakshmanRekha — Scan routes
// @rule:ASMAI-S-006 — ownership must be verified before scan execution
// @rule:ASMAI-S-007 — ROE (Rules of Engagement) must be signed before scan
// @rule:CA-004 — _meta on all responses

import type { FastifyInstance } from 'fastify';

import {
  createScanJob,
  getEndpoint,
  getScanJob,
  listEndpoints,
  listProbeResults,
  listScanJobs,
  recordProbeResult,
  registerEndpoint,
  updateScanJob,
} from '../core/db.js';
import { getProbes } from '../probes/registry.js';
import { runProbe } from '../probes/runner.js';

export async function scanRoutes(app: FastifyInstance) {
  // POST /api/v1/lrk/endpoints — register an LLM endpoint for scanning
  app.post<{
    Body: {
      customer_id: string;
      endpoint_label: string;
      endpoint_url: string;
      api_type: 'openai' | 'anthropic' | 'azure' | 'ankr_proxy';
      ownership_verified: boolean;
      roe_signed: boolean;
    };
  }>('/api/v1/lrk/endpoints', async (req, reply) => {
    const t0 = Date.now();
    const { customer_id, endpoint_label, endpoint_url, api_type, ownership_verified, roe_signed } =
      req.body;

    if (!customer_id || !endpoint_label || !endpoint_url || !api_type) {
      return reply.status(400).send({
        error: 'customer_id, endpoint_label, endpoint_url, api_type are required',
      });
    }

    const validTypes = ['openai', 'anthropic', 'azure', 'ankr_proxy'];
    if (!validTypes.includes(api_type)) {
      return reply.status(400).send({ error: `api_type must be one of: ${validTypes.join(', ')}` });
    }

    // @rule:ASMAI-P2-003 — asserted ownership is never honored (founder ruling 2026-07-11)
    const endpoint = registerEndpoint({
      customer_id,
      endpoint_url,
      endpoint_label,
      api_type,
      roe_signed: roe_signed ?? false,
    });

    return reply.status(201).send({
      endpoint,
      ...(ownership_verified !== undefined && {
        note: 'ownership_verified is ignored — prove control via the ownership challenge',
        challenge: `POST /api/v1/lrk/endpoints/${endpoint.id}/ownership/challenge`,
      }),
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    });
  });

  // GET /api/v1/lrk/endpoints — list endpoints for a customer
  app.get<{ Querystring: { customer_id: string } }>('/api/v1/lrk/endpoints', async (req, reply) => {
    const t0 = Date.now();
    const { customer_id } = req.query;
    if (!customer_id) return reply.status(400).send({ error: 'customer_id required' });

    const endpoints = listEndpoints(customer_id);
    return {
      endpoints,
      count: endpoints.length,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });

  // POST /api/v1/lrk/scan/start — start a probe scan against an endpoint
  app.post<{
    Body: {
      customer_id: string;
      endpoint_id: string;
      api_key: string; // BYOK — used only within this scan window
      endpoint_url?: string; // optional override; defaults to http://localhost:4444 for ankr_proxy type
      probe_ids?: string[];
      frameworks?: string[];
    };
  }>('/api/v1/lrk/scan/start', async (req, reply) => {
    const t0 = Date.now();
    const { customer_id, endpoint_id, api_key, endpoint_url: overrideUrl, probe_ids } = req.body;

    if (!customer_id || !endpoint_id || !api_key) {
      return reply.status(400).send({
        error: 'customer_id, endpoint_id, api_key required',
      });
    }

    // @rule:ASMAI-S-006 — ownership must be PROVEN (dns_txt / http_well_known / fleet_internal).
    // Founder ruling 2026-07-11: no legacy pass — pre-P2 asserted rows must re-verify.
    const endpoint = getEndpoint(endpoint_id);
    if (!endpoint) {
      return reply.status(404).send({ error: 'endpoint not found' });
    }
    if (!endpoint.ownership_verified || endpoint.ownership_method === 'legacy_asserted') {
      return reply.status(403).send({
        error:
          endpoint.ownership_method === 'legacy_asserted'
            ? 'Endpoint ownership was asserted, not proven. Re-verify via the ownership challenge before scanning.'
            : 'Endpoint ownership not proven. Prove control via the ownership challenge before scanning.',
        code: 'OWNERSHIP_NOT_PROVEN',
        rule: 'ASMAI-S-006',
        challenge: `POST /api/v1/lrk/endpoints/${endpoint_id}/ownership/challenge`,
      });
    }

    // @rule:ASMAI-S-007 — ROE check gate
    if (!endpoint.roe_signed) {
      return reply.status(403).send({
        error: 'Rules of Engagement not signed. Sign the ROE document before running a scan.',
        code: 'ROE_NOT_SIGNED',
        rule: 'ASMAI-S-007',
      });
    }

    if (endpoint.customer_id !== customer_id) {
      return reply.status(403).send({ error: 'endpoint does not belong to this customer' });
    }

    // Select probes to run
    const probes = getProbes(probe_ids && probe_ids.length > 0 ? probe_ids : undefined);
    if (probes.length === 0) {
      return reply.status(400).send({ error: 'no matching probes found' });
    }

    // Create scan job
    const job = createScanJob({
      customer_id,
      endpoint_id,
      probe_count: probes.length,
    });

    app.log.info(
      { scan_id: job.id, probe_count: probes.length, endpoint_id },
      'LakshmanRekha scan started'
    );

    // Run probes sequentially
    // @rule:ASMAI-S-005 — api_key used only within this scan loop; never stored
    let pass_count = 0;
    let fail_count = 0;
    const results = [];

    // Resolve the effective endpoint URL:
    // - ankr_proxy type defaults to local AI proxy
    // - caller may pass endpoint_url override in body (the original URL before hashing)
    // - In production: decrypt URL from encrypted store using customer key
    const effectiveUrl =
      overrideUrl ??
      (endpoint.api_type === 'ankr_proxy' ? 'http://localhost:4444' : 'http://localhost:4444');

    for (const probe of probes) {
      const result = await runProbe({
        probe,
        endpoint_url: effectiveUrl,
        api_key,
        api_type: endpoint.api_type,
        timeout_ms: 15000,
      });

      // Verdict: refused = pass (endpoint correctly blocked attack); everything else = fail
      const passed = result.verdict === 'refused';
      if (passed) pass_count++;
      else fail_count++;

      recordProbeResult({
        scan_job_id: job.id,
        probe_id: probe.id,
        probe_name: probe.name,
        verdict: result.verdict,
        response_snippet: result.response_snippet,
        duration_ms: result.duration_ms,
      });

      results.push({
        probe_id: probe.id,
        probe_name: probe.name,
        category: probe.category,
        severity: probe.severity,
        verdict: result.verdict,
        passed,
        duration_ms: result.duration_ms,
        error: result.error,
      });
    }

    // Finalise scan job
    const completedAt = new Date().toISOString();
    updateScanJob(job.id, {
      status: 'complete',
      pass_count,
      fail_count,
      completed_at: completedAt,
    });

    const pass_rate = Math.round((pass_count / probes.length) * 100);

    app.log.info(
      { scan_id: job.id, pass_count, fail_count, pass_rate },
      'LakshmanRekha scan completed'
    );

    return reply.status(200).send({
      scan_id: job.id,
      status: 'complete',
      endpoint_id,
      probe_count: probes.length,
      pass_count,
      fail_count,
      pass_rate,
      results,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    });
  });

  // GET /api/v1/lrk/scan/:id — get scan job status + results
  app.get<{ Params: { id: string } }>('/api/v1/lrk/scan/:id', async (req, reply) => {
    const t0 = Date.now();
    const job = getScanJob(req.params.id);
    if (!job) return reply.status(404).send({ error: 'scan job not found' });

    const probe_results = listProbeResults(job.id);

    return {
      job,
      probe_results,
      pass_rate: job.probe_count > 0 ? Math.round((job.pass_count / job.probe_count) * 100) : 0,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });

  // GET /api/v1/lrk/scans — list scan jobs for customer
  app.get<{ Querystring: { customer_id: string; limit?: string } }>(
    '/api/v1/lrk/scans',
    async (req, reply) => {
      const t0 = Date.now();
      const { customer_id, limit } = req.query;
      if (!customer_id) return reply.status(400).send({ error: 'customer_id required' });

      const jobs = listScanJobs(customer_id, limit ? parseInt(limit, 10) : 20);
      return {
        jobs,
        count: jobs.length,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
        },
      };
    }
  );
}
