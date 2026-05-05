/**
 * IACS UR E26/E27 compliance API.
 * @rule:P2-001 IACS 25-capability compliance score
 * @rule:CA-004 _meta on every resolver
 */

import type { FastifyInstance } from 'fastify';

import { getVessel } from '../store/vessel.js';

import { IACS_CAPABILITIES } from './capabilities.js';
import { runIACSScorer } from './scorer.js';

export async function registerIACSRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/iacs/compliance/:vesselId — run full 25-capability assessment
  app.get<{ Params: { vesselId: string } }>(
    '/api/v1/iacs/compliance/:vesselId',
    async (request) => {
      const _start = Date.now();
      const vessel = getVessel(request.params.vesselId);
      const score = runIACSScorer(vessel);

      return {
        vessel_id: request.params.vesselId,
        iacs_compliance: {
          pass: score.pass,
          partial: score.partial,
          fail: score.fail,
          unknown: score.unknown,
          total: score.total,
          compliance_pct: score.compliance_pct,
        },
        critical_gaps: score.critical_fails,
        results: score.results,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - _start,
          trust_mask_applied: 1,
        },
      };
    }
  );

  // GET /api/v1/iacs/matrix — full capability + clause + MITRE mapping (static)
  app.get('/api/v1/iacs/matrix', async () => {
    const _start = Date.now();
    return {
      capabilities: IACS_CAPABILITIES.map((c) => ({
        cap_id: c.cap_id,
        name: c.name,
        iacs_clause: c.iacs_clause,
        rule_id: c.rule_id,
        mitre_technique_id: c.mitre_technique_id,
        mitre_technique_name: c.mitre_technique_name,
        description: c.description,
      })),
      total: IACS_CAPABILITIES.length,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - _start,
        trust_mask_applied: 1,
      },
    };
  });

  app.log.info('IACS routes registered: compliance + matrix (VARUNA-P2-001)');
}
