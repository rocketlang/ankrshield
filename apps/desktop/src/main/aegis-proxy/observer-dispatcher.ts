// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — provider adapter dispatcher
//
// Picks the right adapter for a (hostname, path) pair, or null if no adapter
// claims this request. Calling code falls back to a generic
// "unknown provider, byte-count only" observation when null.

import { anthropicAdapter } from './observer-anthropic.js';
import { openaiAdapter } from './observer-openai.js';
import type { ProviderAdapter } from './observer-types.js';

export const ALL_ADAPTERS: readonly ProviderAdapter[] = [anthropicAdapter, openaiAdapter];

export function pickAdapter(hostname: string, path: string): ProviderAdapter | null {
  for (const a of ALL_ADAPTERS) {
    if (a.matches(hostname, path)) return a;
  }
  return null;
}
