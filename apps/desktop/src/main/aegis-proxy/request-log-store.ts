// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — request log ring buffer (ASD-T-030 / FR-16 P3)
//
// In-memory ring buffer of the last N proxy events so the renderer's
// /replay route can show "what happened in the past 24 hours" without
// reading the on-disk audit/ tree. Backed by the same AegisProxyEventBus
// that AgentFeed + EventTallyStore subscribe to.
//
// Scope: subscribes to the events the user cares about during replay —
// request.observed, response.observed, denials/blocks, kill_switch.blocked.
// Skips internal scaffolding events (consent.pending/resolved, dan.skipped,
// cost.recorded) to keep the buffer focused.
//
// Bounded by entry count (default 2000) + horizon (default 24h). On
// snapshot, expired entries are dropped lazily. Memory cap: ~2000 events
// × ~1 KB summary each = ~2 MB worst case.
//
// @rule:ASD-007 — long-horizon storage lives in audit/; THIS file is a
//   live in-memory mirror sized for the replay UX.
// @rule:ASD-008 — observation only; no telemetry leaves the device.

import type { AegisProxyEvent, AegisProxyEventBus } from './event-bus.js';

export interface ReplayEntry {
  /** Stable per-event id (uses requestId; events without one use a synthetic). */
  id: string;
  /** ISO-8601 UTC. */
  timestamp: string;
  /** Kind name as on the event bus. */
  kind: string;
  /** Best-effort app id (empty string when not applicable). */
  appId: string;
  /** Best-effort hostname (empty string when not applicable). */
  hostname: string;
  /** Free-form summary line for the UI list view. */
  summary: string;
  /** Verbatim event payload (already plain JSON via the bus). */
  raw: AegisProxyEvent;
}

export interface RequestLogStoreOptions {
  /** Max retained entries. Default 2000. */
  maxEntries?: number;
  /** Drop entries older than this many ms. Default 24h. */
  horizonMs?: number;
  /** Override clock for tests. */
  now?: () => number;
}

const DEFAULT_MAX = 2000;
const DEFAULT_HORIZON = 24 * 60 * 60 * 1000;

export class RequestLogStore {
  private readonly entries: ReplayEntry[] = [];
  private readonly maxEntries: number;
  private readonly horizonMs: number;
  private readonly nowFn: () => number;
  private unsub: (() => void) | null = null;

  constructor(opts: RequestLogStoreOptions = {}) {
    this.maxEntries = Math.max(50, opts.maxEntries ?? DEFAULT_MAX);
    this.horizonMs = Math.max(60_000, opts.horizonMs ?? DEFAULT_HORIZON);
    this.nowFn = opts.now ?? (() => Date.now());
  }

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
   * Time-windowed list of entries. `since`/`until` are ISO strings; both
   * inclusive. Omitted bounds default to (now - horizonMs) and now.
   * Lazy-prunes expired entries on read.
   */
  list(opts: { since?: string; until?: string } = {}): ReplayEntry[] {
    this.prune();
    const sinceMs = opts.since ? Date.parse(opts.since) : this.nowFn() - this.horizonMs;
    const untilMs = opts.until ? Date.parse(opts.until) : this.nowFn();
    return this.entries.filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= sinceMs && t <= untilMs;
    });
  }

  /** Diagnostics — total entries currently held (post-prune). */
  size(): number {
    this.prune();
    return this.entries.length;
  }

  /** Range covered (oldest..newest) after prune. */
  range(): { oldest: string | null; newest: string | null } {
    this.prune();
    if (this.entries.length === 0) return { oldest: null, newest: null };
    return {
      oldest: this.entries[0]!.timestamp,
      newest: this.entries[this.entries.length - 1]!.timestamp,
    };
  }

  /** For tests. */
  clear(): void {
    this.entries.length = 0;
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private handle(e: AegisProxyEvent): void {
    const entry = projectEvent(e);
    if (!entry) return;
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  private prune(): void {
    const cutoff = this.nowFn() - this.horizonMs;
    while (this.entries.length > 0 && Date.parse(this.entries[0]!.timestamp) < cutoff) {
      this.entries.shift();
    }
  }
}

/**
 * Reduce a bus event to a single replay entry. Returns null for events that
 * are noise for the replay UI (consent lifecycle, dan.skipped, cost.recorded).
 */
function projectEvent(e: AegisProxyEvent): ReplayEntry | null {
  switch (e.kind) {
    case 'request.observed': {
      const o = e.observation;
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: o.appId,
        hostname: o.hostname,
        summary:
          `${o.appId} → ${o.hostname} ${o.method} ${o.path}` +
          (o.model ? ` (${o.model})` : '') +
          (o.isStreaming ? ' ⟂' : ''),
        raw: e,
      };
    }
    case 'response.observed':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: '',
        hostname: '',
        summary:
          `← ${e.observation.statusCode}` +
          ` ${e.observation.latencyMs}ms` +
          (e.observation.promptTokens != null
            ? ` ${e.observation.promptTokens}+${e.observation.completionTokens ?? '?'} tok`
            : ''),
        raw: e,
      };
    case 'aegis.denied':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: e.hostname,
        summary: `AEGIS denied ${e.appId}: ${e.reason}`,
        raw: e,
      };
    case 'pii.redacted':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: e.hostname,
        summary: `${e.total} PII span(s) redacted in request body`,
        raw: e,
      };
    case 'pii.blocked':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: e.hostname,
        summary: `Request blocked — ${e.total} PII span(s) detected`,
        raw: e,
      };
    case 'pii.stream.redacted':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: e.hostname,
        summary: `${e.total} PII span(s) redacted in streaming response`,
        raw: e,
      };
    case 'budget.throttled':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: e.hostname,
        summary: `Budget throttled — $${e.currentSpendUsd.toFixed(4)} / $${e.hourlyLimitUsd.toFixed(2)} this hour`,
        raw: e,
      };
    case 'dan.held':
      return {
        id: e.pendingId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: e.hostname,
        summary: `DAN gate held: ${e.highRiskTools.map((t) => t.name).join(', ')}`,
        raw: e,
      };
    case 'dan.resolved':
      return {
        id: e.pendingId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: '',
        summary: `DAN ${e.timedOut ? 'TIMEOUT-deny' : e.decision} for ${e.appId}`,
        raw: e,
      };
    case 'privacy.blocked':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: '',
        hostname: e.hostname,
        summary: `Privacy engine blocked ${e.hostname} (via ${e.via})`,
        raw: e,
      };
    case 'tls.client_error':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: '',
        hostname: e.hostname,
        summary: `TLS client error on ${e.hostname}: ${e.error}`,
        raw: e,
      };
    case 'kill_switch.blocked':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: e.appId,
        hostname: e.hostname,
        summary: `Kill switch ${e.state}: blocked request from ${e.appId}`,
        raw: e,
      };
    case 'request.parse_failed':
      return {
        id: e.requestId,
        timestamp: e.timestamp,
        kind: e.kind,
        appId: '',
        hostname: e.hostname,
        summary: `Parse failed on ${e.provider}: ${e.error}`,
        raw: e,
      };
    // Noise — skipped:
    case 'consent.pending':
    case 'consent.resolved':
    case 'dan.skipped':
    case 'cost.recorded':
      return null;
    default:
      return null;
  }
}

export const __internals = { projectEvent };
