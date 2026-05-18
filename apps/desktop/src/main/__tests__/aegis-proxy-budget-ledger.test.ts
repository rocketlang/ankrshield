// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-014 budget ledger.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BudgetLedger, BudgetConfigResolver, hourBucket } from '../aegis-proxy/budget-ledger.js';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'aegis-budget-'));
  filePath = join(tmpDir, 'budget-ledger.json');
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('ASD-T-014 — hourBucket', () => {
  it('produces YYYY-MM-DDTHH UTC strings', () => {
    expect(hourBucket(new Date('2026-05-18T10:23:45.123Z'))).toBe('2026-05-18T10');
  });

  it('different hours produce different buckets', () => {
    const a = hourBucket(new Date('2026-05-18T10:00:00Z'));
    const b = hourBucket(new Date('2026-05-18T11:00:00Z'));
    expect(a).not.toBe(b);
  });

  it('different minutes in same hour share bucket', () => {
    const a = hourBucket(new Date('2026-05-18T10:00:00Z'));
    const b = hourBucket(new Date('2026-05-18T10:59:59Z'));
    expect(a).toBe(b);
  });
});

describe('ASD-T-014 — BudgetLedger', () => {
  it('starts empty when file does not exist', async () => {
    const l = new BudgetLedger({ filePath });
    await l.load();
    expect(l.getAll()).toEqual({});
    await l.stop();
  });

  it('recordCost adds to current-hour bucket', async () => {
    const l = new BudgetLedger({ filePath, flushDebounceMs: 0 });
    await l.load();
    const entry = l.recordCost('cursor', 0.05);
    expect(entry.cost_usd).toBeCloseTo(0.05);
    expect(entry.request_count).toBe(1);
    await l.stop();
  });

  it('multiple recordCost calls in same hour accumulate', async () => {
    const l = new BudgetLedger({ filePath, flushDebounceMs: 0 });
    await l.load();
    const now = new Date('2026-05-18T10:00:00Z');
    l.recordCost('cursor', 0.01, now);
    l.recordCost('cursor', 0.02, now);
    l.recordCost('cursor', 0.03, now);
    const entry = l.currentHourSpend('cursor', now);
    expect(entry.cost_usd).toBeCloseTo(0.06);
    expect(entry.request_count).toBe(3);
    await l.stop();
  });

  it('different apps tracked independently', async () => {
    const l = new BudgetLedger({ filePath, flushDebounceMs: 0 });
    await l.load();
    l.recordCost('cursor', 0.1);
    l.recordCost('claude-desktop', 0.2);
    expect(l.currentHourSpend('cursor').cost_usd).toBeCloseTo(0.1);
    expect(l.currentHourSpend('claude-desktop').cost_usd).toBeCloseTo(0.2);
    await l.stop();
  });

  it('different hours tracked independently', async () => {
    const l = new BudgetLedger({ filePath, flushDebounceMs: 0 });
    await l.load();
    const hourA = new Date('2026-05-18T10:00:00Z');
    const hourB = new Date('2026-05-18T11:00:00Z');
    l.recordCost('cursor', 0.1, hourA);
    l.recordCost('cursor', 0.2, hourB);
    expect(l.currentHourSpend('cursor', hourA).cost_usd).toBeCloseTo(0.1);
    expect(l.currentHourSpend('cursor', hourB).cost_usd).toBeCloseTo(0.2);
    await l.stop();
  });

  it('currentHourSpend returns zeroed entry for new app', async () => {
    const l = new BudgetLedger({ filePath });
    await l.load();
    const entry = l.currentHourSpend('never-seen');
    expect(entry.cost_usd).toBe(0);
    expect(entry.request_count).toBe(0);
    await l.stop();
  });

  it('hourlyBreakdown returns N entries newest-first', async () => {
    const l = new BudgetLedger({ filePath, flushDebounceMs: 0 });
    await l.load();
    const now = new Date();
    l.recordCost('cursor', 0.05, now);
    const breakdown = l.hourlyBreakdown('cursor', 5);
    expect(breakdown).toHaveLength(5);
    expect(breakdown[0]!.cost_usd).toBeCloseTo(0.05); // current hour
    expect(breakdown[1]!.cost_usd).toBe(0); // hour ago
    await l.stop();
  });

  it('flush writes JSON file readable by another ledger', async () => {
    const a = new BudgetLedger({ filePath, flushDebounceMs: 0 });
    await a.load();
    a.recordCost('cursor', 0.123);
    await a.flush();

    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('"cursor"');

    const b = new BudgetLedger({ filePath, flushDebounceMs: 0 });
    await b.load();
    expect(b.currentHourSpend('cursor').cost_usd).toBeCloseTo(0.123);
    await b.stop();
  });

  it('prunes entries older than retentionHours on load', async () => {
    // Hand-craft a file with one fresh entry + one very old entry.
    const oldBucket = hourBucket(new Date('2020-01-01T00:00:00Z'));
    const freshBucket = hourBucket();
    await writeFile(
      filePath,
      JSON.stringify({
        cursor: {
          [oldBucket]: { cost_usd: 999, request_count: 9 },
          [freshBucket]: { cost_usd: 0.05, request_count: 1 },
        },
      })
    );
    const l = new BudgetLedger({ filePath, retentionHours: 168 });
    await l.load();
    const all = l.getAll();
    expect(all.cursor![oldBucket]).toBeUndefined();
    expect(all.cursor![freshBucket]).toBeDefined();
    await l.stop();
  });

  it('sanitises malformed JSON gracefully', async () => {
    await writeFile(filePath, 'not json');
    const l = new BudgetLedger({ filePath });
    await l.load();
    expect(l.getAll()).toEqual({});
    await l.stop();
  });

  it('stop() force-flushes', async () => {
    const l = new BudgetLedger({ filePath, flushDebounceMs: 10000 });
    await l.load();
    l.recordCost('cursor', 0.01);
    await l.stop();
    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('"cursor"');
  });

  it('hot-path check (currentHourSpend) is microseconds (10k calls)', async () => {
    const l = new BudgetLedger({ filePath, flushDebounceMs: 1000 });
    await l.load();
    l.recordCost('perf', 0.01);
    const N = 10_000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) l.currentHourSpend('perf');
    const elapsedNs = Number(process.hrtime.bigint() - start);
    const perCallMicros = elapsedNs / N / 1000;
    // ASD-YK-001 budget: < 5 ms per ledger read. Give 50 μs headroom.
    expect(perCallMicros).toBeLessThan(50);
    await l.stop();
  });
});

describe('ASD-T-014 — BudgetConfigResolver', () => {
  it('defaults to unlimited (null) for all apps', () => {
    const r = new BudgetConfigResolver();
    expect(r.resolve('cursor').hourly_limit_usd).toBeNull();
  });

  it('setOverride takes effect', () => {
    const r = new BudgetConfigResolver();
    r.setOverride('cursor', { hourly_limit_usd: 0.5 });
    expect(r.resolve('cursor').hourly_limit_usd).toBe(0.5);
  });

  it('snapshot returns overrides', () => {
    const r = new BudgetConfigResolver();
    r.setOverride('a', { hourly_limit_usd: 0.1 });
    r.setOverride('b', { hourly_limit_usd: null });
    expect(r.snapshot()).toEqual({
      a: { hourly_limit_usd: 0.1 },
      b: { hourly_limit_usd: null },
    });
  });
});
