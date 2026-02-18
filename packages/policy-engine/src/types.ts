/**
 * Policy Engine Types
 */

// ─── Core Policy Types (matches Prisma Policy model) ─────────────────────────

export type PolicyAction = 'allow' | 'block' | 'notify' | 'prompt';

export interface PolicyConditions {
  /** Glob-style domain patterns, e.g. ["*.facebook.com", "ads.google.com"] */
  domains?: string[];
  /** Tracker categories, e.g. ["ADVERTISING", "CRYPTOMINING"] */
  categories?: string[];
  /** Minimum threat level to trigger: SAFE < LOW < MEDIUM < HIGH < CRITICAL */
  threatLevel?: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Specific event types */
  eventTypes?: string[];
  /** Process names (for AI agent policies) */
  processNames?: string[];
  /** Agent IDs */
  agentIds?: string[];
  /** File path glob patterns */
  filePaths?: string[];
  /** Max bytes allowed per upload */
  maxUploadBytes?: number;
  /** Time-of-day restriction: "09:00-17:00" */
  allowedHours?: string;
  /** Days of week (0=Sun, 6=Sat) */
  allowedDays?: number[];
}

/** Canonical Policy shape used internally by the engine */
export interface Policy {
  id: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  priority: number;
  conditions: PolicyConditions;
  action: PolicyAction;
  notifyUser: boolean;
  logEvent: boolean;
}

// ─── Evaluation Request ───────────────────────────────────────────────────────

export interface EvaluationRequest {
  domain?: string;
  category?: string;
  threatLevel?: string;
  eventType?: string;
  processName?: string;
  agentId?: string;
  filePath?: string;
  byteCount?: number;
  /** ISO string, defaults to now */
  timestamp?: string;
}

// ─── Evaluation Result ────────────────────────────────────────────────────────

export interface EvaluationResult {
  action: PolicyAction;
  policyId?: string;
  policyName?: string;
  reason: string;
  shouldNotify: boolean;
  shouldLog: boolean;
}

// ─── Legacy Simple Rule (kept for backwards compat) ──────────────────────────

export interface PolicyRule {
  id: string;
  type: 'allow' | 'block';
  condition: string;
}
