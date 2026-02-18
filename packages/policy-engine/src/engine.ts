/**
 * @ankrshield/policy-engine — Full Policy Evaluator
 *
 * Evaluates a request context against an ordered list of policies.
 * Policies are sorted by priority descending (highest priority wins).
 * First matching policy determines the outcome.
 * Default: 'allow' if no policy matches.
 */

import type { Policy, PolicyConditions, EvaluationRequest, EvaluationResult } from './types';

// ─── Threat Level Ranking ──────────────────────────────────────────────────────

const THREAT_RANK: Record<string, number> = {
  SAFE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

// ─── PolicyEngine ─────────────────────────────────────────────────────────────

export class PolicyEngine {
  private policies: Policy[] = [];

  /**
   * Replace the full policy list (call this on load / after DB sync).
   */
  setPolicies(policies: Policy[]): void {
    // Sort descending by priority so iteration stops at first match
    this.policies = [...policies].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Add or update a single policy.
   */
  addPolicy(policy: Policy): void {
    const idx = this.policies.findIndex((p) => p.id === policy.id);
    if (idx >= 0) {
      this.policies[idx] = policy;
    } else {
      this.policies.push(policy);
    }
    this.policies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a policy by ID.
   */
  removePolicy(id: string): void {
    this.policies = this.policies.filter((p) => p.id !== id);
  }

  /**
   * Evaluate a request against all active policies.
   * Returns 'allow' by default if no policy matches.
   */
  evaluate(req: EvaluationRequest): EvaluationResult {
    const now = req.timestamp ? new Date(req.timestamp) : new Date();

    for (const policy of this.policies) {
      if (!policy.isEnabled) continue;
      if (this.matches(policy.conditions, req, now)) {
        return {
          action: policy.action,
          policyId: policy.id,
          policyName: policy.name,
          reason: `Matched policy "${policy.name}" (priority ${policy.priority})`,
          shouldNotify: policy.notifyUser,
          shouldLog: policy.logEvent,
        };
      }
    }

    return {
      action: 'allow',
      reason: 'No matching policy — default allow',
      shouldNotify: false,
      shouldLog: false,
    };
  }

  /**
   * Convenience: evaluate domain only (for DNS resolver integration).
   */
  evaluateDomain(domain: string): 'allow' | 'block' {
    const result = this.evaluate({ domain });
    return result.action === 'block' ? 'block' : 'allow';
  }

  /**
   * Returns all policies, sorted by priority.
   */
  getPolicies(): Policy[] {
    return [...this.policies];
  }

  getPolicyCount(): number {
    return this.policies.length;
  }

  // ─── Condition Matching ────────────────────────────────────────────────────

  private matches(conditions: PolicyConditions, req: EvaluationRequest, now: Date): boolean {
    // Each condition group must match if present (AND logic)

    if (conditions.domains?.length && req.domain) {
      if (!this.matchesDomainList(req.domain, conditions.domains)) return false;
    }

    if (conditions.categories?.length && req.category) {
      if (!conditions.categories.includes(req.category)) return false;
    }

    if (conditions.threatLevel && req.threatLevel) {
      const required = THREAT_RANK[conditions.threatLevel] ?? 0;
      const actual = THREAT_RANK[req.threatLevel] ?? 0;
      if (actual < required) return false;
    }

    if (conditions.eventTypes?.length && req.eventType) {
      if (!conditions.eventTypes.includes(req.eventType)) return false;
    }

    if (conditions.processNames?.length && req.processName) {
      if (!conditions.processNames.some((p) => matchGlob(p, req.processName!))) {
        return false;
      }
    }

    if (conditions.agentIds?.length && req.agentId) {
      if (!conditions.agentIds.includes(req.agentId)) return false;
    }

    if (conditions.filePaths?.length && req.filePath) {
      if (!conditions.filePaths.some((p) => matchGlob(p, req.filePath!))) {
        return false;
      }
    }

    if (conditions.maxUploadBytes != null && req.byteCount != null) {
      if (req.byteCount <= conditions.maxUploadBytes) return false;
    }

    if (conditions.allowedHours) {
      if (!this.isWithinHours(conditions.allowedHours, now)) return false;
    }

    if (conditions.allowedDays?.length) {
      if (!conditions.allowedDays.includes(now.getDay())) return false;
    }

    // All specified conditions matched (or none were specified → wildcard match)
    return true;
  }

  // ─── Domain Matching ───────────────────────────────────────────────────────

  private matchesDomainList(domain: string, patterns: string[]): boolean {
    return patterns.some((pattern) => matchDomainPattern(pattern, domain));
  }

  // ─── Time Matching ─────────────────────────────────────────────────────────

  /**
   * allowedHours format: "HH:MM-HH:MM" (24-hour), e.g. "09:00-17:00"
   * Returns true if current time is OUTSIDE allowed range (i.e. should trigger).
   *
   * Design rationale: policy fires when outside allowed hours so you can block
   * access that happens at 3 AM (suspicious).
   */
  private isWithinHours(allowedHours: string, now: Date): boolean {
    const [startStr, endStr] = allowedHours.split('-');
    if (!startStr || !endStr) return true; // malformed — skip

    const toMinutes = (hhmm: string): number => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };

    const start = toMinutes(startStr);
    const end = toMinutes(endStr);
    const current = now.getHours() * 60 + now.getMinutes();

    if (start <= end) {
      // Normal range: 09:00-17:00
      return current < start || current > end;
    } else {
      // Overnight range: 22:00-06:00
      return current < start && current > end;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Match domain against a pattern that may contain leading wildcard.
 * Patterns: "*.facebook.com", "ads.google.com", "*.com"
 */
function matchDomainPattern(pattern: string, domain: string): boolean {
  if (pattern === domain) return true;

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2); // "facebook.com"
    return domain === suffix || domain.endsWith(`.${suffix}`);
  }

  // Plain glob via our generic matcher
  return matchGlob(pattern, domain);
}

/**
 * Minimal glob match: supports * (any chars including none) and ? (single char).
 * Does NOT support ** (use dedicated path matchers for that).
 */
function matchGlob(pattern: string, str: string): boolean {
  // Escape regex metacharacters except * and ?
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${regexStr}$`, 'i').test(str);
}
