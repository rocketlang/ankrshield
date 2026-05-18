// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-017 DanCarrierRouter (per-app carrier selection).

import { describe, it, expect, vi } from 'vitest';

import { DanCarrierRouter } from '../aegis-proxy/dan-carrier-router.js';
import type { DanNotifier, DanRequest } from '../aegis-proxy/pending-dan-queue.js';

function fakeNotifier(label: string): DanNotifier & { calls: DanRequest[] } {
  const calls: DanRequest[] = [];
  return {
    calls,
    notify: (r) => {
      calls.push(r);
    },
    // tagged with label via closure for assertions
    onResolved: () => {
      void label;
    },
  };
}

const OS = fakeNotifier('os');
const WA = fakeNotifier('wa');
const TG = fakeNotifier('tg');

describe('ASD-T-017 — DanCarrierRouter', () => {
  it("choice='os' → only OS carrier", () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => true,
      hasTelegramCreds: () => true,
    });
    expect(r.carriersFor('os')).toEqual([OS]);
  });

  it("choice='wa' with creds → [WA, OS] (fan-out by default)", () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => true,
      hasTelegramCreds: () => false,
    });
    expect(r.carriersFor('wa')).toEqual([WA, OS]);
  });

  it("choice='wa' without creds → fallback [OS]", () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => false,
      hasTelegramCreds: () => true,
    });
    expect(r.carriersFor('wa')).toEqual([OS]);
  });

  it("choice='tg' with creds → [TG, OS]", () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => false,
      hasTelegramCreds: () => true,
    });
    expect(r.carriersFor('tg')).toEqual([TG, OS]);
  });

  it("choice='tg' without creds → fallback [OS]", () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => true,
      hasTelegramCreds: () => false,
    });
    expect(r.carriersFor('tg')).toEqual([OS]);
  });

  it('fanOutOsAlongside=false → suppresses OS when remote carrier delivers', () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => true,
      hasTelegramCreds: () => true,
      fanOutOsAlongside: false,
    });
    expect(r.carriersFor('wa')).toEqual([WA]);
    expect(r.carriersFor('tg')).toEqual([TG]);
    expect(r.carriersFor('os')).toEqual([OS]);
  });

  it('fanOutOsAlongside=false STILL falls back to OS when remote unconfigured', () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => false,
      hasTelegramCreds: () => false,
      fanOutOsAlongside: false,
    });
    expect(r.carriersFor('wa')).toEqual([OS]);
    expect(r.carriersFor('tg')).toEqual([OS]);
  });

  it('uses default credential probes when not overridden', () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
    });
    // Default probes hit the OS keychain — in vitest env (no keychain wired
    // via __setCredentialBackendForTests) they return null, so WA falls back.
    const got = r.carriersFor('wa');
    expect(got).toContain(OS);
  });

  it('returned carriers are usable as DanNotifier (notify is called)', () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => true,
      hasTelegramCreds: () => true,
    });
    const carriers = r.carriersFor('wa');
    const req: DanRequest = {
      pendingId: 'p',
      appId: 'cursor',
      hostname: 'h',
      heldAt: 't',
      timeoutMs: 30000,
      highRiskTools: [],
    };
    for (const c of carriers) c.notify(req);
    expect(WA.calls).toHaveLength(1);
    expect(OS.calls).toHaveLength(1);
  });

  it('returns never-empty array (OS is the floor)', () => {
    const r = new DanCarrierRouter({
      osCarrier: OS,
      whatsAppCarrier: WA,
      telegramCarrier: TG,
      hasWhatsAppCreds: () => false,
      hasTelegramCreds: () => false,
      fanOutOsAlongside: true,
    });
    for (const choice of ['os', 'wa', 'tg'] as const) {
      expect(r.carriersFor(choice).length).toBeGreaterThan(0);
    }
  });
});

// PendingDanQueue per-hold carriers override is exercised here since it's the
// integration point. Lives in this test file to avoid mocking the queue twice.
describe('ASD-T-017 — PendingDanQueue per-hold carriers override', () => {
  it('hold(carriers) overrides queue-default carriers', async () => {
    const queueDefault = fakeNotifier('default');
    const perHold = fakeNotifier('per-hold');
    const { PendingDanQueue } = await import('../aegis-proxy/pending-dan-queue.js');
    const q = new PendingDanQueue({
      timeoutMs: 60_000,
      carriers: [queueDefault],
    });
    const p = q.hold({
      appId: 'cursor',
      hostname: 'h',
      highRiskTools: [{ name: 'bash', category: 'shell_exec', matchedBy: 'x' }],
      carriers: [perHold],
    });
    expect(perHold.calls).toHaveLength(1);
    expect(queueDefault.calls).toHaveLength(0);
    q.resolve(q.list()[0]!.pendingId, 'deny');
    await p;
  });

  it('drain timeout-denies and fires per-hold onResolved', async () => {
    const perHold: DanNotifier & { resolved: number } = {
      resolved: 0,
      notify: () => {},
      onResolved: () => {
        perHold.resolved += 1;
      },
    };
    const { PendingDanQueue } = await import('../aegis-proxy/pending-dan-queue.js');
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    const p = q.hold({
      appId: 'cursor',
      hostname: 'h',
      highRiskTools: [{ name: 'bash', category: 'shell_exec', matchedBy: 'x' }],
      carriers: [perHold],
    });
    q.drain();
    await p;
    expect(perHold.resolved).toBe(1);
  });

  it('hold without override uses queue-default carriers', async () => {
    const queueDefault = fakeNotifier('default');
    const { PendingDanQueue } = await import('../aegis-proxy/pending-dan-queue.js');
    const q = new PendingDanQueue({ timeoutMs: 60_000, carriers: [queueDefault] });
    const p = q.hold({
      appId: 'cursor',
      hostname: 'h',
      highRiskTools: [{ name: 'bash', category: 'shell_exec', matchedBy: 'x' }],
    });
    expect(queueDefault.calls).toHaveLength(1);
    q.resolve(q.list()[0]!.pendingId, 'deny');
    await p;
  });
});

// silence unused warning when running this file standalone
void vi;
