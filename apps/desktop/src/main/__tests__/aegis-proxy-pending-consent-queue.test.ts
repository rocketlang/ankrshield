// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-015 TOFU pending-consent queue.

import { describe, it, expect, vi } from 'vitest';

import { PendingConsentQueue } from '../aegis-proxy/pending-consent-queue.js';

describe('ASD-T-015 — PendingConsentQueue', () => {
  it('hold returns a pending Promise + emits onPendingAdded', async () => {
    const added: string[] = [];
    const q = new PendingConsentQueue({
      timeoutMs: 1000,
      onPendingAdded: (req) => added.push(req.appId),
    });
    const p = q.hold('cursor', 'api.anthropic.com');
    expect(q.size()).toBe(1);
    expect(added).toEqual(['cursor']);

    // Resolve the pending one so the promise doesn't dangle.
    const list = q.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.hostname).toBe('api.anthropic.com');
    q.resolve(list[0]!.pendingId, { decision: 'deny' });
    await p;
  });

  it('resolve(allow) completes the Promise with chosen policy', async () => {
    const q = new PendingConsentQueue({ timeoutMs: 5000 });
    const p = q.hold('cursor', 'api.anthropic.com');
    const pendingId = q.list()[0]!.pendingId;
    expect(
      q.resolve(pendingId, {
        decision: 'allow',
        hourly_limit_usd: 0.5,
        pii_policy: 'redact',
        dan_carrier: 'os',
      })
    ).toBe(true);
    const outcome = await p;
    expect(outcome.decision).toBe('allow');
    expect(outcome.hourly_limit_usd).toBe(0.5);
    expect(outcome.pii_policy).toBe('redact');
    expect(outcome.dan_carrier).toBe('os');
    expect(outcome.timedOut).toBe(false);
    expect(outcome.pendingId).toBe(pendingId);
    expect(q.size()).toBe(0);
  });

  it('resolve(allow) rejects when hourly_limit_usd is missing or <= 0', async () => {
    const q = new PendingConsentQueue({ timeoutMs: 5000 });
    const p = q.hold('cursor', 'api.anthropic.com');
    const pendingId = q.list()[0]!.pendingId;
    expect(q.resolve(pendingId, { decision: 'allow' })).toBe(false);
    expect(q.resolve(pendingId, { decision: 'allow', hourly_limit_usd: 0 })).toBe(false);
    expect(q.resolve(pendingId, { decision: 'allow', hourly_limit_usd: -1 })).toBe(false);
    expect(q.size()).toBe(1); // still pending
    // Clean up.
    q.resolve(pendingId, { decision: 'deny' });
    await p;
  });

  it('resolve(deny) clears budget + sets safe defaults', async () => {
    const q = new PendingConsentQueue({ timeoutMs: 5000 });
    const p = q.hold('cursor', 'api.anthropic.com');
    const pendingId = q.list()[0]!.pendingId;
    expect(q.resolve(pendingId, { decision: 'deny' })).toBe(true);
    const outcome = await p;
    expect(outcome.decision).toBe('deny');
    expect(outcome.hourly_limit_usd).toBeNull();
    expect(outcome.pii_policy).toBe('block');
    expect(outcome.timedOut).toBe(false);
  });

  it('resolve() returns false for unknown pendingId', () => {
    const q = new PendingConsentQueue({ timeoutMs: 5000 });
    expect(q.resolve('unknown-id', { decision: 'deny' })).toBe(false);
  });

  it('60-second default timeout fires deny (uses fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const q = new PendingConsentQueue({ timeoutMs: 60_000 });
      const p = q.hold('cursor', 'api.anthropic.com');
      expect(q.size()).toBe(1);

      vi.advanceTimersByTime(59_999);
      expect(q.size()).toBe(1);

      vi.advanceTimersByTime(2);
      const outcome = await p;
      expect(outcome.decision).toBe('deny');
      expect(outcome.timedOut).toBe(true);
      expect(outcome.hourly_limit_usd).toBeNull();
      expect(q.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('configurable timeout fires sooner than default', async () => {
    vi.useFakeTimers();
    try {
      const q = new PendingConsentQueue({ timeoutMs: 100 });
      const p = q.hold('cursor', 'api.anthropic.com');
      vi.advanceTimersByTime(101);
      const outcome = await p;
      expect(outcome.timedOut).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolve cancels the pending timeout', async () => {
    vi.useFakeTimers();
    try {
      const q = new PendingConsentQueue({ timeoutMs: 1000 });
      const p = q.hold('cursor', 'api.anthropic.com');
      const pendingId = q.list()[0]!.pendingId;
      q.resolve(pendingId, { decision: 'deny' });
      vi.advanceTimersByTime(10_000); // would have timed out
      const outcome = await p;
      expect(outcome.timedOut).toBe(false); // user-decided, not timed-out
    } finally {
      vi.useRealTimers();
    }
  });

  it('onResolved hook fires on both user-decide and timeout paths', async () => {
    const resolutions: Array<{ id: string; decision: string; timedOut: boolean }> = [];
    const q = new PendingConsentQueue({
      timeoutMs: 50,
      onResolved: (id, outcome) =>
        resolutions.push({ id, decision: outcome.decision, timedOut: outcome.timedOut }),
    });
    // 1) user-decided
    const p1 = q.hold('cursor', 'api.anthropic.com');
    const id1 = q.list()[0]!.pendingId;
    q.resolve(id1, { decision: 'deny' });
    await p1;

    // 2) timeout
    const p2 = q.hold('shady-cli', 'api.openai.com');
    await p2;

    expect(resolutions).toHaveLength(2);
    expect(resolutions[0]!.timedOut).toBe(false);
    expect(resolutions[1]!.timedOut).toBe(true);
  });

  it('drain timeout-denies all pending requests (shutdown path)', async () => {
    const resolutions: Array<{ decision: string; timedOut: boolean }> = [];
    const q = new PendingConsentQueue({
      timeoutMs: 60_000,
      onResolved: (_id, outcome) =>
        resolutions.push({ decision: outcome.decision, timedOut: outcome.timedOut }),
    });
    const p1 = q.hold('cursor', 'api.anthropic.com');
    const p2 = q.hold('shady-cli', 'api.openai.com');
    expect(q.size()).toBe(2);

    q.drain();
    const [o1, o2] = await Promise.all([p1, p2]);
    expect(o1.decision).toBe('deny');
    expect(o1.timedOut).toBe(true);
    expect(o2.decision).toBe('deny');
    expect(o2.timedOut).toBe(true);
    expect(q.size()).toBe(0);
    expect(resolutions).toHaveLength(2);
    expect(resolutions.every((r) => r.timedOut && r.decision === 'deny')).toBe(true);
  });

  it('list returns snapshot without resolve callbacks', () => {
    const q = new PendingConsentQueue({ timeoutMs: 5000 });
    void q.hold('cursor', 'api.anthropic.com');
    void q.hold('claude-desktop', 'api.anthropic.com');
    const list = q.list();
    expect(list).toHaveLength(2);
    for (const item of list) {
      expect(item).toHaveProperty('pendingId');
      expect(item).toHaveProperty('appId');
      expect(item).toHaveProperty('hostname');
      expect(item).toHaveProperty('heldAt');
      expect(item).toHaveProperty('timeoutMs');
      expect(item).not.toHaveProperty('resolve');
    }
    q.drain();
  });

  it('uses default 60s timeout when not specified', () => {
    const q = new PendingConsentQueue();
    void q.hold('cursor', 'api.anthropic.com');
    expect(q.list()[0]!.timeoutMs).toBe(60_000);
    q.drain();
  });
});
