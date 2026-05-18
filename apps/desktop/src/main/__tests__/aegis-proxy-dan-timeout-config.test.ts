// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-018 DanTimeoutStore + per-hold timeout override.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DanTimeoutStore,
  DAN_TIMEOUT_DEFAULT_MS,
  DAN_TIMEOUT_MIN_MS,
  DAN_TIMEOUT_MAX_MS,
} from '../aegis-proxy/dan-timeout-config.js';
import { PendingDanQueue, __limits } from '../aegis-proxy/pending-dan-queue.js';
import type { CategorizedTool } from '../aegis-proxy/dan-categorizer.js';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'aegis-dan-timeout-'));
  filePath = join(tmpDir, 'dan-timeout.json');
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('ASD-T-018 — DanTimeoutStore', () => {
  it('starts at default when file does not exist', async () => {
    const s = new DanTimeoutStore({ filePath });
    await s.load();
    expect(s.getGlobal()).toBe(DAN_TIMEOUT_DEFAULT_MS);
    expect(s.snapshot().per_app).toEqual({});
    await s.stop();
  });

  it('setGlobal + persist + reload', async () => {
    const a = new DanTimeoutStore({ filePath, flushDebounceMs: 0 });
    await a.load();
    a.setGlobal(45_000);
    await a.flush();
    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('45000');

    const b = new DanTimeoutStore({ filePath, flushDebounceMs: 0 });
    await b.load();
    expect(b.getGlobal()).toBe(45_000);
    await b.stop();
  });

  it('per-app override wins over global on resolve()', async () => {
    const s = new DanTimeoutStore({ filePath, flushDebounceMs: 0 });
    await s.load();
    s.setGlobal(30_000);
    s.setOverride('cursor', 90_000);
    expect(s.resolve('cursor')).toBe(90_000);
    expect(s.resolve('claude-desktop')).toBe(30_000);
    await s.stop();
  });

  it('clamps writes outside [MIN, MAX]', async () => {
    const s = new DanTimeoutStore({ filePath, flushDebounceMs: 0 });
    await s.load();
    expect(s.setGlobal(1_000)).toBe(DAN_TIMEOUT_MIN_MS);
    expect(s.setGlobal(999_999)).toBe(DAN_TIMEOUT_MAX_MS);
    expect(s.setGlobal(Number.NaN)).toBe(DAN_TIMEOUT_DEFAULT_MS);
    expect(s.setOverride('cursor', 5_000)).toBe(DAN_TIMEOUT_MIN_MS);
    expect(s.setOverride('cursor', 5_000_000)).toBe(DAN_TIMEOUT_MAX_MS);
    await s.stop();
  });

  it('persisted file always contains clamped values', async () => {
    const s = new DanTimeoutStore({ filePath, flushDebounceMs: 0 });
    await s.load();
    s.setGlobal(5_000_000);
    s.setOverride('cursor', 1_000);
    await s.flush();
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.global_ms).toBe(DAN_TIMEOUT_MAX_MS);
    expect(parsed.per_app.cursor).toBe(DAN_TIMEOUT_MIN_MS);
  });

  it('sanitises malformed loaded data', async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        global_ms: 'not a number',
        per_app: { cursor: 60_000, broken: 'nope', also_bad: null },
      })
    );
    const s = new DanTimeoutStore({ filePath });
    await s.load();
    expect(s.getGlobal()).toBe(DAN_TIMEOUT_DEFAULT_MS);
    expect(s.getOverride('cursor')).toBe(60_000);
    expect(s.getOverride('broken')).toBeNull();
    expect(s.getOverride('also_bad')).toBeNull();
    await s.stop();
  });

  it('handles corrupt JSON by starting fresh', async () => {
    await writeFile(filePath, '{not json');
    const s = new DanTimeoutStore({ filePath });
    await s.load();
    expect(s.getGlobal()).toBe(DAN_TIMEOUT_DEFAULT_MS);
    expect(s.snapshot().per_app).toEqual({});
    await s.stop();
  });

  it('clearOverride removes per-app entry, returns boolean', async () => {
    const s = new DanTimeoutStore({ filePath, flushDebounceMs: 0 });
    await s.load();
    s.setOverride('cursor', 60_000);
    expect(s.clearOverride('cursor')).toBe(true);
    expect(s.getOverride('cursor')).toBeNull();
    expect(s.clearOverride('cursor')).toBe(false);
    await s.stop();
  });

  it('stop() final-flushes pending writes', async () => {
    const s = new DanTimeoutStore({ filePath, flushDebounceMs: 10_000 });
    await s.load();
    s.setGlobal(60_000);
    await s.stop();
    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('60000');
  });

  it('snapshot returns clamped global + raw per_app values', async () => {
    const s = new DanTimeoutStore({ filePath, flushDebounceMs: 0 });
    await s.load();
    s.setGlobal(60_000);
    s.setOverride('cursor', 90_000);
    const snap = s.snapshot();
    expect(snap.global_ms).toBe(60_000);
    expect(snap.per_app).toEqual({ cursor: 90_000 });
    await s.stop();
  });
});

describe('ASD-T-018 — PendingDanQueue per-hold timeoutMs override', () => {
  const TOOLS: CategorizedTool[] = [{ name: 'bash', category: 'shell_exec', matchedBy: 'x' }];

  it('hold uses per-hold timeoutMs override instead of queue default', async () => {
    vi.useFakeTimers();
    try {
      const q = new PendingDanQueue({ timeoutMs: 60_000 });
      const p = q.hold({
        appId: 'cursor',
        hostname: 'h',
        highRiskTools: TOOLS,
        timeoutMs: 30_000, // override
      });
      expect(q.list()[0]!.timeoutMs).toBe(30_000);
      vi.advanceTimersByTime(29_999);
      expect(q.size()).toBe(1);
      vi.advanceTimersByTime(2);
      const o = await p;
      expect(o.decision).toBe('deny');
      expect(o.timedOut).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('per-hold timeout is clamped to [MIN, MAX]', () => {
    const q = new PendingDanQueue({ timeoutMs: 30_000 });
    void q.hold({
      appId: 'a',
      hostname: 'h',
      highRiskTools: TOOLS,
      timeoutMs: 1_000, // below MIN
    });
    expect(q.list()[0]!.timeoutMs).toBe(__limits.MIN_TIMEOUT_MS);
    q.drain();

    void q.hold({
      appId: 'b',
      hostname: 'h',
      highRiskTools: TOOLS,
      timeoutMs: 999_999, // above MAX
    });
    expect(q.list()[0]!.timeoutMs).toBe(__limits.MAX_TIMEOUT_MS);
    q.drain();
  });

  it('per-hold timeout omitted → falls back to queue default', () => {
    const q = new PendingDanQueue({ timeoutMs: 90_000 });
    void q.hold({ appId: 'cursor', hostname: 'h', highRiskTools: TOOLS });
    expect(q.list()[0]!.timeoutMs).toBe(90_000);
    q.drain();
  });

  it('per-hold timeout works alongside per-hold carriers override', async () => {
    const fired: string[] = [];
    const q = new PendingDanQueue({ timeoutMs: 60_000 });
    const carrier = { notify: () => fired.push('hit') };
    const p = q.hold({
      appId: 'cursor',
      hostname: 'h',
      highRiskTools: TOOLS,
      timeoutMs: 45_000,
      carriers: [carrier],
    });
    expect(q.list()[0]!.timeoutMs).toBe(45_000);
    expect(fired).toEqual(['hit']);
    q.resolve(q.list()[0]!.pendingId, 'deny');
    await p;
  });
});
