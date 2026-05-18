// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — event tally store (ASD-T-024)
//
// In-memory subscriber to AegisProxyEventBus that maintains per-app per-day
// counters for the events the HanumanG report card surfaces: requests,
// PII redactions (request + streaming), AEGIS denials, DAN gate holds /
// approvals / denials / skips, budget throttles. Cost totals live in
// BudgetLedger; this store stays out of cost accounting to avoid two
// sources of truth.
//
// Rolling 7-day retention; pruned lazily on read. No JSON persistence yet —
// the report card is a "what happened in the last 24h" view; longer-window
// reasoning lives in the audit/ directory (P3 ASD-T-027 retention worker).
//
// @rule:ASD-007 — append-only audit lives elsewhere; THIS file is the
//   live in-memory tally used by the report-card UI.
// @rule:ASD-YK-001 — observation-only; subscription is event-driven so the
//   request hot path never blocks on tally writes.

import type { AegisProxyEvent, AegisProxyEventBus } from './event-bus.js';

export interface DayBucket {
  /** YYYY-MM-DD (UTC). */
  date: string;
  request_observed: number;
  pii_redacted: number;
  pii_blocked: number;
  pii_stream_redacted: number;
  aegis_denied: number;
  dan_held: number;
  dan_allowed: number;
  dan_denied: number;
  dan_timed_out: number;
  dan_skipped_cached_allow: number;
  dan_skipped_cached_deny: number;
  dan_skipped_no_high_tools: number;
  budget_throttled: number;
  /** Aggregate count of PII spans (sum across counts maps). */
  pii_spans_total: number;
  /** First-seen and last-seen ISO timestamps in this bucket. */
  first_seen: string | null;
  last_seen: string | null;
}

export type AppDayMap = Record<string, Record<string, DayBucket>>; // appId → date → bucket

export interface EventTallyStoreOptions {
  /** Retention in days; older buckets pruned on read. Default 7. */
  retentionDays?: number;
  /** Override clock for tests. */
  now?: () => Date;
}

const DEFAULT_RETENTION = 7;

export class EventTallyStore {
  private readonly map: AppDayMap = {};
  private readonly retentionDays: number;
  private readonly nowFn: () => Date;
  private unsub: (() => void) | null = null;

  constructor(opts: EventTallyStoreOptions = {}) {
    this.retentionDays = Math.max(1, opts.retentionDays ?? DEFAULT_RETENTION);
    this.nowFn = opts.now ?? (() => new Date());
  }

  /** Subscribe to the event bus. Returns the unsubscribe handle (also stored). */
  attach(bus: AegisProxyEventBus): () => void {
    if (this.unsub) this.unsub();
    this.unsub = bus.on((e) => this.handle(e));
    return this.unsub;
  }

  detach(): void {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
  }

  /**
   * Per-app per-day snapshot, oldest-to-newest. `since` / `until` are
   * Date instances; missing entries are zero-filled across the range so
   * the UI sees contiguous buckets.
   */
  range(appId: string, sinceDays: number): DayBucket[] {
    this.prune();
    const out: DayBucket[] = [];
    const apps = this.map[appId] ?? {};
    const now = this.nowFn();
    for (let i = sinceDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = dayKey(d);
      out.push(apps[key] ?? blankBucket(key));
    }
    return out;
  }

  /** Sum of all per-app buckets in the rolling window. */
  rollup(appId: string, sinceDays: number = 1): DayBucket {
    const slice = this.range(appId, sinceDays);
    const out = blankBucket('rollup');
    for (const b of slice) {
      out.request_observed += b.request_observed;
      out.pii_redacted += b.pii_redacted;
      out.pii_blocked += b.pii_blocked;
      out.pii_stream_redacted += b.pii_stream_redacted;
      out.aegis_denied += b.aegis_denied;
      out.dan_held += b.dan_held;
      out.dan_allowed += b.dan_allowed;
      out.dan_denied += b.dan_denied;
      out.dan_timed_out += b.dan_timed_out;
      out.dan_skipped_cached_allow += b.dan_skipped_cached_allow;
      out.dan_skipped_cached_deny += b.dan_skipped_cached_deny;
      out.dan_skipped_no_high_tools += b.dan_skipped_no_high_tools;
      out.budget_throttled += b.budget_throttled;
      out.pii_spans_total += b.pii_spans_total;
      if (b.first_seen && (!out.first_seen || b.first_seen < out.first_seen)) {
        out.first_seen = b.first_seen;
      }
      if (b.last_seen && (!out.last_seen || b.last_seen > out.last_seen)) {
        out.last_seen = b.last_seen;
      }
    }
    return out;
  }

