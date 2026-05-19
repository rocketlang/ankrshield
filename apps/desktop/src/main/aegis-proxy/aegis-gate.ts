// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — AEGIS lite gate (ASD-T-012)
//
// Wraps every observed request with @xshieldai/aegis lite mode's guard().
// Per-app default trust_mask = ROLE_MASK.EXECUTOR. P2 will let the user
// downgrade per-app via the TOFU dialog (ASD-T-015); for now everyone gets
// the default executor mask, which means lite.guard() never denies in P1+P2.
//
// The capability checked per request depends on adapter intent:
//   - Anthropic Messages / OpenAI Chat Completions → AI_EXECUTE (agentic act)
//   - Future read-only embeddings calls → AI_READ
//   - Tool-use / function-calling requests → AI_EXECUTE
//
// Trust-mask resolution is intentionally MINIMAL in P2 first step:
//   - Always use ROLE_MASK.EXECUTOR for now (covers AI_READ + AI_QUERY +
//     AI_SUGGEST + AI_EXECUTE? — actually no, ROLE_MASK.EXECUTOR only covers
//     READ + QUERY + WRITE + EXECUTE bits 0-3. We need the AI_* bits in the
//     24+ range too).
//
// Solution: define DESKTOP_AGENT_MASK = EXECUTOR + AI_* family, the "default
// allow" trust mask for an agentic app the user has consented to. Downgrade
// paths in ASD-T-015 (TOFU) will use this as the starting point and the user
// can clear specific AI_* bits.
//
// @rule:ASD-004 — failure mode is deny; AEGIS check throw → 403
// @rule:INF-ASD-003 — TRY aegis.lite.guard / CATCH AegisLiteError → deny +
//   surface error to the renderer; never silently pass through on check failure.
// @rule:ASD-YK-001 — PreToolUse latency budget < 50ms p99 (lite.guard is μs)
// @rule:FR-7 — every request must pass lite.guard() with per-app trust_mask
// @rule:SDK-001 — Lite mode never reduces enforcement vs full AEGIS

import {
  lite,
  ROLE_MASK,
  TRUST_PERM,
  AegisLiteError,
  type LiteAgent,
  type LiteGuardResult,
} from './aegis-lite-vendored.js';

/**
 * Default trust mask for any app the user has consented to via TOFU.
 * Includes the basic role (READ+QUERY+WRITE+EXECUTE) plus the four AI_*
 * capability bits that cover LLM API calls. P2 TOFU dialog will let users
 * clear individual AI_* bits (e.g. deny AI_EXECUTE for read-only review tools).
 */
export const DESKTOP_AGENT_MASK =
  ROLE_MASK.EXECUTOR |
  TRUST_PERM.AI_READ |
  TRUST_PERM.AI_QUERY |
  TRUST_PERM.AI_SUGGEST |
  TRUST_PERM.AI_EXECUTE;

/**
 * Mapping from {request shape} → which AEGIS TRUST_PERM bit is being exercised.
 * P2 step 1 is coarse-grained: all LLM API calls are AI_EXECUTE. P2 step 2
 * (next task) will distinguish: tool-using requests → AI_EXECUTE, plain
 * inference → AI_QUERY, etc.
 */
export interface AegisCheckInput {
  /** Resolved app_id from ASD-T-006. */
  appId: string;
  /** Provider-detected intent — for now, treat all observed LLM calls as AI_EXECUTE. */
  hasTools: boolean;
  isStreaming: boolean;
}

export function resolveCapability(_input: AegisCheckInput): number {
  // P2 step 1: coarse. AI_EXECUTE covers any agentic LLM call.
  return TRUST_PERM.AI_EXECUTE;
}

/**
 * Per-app agent cache. Each app_id seen gets a stable LiteAgent with the
 * default DESKTOP_AGENT_MASK. P2 ASD-T-015 (TOFU) will replace the default
 * with a user-chosen mask read from ~/.ankrshield/apps/{app-id}.json.
 *
 * The cache is in-memory only — agents are reconstructed on every proxy
 * restart from the apps registry. This is correct: trust masks are not the
 * source of truth, the apps.json + (future) per-app policy file is.
 */
export class AegisGate {
  private readonly agents = new Map<string, LiteAgent>();

  /**
   * Get-or-create the LiteAgent for an app_id.
   * Returns the agent; idempotent.
   */
  agentFor(appId: string): LiteAgent {
    const existing = this.agents.get(appId);
    if (existing) return existing;
    const agent = lite.create({
      id: appId,
      trust_mask: DESKTOP_AGENT_MASK,
    });
    this.agents.set(appId, agent);
    return agent;
  }

  /**
   * Run a synchronous lite.guard() check. Returns the LiteGuardResult on
   * success; throws AegisLiteError on deny. Callers catch the error and
   * emit aegis.denied + return 403 to the client.
   *
   * Designed to be O(1) on the hot path — single bitmask AND.
   */
  guard(input: AegisCheckInput): LiteGuardResult {
    const agent = this.agentFor(input.appId);
    const capability = resolveCapability(input);
    return lite.guard(agent, capability);
  }

  /**
   * Test/debug helper — view what the cache contains.
   */
  snapshot(): Array<{ appId: string; trust_mask_hex: string }> {
    return [...this.agents.values()].map((a) => ({
      appId: a.id,
      trust_mask_hex: `0x${a.trust_mask.toString(16).padStart(8, '0')}`,
    }));
  }

  /**
   * Override the trust_mask for an app_id. Used by P2 TOFU dialog (ASD-T-015)
   * when the user picks a non-default mask. Idempotent re-set.
   */
  setTrustMask(appId: string, mask: number): LiteAgent {
    const agent = lite.create({ id: appId, trust_mask: mask });
    this.agents.set(appId, agent);
    return agent;
  }
}

// Re-export for external use (tests, smoke).
export { AegisLiteError, TRUST_PERM, ROLE_MASK };
