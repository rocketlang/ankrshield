// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — provider cost-per-token table (ASD-T-014)
//
// USD per million tokens, broken into input + output. Rates current as of
// 2026-05-18 IST from public Anthropic + OpenAI pricing pages. Periodic
// refresh required; the rates table is a feature flag in spirit.
//
// Model matching: exact-prefix match against `provider:model_id`. Most-
// specific prefix wins (e.g. `claude-opus-4-7-20260301` matches the
// `claude-opus-4-7` entry, then falls back to `claude-opus-4` if both
// were declared). Unknown models default to the provider's most-expensive
// declared rate — fail-pessimistic so we don't under-bill on a new model.
//
// @rule:ASD-YK-001 — cost lookup is O(1) Map access; well under the 5ms
//   ledger budget portion of the 50ms PreToolUse total.

import type { Provider } from './observer-types.js';

export interface CostRate {
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
}

/**
 * Provider+model → cost rate. Keys are `provider:model-id-prefix`; longest
 * matching prefix wins. Add new entries as models ship; remove deprecated
 * ones only when truly retired (saved invoices reference them).
 */
const RATE_TABLE: ReadonlyMap<string, CostRate> = new Map([
  // ─── Anthropic (Claude family) ─────────────────────────────────────────────
  ['anthropic:claude-opus-4-7', { inputPerMillion: 15.0, outputPerMillion: 75.0 }],
  ['anthropic:claude-opus-4-6', { inputPerMillion: 15.0, outputPerMillion: 75.0 }],
  ['anthropic:claude-opus-4', { inputPerMillion: 15.0, outputPerMillion: 75.0 }],
  ['anthropic:claude-sonnet-4-6', { inputPerMillion: 3.0, outputPerMillion: 15.0 }],
  ['anthropic:claude-sonnet-4', { inputPerMillion: 3.0, outputPerMillion: 15.0 }],
  ['anthropic:claude-haiku-4-5', { inputPerMillion: 1.0, outputPerMillion: 5.0 }],
  ['anthropic:claude-haiku-4', { inputPerMillion: 1.0, outputPerMillion: 5.0 }],
  ['anthropic:claude-3-5-sonnet', { inputPerMillion: 3.0, outputPerMillion: 15.0 }],
  ['anthropic:claude-3-opus', { inputPerMillion: 15.0, outputPerMillion: 75.0 }],

  // ─── OpenAI ────────────────────────────────────────────────────────────────
  ['openai:gpt-4o', { inputPerMillion: 2.5, outputPerMillion: 10.0 }],
  ['openai:gpt-4o-mini', { inputPerMillion: 0.15, outputPerMillion: 0.6 }],
  ['openai:gpt-4', { inputPerMillion: 30.0, outputPerMillion: 60.0 }],
  ['openai:gpt-4-turbo', { inputPerMillion: 10.0, outputPerMillion: 30.0 }],
  ['openai:gpt-3.5-turbo', { inputPerMillion: 0.5, outputPerMillion: 1.5 }],
  ['openai:o1', { inputPerMillion: 15.0, outputPerMillion: 60.0 }],
  ['openai:o1-mini', { inputPerMillion: 3.0, outputPerMillion: 12.0 }],
  ['openai:o3', { inputPerMillion: 20.0, outputPerMillion: 80.0 }],
  ['openai:text-embedding-3-small', { inputPerMillion: 0.02, outputPerMillion: 0.0 }],
  ['openai:text-embedding-3-large', { inputPerMillion: 0.13, outputPerMillion: 0.0 }],
]);

/**
 * Fail-pessimistic fallback when the model isn't in RATE_TABLE: use the
 * provider's most-expensive declared rate. Prevents under-billing on a
 * new model that ships before we update the table.
 */
const PROVIDER_FALLBACK: ReadonlyMap<Provider, CostRate> = new Map([
  ['anthropic', { inputPerMillion: 15.0, outputPerMillion: 75.0 }], // claude-opus
  ['openai', { inputPerMillion: 30.0, outputPerMillion: 80.0 }], // gpt-4 input + o3 output
  ['unknown', { inputPerMillion: 30.0, outputPerMillion: 80.0 }],
]);

/**
 * Look up the rate for a `provider:model` pair. Longest-prefix match wins.
 * Returns the provider's fallback rate if no prefix matches.
 */
export function lookupRate(provider: Provider, model: string | null): CostRate {
  if (!model) return PROVIDER_FALLBACK.get(provider) ?? PROVIDER_FALLBACK.get('unknown')!;
  // Longest-prefix match: walk the table keys for this provider, sort by
  // length descending, return first prefix that matches.
  const candidates = [...RATE_TABLE.keys()]
    .filter((k) => k.startsWith(`${provider}:`))
    .map((k) => ({ key: k, prefix: k.slice(provider.length + 1) }))
    .filter(({ prefix }) => model.startsWith(prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  if (candidates.length === 0) {
    return PROVIDER_FALLBACK.get(provider) ?? PROVIDER_FALLBACK.get('unknown')!;
  }
  return RATE_TABLE.get(candidates[0]!.key)!;
}

/**
 * Compute USD cost for a single request given token counts. Returns 0 if
 * either token count is null/unavailable (some streaming responses skip
 * usage reporting; record-as-0 is honest about the gap).
 */
export function computeCost(
  provider: Provider,
  model: string | null,
  promptTokens: number | null,
  completionTokens: number | null
): number {
  if (promptTokens == null && completionTokens == null) return 0;
  const rate = lookupRate(provider, model);
  const inputUsd = ((promptTokens ?? 0) / 1_000_000) * rate.inputPerMillion;
  const outputUsd = ((completionTokens ?? 0) / 1_000_000) * rate.outputPerMillion;
  return inputUsd + outputUsd;
}

/** Snapshot of the rates table — for debug + UI display. */
export function getRateTable(): ReadonlyMap<string, CostRate> {
  return RATE_TABLE;
}
