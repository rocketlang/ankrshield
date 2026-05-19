// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / renderer — DidacticHint (ASD-T-033 / FR-18)
//
// Self-contained "why this dialog" hint that:
//   - Asks main for the didactic toggle state (cached for the session)
//   - When ON: fetches the rule explanation by ID + renders a 3-line block
//   - When OFF: renders nothing (zero visual cost when feature is off)
//
// Used inside ConsentDialog, DAN inbox row, denial event row, etc. Drop-in
// component — the caller only knows the rule ID, not the toggle state.
//
// Per Vivechana Decision 5 + ASD-008 zero-default-surface: this is opt-in,
// and even when on it is short — we add lessons next to the moment, not a
// wall of text.

import { useEffect, useState } from 'react';

interface DidacticRule {
  id: string;
  title: string;
  summary: string;
  citation: string;
  layer?: 'A' | 'B' | 'C';
}

declare global {
  interface Window {
    electronAPI?: {
      aegisProxyDidacticState?: () => Promise<{ enabled: boolean; updated_at: string | null }>;
      aegisProxyDidacticRule?: (input: { id: string }) => Promise<DidacticRule | null>;
      aegisProxyDidacticSet?: (input: {
        enabled: boolean;
      }) => Promise<{ enabled: boolean; updated_at: string | null }>;
    };
  }
}

/**
 * Module-scoped cache. Toggle state is polled once per mount of the first
 * hint; rule explanations are cached per ID for the page lifetime.
 *
 * Polling cadence is intentionally cheap: if the user flips the toggle
 * via Settings, the next mount picks it up. We don't subscribe to
 * change events — over-engineering for a 1-bit setting.
 */
const ruleCache = new Map<string, DidacticRule | null>();
let toggleCache: { enabled: boolean; fetchedAt: number } | null = null;
const TOGGLE_CACHE_MS = 5000;

async function fetchToggle(): Promise<boolean> {
  const now = Date.now();
  if (toggleCache && now - toggleCache.fetchedAt < TOGGLE_CACHE_MS) {
    return toggleCache.enabled;
  }
  const api = window.electronAPI;
  if (!api?.aegisProxyDidacticState) return false;
  try {
    const state = await api.aegisProxyDidacticState();
    toggleCache = { enabled: !!state.enabled, fetchedAt: now };
    return toggleCache.enabled;
  } catch {
    return false;
  }
}

async function fetchRule(id: string): Promise<DidacticRule | null> {
  if (ruleCache.has(id)) return ruleCache.get(id) ?? null;
  const api = window.electronAPI;
  if (!api?.aegisProxyDidacticRule) {
    ruleCache.set(id, null);
    return null;
  }
  try {
    const rule = await api.aegisProxyDidacticRule({ id });
    ruleCache.set(id, rule);
    return rule;
  } catch {
    ruleCache.set(id, null);
    return null;
  }
}

/**
 * Reset the in-memory cache. Called from the Settings toggle so the next
 * hint mount re-reads. Exposed for tests too.
 */
export function __resetDidacticCache(): void {
  ruleCache.clear();
  toggleCache = null;
}

export interface DidacticHintProps {
  /** Rule ID to render. e.g. 'ASD-005'. */
  ruleId: string;
  /** Visual tone — inherits from the surrounding dialog. Default 'neutral'. */
  tone?: 'neutral' | 'warn' | 'danger';
}

export function DidacticHint({ ruleId, tone = 'neutral' }: DidacticHintProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [rule, setRule] = useState<DidacticRule | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const on = await fetchToggle();
      if (cancelled) return;
      setEnabled(on);
      if (!on) return;
      const r = await fetchRule(ruleId);
      if (cancelled) return;
      setRule(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [ruleId]);

  if (enabled !== true || !rule) return null;

  const toneClass =
    tone === 'danger'
      ? 'border-red-700/60 bg-red-950/40 text-red-200'
      : tone === 'warn'
        ? 'border-yellow-700/60 bg-yellow-950/40 text-yellow-200'
        : 'border-gray-700 bg-gray-900/60 text-gray-300';

  return (
    <aside
      data-testid="didactic-hint"
      data-rule-id={rule.id}
      className={`mt-2 rounded border ${toneClass} px-3 py-2 text-[11px] leading-snug`}
    >
      <header className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold tracking-wide">
          {rule.id}: {rule.title}
        </span>
        <span className="opacity-60 text-[10px]">{rule.citation}</span>
      </header>
      <p className="opacity-90">{rule.summary}</p>
    </aside>
  );
}
