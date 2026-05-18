// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-030 RequestLogStore.

import { describe, it, expect } from 'vitest';

import { AegisProxyEventBus } from '../aegis-proxy/event-bus.js';
import { RequestLogStore, __internals } from '../aegis-proxy/request-log-store.js';

const FROZEN_MS = Date.parse('2026-05-18T12:00:00.000Z');

function mockRequestObserved(at: string, appId = 'cursor', requestId = 'r1') {
  return {
    kind: 'request.observed' as const,
    requestId,
    timestamp: at,
    observation: {
      provider: 'anthropic' as const,
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      model: 'claude-opus-4-7',
      isStreaming: false,
      promptText: 'hi',
      systemPrompt: null,
      hasTools: false,
      messageCount: 1,
      requestBytes: 100,
      appId,
      pid: 1234,
      executable: appId,
    },
  };
}

describe('ASD-T-030 — projectEvent', () => {
  const { projectEvent } = __internals;

  it('projects request.observed into a summary line', () => {
    const r = projectEvent(mockRequestObserved('2026-05-18T11:00:00Z'));
    expect(r?.kind).toBe('request.observed');
    expect(r?.appId).toBe('cursor');
    expect(r?.summary).toContain('api.anthropic.com');
    expect(r?.summary).toContain('claude-opus-4-7');
  });

  it('returns null for noise events (consent.pending, dan.skipped, cost.recorded)', () => {
    expect(
      projectEvent({
        kind: 'consent.pending',
        requestId: 'p',
        timestamp: 't',
        pendingId: 'p',
        appId: 'cursor',
        hostname: 'h',
        timeoutMs: 60000,
      })
    ).toBeNull();
    expect(
      projectEvent({
        kind: 'dan.skipped',
        requestId: 'r',
        timestamp: 't',
        appId: 'cursor',
        hostname: 'h',
        reason: 'cached-allow',
      })
    ).toBeNull();
    expect(
      projectEvent({
        kind: 'cost.recorded',
        requestId: 'r',
        timestamp: 't',
        appId: 'cursor',
        model: 'x',
        costUsd: 0.01,
        promptTokens: 10,
        completionTokens: 5,
      })
    ).toBeNull();
  });

  it('projects denials with reason in the summary', () => {
    const r = projectEvent({
      kind: 'aegis.denied',
      requestId: 'r',
      timestamp: 't',
      appId: 'cursor',
      hostname: 'h',
      capability_hex: '0x1',
      trust_mask_hex: '0x0',
      reason: 'missing capability',
    });
    expect(r?.kind).toBe('aegis.denied');
    expect(r?.summary).toContain('missing capability');
  });
});

