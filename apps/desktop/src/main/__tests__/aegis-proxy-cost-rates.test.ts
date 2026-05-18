// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-014 cost rates table.

import { describe, it, expect } from 'vitest';

import { lookupRate, computeCost, getRateTable } from '../aegis-proxy/cost-rates.js';

describe('ASD-T-014 — lookupRate', () => {
  it('returns exact rate for declared Anthropic models', () => {
    const r = lookupRate('anthropic', 'claude-opus-4-7');
    expect(r.inputPerMillion).toBe(15.0);
    expect(r.outputPerMillion).toBe(75.0);
  });

  it('longest-prefix match wins (claude-opus-4-7-20260301 → claude-opus-4-7)', () => {
    const r = lookupRate('anthropic', 'claude-opus-4-7-20260301');
    expect(r.inputPerMillion).toBe(15.0);
    expect(r.outputPerMillion).toBe(75.0);
  });

  it('falls back to claude-opus-4 when only that prefix exists', () => {
    const r = lookupRate('anthropic', 'claude-opus-4-future-variant');
    expect(r.inputPerMillion).toBe(15.0);
  });

  it('returns exact rate for OpenAI models', () => {
    expect(lookupRate('openai', 'gpt-4o').inputPerMillion).toBe(2.5);
    expect(lookupRate('openai', 'gpt-4o-mini').outputPerMillion).toBe(0.6);
    expect(lookupRate('openai', 'o1-mini').inputPerMillion).toBe(3.0);
  });

  it('embeddings have outputPerMillion=0 (no completion)', () => {
    expect(lookupRate('openai', 'text-embedding-3-small').outputPerMillion).toBe(0);
  });

  it('fail-pessimistic fallback for unknown model (most-expensive declared)', () => {
    const r = lookupRate('anthropic', 'claude-zzz-future');
    expect(r.inputPerMillion).toBeGreaterThanOrEqual(15.0);
  });

  it('fail-pessimistic for null model', () => {
    const r = lookupRate('anthropic', null);
    expect(r.inputPerMillion).toBe(15.0);
  });

  it('fail-pessimistic for unknown provider', () => {
    const r = lookupRate('unknown', 'whatever');
    expect(r.inputPerMillion).toBe(30.0);
    expect(r.outputPerMillion).toBe(80.0);
  });
});

describe('ASD-T-014 — computeCost', () => {
  it('computes USD from token counts at rate / 1M', () => {
    // claude-opus-4-7 is $15/M input, $75/M output
    // 1000 input + 500 output → 15*0.001 + 75*0.0005 = 0.015 + 0.0375 = 0.0525
    const cost = computeCost('anthropic', 'claude-opus-4-7', 1000, 500);
    expect(cost).toBeCloseTo(0.0525, 6);
  });

  it('OpenAI gpt-4o-mini at 10k+5k tokens', () => {
    // $0.15/M in + $0.60/M out
    // 10000 * 0.15 / 1M + 5000 * 0.60 / 1M = 0.0015 + 0.003 = 0.0045
    const cost = computeCost('openai', 'gpt-4o-mini', 10000, 5000);
    expect(cost).toBeCloseTo(0.0045, 6);
  });

  it('returns 0 when both token counts are null', () => {
    expect(computeCost('anthropic', 'claude-opus-4-7', null, null)).toBe(0);
  });

  it('handles null prompt tokens (counts as 0)', () => {
    const cost = computeCost('openai', 'gpt-4o', null, 1000);
    // 1000 * 10 / 1M = 0.01
    expect(cost).toBeCloseTo(0.01, 6);
  });

  it('handles null completion tokens', () => {
    const cost = computeCost('openai', 'gpt-4o', 1000, null);
    // 1000 * 2.5 / 1M = 0.0025
    expect(cost).toBeCloseTo(0.0025, 6);
  });
});

describe('ASD-T-014 — getRateTable', () => {
  it('exposes the rate table for diagnostics', () => {
    const table = getRateTable();
    expect(table.size).toBeGreaterThan(10);
    expect(table.has('anthropic:claude-opus-4-7')).toBe(true);
    expect(table.has('openai:gpt-4o')).toBe(true);
  });
});
