// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — persisted per-request audit receipts (ASD-T-031 / FR-13)
//
// Closes the FR-13 loop: every gated request produces a PRAMANA-format
// receipt on disk at ~/.ankrshield/audit/YYYY-MM-DD/request-{app}-{ts}-{nonce}.json.
// Before this task only ConsentStore wrote to that tree; per-request
// denials, redactions, DAN holds, budget throttles, and kill-switch blocks
// lived only on the event bus + in-memory tally/log stores.
//
// Persistence model mirrors ConsentStore (one file per receipt, mode 0o644,
// dir mode 0o700). Receipts are append-only and the writer never reads or
// edits prior records. The T-028 retention worker handles gzip/prune; the
// T-029 ZIP export already includes any file under the date dirs, so this
// store needs zero coordination with either.
//
// Filename prefix `request-` is deliberately distinct from `consent-` so
// the retention worker's consent counter (countConsentRecords) doesn't
// double-count and so an operator can grep one taxonomy at a time.
//
// @rule:ASD-007 — append-only; this store only writes, never edits/truncates.
// @rule:ASD-005 — capability/budget denials produce auditable artefacts.
// @rule:ASD-009 — kill-switch interventions are recorded.
// @rule:ASD-010 — privacy-engine block at the proxy edge is recorded.
// @rule:ASD-011 — PII redactions (request body + streaming response) are recorded.
//   Receipt body carries only per-type COUNTS, never the redacted strings —
//   honours the "never re-leak what you just redacted" invariant.

import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AegisProxyEvent, AegisProxyEventBus } from './event-bus.js';

const AUDIT_DIR = join(homedir(), '.ankrshield', 'audit');

/**
 * Subset of AegisProxyEvent kinds that produce a persisted receipt. We
 * intentionally exclude:
 *   - request.observed / response.observed (rolling log handles these)
 *   - consent.pending / consent.resolved   (ConsentStore writes the receipt
 *     via the ConsentDialog ceremony — double-writing would duplicate)
 *   - dan.held / dan.skipped               (terminal state captured via
 *     dan.resolved; the hold notification itself is in-memory)
 *   - cost.recorded                        (ledger handles cost capture)
 *   - request.parse_failed / tls.client_error (proxy-internal diagnostics,
 *     not a "gated request" per FR-13 wording)
 */
const PERSISTED_KINDS = new Set<AegisProxyEvent['kind']>([
  'aegis.denied',
  'pii.redacted',
  'pii.blocked',
  'pii.stream.redacted',
  'budget.throttled',
  'dan.resolved',
  'kill_switch.blocked',
  'privacy.blocked',
]);

/** Mapping event kind → ASD rule ID that owns it. Used for `rule` field. */
const KIND_RULE: Record<string, string> = {
  'aegis.denied': 'ASD-005',
  'pii.redacted': 'ASD-011',
  'pii.blocked': 'ASD-011',
  'pii.stream.redacted': 'ASD-011',
  'budget.throttled': 'ASD-005',
  'dan.resolved': 'ASD-005',
  'kill_switch.blocked': 'ASD-009',
  'privacy.blocked': 'ASD-010',
};

export interface RequestAuditReceipt {
  receipt_id: string;
  schema_version: 1;
  ts: string;
  event_kind: string;
  request_id: string;
  app_id: string;
  hostname: string;
  rule: string;
  detail: Record<string, unknown>;
}

export interface RequestAuditStoreOptions {
  /** Override default ~/.ankrshield/audit — used by tests. */
  auditDir?: string;
}

export class RequestAuditStore {
  private readonly auditDir: string;
  private unsub: (() => void) | null = null;
  private writes = 0;
  private errors = 0;
  /**
   * Test/diagnostic hook: resolves the next time write() flushes a receipt.
   * Replaced on each emit so callers must re-fetch between awaits.
   */
  private pendingWriteResolvers: Array<() => void> = [];

  constructor(opts: RequestAuditStoreOptions = {}) {
    this.auditDir = opts.auditDir ?? AUDIT_DIR;
  }

  /**
   * Subscribe to the event bus. Eligible events trigger a fire-and-forget
   * write. Bus listener is synchronous to avoid losing events under load;
   * the actual file IO runs in a detached Promise. Idempotent.
   */
  attach(bus: AegisProxyEventBus): void {
    if (this.unsub) return;
    this.unsub = bus.on((event) => {
      if (!PERSISTED_KINDS.has(event.kind)) return;
      // Fire-and-forget: errors are accounted but never thrown back into
      // the proxy hot path. A failed audit write must not deny a request.
      void this.record(event).catch(() => {
        this.errors += 1;
      });
    });
  }

  detach(): void {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
  }

