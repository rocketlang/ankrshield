// HanumanG — Observation + scoring routes
// @rule:HNG-S-001 through HNG-S-007 — 7 axes; observe endpoint accepts per-axis evidence
// @rule:HNG-YK-001 — worst-axis floor: single FAIL caps grade at D
// @rule:CA-003 — before/after state on every observation
// @rule:CA-004 — _meta on all responses
// @rule:CA-005 — human_modified flag on agent observations

import type { FastifyInstance } from 'fastify';

import { scoreAxis, computePostureScore } from '../axes/scorer.js';
import type { AxisInput, Axis } from '../axes/scorer.js';
import {
  getAgent,
  recordObservation,
  recordMudrika,
  getAxisHistory,
  upsertBaseline,
} from '../core/db.js';
import { verifyMudrika } from '../core/mudrika.js';

export async function observeRoutes(app: FastifyInstance) {
  // Verify a mudrika credential (Axis 1 gate)
  // @rule:HNG-S-001 — primary verification endpoint
  app.post<{
    Body: {
      agent_id: string;
      customer_id: string;
      mudrika: unknown;
    };
  }>('/api/v1/hanumang/mudrika/verify', async (req, reply) => {
    const t0 = Date.now();
    const { agent_id, customer_id, mudrika } = req.body;
    if (!agent_id || !customer_id || !mudrika) {
      return reply.status(400).send({ error: 'agent_id, customer_id, mudrika required' });
    }

    // @rule:HNG-P2-003 — verify against the agent's registered Ed25519 pubkey when present
    const agent = getAgent(agent_id);
    const result = verifyMudrika(mudrika, agent_id, agent?.mudrika_pubkey_pem ?? null);

    // Record the mudrika attempt
    recordMudrika({
      agent_id,
      mudrika_id: (mudrika as Record<string, string>).mudrika_id ?? 'unknown',
      principal_id: (mudrika as Record<string, string>).principal_id ?? 'unknown',
      trust_mask: result.trust_mask,
      scope_key: result.scope_key,
      issued_at: (mudrika as Record<string, string>).issued_at ?? new Date().toISOString(),
      expires_at: result.expires_at,
      verified_at: new Date().toISOString(),
      outcome: result.outcome,
      failure_reason: result.failure_reason,
      pramana_chain: result.pramana_chain.join(','),
      _meta_duration_ms: result.duration_ms,
    });

    // Record as Axis 1 observation
    const axisScore = scoreAxis({
      axis: 'mudrika_integrity',
      mudrika_verified: result.outcome === 'PASS',
      mudrika_signature_state: result.signature_state,
      mudrika_ttl_remaining_s:
        result.outcome === 'PASS'
          ? Math.max(0, (new Date(result.expires_at).getTime() - Date.now()) / 1000)
          : 0,
      pramana_chain_depth: result.pramana_chain.length,
    });

    recordObservation({
      agent_id,
      customer_id,
      axis: 'mudrika_integrity',
      score: axisScore.score,
      outcome: axisScore.outcome,
      evidence: JSON.stringify({
        mudrika_id: result.mudrika_id,
        failure_reason: result.failure_reason,
        signature_state: result.signature_state,
      }),
      rule_id: axisScore.rule_id,
    });

    const statusCode = result.outcome === 'PASS' ? 200 : result.outcome === 'EXPIRED' ? 401 : 403;
    return reply.status(statusCode).send({
      outcome: result.outcome,
      failure_reason: result.failure_reason,
      signature_state: result.signature_state,
      expires_at: result.expires_at,
      axis_score: axisScore,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    });
  });

  // Submit a multi-axis observation bundle
  // @rule:HNG-S-001..HNG-S-007 — all 7 axes accepted in one call
  app.post<{
    Body: {
      agent_id: string;
      customer_id: string;
      task_id?: string;
      observations: AxisInput[];
      before_state?: unknown;
      after_state?: unknown;
    };
  }>('/api/v1/hanumang/observe', async (req, reply) => {
    const t0 = Date.now();
    const { agent_id, customer_id, task_id, observations, before_state, after_state } = req.body;
    if (!agent_id || !customer_id || !observations?.length) {
      return reply.status(400).send({ error: 'agent_id, customer_id, observations[] required' });
    }

    const scored = observations.map((o) => ({
      input: o,
      result: scoreAxis({ ...o, task_id }),
    }));

    // Persist each observation
    const records = scored.map(({ input, result }) =>
      recordObservation({
        agent_id,
        customer_id,
        axis: result.axis,
        score: result.score,
        outcome: result.outcome,
        evidence: input.evidence ?? JSON.stringify(result.notes),
        rule_id: result.rule_id,
        task_id: task_id ?? null,
        before_state: before_state ? JSON.stringify(before_state) : null,
        after_state: after_state ? JSON.stringify(after_state) : null,
      })
    );

    // Update overreach baseline if Axis 6 present
    const axis6 = observations.find((o) => o.axis === 'no_overreach');
    if (axis6?.trust_mask_used !== undefined && axis6?.trust_mask_granted !== undefined) {
      upsertBaseline(
        agent_id,
        customer_id,
        axis6.trust_mask_used,
        axis6.trust_mask_granted,
        axis6.evidence ?? ''
      );
    }

    const posture = computePostureScore(scored.map((s) => s.result));

    return reply.status(201).send({
      agent_id,
      task_id: task_id ?? null,
      posture,
      observations: records,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    });
  });

  // Get current posture score for an agent (from recent observations)
  // @rule:HNG-YK-002 — score is computed from last 7 days unless period specified
  app.get<{
    Params: { agent_id: string };
    Querystring: { customer_id: string; limit?: string };
  }>('/api/v1/hanumang/score/:agent_id', async (req, reply) => {
    const t0 = Date.now();
    const { agent_id } = req.params;
    const { customer_id, limit } = req.query;
    if (!customer_id) return reply.status(400).send({ error: 'customer_id required' });

    const history = getAxisHistory(agent_id, undefined, parseInt(limit ?? '50'));
    if (!history.length) {
      return reply.status(404).send({ error: 'no observations found for agent' });
    }

    // Take the most recent observation per axis
    const latestPerAxis = new Map<string, (typeof history)[0]>();
    for (const obs of history) {
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

    return {
      agent_id,
      posture,
      observation_count: history.length,
      axes_observed: axisScores.length,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });

  // Axis history for an agent
  app.get<{
    Params: { agent_id: string };
    Querystring: { customer_id: string; axis?: string; limit?: string };
  }>('/api/v1/hanumang/history/:agent_id', async (req, reply) => {
    const t0 = Date.now();
    const { agent_id } = req.params;
    const { customer_id, axis, limit } = req.query;
    if (!customer_id) return reply.status(400).send({ error: 'customer_id required' });
    const history = getAxisHistory(agent_id, axis, parseInt(limit ?? '50'));
    return {
      agent_id,
      axis: axis ?? 'all',
      history,
      count: history.length,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    };
  });
}
