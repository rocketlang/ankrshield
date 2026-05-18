// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — per-app TOFU policy store (ASD-T-015)
//
// Separate from AppsStore (which is observation-only). This file owns the
// USER DECISION for each app: allow-with-policy or deny. Single JSON file
// at ~/.ankrshield/apps-policy.json, same debounced-flush pattern.
//
// Schema is forward-compatible: P2 step 4 ships budget + pii_policy +
// dan_carrier fields; later phases can add more without migration.
//
// @rule:ASD-005 — per-app consent named, stored, budgeted, revocable.
//   The "budgeted" half is enforced HERE: an allow decision must include
//   hourly_limit_usd > 0; no unbounded allow.
// @rule:ASD-YK-007 — every consent record is PRAMANA-shape via consent-store.ts;
//   THIS file stores the resulting policy that the proxy reads on each request.
// @rule:ASD-007 — append-only audit lives in consent-store.ts; THIS file is the
//   mutable per-app current-policy snapshot. Latest decision wins.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const POLICY_FILE = join(homedir(), '.ankrshield', 'apps-policy.json');

export type Decision = 'allow' | 'deny';
export type PiiPolicyChoice = 'redact' | 'block' | 'off';
export type DanCarrier = 'os' | 'wa' | 'tg';

export interface AppPolicy {
  /** User's terminal decision for this app. */
  decision: Decision;
  /** ISO-8601 UTC. */
  decided_at: string;
  /**
   * Hourly USD cap for this app. REQUIRED when decision='allow' (per ASD-005
   * tightening — no unbounded allow). Null/absent when decision='deny'.
   */
  hourly_limit_usd: number | null;
  /** Default 'redact'. Per-app override (P2 ASD-T-013). */
  pii_policy: PiiPolicyChoice;
  /** Default 'os' (OS notification). Per-app override (P2 ASD-T-016+17). */
  dan_carrier: DanCarrier;
}

export type PolicyMap = Record<string, AppPolicy>;

export interface AppsPolicyStoreOptions {
  filePath?: string;
  flushDebounceMs?: number;
}

export class AppsPolicyStore {
  private map: PolicyMap = {};
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  private readonly flushDebounceMs: number;

  constructor(opts: AppsPolicyStoreOptions = {}) {
    this.filePath = opts.filePath ?? POLICY_FILE;
    this.flushDebounceMs = opts.flushDebounceMs ?? 1000;
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.map = {};
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.map = sanitiseLoaded(JSON.parse(raw));
    } catch {
      this.map = {};
    }
  }

  /**
   * Look up the policy for an app. Returns null if the user has not yet
   * made a decision — caller should hold the request in the pending queue.
   */
  get(appId: string): AppPolicy | null {
    return this.map[appId] ? { ...this.map[appId] } : null;
  }

  hasDecision(appId: string): boolean {
    return this.map[appId] != null;
  }

  /**
   * Record an allow decision with mandatory budget + chosen PII/DAN policy.
   * Throws if hourly_limit_usd <= 0 (ASD-005 — no unbounded allow).
   */
  recordAllow(
    appId: string,
    args: { hourly_limit_usd: number; pii_policy: PiiPolicyChoice; dan_carrier: DanCarrier }
  ): AppPolicy {
    if (!Number.isFinite(args.hourly_limit_usd) || args.hourly_limit_usd <= 0) {
      throw new Error(
        `ASD-005 violation: allow decision for "${appId}" must have hourly_limit_usd > 0 ` +
          `(got ${args.hourly_limit_usd}). Use recordDeny for refusals.`
      );
    }
    const policy: AppPolicy = {
      decision: 'allow',
      decided_at: new Date().toISOString(),
      hourly_limit_usd: args.hourly_limit_usd,
      pii_policy: args.pii_policy,
      dan_carrier: args.dan_carrier,
    };
    this.map[appId] = policy;
    this.markDirty();
    return policy;
  }

  recordDeny(appId: string): AppPolicy {
    const policy: AppPolicy = {
      decision: 'deny',
      decided_at: new Date().toISOString(),
      hourly_limit_usd: null,
      pii_policy: 'block', // moot for denied apps but populate honest defaults
      dan_carrier: 'os',
    };
    this.map[appId] = policy;
    this.markDirty();
    return policy;
  }

  /** Clear a decision so the user is re-prompted next time. */
  forget(appId: string): boolean {
    if (!this.map[appId]) return false;
    delete this.map[appId];
    this.markDirty();
    return true;
  }

  getAll(): PolicyMap {
    const out: PolicyMap = {};
    for (const k of Object.keys(this.map)) out[k] = { ...this.map[k]! };
    return out;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeFile(this.filePath, JSON.stringify(this.map, null, 2) + '\n', { mode: 0o644 });
    } catch (err) {
      this.dirty = true;
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushDebounceMs);
  }
}

function sanitiseLoaded(raw: unknown): PolicyMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PolicyMap = {};
  for (const [appId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as Partial<AppPolicy>;
    if ((v.decision === 'allow' || v.decision === 'deny') && typeof v.decided_at === 'string') {
      out[appId] = {
        decision: v.decision,
        decided_at: v.decided_at,
        hourly_limit_usd: typeof v.hourly_limit_usd === 'number' ? v.hourly_limit_usd : null,
        pii_policy:
          v.pii_policy === 'redact' || v.pii_policy === 'block' || v.pii_policy === 'off'
            ? v.pii_policy
            : 'redact',
        dan_carrier:
          v.dan_carrier === 'os' || v.dan_carrier === 'wa' || v.dan_carrier === 'tg'
            ? v.dan_carrier
            : 'os',
      };
    }
  }
  return out;
}

export const __paths = { POLICY_FILE };
