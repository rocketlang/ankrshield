// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-009 privacy-engine block chain.

import { describe, it, expect } from 'vitest';

import { AegisProxyEventBus, type AegisProxyEvent } from '../aegis-proxy/event-bus.js';
import { __testHooks } from '../aegis-proxy/server.js';

const { isHostBlocked } = __testHooks;

describe('ASD-T-009 — isHostBlocked', () => {
  it('returns true when fn returns true and emits privacy.blocked event', async () => {
    const bus = new AegisProxyEventBus();
    const received: AegisProxyEvent[] = [];
    bus.on((e) => received.push(e));

    const blocked = await isHostBlocked(async () => true, 'tracker.example', bus, 'http');
    expect(blocked).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]!.kind).toBe('privacy.blocked');
    if (received[0]!.kind === 'privacy.blocked') {
      expect(received[0]!.hostname).toBe('tracker.example');
      expect(received[0]!.via).toBe('http');
    }
  });

  it('returns false when fn returns false and emits no event', async () => {
    const bus = new AegisProxyEventBus();
    const received: AegisProxyEvent[] = [];
    bus.on((e) => received.push(e));

    const blocked = await isHostBlocked(async () => false, 'safe.example', bus, 'connect');
    expect(blocked).toBe(false);
    expect(received).toHaveLength(0);
  });

  it('fails open when fn throws (privacy-engine outage should not break LLM)', async () => {
    const bus = new AegisProxyEventBus();
    const received: AegisProxyEvent[] = [];
    bus.on((e) => received.push(e));

    const blocked = await isHostBlocked(
      async () => {
        throw new Error('privacy engine down');
      },
      'some.example',
      bus,
      'http'
    );
    expect(blocked).toBe(false);
    expect(received).toHaveLength(0);
  });

  it('emits with via=connect when CONNECT path triggers the check', async () => {
    const bus = new AegisProxyEventBus();
    const received: AegisProxyEvent[] = [];
    bus.on((e) => received.push(e));

    await isHostBlocked(async () => true, 'tracker.example', bus, 'connect');
    expect(received[0]!.kind).toBe('privacy.blocked');
    if (received[0]!.kind === 'privacy.blocked') {
      expect(received[0]!.via).toBe('connect');
    }
  });

  it('produces a unique requestId for each call', async () => {
    const bus = new AegisProxyEventBus();
    const received: AegisProxyEvent[] = [];
    bus.on((e) => received.push(e));

    await isHostBlocked(async () => true, 'a.example', bus, 'http');
    await isHostBlocked(async () => true, 'b.example', bus, 'http');
    expect(received).toHaveLength(2);
    expect(received[0]!.requestId).not.toBe(received[1]!.requestId);
  });
});
