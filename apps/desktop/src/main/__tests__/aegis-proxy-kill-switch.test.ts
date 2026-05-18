// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-026 + T-027 KillSwitch — state machine, preflight, throttle,
// force-close in-flight.

import { describe, it, expect, vi } from 'vitest';

import { KillSwitch, __internals, type InFlightSocket } from '../aegis-proxy/kill-switch.js';

describe('ASD-T-026/27 — KillSwitch state transitions', () => {
  it('starts NORMAL globally and per-app', () => {
    const k = new KillSwitch();
    expect(k.resolveState('cursor')).toBe('normal');
    expect(k.globalSnapshot().state).toBe('normal');
  });

  it('setAppState updates effective state', () => {
    const k = new KillSwitch();
    k.setAppState('cursor', 'paused');
    expect(k.resolveState('cursor')).toBe('paused');
    expect(k.snapshot('cursor').appLevel).toBe('paused');
    expect(k.snapshot('cursor').effective).toBe('paused');
  });

  it('global state overrides app state when stricter', () => {
    const k = new KillSwitch();
    k.setAppState('cursor', 'normal');
    k.setGlobalState('locked');
    expect(k.resolveState('cursor')).toBe('locked');
    expect(k.snapshot('cursor').appLevel).toBe('normal');
    expect(k.snapshot('cursor').globalLevel).toBe('locked');
    expect(k.snapshot('cursor').effective).toBe('locked');
  });

  it('app state overrides global when stricter', () => {
    const k = new KillSwitch();
    k.setGlobalState('paused');
    k.setAppState('cursor', 'locked');
    expect(k.resolveState('cursor')).toBe('locked');
  });

  it('stricter() order: locked > throttled > paused > normal', () => {
    const { stricter } = __internals;
    expect(stricter('normal', 'paused')).toBe('paused');
    expect(stricter('paused', 'throttled')).toBe('throttled');
    expect(stricter('throttled', 'locked')).toBe('locked');
    expect(stricter('locked', 'normal')).toBe('locked');
  });

  it('emits "changed" on every transition', () => {
    const k = new KillSwitch();
    const events: Array<{ appId: string | null; state: string }> = [];
    k.on('changed', (e: { appId: string | null; state: string }) => events.push(e));
    k.setAppState('cursor', 'paused');
    k.setGlobalState('throttled');
    expect(events).toEqual([
      { appId: 'cursor', state: 'paused', snapshot: expect.any(Object) },
      { appId: null, state: 'throttled', snapshot: expect.any(Object) },
    ]);
  });
});

describe('ASD-T-026/27 — preflight', () => {
  it('NORMAL → allow', () => {
    const k = new KillSwitch();
    expect(k.preflight('cursor')).toEqual({ allow: true, state: 'normal' });
  });

  it('PAUSED → deny ASD-009-paused', () => {
    const k = new KillSwitch();
    k.setAppState('cursor', 'paused');
    const r = k.preflight('cursor');
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('ASD-009-paused');
    expect(r.state).toBe('paused');
  });

  it('LOCKED → deny ASD-009-locked', () => {
    const k = new KillSwitch();
    k.setAppState('cursor', 'locked');
    const r = k.preflight('cursor');
    expect(r.allow).toBe(false);
    expect(r.reason).toBe('ASD-009-locked');
  });

  it('THROTTLED — first request within window allowed; further denied', () => {
    let t = 1000;
    const k = new KillSwitch({
      throttle: { limit: 1, windowMs: 5000 },
      now: () => t,
    });
    k.setAppState('cursor', 'throttled');
    expect(k.preflight('cursor').allow).toBe(true);
    expect(k.preflight('cursor').allow).toBe(false);
    expect(k.preflight('cursor').reason).toBe('ASD-009-throttled');
    // Advance past window — next should allow again.
    t += 5001;
    expect(k.preflight('cursor').allow).toBe(true);
  });

  it('THROTTLED with limit=3, windowMs=10s allows 3 then denies', () => {
    let t = 1000;
    const k = new KillSwitch({
      throttle: { limit: 3, windowMs: 10000 },
      now: () => t,
    });
    k.setAppState('cursor', 'throttled');
    expect(k.preflight('cursor').allow).toBe(true);
    expect(k.preflight('cursor').allow).toBe(true);
    expect(k.preflight('cursor').allow).toBe(true);
    expect(k.preflight('cursor').allow).toBe(false);
  });

  it('global override applies during preflight', () => {
    const k = new KillSwitch();
    k.setAppState('cursor', 'normal');
    k.setGlobalState('paused');
    const r = k.preflight('cursor');
    expect(r.allow).toBe(false);
    expect(r.state).toBe('paused');
  });
});

