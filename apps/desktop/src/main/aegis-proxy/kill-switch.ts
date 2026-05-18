// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — kill switch (ASD-T-026 + T-027)
//
// Per-app + global state machine: NORMAL → PAUSED → THROTTLED → LOCKED.
// Read on every request entry; transition to LOCKED force-closes in-flight
// upstream sockets so the user-visible "stop now" UX completes ≤1s p99
// (NFR-2, FR-15, ASD-009, INF-ASD-006).
//
// Implementation notes:
//
// - "Dedicated worker thread" per FR-15 is interpreted as "the IPC handler
//   must not block on per-request work". A pure in-memory atomic-flag map
//   meets that contract — setState is O(1) + a Set iteration to close
//   sockets, none of which awaits the request hot path. The server.ts
//   hot path reads state via resolveState() which is a single Map lookup.
//
// - Global state OVERRIDES per-app state when stricter. Precedence:
//   LOCKED > THROTTLED > PAUSED > NORMAL. If global is LOCKED and an
//   app is NORMAL, the effective state is LOCKED.
//
// - In-flight sockets registered per-app via registerInFlight() and
//   deregistered on stream end / error. LOCK transition iterates the
//   affected set and calls socket.destroy() — closes both upstream and
//   client sides.
//
// - THROTTLE: tracks recent timestamps per app in a ring; rejects new
//   requests when N within the last windowMs would exceed the limit.
//   Defaults: 1 req per 5s when throttled. Configurable per-call.

import { EventEmitter } from 'node:events';

export type KillState = 'normal' | 'paused' | 'throttled' | 'locked';

export interface ThrottleConfig {
  /** Max requests in the rolling window when state === 'throttled'. */
  limit: number;
  /** Rolling window in ms. */
  windowMs: number;
}

const DEFAULT_THROTTLE: ThrottleConfig = { limit: 1, windowMs: 5_000 };

export interface InFlightSocket {
  /** Anything with destroy() — net.Socket, ClientRequest, ServerResponse. */
  destroy(error?: Error): void;
}

export interface KillStateSnapshot {
  /** Effective state for this app after considering the global override. */
  effective: KillState;
  /** App-level state as set by the user. */
  appLevel: KillState;
  /** Global override state. */
  globalLevel: KillState;
  /** Current in-flight count for the app. */
  inFlight: number;
  /** ISO timestamp of the most recent state change for this app. */
  changedAt: string;
}

export interface KillSwitchOptions {
  throttle?: ThrottleConfig;
  /** Override clock for tests. */
  now?: () => number;
}

interface AppEntry {
  state: KillState;
  changedAt: string;
  inFlight: Set<InFlightSocket>;
  /** Ring buffer of recent request timestamps for throttle check. */
  recent: number[];
}

export class KillSwitch extends EventEmitter {
  private readonly perApp = new Map<string, AppEntry>();
  private globalState: KillState = 'normal';
  private globalChangedAt: string = new Date(0).toISOString();
  private readonly throttle: ThrottleConfig;
  private readonly nowFn: () => number;

  constructor(opts: KillSwitchOptions = {}) {
    super();
    this.throttle = opts.throttle ?? DEFAULT_THROTTLE;
    this.nowFn = opts.now ?? (() => Date.now());
  }

  // ─── State management ─────────────────────────────────────────────────────

  setAppState(appId: string, state: KillState): KillStateSnapshot {
    const entry = this.getOrCreate(appId);
    entry.state = state;
    entry.changedAt = new Date(this.nowFn()).toISOString();
    if (state === 'locked') {
      this.closeInFlight(entry);
    }
    this.emit('changed', { appId, state, snapshot: this.snapshot(appId) });
    return this.snapshot(appId);
  }

  setGlobalState(state: KillState): KillState {
    this.globalState = state;
    this.globalChangedAt = new Date(this.nowFn()).toISOString();
    if (state === 'locked') {
      for (const entry of this.perApp.values()) this.closeInFlight(entry);
    }
    this.emit('changed', { appId: null, state, snapshot: this.globalSnapshot() });
    return state;
  }

