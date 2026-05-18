/**
 * Action Dispatch Handler — the brain
 * Ties together: existential classifier → consent → audit → router → Option A/B
 *
 * @rule:XSACT-YK-001 Route by action type first, not consent mode
 * @rule:XSACT-002 Mode 1/2/3 governs approval gate
 * @rule:XSACT-003 Mode 3 always-on — fires on EXISTENTIAL regardless of client mode
 * @rule:XSACT-009 Audit write before execution — block on failure
 * @rule:INF-XSACT-002 EXISTENTIAL → Mode 3 fires regardless
 * @rule:INF-XSACT-004 No audit write → blocked
 */

import { classifyThreat, type ThreatSignal } from '../beacon/existential-classifier.js';
import { routeAction, type RoutedAction } from '../router/executor.js';
import { getConsentConfig, isAddendumSigned } from '../consent/types.js';
import {
  fileDmca,
  submitAbuseReport,
  reportGoogleSafeBrowsing,
  reportCloudflare,
  notifyExecutive,
} from '../option-a/actor.js';
import type { ActionType } from '../consent/types.js';

export interface ThreatInput {
  id: string;
  type: string;
  target: string;
  target_confirmed_attacker_owned: boolean;
  signals: ThreatSignal[];
  registrar_abuse_email?: string; // for abuse_report action
  client_name?: string;
  evidence?: string;
}

export interface DispatchRequest {
  client_id: string;
  threat: ThreatInput;
  requested_action: ActionType;
}

export interface DispatchResult {
  dispatched: boolean;
  severity: string;
  mode_triggered: 'mode_1' | 'mode_2' | 'mode_3';
  execution_path: string;
  pending_approval: boolean;
  result?: Record<string, unknown>;
  block_reason?: string;
  audit_record_id: string;
  case_id?: string;
  // @rule:CA-004 telemetry
  _meta: {
    computed_at: string;
    duration_ms: number;
    trust_mask_applied: number;
  };
}

/** File-backed approval queue — survives restarts. @see persistence/file-store.ts */
import { FileBackedMap } from '../persistence/file-store.js';
export const approvalQueue = new FileBackedMap<{
  request: DispatchRequest;
  classification: ReturnType<typeof classifyThreat>;
  queued_at: string;
  approved: boolean;
}>('approval-queue');

/**
 * Main dispatch entry point.
 * Called by /api/v1/action/execute
 */
export async function dispatch(req: DispatchRequest): Promise<DispatchResult> {
  const start = Date.now();
  const config = getConsentConfig(req.client_id);

  // ── Step 1: Classify threat ──────────────────────────────────────────────
  const classification = classifyThreat(req.threat.signals);

  // ── Step 2: Build routed action ──────────────────────────────────────────
  const routedAction: RoutedAction = {
    action_type: req.requested_action,
    client_id: req.client_id,
    threat_id: req.threat.id,
    threat_severity: classification.severity,
    target: req.threat.target,
    target_confirmed_attacker_owned: req.threat.target_confirmed_attacker_owned,
    payload: { threat: req.threat },
  };

  // ── Step 3: Run through gates (proportionality, ownership, audit write) ──
  const decision = routeAction(routedAction);

  if (!decision.allowed) {
    return {
      dispatched: false,
      severity: classification.severity,
      mode_triggered: classification.mode_triggered,
      execution_path: 'blocked',
      pending_approval: false,
      block_reason: decision.block_reason,
      audit_record_id: decision.audit_record.id,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        trust_mask_applied: 1,
      },
    };
  }

  // ── Step 4: Mode gate ────────────────────────────────────────────────────

  // @rule:INF-XSACT-002 EXISTENTIAL → Mode 3 regardless of client mode
  const effectiveMode = classification.severity === 'EXISTENTIAL' ? 'mode_3' : config.mode;

  // Mode 1: queue for approval
  if (effectiveMode === 'mode_1') {
    const queueId = `QUEUE-${Date.now()}`;
    approvalQueue.set(queueId, {
      request: req,
      classification,
      queued_at: new Date().toISOString(),
      approved: false,
    });

    return {
      dispatched: false,
      severity: classification.severity,
      mode_triggered: 'mode_1',
      execution_path: decision.execution_path,
      pending_approval: true,
      audit_record_id: decision.audit_record.id,
      case_id: queueId,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        trust_mask_applied: 1,
      },
    };
  }

  // Mode 2: check standing orders
  if (effectiveMode === 'mode_2') {
    const matchingOrder = config.standing_orders.find(
      (o) => o.action_type === req.requested_action && o.enabled
    );

    if (!matchingOrder) {
      // No matching standing order → fall back to Mode 1 queue
      const queueId = `QUEUE-${Date.now()}`;
      approvalQueue.set(queueId, {
        request: req,
        classification,
        queued_at: new Date().toISOString(),
        approved: false,
      });

      return {
        dispatched: false,
        severity: classification.severity,
        mode_triggered: 'mode_1',
        execution_path: decision.execution_path,
        pending_approval: true,
        audit_record_id: decision.audit_record.id,
        case_id: queueId,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - start,
          trust_mask_applied: 1,
        },
      };
    }
  }

  // ── Step 5: Execute ──────────────────────────────────────────────────────
  // Mode 2 (standing order matched) or Mode 3 (existential)
  const execResult = await executeAction(req, decision.execution_path as any, config);

  return {
    dispatched: true,
    severity: classification.severity,
    mode_triggered: effectiveMode,
    execution_path: decision.execution_path,
    pending_approval: false,
    result: execResult,
    audit_record_id: decision.audit_record.id,
    case_id: `XS-${Date.now()}`,
    _meta: {
      computed_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      trust_mask_applied: 1,
    },
  };
}

/** Execute the action via Option A or B */
async function executeAction(
  req: DispatchRequest,
  path: 'option_a' | 'option_b' | 'both',
  config: ReturnType<typeof getConsentConfig>
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  const shouldRunA = path === 'option_a' || path === 'both';
  const shouldRunB = path === 'option_b' || path === 'both';

  if (shouldRunA) {
    results['option_a'] = await runOptionA(req, config);
  }

  if (shouldRunB && config.siem_webhook?.enabled) {
    // Option B: fire webhook — token must come from secure runtime retrieval
    // Phase 6: retrieve token from encrypted vault
    results['option_b'] = {
      status: 'webhook_queued',
      siem_type: config.siem_webhook.type,
      note: 'Token retrieval from vault pending Phase 6',
    };
  }

  return results;
}

async function runOptionA(
  req: DispatchRequest,
  config: ReturnType<typeof getConsentConfig>
): Promise<Record<string, unknown>> {
  const { action_type } = req;
  const t = req.threat;

  switch (action_type) {
    case 'dmca':
      return fileDmca(t.target, t.client_name ?? req.client_id, t.evidence ?? 'xShieldAI scan');

    case 'abuse_report':
      return submitAbuseReport(
        t.target,
        t.registrar_abuse_email ?? `abuse@${t.target.split('.').slice(-2).join('.')}`,
        t.evidence ?? 'Threat detected by xShieldAI'
      );

    case 'google_safe_browsing':
      return reportGoogleSafeBrowsing(t.target);

    case 'cloudflare_report':
      return reportCloudflare(t.target);

    case 'exec_notify':
      return notifyExecutive(
        config.executive_contacts,
        `Threat detected: ${t.type} targeting ${t.target}`,
        `XS-${Date.now()}`,
        'EXISTENTIAL'
      );

    default:
      return { status: 'unsupported_in_option_a', action_type };
  }
}
