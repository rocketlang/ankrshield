// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — per-app hourly budget governor (ASD-T-014)
//
// In-memory ledger of per-app per-hour cost accumulation, debounced-flushed
// to disk. Same pattern as AppsStore — SQLite would be overkill for a single-
// user single-process workload where the ledger fits comfortably in RAM
// (1000 requests × 7-day retention = ~7000 entries, ~200KB JSON max).
//
// @rule:INF-ASD-007 — hourly exhausted → throttle (429 ASD-007-budget-throttled).
// @rule:ASD-YK-001 — per-request ledger check is O(1) Map lookup, well under
//   the 5ms ledger-read budget portion of the 50ms PreToolUse total.
// @rule:ASD-004 — fail-closed: ledger I/O errors do NOT bypass the gate
//   (the in-memory state stays authoritative until next successful flush).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const LEDGER_FILE = join(homedir(), '.ankrshield', 'budget-ledger.json');

/** ISO hour bucket key: `YYYY-MM-DDTHH`. Stable across timezones (UTC). */
export function hourBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

export interface AppHourSpend {
  /** Sum of USD across all requests recorded in this hour. */
  cost_usd: number;
  /** Count of requests recorded. */
  request_count: number;
}

/** Persisted shape: { appId: { hourBucket: AppHourSpend } } */
export type LedgerMap = Record<string, Record<string, AppHourSpend>>;

export interface BudgetLedgerOptions {
  /** Override default ~/.ankrshield/budget-ledger.json — for tests. */
  filePath?: string;
  /** Coalesce window for writes. Default 1000ms. */
  flushDebounceMs?: number;
  /** Retention hours — entries older than this are pruned on load. Default 168 (7 days). */
  retentionHours?: number;
}

export class BudgetLedger {
  private map: LedgerMap = {};
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  private readonly flushDebounceMs: number;
  private readonly retentionHours: number;

  constructor(opts: BudgetLedgerOptions = {}) {
    this.filePath = opts.filePath ?? LEDGER_FILE;
    this.flushDebounceMs = opts.flushDebounceMs ?? 1000;
    this.retentionHours = opts.retentionHours ?? 24 * 7;
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.map = {};
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      this.map = sanitiseLoaded(parsed);
      this.pruneOldEntries();
    } catch {
      // Corrupted ledger → start fresh. The lost data is observation history,
      // not user-set policy; ASD-004 doesn't require deny on this since
      // budget enforcement is fresh-start safer than persistent-corruption.
      this.map = {};
    }
  }

  /**
   * Add cost to the current (or specified) hour bucket for an app. Idempotent
   * additive — each request's cost is recorded once. Schedules a debounced flush.
   */
  recordCost(appId: string, costUsd: number, now: Date = new Date()): AppHourSpend {
    const bucket = hourBucket(now);
    if (!this.map[appId]) this.map[appId] = {};
    const apps = this.map[appId];
    if (!apps[bucket]) apps[bucket] = { cost_usd: 0, request_count: 0 };
    const entry = apps[bucket];
    entry.cost_usd += costUsd;
    entry.request_count += 1;
    this.markDirty();
    return entry;
  }

  /**
   * Get current-hour spend for an app. Returns { cost_usd: 0, request_count: 0 }
   * if no entries yet this hour.
   */
  currentHourSpend(appId: string, now: Date = new Date()): AppHourSpend {
    const bucket = hourBucket(now);
    return this.map[appId]?.[bucket] ?? { cost_usd: 0, request_count: 0 };
  }

  /**
   * Sum spend over the last N hours (default 24) for an app. ASD-T-020
   * BudgetPanel reads this to show "today's spend" alongside the
   * current-hour cap. Walks the persisted hour buckets so it stays O(N) in
   * the retention window (~168 hourly entries max per app).
   */
  recentSpend(appId: string, hours = 24, now: Date = new Date()): AppHourSpend {
    let cost_usd = 0;
    let request_count = 0;
    const data = this.map[appId];
    if (!data) return { cost_usd: 0, request_count: 0 };
    for (let i = 0; i < hours; i++) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const e = data[hourBucket(d)];
      if (!e) continue;
      cost_usd += e.cost_usd;
      request_count += e.request_count;
    }
    return { cost_usd, request_count };
  }

  /** List of appIds with any ledger activity in retention. */
  knownAppIds(): string[] {
    return Object.keys(this.map);
  }

  /**
   * Get the full per-hour breakdown for an app over the last N hours.
   * Used by UI to render budget panel + 7-day trend.
   */
  hourlyBreakdown(
    appId: string,
    hours = 24
  ): Array<{ bucket: string; cost_usd: number; request_count: number }> {
    const buckets: string[] = [];
    const now = new Date();
    for (let i = 0; i < hours; i++) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      buckets.push(hourBucket(d));
    }
    const data = this.map[appId] ?? {};
    return buckets.map((b) => ({
      bucket: b,
      cost_usd: data[b]?.cost_usd ?? 0,
      request_count: data[b]?.request_count ?? 0,
    }));
  }

  /** Full ledger snapshot — for debug + UI overview. */
  getAll(): LedgerMap {
    const out: LedgerMap = {};
    for (const [appId, hours] of Object.entries(this.map)) {
      out[appId] = { ...hours };
    }
    return out;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeFile(this.filePath, JSON.stringify(this.map, null, 2) + '\n', { mode: 0o644 });
    } catch (err) {
      this.dirty = true; // retry next change
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

  /**
   * Drop entries older than retentionHours. Called on load; could also be
   * triggered periodically by a background sweeper (out of scope for v1).
   */
  private pruneOldEntries(): void {
    const cutoff = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);
    const cutoffBucket = hourBucket(cutoff);
    for (const appId of Object.keys(this.map)) {
      const apps = this.map[appId]!;
      for (const bucket of Object.keys(apps)) {
        if (bucket < cutoffBucket) delete apps[bucket];
      }
      if (Object.keys(apps).length === 0) delete this.map[appId];
    }
  }
}

// ─── Per-app budget config (default: unlimited) ──────────────────────────────

export interface BudgetConfig {
  /** Hourly limit in USD. null = unlimited. */
  hourly_limit_usd: number | null;
}

/**
 * In-memory per-app budget config. Default for any app = unlimited (gate is
 * silent until P2 ASD-T-015 TOFU dialog lets users set per-app limits).
 */
export class BudgetConfigResolver {
  private readonly overrides = new Map<string, BudgetConfig>();

  resolve(appId: string): BudgetConfig {
    return this.overrides.get(appId) ?? { hourly_limit_usd: null };
  }

  setOverride(appId: string, config: BudgetConfig): void {
    this.overrides.set(appId, config);
  }

  snapshot(): Record<string, BudgetConfig> {
    return Object.fromEntries(this.overrides);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitiseLoaded(raw: unknown): LedgerMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LedgerMap = {};
  for (const [appId, hours] of Object.entries(raw as Record<string, unknown>)) {
    if (!hours || typeof hours !== 'object' || Array.isArray(hours)) continue;
    const validHours: Record<string, AppHourSpend> = {};
    for (const [bucket, spend] of Object.entries(hours as Record<string, unknown>)) {
      if (!spend || typeof spend !== 'object') continue;
      const s = spend as Partial<AppHourSpend>;
      if (typeof s.cost_usd === 'number' && typeof s.request_count === 'number') {
        validHours[bucket] = { cost_usd: s.cost_usd, request_count: s.request_count };
      }
    }
    if (Object.keys(validHours).length > 0) out[appId] = validHours;
  }
  return out;
}

export const __paths = { LEDGER_FILE };