  /** List of appIds with any tally activity in the retention window. */
  knownAppIds(): string[] {
    this.prune();
    return Object.keys(this.map);
  }

  /** For diagnostics + tests. */
  snapshot(): AppDayMap {
    this.prune();
    const out: AppDayMap = {};
    for (const [appId, days] of Object.entries(this.map)) out[appId] = { ...days };
    return out;
  }

  /** For tests. */
  clear(): void {
    for (const k of Object.keys(this.map)) delete this.map[k];
  }

  // ─── Event dispatch ──────────────────────────────────────────────────────

  private handle(e: AegisProxyEvent): void {
    const appId = extractAppId(e);
    if (!appId) return; // events without app context (e.g. tls.client_error)
    const date = dayKey(new Date(e.timestamp));
    const bucket = this.getOrCreate(appId, date);
    bucket.last_seen = e.timestamp;
    if (!bucket.first_seen) bucket.first_seen = e.timestamp;
    switch (e.kind) {
      case 'request.observed':
        bucket.request_observed += 1;
        break;
      case 'pii.redacted':
        bucket.pii_redacted += 1;
        bucket.pii_spans_total += e.total;
        break;
      case 'pii.blocked':
        bucket.pii_blocked += 1;
        bucket.pii_spans_total += e.total;
        break;
      case 'pii.stream.redacted':
        bucket.pii_stream_redacted += 1;
        bucket.pii_spans_total += e.total;
        break;
      case 'aegis.denied':
        bucket.aegis_denied += 1;
        break;
      case 'dan.held':
        bucket.dan_held += 1;
        break;
      case 'dan.resolved':
        if (e.timedOut) bucket.dan_timed_out += 1;
        else if (e.decision === 'allow') bucket.dan_allowed += 1;
        else bucket.dan_denied += 1;
        break;
      case 'dan.skipped':
        if (e.reason === 'cached-allow') bucket.dan_skipped_cached_allow += 1;
        else if (e.reason === 'cached-deny') bucket.dan_skipped_cached_deny += 1;
        else bucket.dan_skipped_no_high_tools += 1;
        break;
      case 'budget.throttled':
        bucket.budget_throttled += 1;
        break;
      // ignore: response.observed (paired with request), cost.recorded
      // (BudgetLedger owns this), consent.*, request.parse_failed,
      // privacy.blocked (sibling subsystem), tls.client_error.
    }
  }

  private getOrCreate(appId: string, date: string): DayBucket {
    if (!this.map[appId]) this.map[appId] = {};
    const apps = this.map[appId];
    if (!apps[date]) apps[date] = blankBucket(date);
    return apps[date]!;
  }

  private prune(): void {
    const cutoff = new Date(this.nowFn().getTime() - this.retentionDays * 24 * 60 * 60 * 1000);
    const cutoffKey = dayKey(cutoff);
    for (const appId of Object.keys(this.map)) {
      const apps = this.map[appId]!;
      for (const date of Object.keys(apps)) {
        if (date < cutoffKey) delete apps[date];
      }
      if (Object.keys(apps).length === 0) delete this.map[appId];
    }
  }
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function blankBucket(date: string): DayBucket {
  return {
    date,
    request_observed: 0,
    pii_redacted: 0,
    pii_blocked: 0,
    pii_stream_redacted: 0,
    aegis_denied: 0,
    dan_held: 0,
    dan_allowed: 0,
    dan_denied: 0,
    dan_timed_out: 0,
    dan_skipped_cached_allow: 0,
    dan_skipped_cached_deny: 0,
    dan_skipped_no_high_tools: 0,
    budget_throttled: 0,
    pii_spans_total: 0,
    first_seen: null,
    last_seen: null,
  };
}

function extractAppId(e: AegisProxyEvent): string | null {
  switch (e.kind) {
    case 'request.observed':
      return e.observation.appId;
    case 'pii.redacted':
    case 'pii.blocked':
    case 'pii.stream.redacted':
    case 'aegis.denied':
    case 'dan.held':
    case 'dan.resolved':
    case 'dan.skipped':
    case 'budget.throttled':
    case 'cost.recorded':
    case 'consent.pending':
    case 'consent.resolved':
      return e.appId || null;
    default:
      return null;
  }
}

export const __internals = { dayKey, blankBucket, extractAppId };
