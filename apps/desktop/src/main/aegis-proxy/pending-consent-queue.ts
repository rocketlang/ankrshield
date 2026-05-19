// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — TOFU pending-consent queue (ASD-T-015)
//
// In-memory queue of request observations holding in the proxy while the
// user decides via the TOFU dialog. Each entry resolves when the user makes
// a decision OR the 60-second timeout fires (treated as 'deny').
//
// @rule:ASD-005 — first request from an unseen app holds pending dialog;
//   no silent first-call pass-through.
// @rule:ASD-YK-002 — TOFU beats allow-list for consumer surface; no app
//   pre-declaration is required because the user can't enumerate every AI
//   app they'll ever run.
// @rule:INF-ASD-004 — modal-until-decided; the dialog has exactly two
//   terminal options (Allow with budget, Deny). Timeout = deny.

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

import type { PiiPolicyChoice, DanCarrier } from './apps-policy.js';

export interface ConsentRequest {
  /** crypto.randomUUID — same shape as proxy requestId for cross-referencing. */
  pendingId: string;
  appId: string;
  hostname: string;
  /** ISO-8601 UTC — when the request was held. */
  heldAt: string;
  /** Timeout in ms (default 60_000). */
  timeoutMs: number;
}

export interface ConsentInput {
  decision: 'allow' | 'deny';
  hourly_limit_usd?: number;
  pii_policy?: PiiPolicyChoice;
  dan_carrier?: DanCarrier;
}

export interface ConsentOutcome {
  decision: 'allow' | 'deny';
  hourly_limit_usd: number | null;
  pii_policy: PiiPolicyChoice;
  dan_carrier: DanCarrier;
  /** True if the outcome was set by 60s timeout (treated as deny per INF-ASD-004). */
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export interface PendingConsentQueueOptions {
  /** Override default 60s. */
  timeoutMs?: number;
  /** Emitter for renderer broadcast hook. */
  onPendingAdded?: (req: ConsentRequest) => void;
  onResolved?: (pendingId: string, outcome: ConsentOutcome) => void;
}

/**
 * Per-process queue. Single instance owned by startAegisProxy and exposed
 * to IPC handlers + renderer.
 */
export class PendingConsentQueue extends EventEmitter {
  private readonly pending = new Map<
    string,
    { req: ConsentRequest; resolve: (outcome: ConsentOutcome) => void; timer: NodeJS.Timeout }
  >();
  private readonly timeoutMs: number;
  private readonly onPendingAdded?: (req: ConsentRequest) => void;
  private readonly onResolved?: (pendingId: string, outcome: ConsentOutcome) => void;

  constructor(opts: PendingConsentQueueOptions = {}) {
    super();
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onPendingAdded = opts.onPendingAdded;
    this.onResolved = opts.onResolved;
  }

  /**
   * Hold a request pending user decision. Resolves when the user decides
   * or the timeout fires (timed-out resolves to deny per INF-ASD-004).
   */
  hold(appId: string, hostname: string): Promise<ConsentOutcome & { pendingId: string }> {
    const pendingId = crypto.randomUUID();
    const req: ConsentRequest = {
      pendingId,
      appId,
      hostname,
      heldAt: new Date().toISOString(),
      timeoutMs: this.timeoutMs,
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(pendingId);
        if (!entry) return; // already resolved manually
        this.pending.delete(pendingId);
        const outcome: ConsentOutcome = {
          decision: 'deny',
          hourly_limit_usd: null,
          pii_policy: 'block',
          dan_carrier: 'os',
          timedOut: true,
        };
        this.onResolved?.(pendingId, outcome);
        resolve({ ...outcome, pendingId });
      }, this.timeoutMs);

      this.pending.set(pendingId, {
        req,
        timer,
        resolve: (outcome) => {
          clearTimeout(timer);
          this.pending.delete(pendingId);
          this.onResolved?.(pendingId, outcome);
          resolve({ ...outcome, pendingId });
        },
      });

      this.onPendingAdded?.(req);
    });
  }

  /**
   * Resolve a pending request with the user's decision. Validates that
   * allow decisions have a positive hourly_limit_usd (ASD-005 — no
   * unbounded allow). Returns true if resolution applied, false if
   * pendingId was unknown (already resolved or expired).
   */
  resolve(pendingId: string, input: ConsentInput): boolean {
    const entry = this.pending.get(pendingId);
    if (!entry) return false;
    let outcome: ConsentOutcome;
    if (input.decision === 'allow') {
      const hl = input.hourly_limit_usd ?? 0;
      if (!Number.isFinite(hl) || hl <= 0) {
        // Reject silently — caller should validate too, but we double-check.
        return false;
      }
      outcome = {
        decision: 'allow',
        hourly_limit_usd: hl,
        pii_policy: input.pii_policy ?? 'redact',
        dan_carrier: input.dan_carrier ?? 'os',
        timedOut: false,
      };
    } else {
      outcome = {
        decision: 'deny',
        hourly_limit_usd: null,
        pii_policy: 'block',
        dan_carrier: 'os',
        timedOut: false,
      };
    }
    entry.resolve(outcome);
    return true;
  }

  /** Snapshot of pending requests for IPC (without the resolve callbacks). */
  list(): ConsentRequest[] {
    return [...this.pending.values()].map((e) => e.req);
  }

  /** Count of currently-pending requests. */
  size(): number {
    return this.pending.size;
  }

  /** Tear down all pending requests (timeout-deny each). For app shutdown. */
  drain(): void {
    // entry.resolve() owns the onResolved emit + delete; just invoke it.
    for (const entry of [...this.pending.values()]) {
      const outcome: ConsentOutcome = {
        decision: 'deny',
        hourly_limit_usd: null,
        pii_policy: 'block',
        dan_carrier: 'os',
        timedOut: true,
      };
      entry.resolve(outcome);
    }
  }
}
