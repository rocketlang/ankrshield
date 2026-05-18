// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — latency tracker (ASD-T-022)
//
// NFR-1: AEGIS check p99 < 50 ms over 1000 samples. We track per-call
// timings in a fixed-size circular buffer, compute percentiles on demand
// by sorting a copy of the populated slice. For a 1000-sample window the
// sort is O(N log N) ≈ ~10000 ops, well under any latency budget — even
// at 10x the window size it's negligible compared to a single network
// round-trip.
//
// Why a circular buffer and not HDR histogram: simpler, exact percentiles
// (no bucket quantisation), zero deps. Window size is bounded so memory
// is bounded. The trade-off is that snapshot() is O(N log N) instead of
// O(1) — fine because the renderer polls at ~1Hz.
//
// @rule:ASD-YK-001 — per-request latency budget; this is the source of truth
// @rule:ASD-006 — observation only; tracker never modifies the request

const DEFAULT_WINDOW = 1000;

export interface LatencyStatsSnapshot {
  /** Total samples ever recorded (across all windows). */
  totalRecorded: number;
  /** Samples currently in the window (≤ window size). */
  sampleCount: number;
  /** Window cap. */
  windowSize: number;
  /** Sub-millisecond accuracy (process.hrtime delta in ms). */
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface LatencyTrackerOptions {
  /** Max samples retained for percentile compute. Default 1000 (per NFR-1). */
  windowSize?: number;
  /** Optional label for diagnostics (e.g., 'aegis-gate'). */
  label?: string;
}

export class LatencyTracker {
  private readonly samples: number[];
  private readonly windowSize: number;
  private nextSlot = 0;
  private filled = false;
  private total = 0;
  readonly label: string;

  constructor(opts: LatencyTrackerOptions = {}) {
    this.windowSize = Math.max(8, opts.windowSize ?? DEFAULT_WINDOW);
    this.samples = new Array<number>(this.windowSize);
    this.label = opts.label ?? 'latency';
  }

  /**
   * Record a single timing in milliseconds. Negative / NaN / Infinity are
   * discarded (caller bugs should be visible upstream, not silently warped).
   */
  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples[this.nextSlot] = ms;
    this.nextSlot += 1;
    if (this.nextSlot >= this.windowSize) {
      this.nextSlot = 0;
      this.filled = true;
    }
    this.total += 1;
  }

  /**
   * Convenience wrapper: time a synchronous function call. Returns the
   * function's result + the elapsed ms (also records into the tracker).
   */
  timeSync<T>(fn: () => T): { result: T; elapsedMs: number } {
    const t0 = nowMs();
    const result = fn();
    const elapsedMs = nowMs() - t0;
    this.record(elapsedMs);
    return { result, elapsedMs };
  }

  /**
   * Snapshot stats over the current window. O(N log N) in window size due
   * to sort; safe to call at ~1Hz polling rate.
   */
  snapshot(): LatencyStatsSnapshot {
    const count = this.filled ? this.windowSize : this.nextSlot;
    if (count === 0) {
      return {
        totalRecorded: this.total,
        sampleCount: 0,
        windowSize: this.windowSize,
        min: 0,
        max: 0,
        mean: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }
    // Copy populated slice + sort ascending.
    const sorted = new Array<number>(count);
    for (let i = 0; i < count; i++) sorted[i] = this.samples[i]!;
    sorted.sort((a, b) => a - b);

    let sum = 0;
    for (let i = 0; i < count; i++) sum += sorted[i]!;
    return {
      totalRecorded: this.total,
      sampleCount: count,
      windowSize: this.windowSize,
      min: sorted[0]!,
      max: sorted[count - 1]!,
      mean: sum / count,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
    };
  }

  /** Drop all samples (for tests / explicit reset). */
  clear(): void {
    this.nextSlot = 0;
    this.filled = false;
    this.total = 0;
  }
}

/**
 * Linear-interpolation percentile on a sorted ascending array.
 * Returns sorted[0] for q=0 and sorted[len-1] for q=1.
 */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/** Monotonic wall-clock ms via process.hrtime when available. */
export function nowMs(): number {
  if (typeof process !== 'undefined' && process.hrtime) {
    const [s, ns] = process.hrtime();
    return s * 1000 + ns / 1e6;
  }
  return Date.now();
}

export const __internals = { percentile };