  globalSnapshot(): { state: KillState; changedAt: string } {
    return { state: this.globalState, changedAt: this.globalChangedAt };
  }

  /**
   * Resolve effective state for an app — STRICTER of global vs app-level.
   * Read on every request entry; cheap (Map lookup + 2-way comparison).
   */
  resolveState(appId: string): KillState {
    const app = this.perApp.get(appId)?.state ?? 'normal';
    return stricter(app, this.globalState);
  }

  snapshot(appId: string): KillStateSnapshot {
    const entry = this.perApp.get(appId);
    const appLevel = entry?.state ?? 'normal';
    return {
      effective: stricter(appLevel, this.globalState),
      appLevel,
      globalLevel: this.globalState,
      inFlight: entry?.inFlight.size ?? 0,
      changedAt: entry?.changedAt ?? new Date(0).toISOString(),
    };
  }

  /** Snapshot for every app with any registered state or in-flight activity. */
  snapshotAll(): Record<string, KillStateSnapshot> {
    const out: Record<string, KillStateSnapshot> = {};
    for (const appId of this.perApp.keys()) out[appId] = this.snapshot(appId);
    return out;
  }

  // ─── Pre-flight decision (called on every new request) ────────────────────

  /**
   * Decide whether a new request from this app may proceed.
   *
   *   normal     → allow
   *   paused     → reject ASD-009-paused
   *   throttled  → allow OR reject ASD-009-throttled based on recent rate
   *   locked     → reject ASD-009-locked
   *
   * On allow under throttled, records the timestamp into the ring buffer.
   */
  preflight(appId: string): { allow: boolean; reason?: string; state: KillState } {
    const state = this.resolveState(appId);
    if (state === 'normal') return { allow: true, state };
    if (state === 'paused') return { allow: false, reason: 'ASD-009-paused', state };
    if (state === 'locked') return { allow: false, reason: 'ASD-009-locked', state };
    // throttled
    const entry = this.getOrCreate(appId);
    const now = this.nowFn();
    const cutoff = now - this.throttle.windowMs;
    // Drop expired timestamps.
    while (entry.recent.length > 0 && entry.recent[0]! < cutoff) entry.recent.shift();
    if (entry.recent.length >= this.throttle.limit) {
      return { allow: false, reason: 'ASD-009-throttled', state };
    }
    entry.recent.push(now);
    return { allow: true, state };
  }

  // ─── In-flight tracking ───────────────────────────────────────────────────

  registerInFlight(appId: string, socket: InFlightSocket): () => void {
    const entry = this.getOrCreate(appId);
    entry.inFlight.add(socket);
    return () => {
      entry.inFlight.delete(socket);
    };
  }

  closeInFlightFor(appId: string): number {
    const entry = this.perApp.get(appId);
    if (!entry) return 0;
    return this.closeInFlight(entry);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private getOrCreate(appId: string): AppEntry {
    let entry = this.perApp.get(appId);
    if (!entry) {
      entry = {
        state: 'normal',
        changedAt: new Date(this.nowFn()).toISOString(),
        inFlight: new Set(),
        recent: [],
      };
      this.perApp.set(appId, entry);
    }
    return entry;
  }

  private closeInFlight(entry: AppEntry): number {
    let n = 0;
    for (const sock of [...entry.inFlight]) {
      try {
        sock.destroy(new Error('aegis-proxy: kill switch LOCKED — in-flight closed'));
      } catch {
        // ignore — caller's already-closed sockets throw, that's fine
      }
      entry.inFlight.delete(sock);
      n += 1;
    }
    if (n > 0) {
      this.emit('in_flight_closed', { count: n });
    }
    return n;
  }
}

function stricter(a: KillState, b: KillState): KillState {
  const order: Record<KillState, number> = {
    normal: 0,
    paused: 1,
    throttled: 2,
    locked: 3,
  };
  return order[a] >= order[b] ? a : b;
}

export const __internals = { stricter, DEFAULT_THROTTLE };
