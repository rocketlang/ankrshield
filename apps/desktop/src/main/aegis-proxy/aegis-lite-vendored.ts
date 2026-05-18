// SPDX-License-Identifier: AGPL-3.0-only
// VENDORED COPY of @xshieldai/aegis@2.2.0 / lite mode.
//
// Why vendored: upstream ships .ts source via package.json `main: "./index.ts"`
// + `exports./lite: "./src/sdk/lite.ts"` with no compiled .js output. Node
// can't load .ts at runtime and our tsc setup (moduleResolution: node10) won't
// resolve the package exports map. Until upstream ships compiled .js (or we
// switch our build to bundle node_modules via esbuild), we vendor the lite
// module here.
//
// Source: https://github.com/rocketlang/aegis (now @xshieldai/aegis)
//         /root/aegis/src/sdk/lite.ts at commit f1ecb6f (2026-05-18,
//         post @rocketlang → @xshieldai docstring fix; see ASD-T-011)
//
// How to update: when upstream ships compiled .js OR our build adds esbuild
// bundling of node_modules, delete this file and:
//   import { lite, TRUST_PERM, ROLE_MASK, AegisLiteError } from '@xshieldai/aegis/lite';
// Diff this file against /root/aegis/src/sdk/lite.ts before re-importing to
// catch upstream changes since vendor date.
//
// @rule:SDK-001 — Lite mode never reduces enforcement vs full AEGIS
// @rule:SDK-002 — Lite mode exposes trust_mask validation only; no kernel enforcement
// @rule:ASD-YK-001 — PreToolUse latency budget — lite.guard() is a single
//   bitmask AND + compare; runs in microseconds, well under the 50ms p99 budget

// ─── Re-export trust constants for convenience ────────────────────────────────

export const TRUST_PERM = {
  READ: 1 << 0,
  QUERY: 1 << 1,
  WRITE: 1 << 2,
  EXECUTE: 1 << 3,
  APPROVE: 1 << 4,
  AUDIT: 1 << 5,
  ADMIN: 1 << 6,
  SUPER: 1 << 7,
  BOOK: 1 << 8,
  MANIFEST: 1 << 9,
  BL_ISSUE: 1 << 10,
  RATE_DESK: 1 << 11,
  FEEDER_OPS: 1 << 12,
  NETWORK_PLAN: 1 << 13,
  VESSEL_OPS: 1 << 14,
  COMPLIANCE_OVERRIDE: 1 << 15,
  GATE_IN: 1 << 16,
  TRACK: 1 << 17,
  FTA_CHECK: 1 << 18,
  ALERT_ACK: 1 << 19,
  PORT_OPS: 1 << 20,
  AI_READ: 1 << 24,
  AI_QUERY: 1 << 25,
  AI_SUGGEST: 1 << 26,
  AI_EXECUTE: 1 << 27,
  AI_APPROVE: 1 << 28,
  AUTONOMOUS: 1 << 29,
} as const;

export type TrustPerm = (typeof TRUST_PERM)[keyof typeof TRUST_PERM];

export const ROLE_MASK = {
  GUEST: 0,
  VIEWER: TRUST_PERM.READ | TRUST_PERM.QUERY,
  WRITER: TRUST_PERM.READ | TRUST_PERM.QUERY | TRUST_PERM.WRITE,
  EXECUTOR: TRUST_PERM.READ | TRUST_PERM.QUERY | TRUST_PERM.WRITE | TRUST_PERM.EXECUTE,
  AUDITOR: TRUST_PERM.READ | TRUST_PERM.QUERY | TRUST_PERM.AUDIT,
  ADMIN: (1 << 7) - 1, // bits 0-6
} as const;

// ─── Agent handle ─────────────────────────────────────────────────────────────

export interface LiteAgent {
  id: string;
  trust_mask: number;
  created_at: string;
}

export interface LiteGuardResult {
  allowed: boolean;
  agent_id: string;
  capability: number;
  capability_hex: string;
  trust_mask: number;
  trust_mask_hex: string;
  reason: string;
}

export class AegisLiteError extends Error {
  constructor(
    public readonly agent_id: string,
    public readonly capability: number,
    public readonly trust_mask: number
  ) {
    super(
      `[AEGIS Lite] Agent '${agent_id}' denied — capability 0x${capability
        .toString(16)
        .padStart(8, '0')} not in trust_mask 0x${trust_mask.toString(16).padStart(8, '0')}`
    );
    this.name = 'AegisLiteError';
  }
}

// ─── Lite API ─────────────────────────────────────────────────────────────────

export const lite = {
  create(config: { id: string; trust_mask: number }): LiteAgent {
    if (config.trust_mask === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[AEGIS Lite] Warning: agent '${config.id}' has trust_mask: 0 — all capabilities will be denied. Set a non-zero trust_mask or use ROLE_MASK presets.`
      );
    }
    return {
      id: config.id,
      trust_mask: config.trust_mask,
      created_at: new Date().toISOString(),
    };
  },

  can(agent: LiteAgent, capability: number): boolean {
    return (agent.trust_mask & capability) !== 0;
  },

  guard(agent: LiteAgent, capability: number): LiteGuardResult {
    const allowed = (agent.trust_mask & capability) !== 0;
    const result: LiteGuardResult = {
      allowed,
      agent_id: agent.id,
      capability,
      capability_hex: `0x${capability.toString(16).padStart(8, '0')}`,
      trust_mask: agent.trust_mask,
      trust_mask_hex: `0x${agent.trust_mask.toString(16).padStart(8, '0')}`,
      reason: allowed ? `capability bit present in trust_mask` : `capability bit not in trust_mask`,
    };
    if (!allowed) throw new AegisLiteError(agent.id, capability, agent.trust_mask);
    return result;
  },

  validate(agent: LiteAgent, capability: number): LiteGuardResult {
    const allowed = (agent.trust_mask & capability) !== 0;
    return {
      allowed,
      agent_id: agent.id,
      capability,
      capability_hex: `0x${capability.toString(16).padStart(8, '0')}`,
      trust_mask: agent.trust_mask,
      trust_mask_hex: `0x${agent.trust_mask.toString(16).padStart(8, '0')}`,
      reason: allowed ? `capability bit present in trust_mask` : `capability bit not in trust_mask`,
    };
  },

  inspect(agent: LiteAgent): Record<string, boolean> {
    return Object.fromEntries(
      Object.entries(TRUST_PERM).map(([name, bit]) => [name, (agent.trust_mask & bit) !== 0])
    );
  },
} as const;
