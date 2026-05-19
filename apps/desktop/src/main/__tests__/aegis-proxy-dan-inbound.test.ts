// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-034 — DAN inbound reply parser, config store, Telegram
// poller, and PendingDanQueue.resolveByNonce extension.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseDanReply, nonceForPendingId } from '../aegis-proxy/dan-inbound-parser.js';
import {
  DanInboundConfigStore,
  clampInterval,
  POLL_INTERVAL_DEFAULT_MS,
  POLL_INTERVAL_MIN_MS,
  POLL_INTERVAL_MAX_MS,
} from '../aegis-proxy/dan-inbound-config.js';
import { TelegramInboundPoller, type TelegramUpdate } from '../aegis-proxy/dan-inbound-poller.js';
import { PendingDanQueue } from '../aegis-proxy/pending-dan-queue.js';

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'aegis-dan-inbound-'));
});
afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

// ─── parseDanReply ───────────────────────────────────────────────────────────

describe('ASD-T-034 — parseDanReply', () => {
  it('recognises "y <nonce>" as allow', () => {
    expect(parseDanReply('y a1b2c3')).toEqual({ decision: 'allow', nonce: 'a1b2c3' });
  });

  it('recognises every allow synonym', () => {
    for (const w of ['y', 'Y', 'yes', 'YES', 'approve', 'allow', 'ok', 'okay']) {
      const r = parseDanReply(`${w} a1b2c3`);
      expect(r?.decision, w).toBe('allow');
    }
  });

  it('recognises every deny synonym', () => {
    for (const w of ['n', 'N', 'no', 'NO', 'deny', 'reject', 'stop']) {
      const r = parseDanReply(`${w} a1b2c3`);
      expect(r?.decision, w).toBe('deny');
    }
  });

  it('lowercases the nonce on return', () => {
    expect(parseDanReply('Y A1B2C3')?.nonce).toBe('a1b2c3');
  });

  it('tolerates surrounding decoration / forwarded format', () => {
    expect(parseDanReply('Re: 🛡 [y a1b2c3]')).toEqual({ decision: 'allow', nonce: 'a1b2c3' });
    expect(parseDanReply('   yes,  a1b2c3  ')).toEqual({ decision: 'allow', nonce: 'a1b2c3' });
    expect(parseDanReply('yes - a1b2c3')).toEqual({ decision: 'allow', nonce: 'a1b2c3' });
  });

  it('returns null with no nonce', () => {
    expect(parseDanReply('y')).toBeNull();
    expect(parseDanReply('yes please approve')).toBeNull();
  });

  it('returns null with no decision verb', () => {
    expect(parseDanReply('a1b2c3')).toBeNull();
    expect(parseDanReply('please a1b2c3')).toBeNull();
  });

  it('returns null on bad input types', () => {
    expect(parseDanReply('')).toBeNull();
    expect(parseDanReply(null)).toBeNull();
    expect(parseDanReply(undefined)).toBeNull();
    expect(parseDanReply('x'.repeat(600))).toBeNull(); // too long
  });

  it('does NOT match a 7+ char hex substring', () => {
    // "a1b2c3def" tokenises as one token of length 9 — should not match.
    expect(parseDanReply('y a1b2c3def')).toBeNull();
  });

  it('returns first decision when both present (allow wins by position)', () => {
    expect(parseDanReply('y a1b2c3 no')?.decision).toBe('allow');
    expect(parseDanReply('no a1b2c3 y')?.decision).toBe('deny');
  });
});

describe('ASD-T-034 — nonceForPendingId', () => {
  it('returns lowercase first 6 chars', () => {
    expect(nonceForPendingId('A1B2C3D4-E5F6-7890-1234')).toBe('a1b2c3');
  });
});

// ─── DanInboundConfigStore ───────────────────────────────────────────────────

