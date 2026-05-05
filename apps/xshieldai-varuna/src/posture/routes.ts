/**
 * Vessel posture summary — aggregates all detection signals into a score.
 * @rule:VRN-050 Posture is a living score, updated continuously.
 * @rule:CA-004 _meta on every resolver.
 */

import type { FastifyInstance } from 'fastify';

import { getVessel, listVessels } from '../store/vessel.js';

export async function registerPostureRoutes(app: FastifyInstance): Promise<void> {
  // @rule:VRN-050 Living posture score per vessel
  app.get<{ Params: { vesselId: string } }>('/api/v1/posture/:vesselId', async (request) => {
    const _start = Date.now();
    const vessel_id = request.params.vesselId;
    const vessel = getVessel(vessel_id);

    // Score components (100 = perfect, deducted per finding)
    const findings: Array<{
      rule_id: string;
      severity: string;
      description: string;
      deduction: number;
    }> = [];

    // Modbus findings
    const criticalModbus = vessel.modbusAnomalies.filter((a) => a.severity === 'CRITICAL').length;
    const warnModbus = vessel.modbusAnomalies.filter((a) => a.severity === 'WARN').length;
    if (criticalModbus > 0)
      findings.push({
        rule_id: 'VRN-026',
        severity: 'CRITICAL',
        description: `${criticalModbus} critical Modbus anomalies detected`,
        deduction: Math.min(30, criticalModbus * 10),
      });
    if (warnModbus > 0)
      findings.push({
        rule_id: 'VRN-026',
        severity: 'WARN',
        description: `${warnModbus} Modbus anomalies detected`,
        deduction: Math.min(10, warnModbus * 2),
      });
    if (!vessel.modbusBaselineLocked)
      findings.push({
        rule_id: 'VRN-026',
        severity: 'INFO',
        description: 'Modbus baseline observation in progress',
        deduction: 5,
      });

    // NMEA findings
    const criticalNMEA = vessel.nmeaAnomalies.filter((a) => a.severity === 'CRITICAL').length;
    if (criticalNMEA > 0)
      findings.push({
        rule_id: 'VRN-032',
        severity: 'CRITICAL',
        description: `${criticalNMEA} NMEA injection events detected`,
        deduction: Math.min(25, criticalNMEA * 10),
      });

    // GPS/AIS findings
    if (vessel.gpsAnomalies.length > 0)
      findings.push({
        rule_id: 'VRN-036',
        severity: 'WARN',
        description: `${vessel.gpsAnomalies.length} GPS anomalies detected`,
        deduction: Math.min(15, vessel.gpsAnomalies.length * 5),
      });

    // Topology findings
    if (!vessel.topology) {
      findings.push({
        rule_id: 'VRN-002',
        severity: 'WARN',
        description: 'No zone/conduit topology imported',
        deduction: 10,
      });
    } else if (vessel.topology.flat_network) {
      findings.push({
        rule_id: 'VRN-008',
        severity: 'CRITICAL',
        description: 'Flat network detected — no zone segmentation',
        deduction: 20,
      });
    }

    // @rule:VRN-044 Runaway-diesel precursor is instant CRITICAL — zero score
    const runawayEvent = vessel.senseEvents.find(
      (e) => e.event_type === 'vrn.runaway_diesel.precursor.detected'
    );
    if (runawayEvent)
      findings.push({
        rule_id: 'VRN-044',
        severity: 'CRITICAL',
        description: 'RUNAWAY DIESEL PRECURSOR DETECTED — two-coil sequence',
        deduction: 100,
      });

    const totalDeduction = Math.min(
      100,
      findings.reduce((sum, f) => sum + f.deduction, 0)
    );
    const score = Math.max(0, 100 - totalDeduction);

    // Update stored score
    vessel.postureScore = score;

    const posture_band = score >= 80 ? 'GREEN' : score >= 50 ? 'AMBER' : 'RED';

    return {
      vessel_id,
      posture_score: score,
      posture_band,
      findings_count: {
        critical: findings.filter((f) => f.severity === 'CRITICAL').length,
        warn: findings.filter((f) => f.severity === 'WARN').length,
      },
      findings,
      iacs_ur_e26:
        vessel.modbusBaselineLocked && vessel.nmeaBaselineLocked && !vessel.topology?.flat_network
          ? 'PARTIAL'
          : 'NOT_ASSESSED',
      recent_events: vessel.senseEvents
        .slice(-10)
        .map((e) => ({
          event_type: e.event_type,
          severity: e.severity,
          timestamp: new Date(e.timestamp).toISOString(),
        })),
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - _start,
        trust_mask_applied: 1,
      },
    };
  });

  // GET /api/v1/posture — fleet-wide summary
  app.get('/api/v1/posture', async () => {
    const _start = Date.now();
    const vessels = listVessels();
    const summary = vessels.map((vid) => {
      const v = getVessel(vid);
      return { vessel_id: vid, posture_score: v.postureScore, event_count: v.senseEvents.length };
    });
    return {
      vessel_count: vessels.length,
      vessels: summary,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - _start,
        trust_mask_applied: 1,
      },
    };
  });

  // GET /api/v1/events/:vesselId — SENSE event log
  app.get<{ Params: { vesselId: string }; Querystring: { limit?: string; severity?: string } }>(
    '/api/v1/events/:vesselId',
    async (request) => {
      const _start = Date.now();
      const vessel = getVessel(request.params.vesselId);
      const limit = parseInt(request.query.limit ?? '50');
      const { severity } = request.query;

      let events = [...vessel.senseEvents].reverse();
      if (severity) events = events.filter((e) => e.severity === severity.toUpperCase());
      events = events.slice(0, limit);

      return {
        vessel_id: request.params.vesselId,
        total: vessel.senseEvents.length,
        returned: events.length,
        events,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - _start,
          trust_mask_applied: 1,
        },
      };
    }
  );

  app.log.info('Posture routes registered: score + events (VARUNA-P1 living score)');
}
