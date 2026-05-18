// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — typed event bus for proxy observation events
//
// @rule:ASD-006 — single Electron main process; events flow to renderer via IPC

import { EventEmitter } from 'node:events';

import type { ObservedRequest, ObservedResponse, Provider } from './observer-types.js';

/**
 * Events fired by the proxy during a request lifecycle. Subscribers (renderer
 * IPC, audit log writer, future AEGIS lite gate) consume the same stream.
 *
 * `requestId` ties paired request/response events together. Generated on the
 * first event of a request.
 */
export type AegisProxyEvent =
  | {
      kind: 'request.observed';
      requestId: string;
      timestamp: string;
      observation: ObservedRequest;
    }
  | {
      kind: 'response.observed';
      requestId: string;
      timestamp: string;
      observation: ObservedResponse;
    }
  | {
      kind: 'request.parse_failed';
      requestId: string;
      timestamp: string;
      provider: Provider;
      hostname: string;
      path: string;
      error: string;
    }
  | {
      kind: 'tls.client_error';
      requestId: string;
      timestamp: string;
      hostname: string;
      error: string;
    }
  | {
      kind: 'privacy.blocked';
      requestId: string;
      timestamp: string;
      hostname: string;
      /** Which proxy entry point intercepted it. */
      via: 'http' | 'connect';
    }
  | {
      kind: 'aegis.denied';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      /** AEGIS bitmask hex strings for renderer display. */
      capability_hex: string;
      trust_mask_hex: string;
      reason: string;
    }
  | {
      kind: 'pii.redacted';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      /** Per-type counts of redacted PII spans for renderer aggregate display. */
      counts: Record<string, number>;
      total: number;
    }
  | {
      kind: 'pii.blocked';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      counts: Record<string, number>;
      total: number;
    }
  | {
      kind: 'pii.stream.redacted';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      /** Per-type tally of streaming PII matches scrubbed before the client. */
      counts: Record<string, number>;
      total: number;
    }
  | {
      kind: 'budget.throttled';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      /** Current-hour USD spend at the moment of throttle. */
      currentSpendUsd: number;
      /** Per-app hourly cap that was exceeded. */
      hourlyLimitUsd: number;
      /** ISO hour bucket (YYYY-MM-DDTHH). */
      bucket: string;
    }
  | {
      kind: 'cost.recorded';
      requestId: string;
      timestamp: string;
      appId: string;
      model: string | null;
      costUsd: number;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | {
      kind: 'consent.pending';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      hostname: string;
      timeoutMs: number;
    }
  | {
      kind: 'consent.resolved';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      decision: 'allow' | 'deny';
      timedOut: boolean;
    }
  | {
      kind: 'dan.held';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      hostname: string;
      timeoutMs: number;
      /** Per-tool category breakdown for renderer display. */
      highRiskTools: Array<{ name: string; category: string }>;
    }
  | {
      kind: 'dan.resolved';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      decision: 'allow' | 'deny';
      timedOut: boolean;
    }
  | {
      kind: 'dan.skipped';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      /** 'cached' = decision-cache hit; 'no-high-tools' = nothing to gate. */
      reason: 'cached-allow' | 'cached-deny' | 'no-high-tools';
    };

export type AegisProxyEventListener = (event: AegisProxyEvent) => void;

/**
 * Single-channel typed event bus. Wraps EventEmitter so callers don't have to
 * stringify event names. One bus per proxy instance — passed in startAegisProxy.
 */
export class AegisProxyEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Lift the default cap; renderer + audit-log + AEGIS gate will all subscribe.
    this.emitter.setMaxListeners(32);
  }

  emit(event: AegisProxyEvent): void {
    this.emitter.emit('aegis-proxy', event);
  }

  on(listener: AegisProxyEventListener): () => void {
    this.emitter.on('aegis-proxy', listener);
    return () => this.emitter.off('aegis-proxy', listener);
  }

  /** Number of subscribers — for diagnostics. */
  listenerCount(): number {
    return this.emitter.listenerCount('aegis-proxy');
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners('aegis-proxy');
  }
}
