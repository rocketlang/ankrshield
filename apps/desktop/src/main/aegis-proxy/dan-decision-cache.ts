// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — session-scoped DAN decision cache (ASD-T-016)
//
// Without this, every request from an approved agentic app would re-fire the
// DAN gate — unusable. The cache remembers "user approved {app} for tool-set
// {toolset_hash} until {expiry}". Same app + same tool-set within TTL =
// skip the gate.
//
// In-memory only, per process — restart clears all decisions. TTL default
// 1 hour. Allow decisions cached; deny decisions cached for shorter window
// (so an angrily-denied app can be re-tried after a minute).
//
// Cache key: `${appId}|${sha256(sorted_unique_high_tool_names)}` — only the
// HIGH set matters, since low-cat tools never trigger the gate.

import crypto from 'node:crypto';

import type { CategorizedTool } from './dan-categorizer.js';

const DEFAULT_TTL_ALLOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_TTL_DENY_MS = 60 * 1000; // 1 minute

export interface DanDecisionCacheOptions {
  ttlAllowMs?: number;
  ttlDenyMs?: number;
  /** Override Date.now for tests. */
  now?: () => number;
}

export type CachedDanDecision = { decision: 'allow' | 'deny'; expiresAt: number };

export class DanDecisionCache {
  private readonly map = new Map<string, CachedDanDecision>();
  private readonly ttlAllowMs: number;
  private readonly ttlDenyMs: number;
  private readonly now: () => number;

  constructor(opts: DanDecisionCacheOptions = {}) {
    this.ttlAllowMs = opts.ttlAllowMs ?? DEFAULT_TTL_ALLOW_MS;
    this.ttlDenyMs = opts.ttlDenyMs ?? DEFAULT_TTL_DENY_MS;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Look up a cached decision. Returns null if absent OR expired.
   * Expired entries are evicted on read (lazy GC).
   */
  get(appId: string, highTools: CategorizedTool[]): CachedDanDecision | null {
    const key = makeKey(appId, highTools);
    const v = this.map.get(key);
    if (!v) return null;
    if (v.expiresAt <= this.now()) {
      this.map.delete(key);
      return null;
    }
    return { ...v };
  }

  set(appId: string, highTools: CategorizedTool[], decision: 'allow' | 'deny'): void {
    const key = makeKey(appId, highTools);
    const ttl = decision === 'allow' ? this.ttlAllowMs : this.ttlDenyMs;
    this.map.set(key, { decision, expiresAt: this.now() + ttl });
  }

  /** Clear all decisions for one app (e.g., user revoked via UI). */
  forgetApp(appId: string): number {
    let n = 0;
    const prefix = `${appId}|`;
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) {
        this.map.delete(k);
        n++;
      }
    }
    return n;
  }

  /** For diagnostics + tests. */
  size(): number {
    let n = 0;
    const cutoff = this.now();
    for (const v of this.map.values()) {
      if (v.expiresAt > cutoff) n++;
    }
    return n;
  }

  /** For tests: drop all entries regardless of expiry. */
  clear(): void {
    this.map.clear();
  }
}

function makeKey(appId: string, tools: CategorizedTool[]): string {
  const names = [...new Set(tools.map((t) => t.name.toLowerCase()))].sort();
  const hash = crypto.createHash('sha256').update(names.join('|')).digest('hex').slice(0, 16);
  return `${appId}|${hash}`;
}

export const __defaults = { DEFAULT_TTL_ALLOW_MS, DEFAULT_TTL_DENY_MS };