describe('ASD-T-034 — DanInboundConfigStore', () => {
  it('defaults to both off + default interval', async () => {
    const s = new DanInboundConfigStore({ filePath: join(tmpRoot, 'd.json') });
    await s.load();
    expect(s.get()).toMatchObject({
      tg_polling_enabled: false,
      wa_polling_enabled: false,
      poll_interval_ms: POLL_INTERVAL_DEFAULT_MS,
      updated_at: null,
    });
  });

  it('set(tg_polling_enabled=true) persists + updates updated_at', async () => {
    const path = join(tmpRoot, 'd.json');
    const s = new DanInboundConfigStore({ filePath: path, flushDebounceMs: 0 });
    await s.load();
    s.set({ tg_polling_enabled: true });
    expect(s.get().tg_polling_enabled).toBe(true);
    expect(s.get().updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await s.stop();
    const raw = await readFile(path, 'utf8');
    expect(JSON.parse(raw).tg_polling_enabled).toBe(true);
  });

  it('idempotent — re-setting same value does not bump updated_at', async () => {
    const s = new DanInboundConfigStore({ filePath: join(tmpRoot, 'd.json'), flushDebounceMs: 0 });
    await s.load();
    s.set({ tg_polling_enabled: true });
    const firstTs = s.get().updated_at;
    await new Promise((r) => setTimeout(r, 2));
    s.set({ tg_polling_enabled: true });
    expect(s.get().updated_at).toBe(firstTs);
    await s.stop();
  });

  it('clamps poll_interval_ms to [MIN, MAX]', () => {
    expect(clampInterval(100)).toBe(POLL_INTERVAL_MIN_MS);
    expect(clampInterval(999999)).toBe(POLL_INTERVAL_MAX_MS);
    expect(clampInterval(NaN)).toBe(POLL_INTERVAL_DEFAULT_MS);
    expect(clampInterval(10_000)).toBe(10_000);
  });

  it('survives malformed file by defaulting', async () => {
    const path = join(tmpRoot, 'd.json');
    await (await import('node:fs/promises')).writeFile(path, '{broken', 'utf8');
    const s = new DanInboundConfigStore({ filePath: path });
    await s.load();
    expect(s.get().tg_polling_enabled).toBe(false);
  });
});

// ─── PendingDanQueue.resolveByNonce ──────────────────────────────────────────

describe('ASD-T-034 — PendingDanQueue.resolveByNonce', () => {
  it('resolves the matching pending entry by 6-char prefix', async () => {
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    const p = q.hold({
      appId: 'cursor.app',
      hostname: 'api.openai.com',
      highRiskTools: [{ name: 't', category: 'shell_exec', matchedBy: 'test' }],
    });
    const id = q.list()[0]!.pendingId;
    const nonce = id.slice(0, 6).toLowerCase();

    const matched = q.resolveByNonce(nonce, 'allow');
    expect(matched).toBe(id);
    await expect(p).resolves.toMatchObject({ decision: 'allow', timedOut: false });
  });

  it('returns null on no match', () => {
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    q.hold({
      appId: 'x',
      hostname: 'y',
      highRiskTools: [{ name: 't', category: 'shell_exec', matchedBy: 'test' }],
    });
    expect(q.resolveByNonce('ffffff', 'allow')).toBeNull();
  });

  it('rejects bad nonce length', () => {
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    q.hold({
      appId: 'x',
      hostname: 'y',
      highRiskTools: [{ name: 't', category: 'shell_exec', matchedBy: 'test' }],
    });
    expect(q.resolveByNonce('abc', 'allow')).toBeNull();
    expect(q.resolveByNonce('abcdef1234', 'allow')).toBeNull();
  });

  it('case-insensitive nonce match', async () => {
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    q.hold({
      appId: 'x',
      hostname: 'y',
      highRiskTools: [{ name: 't', category: 'shell_exec', matchedBy: 'test' }],
    });
    const id = q.list()[0]!.pendingId;
    const upperNonce = id.slice(0, 6).toUpperCase();
    expect(q.resolveByNonce(upperNonce, 'deny')).toBe(id);
  });
});

// ─── TelegramInboundPoller ───────────────────────────────────────────────────

describe('ASD-T-034 — TelegramInboundPoller', () => {
  const creds = { bot_token: 'TEST_TOKEN', chat_id: '987' };

  function makeQueueWithOneHold(): { q: PendingDanQueue; nonce: string; id: string } {
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    q.hold({
      appId: 'cursor.app',
      hostname: 'api.openai.com',
      highRiskTools: [{ name: 'shell', category: 'shell_exec', matchedBy: 'test' }],
    });
    const id = q.list()[0]!.pendingId;
    return { q, id, nonce: id.slice(0, 6).toLowerCase() };
  }

  it('dispatch resolves pending DAN on matching reply text', () => {
    const { q, id, nonce } = makeQueueWithOneHold();
    const poller = new TelegramInboundPoller(q, { loadCreds: () => creds });
    const result = poller.dispatch(
      {
        update_id: 1,
        message: { text: `y ${nonce}`, chat: { id: 987 } },
      },
      creds
    );
    expect(result).toEqual({ kind: 'resolved', pendingId: id, decision: 'allow' });
  });

  it('dispatch returns "wrong-chat" if chat_id does not match creds', () => {
    const { q, nonce } = makeQueueWithOneHold();
    const poller = new TelegramInboundPoller(q, { loadCreds: () => creds });
    const result = poller.dispatch(
      {
        update_id: 2,
        message: { text: `y ${nonce}`, chat: { id: 12345 } },
      },
      creds
    );
    expect(result).toEqual({ kind: 'wrong-chat' });
  });

  it('dispatch returns "parsed" when reply matches no pending hold', () => {
    const { q } = makeQueueWithOneHold();
    const poller = new TelegramInboundPoller(q, { loadCreds: () => creds });
    const result = poller.dispatch(
      { update_id: 3, message: { text: 'y ffffff', chat: { id: 987 } } },
      creds
    );
    expect(result).toEqual({ kind: 'parsed', nonce: 'ffffff' });
  });

  it('dispatch returns "ignored" on non-reply text', () => {
    const { q } = makeQueueWithOneHold();
    const poller = new TelegramInboundPoller(q, { loadCreds: () => creds });
    expect(
      poller.dispatch({ update_id: 4, message: { text: 'hello there', chat: { id: 987 } } }, creds)
    ).toEqual({ kind: 'ignored' });
  });

  it('tick advances offset and dispatches each update', async () => {
    const { q, id, nonce } = makeQueueWithOneHold();
    const updates: TelegramUpdate[] = [
      { update_id: 100, message: { text: 'noise', chat: { id: 987 } } },
      { update_id: 101, message: { text: `y ${nonce}`, chat: { id: 987 } } },
    ];
    const fetchImpl: typeof fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: updates }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )) as typeof fetch;
    const poller = new TelegramInboundPoller(q, { fetchImpl, loadCreds: () => creds });
    const results = await poller.tick();
    expect(results).toEqual([
      { kind: 'ignored' },
      { kind: 'resolved', pendingId: id, decision: 'allow' },
    ]);
  });

  it('tick dedupes already-seen update_ids across calls', async () => {
    const { q, nonce } = makeQueueWithOneHold();
    let callCount = 0;
    const fetchImpl: typeof fetch = (() => {
      callCount += 1;
      const updates: TelegramUpdate[] = [
        { update_id: 200, message: { text: `y ${nonce}`, chat: { id: 987 } } },
      ];
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: updates }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    }) as typeof fetch;
    const poller = new TelegramInboundPoller(q, { fetchImpl, loadCreds: () => creds });
    // First tick resolves the hold; second tick gets the same update_id
    // but it's already in `seen` → dispatched 0 times.
    const first = await poller.tick();
    const second = await poller.tick();
    expect(first[0]?.kind).toBe('resolved');
    expect(second).toEqual([]); // already-seen update is skipped
    expect(callCount).toBe(2); // both ticks hit the API
  });

  it('tick swallows network errors without throwing', async () => {
    const { q } = makeQueueWithOneHold();
    const fetchImpl: typeof fetch = (() => Promise.reject(new Error('ECONNRESET'))) as typeof fetch;
    const poller = new TelegramInboundPoller(q, { fetchImpl, loadCreds: () => creds });
    await expect(poller.tick()).resolves.toEqual([]);
  });

  it('tick returns [] on auth error (401) without throwing', async () => {
    const { q } = makeQueueWithOneHold();
    const fetchImpl: typeof fetch = (() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 }))) as typeof fetch;
    const poller = new TelegramInboundPoller(q, { fetchImpl, loadCreds: () => creds });
    await expect(poller.tick()).resolves.toEqual([]);
  });

  it('start() returns false when credentials missing', () => {
    const { q } = makeQueueWithOneHold();
    const poller = new TelegramInboundPoller(q, { loadCreds: () => null });
    expect(poller.start(2000)).toBe(false);
    expect(poller.isRunning()).toBe(false);
  });

  it('start() returns true on first call, false on second; stop() halts', () => {
    const { q } = makeQueueWithOneHold();
    const poller = new TelegramInboundPoller(q, { loadCreds: () => creds });
    expect(poller.start(60_000)).toBe(true);
    expect(poller.isRunning()).toBe(true);
    expect(poller.start(60_000)).toBe(false); // already running
    poller.stop();
    expect(poller.isRunning()).toBe(false);
  });
});
