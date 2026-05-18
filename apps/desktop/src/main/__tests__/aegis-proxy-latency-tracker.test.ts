// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-022 LatencyTracker — sliding-window stats + percentile math.

import { describe, it, expect } from 'vitest';

import { LatencyTracker, nowMs, __internals } from '../aegis-proxy/latency-tracker.js';

describe('ASD-T-022 — percentile()', () => {
  const p = __internals.percentile;

  it('empty array → 0', () => {
    expect(p([], 0.5)).toBe(0);
  });

  it('single-element', () => {
    expect(p([7], 0)).toBe(7);
    expect(p([7], 0.5)).toBe(7);
    expect(p([7], 1)).toBe(7);
  });

  it('q=0 and q=1 give endpoints', () => {
    const xs = [1, 2, 3, 4, 5];
    expect(p(xs, 0)).toBe(1);
    expect(p(xs, 1)).toBe(5);
  });

  it('median of odd-length array', () => {
    expect(p([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('median of even-length array (linear interp)', () => {
    expect(p([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 6);
  });

  it('p99 of 100 elements 1..100 = ~99.01 (linear interp)', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    const v = p(xs, 0.99);
    expect(v).toBeGreaterThan(98);
    expect(v).toBeLessThan(100);
  });
});

describe('ASD-T-022 — LatencyTracker basics', () => {
  it('snapshot of empty tracker is all-zeros, sampleCount=0', () => {
    const t = new LatencyTracker({ windowSize: 16 });
    const s = t.snapshot();
    expect(s.sampleCount).toBe(0);
    expect(s.totalRecorded).toBe(0);
    expect(s.p99).toBe(0);
  });

  it('record + snapshot for trivial sequence', () => {
    const t = new LatencyTracker({ windowSize: 16 });
    for (let i = 1; i <= 10; i++) t.record(i);
    const s = t.snapshot();
    expect(s.sampleCount).toBe(10);
    expect(s.totalRecorded).toBe(10);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    expect(s.mean).toBeCloseTo(5.5, 6);
    expect(s.p50).toBeCloseTo(5.5, 6);
  });

  it('discards NaN / Infinity / negative samples', () => {
    const t = new LatencyTracker({ windowSize: 16 });
    t.record(Number.NaN);
    t.record(Number.POSITIVE_INFINITY);
    t.record(-1);
    t.record(5);
    const s = t.snapshot();
    expect(s.sampleCount).toBe(1);
    expect(s.totalRecorded).toBe(1);
    expect(s.p50).toBe(5);
  });

  it('clamps windowSize to minimum 8', () => {
    const t = new LatencyTracker({ windowSize: 2 });
    for (let i = 0; i < 12; i++) t.record(i);
    expect(t.snapshot().sampleCount).toBe(8);
  });

  it('circular overwrite preserves only the last `windowSize` samples', () => {
    const t = new LatencyTracker({ windowSize: 8 });
    // Record 12 samples; window keeps the last 8.
    for (let i = 1; i <= 12; i++) t.record(i);
    const s = t.snapshot();
    expect(s.sampleCount).toBe(8);
    expect(s.totalRecorded).toBe(12);
    // Last 8 are 5..12 → min 5, max 12, mean = (5+...+12)/8 = 8.5
    expect(s.min).toBe(5);
    expect(s.max).toBe(12);
    expect(s.mean).toBeCloseTo(8.5, 6);
  });

  it('timeSync returns elapsed + result, records latency', () => {
    const t = new LatencyTracker({ windowSize: 16 });
    const { result, elapsedMs } = t.timeSync(() => 42);
    expect(result).toBe(42);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    expect(t.snapshot().sampleCount).toBe(1);
  });

  it('clear resets sampleCount and totalRecorded', () => {
    const t = new LatencyTracker({ windowSize: 8 });
    for (let i = 0; i < 10; i++) t.record(i);
    expect(t.snapshot().sampleCount).toBe(8);
    t.clear();
    const s = t.snapshot();
    expect(s.sampleCount).toBe(0);
    expect(s.totalRecorded).toBe(0);
  });

  it('label defaults to "latency" and is exposed', () => {
    const a = new LatencyTracker();
    expect(a.label).toBe('latency');
    const b = new LatencyTracker({ label: 'aegis-gate' });
    expect(b.label).toBe('aegis-gate');
  });
});

describe('ASD-T-022 — NFR-1 p99 verification', () => {
  it('1000 sub-ms samples → p99 well under 50ms', () => {
    const t = new LatencyTracker({ windowSize: 1000 });
    // Simulate the AEGIS gate's tight-loop latency: most calls < 0.5ms,
    // a few outliers up to 5ms. Mirrors what a bitmask check looks like.
    for (let i = 0; i < 990; i++) t.record(Math.random() * 0.5);
    for (let i = 0; i < 10; i++) t.record(2 + Math.random() * 3);
    const s = t.snapshot();
    expect(s.sampleCount).toBe(1000);
    expect(s.p50).toBeLessThan(1);
    expect(s.p95).toBeLessThan(5);
    expect(s.p99).toBeLessThan(50); // NFR-1
  });

  it('p99 flags FAIL when a slow tail dominates', () => {
    const t = new LatencyTracker({ windowSize: 1000 });
    // Most calls fast, but 50 calls > 50ms — should push p99 over.
    for (let i = 0; i < 950; i++) t.record(0.1);
    for (let i = 0; i < 50; i++) t.record(100);
    const s = t.snapshot();
    expect(s.p99).toBeGreaterThanOrEqual(50);
  });

  it('p99 of constant series equals the value', () => {
    const t = new LatencyTracker({ windowSize: 100 });
    for (let i = 0; i < 100; i++) t.record(7);
    expect(t.snapshot().p99).toBeCloseTo(7, 6);
  });
});

describe('ASD-T-022 — nowMs', () => {
  it('returns monotonically non-decreasing values', () => {
    const a = nowMs();
    const b = nowMs();
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it('produces sub-ms resolution (or at least finite)', () => {
    const a = nowMs();
    for (let i = 0; i < 1000; i++) Math.sqrt(i);
    const b = nowMs();
    expect(b - a).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(b - a)).toBe(true);
  });
});
