// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — DAN gate pending queue (ASD-T-016)
//
// Holds the upstream forward of a request whose declared tools include
// HIGH-category entries until the user approves via the chosen carrier
// (OS notification by default; WA/TG in T-017). 30s default timeout per
// Vivechana Decision 3 (range 15-120s — T-018 makes it configurable).
//
// @rule:ASD-008 — DAN gate for HIGH-category operations
// @rule:INF-ASD-008 — hold pending, notify, deny on timeout

import crypto from 'node:crypto';

import type { CategorizedTool } from './dan-categorizer.js';

export interface DanRequest {
  /** Stable per-hold UUID; appears in IPC + carrier notifications. */
  pendingId: string;
  appId: string;
  hostname: string;
  /** ISO-8601 UTC. */
  heldAt: string;
  /** Timeout in ms — see Vivechana Decision 3 (default 30000, range 15000-120000). */
  timeoutMs: number;
  /** The HIGH-category tools that triggered the gate. */
  highRiskTools: CategorizedTool[];
}

export interface DanOutcome {
  decision: 'allow' | 'deny';
  /** True if 60s timeout fired (treated as deny per INF-ASD-008). */
  timedOut: boolean;
}

export interface DanNotifier {
  /** Called once per hold; fire OS notification / WhatsApp / Telegram. */
  notify(req: DanRequest): void;
  /** Optional cleanup hook when a held request resolves. */
  onResolved?(pendingId: string, outcome: DanOutcome): void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 120_000;

export interface PendingDanQueueOptions {
  timeoutMs?: number;
  /**
   * Carrier(s) to notify on each hold. Allows fan-out (e.g., OS + WA in P3).
   * Empty array is permitted for tests; production wiring always passes ≥1.
   */
  carriers?: DanNotifier[];
  /** Renderer/event-bus broadcast hooks. */
  onPendingAdded?: (req: DanRequest) => void;
  onResolved?: (pendingId: string, outcome: DanOutcome) => void;
}

export class PendingDanQueue {
  private readonly pending = new Map<
    string,
    {
      req: DanRequest;
      resolve: (outcome: DanOutcome) => void;
      timer: NodeJS.Timeout;
      carriers: DanNotifier[];
    }
  >();
  private readonly timeoutMs: number;
  private readonly carriers: DanNotifier[];
  private readonly onPendingAdded?: (req: DanRequest) => void;
  private readonly onResolved?: (pendingId: string, outcome: DanOutcome) => void;

  constructor(opts: PendingDanQueueOptions = {}) {
    const raw = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.timeoutMs = clampTimeout(raw);
    this.carriers = opts.carriers ?? [];
    this.onPendingAdded = opts.onPendingAdded;
    this.onResolved = opts.onResolved;
  }

  /**
   * Hold the request. Fires every carrier's notify() exactly once. Resolves
   * when the user decides via resolve() OR the timeout fires (timed-out =
   * deny per INF-ASD-008).
   */
  hold(args: {
    appId: string;
    hostname: string;
    highRiskTools: CategorizedTool[];
    /**
     * Per-hold carrier override (ASD-T-017). When provided, replaces the
     * queue's default carriers for this hold only — used by the proxy to
     * route based on the app's stored dan_carrier policy.
     */
    carriers?: DanNotifier[];
  }): Promise<DanOutcome & { pendingId: string }> {
    const pendingId = crypto.randomUUID();
    const req: DanRequest = {
      pendingId,
      appId: args.appId,
      hostname: args.hostname,
      heldAt: new Date().toISOString(),
      timeoutMs: this.timeoutMs,
      highRiskTools: args.highRiskTools,
    };
    const activeCarriers = args.carriers ?? this.carriers;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(pendingId);
        if (!entry) return;
        this.pending.delete(pendingId);
        const outcome: DanOutcome = { decision: 'deny', timedOut: true };
        this.fireResolved(pendingId, outcome, entry.carriers);
        resolve({ ...outcome, pendingId });
      }, this.timeoutMs);

      this.pending.set(pendingId, {
        req,
        timer,
        carriers: activeCarriers,
        resolve: (outcome) => {
          clearTimeout(timer);
          this.pending.delete(pendingId);
          this.fireResolved(pendingId, outcome, activeCarriers);
          resolve({ ...outcome, pendingId });
        },
      });

      // Notify carriers + renderer hook AFTER the entry is in the map so
      // any IPC list() call from the carrier sees the new entry.
      for (const c of activeCarriers) {
        try {
          c.notify(req);
        } catch (err) {
          // Carrier failure must not block other carriers or the hold itself.
          // Log + continue — the proxy still has the renderer-side inbox as a
          // backstop.
          // eslint-disable-next-line no-console
          console.warn(
            `[aegis-proxy] DAN carrier notify failed for ${req.appId} -> ${req.hostname}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      this.onPendingAdded?.(req);
    });
  }

  resolve(pendingId: string, decision: 'allow' | 'deny'): boolean {
    const entry = this.pending.get(pendingId);
    if (!entry) return false;
    entry.resolve({ decision, timedOut: false });
    return true;
  }

  list(): DanRequest[] {
    return [...this.pending.values()].map((e) => e.req);
  }

  size(): number {
    return this.pending.size;
  }

  /** Shutdown — timeout-deny every pending request. */
  drain(): void {
    for (const entry of [...this.pending.values()]) {
      entry.resolve({ decision: 'deny', timedOut: true });
    }
  }

  private fireResolved(pendingId: string, outcome: DanOutcome, carriers: DanNotifier[]): void {
    this.onResolved?.(pendingId, outcome);
    for (const c of carriers) {
      try {
        c.onResolved?.(pendingId, outcome);
      } catch {
        // ignore — carrier hooks are best-effort
      }
    }
  }
}

function clampTimeout(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  if (raw < MIN_TIMEOUT_MS) return MIN_TIMEOUT_MS;
  if (raw > MAX_TIMEOUT_MS) return MAX_TIMEOUT_MS;
  return raw;
}

export const __limits = { DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS };
