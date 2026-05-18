// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-020 BudgetPanel main-side bits: BudgetLedger.recentSpend +
// knownAppIds + the summary-row sort behaviour that the IPC handler uses.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BudgetLedger, BudgetConfigResolver } from '../aegis-proxy/budget-ledger.js';
import { AppsPolicyStore } from '../aegis-proxy/apps-policy.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'aegis-budget-panel-'));
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('ASD-T-020 — BudgetLedger.recentSpend', () => {
  it('returns zeros when app has no activity', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json') });
    const r = l.recentSpend('cursor', 24);
    expect(r).toEqual({ cost_usd: 0, request_count: 0 });
    await l.stop();
  });

  it('sums current-hour activity into the 24h window', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    l.recordCost('cursor', 0.05);
    l.recordCost('cursor', 0.02);
    const r = l.recentSpend('cursor', 24);
    expect(r.cost_usd).toBeCloseTo(0.07, 6);
    expect(r.request_count).toBe(2);
    await l.stop();
  });

  it('sums across hour boundaries inside the window', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    const now = new Date('2026-05-18T10:30:00Z');
    const oneHourAgo = new Date('2026-05-18T09:30:00Z');
    const fiveHoursAgo = new Date('2026-05-18T05:30:00Z');
    l.recordCost('cursor', 0.1, now);
    l.recordCost('cursor', 0.2, oneHourAgo);
    l.recordCost('cursor', 0.3, fiveHoursAgo);
    const r = l.recentSpend('cursor', 24, now);
    expect(r.cost_usd).toBeCloseTo(0.6, 6);
    expect(r.request_count).toBe(3);
    await l.stop();
  });

  it('excludes activity older than the window', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    const now = new Date('2026-05-18T10:30:00Z');
    const dayAgo = new Date('2026-05-17T10:00:00Z'); // ~24h+ old
    l.recordCost('cursor', 0.5, dayAgo);
    l.recordCost('cursor', 0.1, now);
    const r = l.recentSpend('cursor', 24, now);
    expect(r.cost_usd).toBeCloseTo(0.1, 6);
    expect(r.request_count).toBe(1);
    await l.stop();
  });

  it('different apps tracked independently', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    l.recordCost('cursor', 0.5);
    l.recordCost('claude-desktop', 0.2);
    expect(l.recentSpend('cursor', 24).cost_usd).toBeCloseTo(0.5, 6);
    expect(l.recentSpend('claude-desktop', 24).cost_usd).toBeCloseTo(0.2, 6);
    expect(l.recentSpend('unknown-app', 24).cost_usd).toBe(0);
    await l.stop();
  });

  it('configurable window size', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    const now = new Date('2026-05-18T10:30:00Z');
    const threeHoursAgo = new Date('2026-05-18T07:30:00Z');
    l.recordCost('cursor', 0.1, now);
    l.recordCost('cursor', 0.5, threeHoursAgo);
    expect(l.recentSpend('cursor', 1, now).cost_usd).toBeCloseTo(0.1, 6);
    expect(l.recentSpend('cursor', 24, now).cost_usd).toBeCloseTo(0.6, 6);
    await l.stop();
  });
});

describe('ASD-T-020 — BudgetLedger.knownAppIds', () => {
  it('returns empty when no activity', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json') });
    expect(l.knownAppIds()).toEqual([]);
    await l.stop();
  });

  it('lists apps with recorded cost', async () => {
    const l = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    l.recordCost('cursor', 0.01);
    l.recordCost('claude-desktop', 0.02);
    l.recordCost('cursor', 0.03);
    expect(l.knownAppIds().sort()).toEqual(['claude-desktop', 'cursor']);
    await l.stop();
  });
});

describe('ASD-T-020 — BudgetConfigResolver round-trip', () => {
  it('default resolve returns null cap', () => {
    const c = new BudgetConfigResolver();
    expect(c.resolve('cursor').hourly_limit_usd).toBeNull();
  });

  it('setOverride + resolve roundtrip', () => {
    const c = new BudgetConfigResolver();
    c.setOverride('cursor', { hourly_limit_usd: 0.5 });
    expect(c.resolve('cursor').hourly_limit_usd).toBe(0.5);
  });

  it('clearing via null cap', () => {
    const c = new BudgetConfigResolver();
    c.setOverride('cursor', { hourly_limit_usd: 0.5 });
    c.setOverride('cursor', { hourly_limit_usd: null });
    expect(c.resolve('cursor').hourly_limit_usd).toBeNull();
  });

  it('snapshot returns all overrides', () => {
    const c = new BudgetConfigResolver();
    c.setOverride('cursor', { hourly_limit_usd: 0.5 });
    c.setOverride('claude-desktop', { hourly_limit_usd: 1 });
    expect(c.snapshot()).toEqual({
      cursor: { hourly_limit_usd: 0.5 },
      'claude-desktop': { hourly_limit_usd: 1 },
    });
  });
});

describe('ASD-T-020 — AppsPolicyStore + BudgetConfigResolver integration', () => {
  it('cap update keeps existing pii_policy + dan_carrier intact', async () => {
    const ap = new AppsPolicyStore({
      filePath: join(tmpDir, 'ap.json'),
      flushDebounceMs: 0,
    });
    await ap.load();
    ap.recordAllow('cursor', { hourly_limit_usd: 0.5, pii_policy: 'block', dan_carrier: 'wa' });

    // Simulating the IPC handler's "preserve other fields" behaviour.
    const current = ap.get('cursor')!;
    ap.recordAllow('cursor', {
      hourly_limit_usd: 1.5,
      pii_policy: current.pii_policy,
      dan_carrier: current.dan_carrier,
    });
    const next = ap.get('cursor')!;
    expect(next.hourly_limit_usd).toBe(1.5);
    expect(next.pii_policy).toBe('block');
    expect(next.dan_carrier).toBe('wa');
    await ap.stop();
  });
});
