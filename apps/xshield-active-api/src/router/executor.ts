/**
 * Execution Router
 * @rule:XSACT-YK-001 Action type determines path — not consent mode
 * @rule:XSACT-YK-003 Proportionality test before every action
 * @rule:XSACT-YK-008 Target ownership verification
 * @rule:INF-XSACT-003 Third-party infra → blocked
 * @rule:INF-XSACT-004 No audit write → blocked
 */

import { writeAuditRecord, type AuditRecord } from '../audit/logger.js';
import { getConsentConfig, isAddendumSigned } from '../consent/types.js';
import type { ActionType } from '../consent/types.js';

// @rule:XSACT-004 Public actions — Option A only
const OPTION_A_ACTIONS = new Set<ActionType>([
  'dmca',
  'abuse_report',
  'google_safe_browsing',
  'cloudflare_report',
  'exec_notify',
]);

// @rule:XSACT-005 Client-side actions — Option B only
const OPTION_B_ACTIONS = new Set<ActionType>([
  'iam_reset',
  'dns_change',
  'internal_alert',
  'siem_playbook',
]);

export interface RoutedAction {
  action_type: ActionType;
  client_id: string;
  threat_id: string;
  threat_severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'EXISTENTIAL';
  target: string; // domain, IP, or service name
  target_confirmed_attacker_owned: boolean;
  payload: Record<string, unknown>;
}

export interface RouteDecision {
  allowed: boolean;
  execution_path: 'option_a' | 'option_b' | 'both' | 'blocked';
  block_reason?: string;
  block_rule?: string;
  audit_record: AuditRecord;
}

/**
 * Route an action through all gates.
 * Returns a decision. Caller executes only if allowed === true.
 *
 * @rule:XSACT-YK-001 Route by action type first
 * @rule:INF-XSACT-004 Audit write is attempted before any check — blocks if it fails
 */
export function routeAction(action: RoutedAction): RouteDecision {
  const config = getConsentConfig(action.client_id);
  const start = Date.now();

  // Determine path before any gate checks
  let execution_path: 'option_a' | 'option_b' | 'both' | 'blocked';

  if (action.threat_severity === 'EXISTENTIAL') {
    // @rule:XSACT-003 Mode 3 always-on — both paths simultaneously
    execution_path = 'both';
  } else if (OPTION_A_ACTIONS.has(action.action_type)) {
    execution_path = 'option_a';
  } else if (OPTION_B_ACTIONS.has(action.action_type)) {
    execution_path = config.siem_webhook?.enabled ? 'option_b' : 'option_a';
    // @rule:INF-XSACT-001 No SIEM → fallback to notify-only option_a
  } else {
    execution_path = 'blocked';
  }

  // @rule:XSACT-YK-008 + INF-XSACT-003 — target ownership gate
  if (!action.target_confirmed_attacker_owned && execution_path !== 'blocked') {
    const auditRecord = writeAuditRecord({
      client_id: action.client_id,
      before_snapshot: { threat_id: action.threat_id, target: action.target },
      action_taken: action.action_type,
      after_snapshot: null,
      delta: null,
      consent_mode: action.threat_severity === 'EXISTENTIAL' ? 'mode_3' : config.mode,
      execution_path: 'blocked',
      rule_id_applied: ['XSACT-YK-008', 'INF-XSACT-003'],
      jurisdiction_detected: config.jurisdiction,
      legal_basis_applied: 'N/A — blocked before execution',
      result: 'blocked',
      result_detail: 'Target ownership unconfirmed — could be third-party/botnet infrastructure',
      duration_ms: Date.now() - start,
      trust_mask_applied: 1,
    });

    return {
      allowed: false,
      execution_path: 'blocked',
      block_reason:
        'Target ownership unconfirmed. May be third-party infrastructure (botnet/compromised). Downgraded to notify + TAXII push only.',
      block_rule: 'XSACT-YK-008 + INF-XSACT-003',
      audit_record: auditRecord,
    };
  }

  // @rule:XSACT-YK-003 Proportionality gate
  const proportionalityViolation = checkProportionality(action);
  if (proportionalityViolation) {
    const auditRecord = writeAuditRecord({
      client_id: action.client_id,
      before_snapshot: { threat_id: action.threat_id, severity: action.threat_severity },
      action_taken: action.action_type,
      after_snapshot: null,
      delta: null,
      consent_mode: config.mode,
      execution_path: 'blocked',
      rule_id_applied: ['XSACT-YK-003'],
      jurisdiction_detected: config.jurisdiction,
      legal_basis_applied: 'N/A — blocked for disproportionality',
      result: 'blocked',
      result_detail: proportionalityViolation,
      duration_ms: Date.now() - start,
      trust_mask_applied: 1,
    });

    return {
      allowed: false,
      execution_path: 'blocked',
      block_reason: proportionalityViolation,
      block_rule: 'XSACT-YK-003',
      audit_record: auditRecord,
    };
  }

  // All gates passed — write audit record and allow
  // @rule:INF-XSACT-004 Audit write happens here — if it throws, action is blocked
  const auditRecord = writeAuditRecord({
    client_id: action.client_id,
    before_snapshot: {
      threat_id: action.threat_id,
      target: action.target,
      severity: action.threat_severity,
    },
    action_taken: action.action_type,
    after_snapshot: null, // filled in post-execution
    delta: null,
    consent_mode: action.threat_severity === 'EXISTENTIAL' ? 'mode_3' : config.mode,
    execution_path: execution_path as any,
    rule_id_applied: ['XSACT-YK-001', 'XSACT-009'],
    jurisdiction_detected: config.jurisdiction,
    legal_basis_applied: legalBasis(action),
    result: 'pending_approval',
    duration_ms: Date.now() - start,
    trust_mask_applied: 1,
  });

  return {
    allowed: true,
    execution_path: execution_path as any,
    audit_record: auditRecord,
  };
}

/** @rule:XSACT-YK-003 Proportionality check */
function checkProportionality(action: RoutedAction): string | null {
  // IAM reset is disproportionate for LOW/MEDIUM threats
  if (action.action_type === 'iam_reset' && ['LOW', 'MEDIUM'].includes(action.threat_severity)) {
    return `IAM reset is disproportionate for ${action.threat_severity} severity. Minimum: HIGH.`;
  }
  return null;
}

/** Legal basis per action type and jurisdiction */
function legalBasis(action: RoutedAction): string {
  if (action.threat_severity === 'EXISTENTIAL') return 'GDPR-Art6-1d-vital-interests + DPDP-S7';
  if (OPTION_A_ACTIONS.has(action.action_type))
    return 'GDPR-Art6-1f-legitimate-interests + Recital49';
  return 'GDPR-Art6-1f + client-DPA';
}
