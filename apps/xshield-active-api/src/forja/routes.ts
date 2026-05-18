/**
 * Forja Protocol v2.0 — xShield Active Defense
 * @rule:FP-003 Forja-Native by Default
 *
 * STATE  — what this service knows and can do
 * TRUST  — what a user/role is authorised to do
 * SENSE  — fire an internal capability event
 * PROOF  — was this service built as its LOGICS doc says?
 */

import type { FastifyInstance } from 'fastify';
import { TRUST_PERM } from '@ankr/trust-constants';

// ─── Capability constants ─────────────────────────────────────────────────────

const CAN_ANSWER = [
  'consent-mode',
  'action-execution-path',
  'beacon-credential-status',
  'existential-threat-level',
  'audit-trail',
  'siem-connector-status',
];

const CAN_DO = [
  'file-dmca',
  'submit-abuse-report',
  'dispatch-siem-webhook',
  'generate-beacon-credential',
  'capture-attacker-fingerprint',
  'warn-attacker',
  'push-stix-to-taxii',
  'route-existential-mode3',
  'approve-mode1-action',
  'configure-mode2-standing-orders',
];

const EMITS = [
  'xsact.threat.detected',
  'xsact.action.proposed',
  'xsact.action.approved',
  'xsact.action.executed',
  'xsact.beacon.triggered',
  'xsact.existential.fired',
  'xsact.siem.pushed',
  'xsact.taxii.pushed',
];

// @rule:XSACT-002 Three consent modes
// @rule:XSACT-004 Public actions use Option A
// @rule:XSACT-005 Client-side actions use Option B
// @rule:BMK-004 import from trust-constants, never define local bit positions
const TRUST_MASK =
  TRUST_PERM.READ | TRUST_PERM.QUERY | TRUST_PERM.EXECUTE | TRUST_PERM.APPROVE | TRUST_PERM.AUDIT;

// ─── STATE ────────────────────────────────────────────────────────────────────

export async function registerForjaRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v2/forja/state
  app.get('/api/v2/forja/state', async () => ({
    service_key: 'xshield-active',
    version: '0.1.0',
    forja_version: '2.0',
    can_answer: CAN_ANSWER,
    can_do: CAN_DO,
    emits: EMITS,
    depends_on: ['xshieldai'],
    trust_mask: TRUST_MASK,
    compliance_posture: 'GREEN',
    modes: {
      mode_1: 'client-moderated',
      mode_2: 'pre-authorised',
      mode_3: 'existential-override',
    },
    execution_paths: {
      option_a: 'xshield-direct (public endpoints, no client creds)',
      option_b: 'siem-webhook (client SOAR/SIEM executes)',
    },
    legal_basis: {
      beacon_capture: 'DPDP-S7g + GDPR-Art6-1f + Recital49',
      mode_3_autoact: 'GDPR-Art6-1d-vital-interests',
      taxii_sharing: 'NIS2 + CISA-2015 + NCIIPC',
    },
    geography: 'west-first (US + EU)',
    timestamp: new Date().toISOString(),
  }));

  // GET /api/v2/forja/state/:entityId  — per-client posture
  app.get<{ Params: { entityId: string } }>('/api/v2/forja/state/:entityId', async (request) => ({
    service_key: 'xshield-active',
    entity_id: request.params.entityId,
    can_answer: CAN_ANSWER,
    can_do: CAN_DO,
    // @rule:XSACT-011 addendum gate enforced at feature level, not STATE level
    compliance_posture: 'GREEN',
    timestamp: new Date().toISOString(),
  }));

  // GET /api/v2/forja/trust/:userId
  // @rule:XSACT-002 consent mode determines what user can do
  app.get<{ Params: { userId: string } }>('/api/v2/forja/trust/:userId', async (request) => ({
    user_id: request.params.userId,
    trust_mask: TRUST_MASK,
    authorised_actions: CAN_DO,
    // Real RBAC implemented in consent/routes.ts per client config
    consent_mode: 'mode_1', // default until client configures
    addendum_signed: false, // default until signed
    timestamp: new Date().toISOString(),
  }));

  // POST /api/v2/forja/sense/emit
  // @rule:XSACT-003 SENSE events used for all capability notifications
  app.post<{
    Body: { event: string; payload?: Record<string, unknown>; source?: string };
  }>('/api/v2/forja/sense/emit', async (request, reply) => {
    const { event, payload = {}, source = 'internal' } = request.body;

    if (!EMITS.includes(event)) {
      return reply.status(400).send({
        error: 'unknown_event',
        message: `Event '${event}' not in declared EMITS. Known: ${EMITS.join(', ')}`,
      });
    }

    // In production: publish to SENSE subscriber bus
    // @rule:CA-003 SENSE payload carries before/after/delta
    app.log.info({ event, source, payload }, 'SENSE event emitted');

    return {
      emitted: true,
      event,
      source,
      timestamp: new Date().toISOString(),
    };
  });

  // GET /api/v2/forja/proof
  // @rule:FP-004 Code Implements Rules — PROOF enforces this
  app.get('/api/v2/forja/proof', async () => ({
    service_key: 'xshield-active',
    logics_doc: 'xshield-active--logics--formal--2026-04-07.md',
    rules_declared: [
      'XSACT-001',
      'XSACT-002',
      'XSACT-003',
      'XSACT-004',
      'XSACT-005',
      'XSACT-006',
      'XSACT-007',
      'XSACT-008',
      'XSACT-009',
      'XSACT-010',
      'XSACT-011',
      'XSACT-YK-001',
      'XSACT-YK-002',
      'XSACT-YK-003',
      'XSACT-YK-004',
      'XSACT-YK-005',
      'XSACT-YK-006',
      'XSACT-YK-007',
      'XSACT-YK-008',
      'INF-XSACT-001',
      'INF-XSACT-002',
      'INF-XSACT-003',
      'INF-XSACT-004',
      'INF-XSACT-005',
      'INF-XSACT-006',
      'INF-XSACT-007',
      'INF-XSACT-008',
    ],
    annotation_coverage: 'partial', // grows as phases complete
    proof_status: 'FRJ-P-001-PARTIAL',
    timestamp: new Date().toISOString(),
  }));

  app.log.info('Forja v2.0 routes registered: STATE + TRUST + SENSE + PROOF');
}