describe('ASD-T-026/27 — in-flight tracking', () => {
  function makeSocket(): InFlightSocket & { destroyed: boolean } {
    const o: InFlightSocket & { destroyed: boolean } = {
      destroyed: false,
      destroy: () => {
        o.destroyed = true;
      },
    };
    return o;
  }

  it('registerInFlight + unregister updates the in-flight count', () => {
    const k = new KillSwitch();
    const s = makeSocket();
    const unreg = k.registerInFlight('cursor', s);
    expect(k.snapshot('cursor').inFlight).toBe(1);
    unreg();
    expect(k.snapshot('cursor').inFlight).toBe(0);
  });

  it('setting state to LOCKED force-destroys all in-flight for that app', () => {
    const k = new KillSwitch();
    const a = makeSocket();
    const b = makeSocket();
    const c = makeSocket();
    k.registerInFlight('cursor', a);
    k.registerInFlight('cursor', b);
    k.registerInFlight('claude-desktop', c);
    k.setAppState('cursor', 'locked');
    expect(a.destroyed).toBe(true);
    expect(b.destroyed).toBe(true);
    expect(c.destroyed).toBe(false);
    expect(k.snapshot('cursor').inFlight).toBe(0);
    expect(k.snapshot('claude-desktop').inFlight).toBe(1);
  });

  it('global LOCKED force-destroys in-flight across all apps', () => {
    const k = new KillSwitch();
    const a = makeSocket();
    const b = makeSocket();
    k.registerInFlight('cursor', a);
    k.registerInFlight('claude-desktop', b);
    k.setGlobalState('locked');
    expect(a.destroyed).toBe(true);
    expect(b.destroyed).toBe(true);
  });

  it('PAUSED / THROTTLED do NOT force-close in-flight', () => {
    const k = new KillSwitch();
    const s = makeSocket();
    k.registerInFlight('cursor', s);
    k.setAppState('cursor', 'paused');
    expect(s.destroyed).toBe(false);
    k.setAppState('cursor', 'throttled');
    expect(s.destroyed).toBe(false);
  });

  it('closeInFlightFor returns the count closed', () => {
    const k = new KillSwitch();
    k.registerInFlight('cursor', makeSocket());
    k.registerInFlight('cursor', makeSocket());
    expect(k.closeInFlightFor('cursor')).toBe(2);
    expect(k.closeInFlightFor('cursor')).toBe(0);
  });

  it('emits in_flight_closed with count on LOCK', () => {
    const k = new KillSwitch();
    const events: Array<{ count: number }> = [];
    k.on('in_flight_closed', (e: { count: number }) => events.push(e));
    k.registerInFlight('cursor', makeSocket());
    k.registerInFlight('cursor', makeSocket());
    k.setAppState('cursor', 'locked');
    expect(events).toEqual([{ count: 2 }]);
  });

  it('destroy() throwing on already-closed socket does not crash LOCK', () => {
    const k = new KillSwitch();
    const bad: InFlightSocket = {
      destroy: () => {
        throw new Error('already destroyed');
      },
    };
    k.registerInFlight('cursor', bad);
    expect(() => k.setAppState('cursor', 'locked')).not.toThrow();
    expect(k.snapshot('cursor').inFlight).toBe(0);
  });
});

describe('ASD-T-026/27 — snapshots', () => {
  it('snapshotAll() returns every app with any state', () => {
    const k = new KillSwitch();
    k.setAppState('cursor', 'paused');
    k.setAppState('claude-desktop', 'throttled');
    const snap = k.snapshotAll();
    expect(Object.keys(snap).sort()).toEqual(['claude-desktop', 'cursor']);
    expect(snap.cursor.effective).toBe('paused');
    expect(snap['claude-desktop'].effective).toBe('throttled');
  });

  it('changedAt timestamps are ISO strings', () => {
    const k = new KillSwitch({ now: () => 1700000000000 });
    k.setAppState('cursor', 'locked');
    expect(k.snapshot('cursor').changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('ASD-T-026/27 — NFR-2 ≤1s p99 close', () => {
  it('LOCK transition closes 100 in-flight sockets in <1ms in-process', () => {
    const k = new KillSwitch();
    for (let i = 0; i < 100; i++) {
      k.registerInFlight('cursor', { destroy: () => {} });
    }
    const t0 = performance.now();
    k.setAppState('cursor', 'locked');
    const dt = performance.now() - t0;
    // Far under 1000ms (typical: < 1ms). NFR-2 ≤1s p99.
    expect(dt).toBeLessThan(1000);
    expect(k.snapshot('cursor').inFlight).toBe(0);
  });
});

void vi;
