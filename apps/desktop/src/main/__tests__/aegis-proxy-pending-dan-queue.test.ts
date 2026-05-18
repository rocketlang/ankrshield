// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-016 PendingDanQueue (DAN gate hold queue with timeout +
// pluggable carrier abstraction).

import { describe, it, expect, vi } from 'vitest';

import { PendingDanQueue, __limits } from '../aegis-proxy/pending-dan-queue.js';
import type { CategorizedTool } from '../aegis-proxy/dan-categorizer.js';

const TOOLS_BASH: CategorizedTool[] = [
  { name: 'bash', category: 'shell_exec', matchedBy: 'name:bash' },
];
const TOOLS_BASH_SQL: CategorizedTool[] = [
  ...TOOLS_BASH,
  { name: 'execute_sql', category: 'database_ddl', matchedBy: 'name:sql' },
];

describe('ASD-T-016 — PendingDanQueue', () => {
  it('hold returns pending promise + fires every carrier exactly once', async () => {
    const notified: Array<{ appId: string; hostname: string }> = [];
    const q = new PendingDanQueue({
      timeoutMs: 60_000,
      carriers: [
        { notify: (r) => notified.push({ appId: r.appId, hostname: r.hostname }) },
        { notify: (r) => notified.push({ appId: r.appId + '-2', hostname: r.hostname }) },
      ],
    });
    const p = q.hold({
      appId: 'cursor',
      hostname: 'api.anthropic.com',
      highRiskTools: TOOLS_BASH,
    });
    expect(q.size()).toBe(1);
    expect(notified).toEqual([
      { appId: 'cursor', hostname: 'api.anthropic.com' },
      { appId: 'cursor-2', hostname: 'api.anthropic.com' },
    ]);
    const id = q.list()[0]!.pendingId;
    q.resolve(id, 'deny');
    await p;
  });

  it('resolve(allow) completes the Promise with allow + not timedOut', async () => {
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    const p = q.hold({
      appId: 'cursor',
      hostname: 'api.anthropic.com',
      highRiskTools: TOOLS_BASH,
    });
    const id = q.list()[0]!.pendingId;
    expect(q.resolve(id, 'allow')).toBe(true);
    const o = await p;
    expect(o.decision).toBe('allow');
    expect(o.timedOut).toBe(false);
    expect(o.pendingId).toBe(id);
    expect(q.size()).toBe(0);
  });

  it('resolve(deny) completes the Promise with deny + not timedOut', async () => {
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    const p = q.hold({
      appId: 'cursor',
      hostname: 'api.anthropic.com',
      highRiskTools: TOOLS_BASH,
    });
    const id = q.list()[0]!.pendingId;
    q.resolve(id, 'deny');
    const o = await p;
    expect(o.decision).toBe('deny');
    expect(o.timedOut).toBe(false);
  });

  it('resolve() returns false for unknown pendingId', () => {
    const q = new PendingDanQueue();
    expect(q.resolve('nope', 'deny')).toBe(false);
  });

  it('30s default timeout → deny + timedOut=true', async () => {
    vi.useFakeTimers();
    try {
      const q = new PendingDanQueue();
      const p = q.hold({
        appId: 'cursor',
        hostname: 'api.anthropic.com',
        highRiskTools: TOOLS_BASH,
      });
      expect(q.size()).toBe(1);
      vi.advanceTimersByTime(29_999);
      expect(q.size()).toBe(1);
      vi.advanceTimersByTime(2);
      const o = await p;
      expect(o.decision).toBe('deny');
      expect(o.timedOut).toBe(true);
      expect(q.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps timeout to [MIN, MAX]', () => {
    const a = new PendingDanQueue({ timeoutMs: 1_000 });
    void a.hold({ appId: 'a', hostname: 'h', highRiskTools: TOOLS_BASH });
    expect(a.list()[0]!.timeoutMs).toBe(__limits.MIN_TIMEOUT_MS);
    a.drain();

    const b = new PendingDanQueue({ timeoutMs: 999_999_999 });
    void b.hold({ appId: 'b', hostname: 'h', highRiskTools: TOOLS_BASH });
    expect(b.list()[0]!.timeoutMs).toBe(__limits.MAX_TIMEOUT_MS);
    b.drain();

    const c = new PendingDanQueue({ timeoutMs: 45_000 });
    void c.hold({ appId: 'c', hostname: 'h', highRiskTools: TOOLS_BASH });
    expect(c.list()[0]!.timeoutMs).toBe(45_000);
    c.drain();

    const d = new PendingDanQueue({ timeoutMs: Number.NaN });
    void d.hold({ appId: 'd', hostname: 'h', highRiskTools: TOOLS_BASH });
    expect(d.list()[0]!.timeoutMs).toBe(__limits.DEFAULT_TIMEOUT_MS);
    d.drain();
  });

  it('resolve cancels the timeout', async () => {
    vi.useFakeTimers();
    try {
      const q = new PendingDanQueue();
      const p = q.hold({
        appId: 'cursor',
        hostname: 'h',
        highRiskTools: TOOLS_BASH,
      });
      const id = q.list()[0]!.pendingId;
      q.resolve(id, 'allow');
      vi.advanceTimersByTime(5 * 60 * 1000);
      const o = await p;
      expect(o.decision).toBe('allow');
      expect(o.timedOut).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drain timeout-denies all + fires onResolved exactly once per entry', async () => {
    const resolutions: Array<{ pendingId: string; decision: string; timedOut: boolean }> = [];
    const q = new PendingDanQueue({
      timeoutMs: 60_000,
      onResolved: (id, o) =>
        resolutions.push({ pendingId: id, decision: o.decision, timedOut: o.timedOut }),
    });
    const p1 = q.hold({ appId: 'a', hostname: 'h', highRiskTools: TOOLS_BASH });
    const p2 = q.hold({ appId: 'b', hostname: 'h', highRiskTools: TOOLS_BASH_SQL });
    expect(q.size()).toBe(2);

    q.drain();
    const [o1, o2] = await Promise.all([p1, p2]);
    expect(o1.decision).toBe('deny');
    expect(o1.timedOut).toBe(true);
    expect(o2.decision).toBe('deny');
    expect(o2.timedOut).toBe(true);
    expect(q.size()).toBe(0);
    expect(resolutions).toHaveLength(2);
    expect(resolutions.every((r) => r.decision === 'deny' && r.timedOut)).toBe(true);
  });

  it('carrier notify failure does not block other carriers or the hold', async () => {
    const notified: string[] = [];
    const q = new PendingDanQueue({
      timeoutMs: 60_000,
      carriers: [
        {
          notify: () => {
            throw new Error('boom');
          },
        },
        { notify: (r) => notified.push(r.appId) },
      ],
    });
    const p = q.hold({ appId: 'cursor', hostname: 'h', highRiskTools: TOOLS_BASH });
    expect(notified).toEqual(['cursor']);
    expect(q.size()).toBe(1);
    q.resolve(q.list()[0]!.pendingId, 'deny');
    await p;
  });

  it('onPendingAdded fires + list snapshot has highRiskTools', () => {
    const added: string[] = [];
    const q = new PendingDanQueue({
      timeoutMs: 60_000,
      onPendingAdded: (r) => added.push(r.appId),
    });
    void q.hold({ appId: 'cursor', hostname: 'h', highRiskTools: TOOLS_BASH_SQL });
    expect(added).toEqual(['cursor']);
    const snap = q.list();
    expect(snap).toHaveLength(1);
    expect(snap[0]!.highRiskTools.map((t) => t.name)).toEqual(['bash', 'execute_sql']);
    q.drain();
  });

  it('carrier onResolved fires for both user-decide + timeout paths', async () => {
    const events: Array<{ id: string; decision: string; timedOut: boolean }> = [];
    const q = new PendingDanQueue({
      timeoutMs: 20_000, // below MIN — gets clamped, that's fine
      carriers: [
        {
          notify: () => {},
          onResolved: (id, o) => events.push({ id, decision: o.decision, timedOut: o.timedOut }),
        },
      ],
    });
    // user-decide path
    const p1 = q.hold({ appId: 'a', hostname: 'h', highRiskTools: TOOLS_BASH });
    q.resolve(q.list()[0]!.pendingId, 'allow');
    await p1;

    // timeout path
    vi.useFakeTimers();
    try {
      const p2 = q.hold({ appId: 'b', hostname: 'h', highRiskTools: TOOLS_BASH });
      vi.advanceTimersByTime(60_000);
      await p2;
    } finally {
      vi.useRealTimers();
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ decision: 'allow', timedOut: false });
    expect(events[1]).toMatchObject({ decision: 'deny', timedOut: true });
  });
});