  /**
   * Write a single receipt to disk. Public so the renderer / IPC layer can
   * also force-persist a synthesised event (currently unused but harmless).
   */
  async record(event: AegisProxyEvent): Promise<string | null> {
    if (!PERSISTED_KINDS.has(event.kind)) return null;
    const receipt = this.toReceipt(event);
    const date = receipt.ts.slice(0, 10);
    const dir = join(this.auditDir, date);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const filename = this.filenameFor(receipt);
    await writeFile(join(dir, filename), JSON.stringify(receipt, null, 2) + '\n', {
      mode: 0o644,
    });
    this.writes += 1;
    this.flushPendingResolvers();
    return join(dir, filename);
  }

  /**
   * List request-audit receipts for a given date (YYYY-MM-DD). Best-effort —
   * silently skips unparseable files. Used by tests + diagnostics.
   */
  async list(date: string): Promise<RequestAuditReceipt[]> {
    const dir = join(this.auditDir, date);
    if (!existsSync(dir)) return [];
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    const out: RequestAuditReceipt[] = [];
    for (const f of files) {
      if (!f.startsWith('request-') || !f.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(dir, f), 'utf8');
        out.push(JSON.parse(raw) as RequestAuditReceipt);
      } catch {
        // skip unreadable / malformed
      }
    }
    // Stable order by timestamp ascending so callers can scan chronologically.
    out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    return out;
  }

  /** Counters for diagnostics + IPC tile in the renderer. */
  stats(): { writes: number; errors: number } {
    return { writes: this.writes, errors: this.errors };
  }

  /**
   * Test helper: resolve when the next write() completes. Returns immediately
   * if a write is already in flight; the resolver fires on the next flush.
   */
  nextWrite(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingWriteResolvers.push(resolve);
    });
  }

  private flushPendingResolvers(): void {
    const pending = this.pendingWriteResolvers;
    this.pendingWriteResolvers = [];
    for (const r of pending) r();
  }

  // ─── Receipt construction ─────────────────────────────────────────────────

  private toReceipt(event: AegisProxyEvent): RequestAuditReceipt {
    const { app_id, hostname, detail } = projectEvent(event);
    return {
      receipt_id: crypto.randomUUID(),
      schema_version: 1,
      ts: new Date().toISOString(),
      event_kind: event.kind,
      request_id: event.requestId,
      app_id,
      hostname,
      rule: KIND_RULE[event.kind] ?? 'ASD-007',
      detail,
    };
  }

  private filenameFor(receipt: RequestAuditReceipt): string {
    const appSafe = sanitiseForFilename(receipt.app_id || 'unknown');
    const tsSafe = receipt.ts.replace(/[:.]/g, '-');
    const nonce = receipt.receipt_id.slice(0, 8);
    const kindSafe = receipt.event_kind.replace(/\./g, '_');
    return `request-${kindSafe}-${appSafe}-${tsSafe}-${nonce}.json`;
  }
}

/**
 * Project a typed event into a uniform {app_id, hostname, detail} triple.
 * Strips event scaffolding (kind/requestId/timestamp) and lifts the
 * remaining payload into `detail`. PII counts (Record<string, number>) pass
 * through; redacted SPANS never appear on the bus and so cannot leak here.
 */
function projectEvent(event: AegisProxyEvent): {
  app_id: string;
  hostname: string;
  detail: Record<string, unknown>;
} {
  switch (event.kind) {
    case 'aegis.denied':
      return {
        app_id: event.appId,
        hostname: event.hostname,
        detail: {
          capability_hex: event.capability_hex,
          trust_mask_hex: event.trust_mask_hex,
          reason: event.reason,
        },
      };
    case 'pii.redacted':
    case 'pii.blocked':
    case 'pii.stream.redacted':
      return {
        app_id: event.appId,
        hostname: event.hostname,
        detail: { counts: event.counts, total: event.total },
      };
    case 'budget.throttled':
      return {
        app_id: event.appId,
        hostname: event.hostname,
        detail: {
          currentSpendUsd: event.currentSpendUsd,
          hourlyLimitUsd: event.hourlyLimitUsd,
          bucket: event.bucket,
        },
      };
    case 'dan.resolved':
      return {
        app_id: event.appId,
        hostname: '',
        detail: {
          pendingId: event.pendingId,
          decision: event.decision,
          timedOut: event.timedOut,
        },
      };
    case 'kill_switch.blocked':
      return {
        app_id: event.appId,
        hostname: event.hostname,
        detail: { state: event.state },
      };
    case 'privacy.blocked':
      return {
        app_id: '',
        hostname: event.hostname,
        detail: { via: event.via },
      };
    default:
      return { app_id: '', hostname: '', detail: {} };
  }
}

function sanitiseForFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64);
}

export const __paths = { AUDIT_DIR };
export const __internals = { PERSISTED_KINDS, KIND_RULE, projectEvent, sanitiseForFilename };