describe('ASD-T-030 — RequestLogStore basics', () => {
  it('starts empty', () => {
    const s = new RequestLogStore({ now: () => FROZEN_MS });
    expect(s.size()).toBe(0);
    expect(s.range()).toEqual({ oldest: null, newest: null });
  });

  it('handles bus events through projectEvent + appends to ring', () => {
    const bus = new AegisProxyEventBus();
    const s = new RequestLogStore({ now: () => FROZEN_MS });
    s.attach(bus);
    bus.emit(mockRequestObserved('2026-05-18T11:00:00Z'));
    bus.emit(mockRequestObserved('2026-05-18T11:30:00Z', 'cursor', 'r2'));
    expect(s.size()).toBe(2);
    const r = s.range();
    expect(r.oldest).toBe('2026-05-18T11:00:00Z');
    expect(r.newest).toBe('2026-05-18T11:30:00Z');
    s.detach();
  });

  it('skips noise events', () => {
    const bus = new AegisProxyEventBus();
    const s = new RequestLogStore({ now: () => FROZEN_MS });
    s.attach(bus);
    bus.emit({
      kind: 'dan.skipped',
      requestId: 'r',
      timestamp: '2026-05-18T11:00:00Z',
      appId: 'cursor',
      hostname: 'h',
      reason: 'cached-allow',
    });
    expect(s.size()).toBe(0);
  });

  it('enforces maxEntries ring', () => {
    const s = new RequestLogStore({ maxEntries: 50, now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    for (let i = 0; i < 100; i++) {
      bus.emit(mockRequestObserved('2026-05-18T11:00:00Z', 'cursor', `r${i}`));
    }
    expect(s.size()).toBe(50);
  });

  it('clamps maxEntries to minimum 50', () => {
    const s = new RequestLogStore({ maxEntries: 5, now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    for (let i = 0; i < 60; i++) {
      bus.emit(mockRequestObserved('2026-05-18T11:00:00Z', 'cursor', `r${i}`));
    }
    expect(s.size()).toBe(50);
  });

  it('prunes entries older than horizonMs on read', () => {
    const s = new RequestLogStore({ horizonMs: 60_000, now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    // 2 minutes old → outside 60s horizon.
    bus.emit(mockRequestObserved('2026-05-18T11:58:00Z'));
    // 30 seconds old → inside horizon.
    bus.emit(mockRequestObserved('2026-05-18T11:59:30Z', 'cursor', 'r2'));
    expect(s.size()).toBe(1);
    expect(s.list()).toHaveLength(1);
  });

  it('detach stops further handling', () => {
    const s = new RequestLogStore({ now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    bus.emit(mockRequestObserved('2026-05-18T11:00:00Z'));
    s.detach();
    bus.emit(mockRequestObserved('2026-05-18T11:01:00Z', 'cursor', 'r2'));
    expect(s.size()).toBe(1);
  });

  it('clear() empties the buffer', () => {
    const s = new RequestLogStore({ now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    bus.emit(mockRequestObserved('2026-05-18T11:00:00Z'));
    s.clear();
    expect(s.size()).toBe(0);
  });
});

describe('ASD-T-030 — RequestLogStore.list time-window filter', () => {
  it('returns entries inclusive of [since, until]', () => {
    const s = new RequestLogStore({ now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    bus.emit(mockRequestObserved('2026-05-18T10:00:00Z', 'cursor', 'r1'));
    bus.emit(mockRequestObserved('2026-05-18T11:00:00Z', 'cursor', 'r2'));
    bus.emit(mockRequestObserved('2026-05-18T11:30:00Z', 'cursor', 'r3'));
    const slice = s.list({
      since: '2026-05-18T10:30:00Z',
      until: '2026-05-18T11:15:00Z',
    });
    expect(slice).toHaveLength(1);
    expect(slice[0]!.id).toBe('r2');
  });

  it('default since = now - horizon, default until = now', () => {
    const s = new RequestLogStore({ horizonMs: 60 * 60 * 1000, now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    bus.emit(mockRequestObserved('2026-05-18T11:30:00Z', 'cursor', 'r1'));
    bus.emit(mockRequestObserved('2026-05-18T11:45:00Z', 'cursor', 'r2'));
    expect(s.list()).toHaveLength(2);
  });

  it('handles every event kind we project', () => {
    const s = new RequestLogStore({ now: () => FROZEN_MS });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    bus.emit(mockRequestObserved('2026-05-18T11:00:00Z'));
    bus.emit({
      kind: 'response.observed',
      requestId: 'r',
      timestamp: '2026-05-18T11:00:01Z',
      observation: {
        statusCode: 200,
        responseBytes: 500,
        promptTokens: 10,
        completionTokens: 5,
        finishReason: 'stop',
        isStreaming: false,
        latencyMs: 250,
      },
    });
    bus.emit({
      kind: 'aegis.denied',
      requestId: 'r2',
      timestamp: '2026-05-18T11:00:02Z',
      appId: 'cursor',
      hostname: 'h',
      capability_hex: '0x1',
      trust_mask_hex: '0x0',
      reason: 'x',
    });
    bus.emit({
      kind: 'pii.redacted',
      requestId: 'r3',
      timestamp: '2026-05-18T11:00:03Z',
      appId: 'cursor',
      hostname: 'h',
      counts: { aadhaar: 1 },
      total: 1,
    });
    bus.emit({
      kind: 'budget.throttled',
      requestId: 'r4',
      timestamp: '2026-05-18T11:00:04Z',
      appId: 'cursor',
      hostname: 'h',
      currentSpendUsd: 1.5,
      hourlyLimitUsd: 1.0,
      bucket: '2026-05-18T11',
    });
    bus.emit({
      kind: 'kill_switch.blocked',
      requestId: 'r5',
      timestamp: '2026-05-18T11:00:05Z',
      appId: 'cursor',
      hostname: 'h',
      state: 'locked',
    });
    // 6 emitted events; all 6 project to entries (mockRequestObserved
    // contributes the request.observed; the other 5 are the explicit
    // emissions above).
    expect(s.size()).toBe(6);
    const list = s.list();
    expect(list.map((e) => e.kind).sort()).toEqual(
      [
        'aegis.denied',
        'budget.throttled',
        'kill_switch.blocked',
        'pii.redacted',
        'request.observed',
        'response.observed',
      ].sort()
    );
  });
});
