// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-016 DanDecisionCache (session-scoped per-app x tool-set TTL cache).

import { describe, it, expect } from 'vitest';

import { DanDecisionCache, __defaults } from '../aegis-proxy/dan-decision-cache.js';
import type { CategorizedTool } from '../aegis-proxy/dan-categorizer.js';

const TOOLS_BASH: CategorizedTool[] = [
  { name: 'bash', category: 'shell_exec', matchedBy: 'name:bash' },
];
const TOOLS_SQL: CategorizedTool[] = [
  { name: 'execute_sql', category: 'database_ddl', matchedBy: 'name:sql' },
];
const TOOLS_BASH_SQL: CategorizedTool[] = [...TOOLS_BASH, ...TOOLS_SQL];

describe('ASD-T-016 — DanDecisionCache', () => {
  it('returns null when no entry', () => {
    const c = new DanDecisionCache();
    expect(c.get('cursor', TOOLS_BASH)).toBeNull();
  });

  it('set + get roundtrip', () => {
    const c = new DanDecisionCache();
    c.set('cursor', TOOLS_BASH, 'allow');
    const v = c.get('cursor', TOOLS_BASH);
    expect(v).not.toBeNull();
    expect(v!.decision).toBe('allow');
    expect(v!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('different tool sets keyed independently', () => {
    const c = new DanDecisionCache();
    c.set('cursor', TOOLS_BASH, 'allow');
    c.set('cursor', TOOLS_SQL, 'deny');
    expect(c.get('cursor', TOOLS_BASH)!.decision).toBe('allow');
    expect(c.get('cursor', TOOLS_SQL)!.decision).toBe('deny');
    expect(c.get('cursor', TOOLS_BASH_SQL)).toBeNull(); // distinct set
  });

  it('different appIds keyed independently', () => {
    const c = new DanDecisionCache();
    c.set('cursor', TOOLS_BASH, 'allow');
    expect(c.get('claude-desktop', TOOLS_BASH)).toBeNull();
  });

  it('tool-set order does NOT matter (sorted hash)', () => {
    const c = new DanDecisionCache();
    c.set('cursor', [TOOLS_BASH[0]!, TOOLS_SQL[0]!], 'allow');
    expect(c.get('cursor', [TOOLS_SQL[0]!, TOOLS_BASH[0]!])).not.toBeNull();
  });

  it('case-insensitive on tool names', () => {
    const c = new DanDecisionCache();
    c.set('cursor', [{ name: 'BASH', category: 'shell_exec', matchedBy: 'x' }], 'allow');
    expect(
      c.get('cursor', [{ name: 'bash', category: 'shell_exec', matchedBy: 'x' }])
    ).not.toBeNull();
  });

  it('allow TTL is longer than deny TTL', () => {
    expect(__defaults.DEFAULT_TTL_ALLOW_MS).toBeGreaterThan(__defaults.DEFAULT_TTL_DENY_MS);
  });

  it('allow entry survives short-lived window; deny expires sooner', () => {
    let t = 1_000_000;
    const c = new DanDecisionCache({
      ttlAllowMs: 60_000,
      ttlDenyMs: 1_000,
      now: () => t,
    });
    c.set('cursor', TOOLS_BASH, 'allow');
    c.set('claude-desktop', TOOLS_BASH, 'deny');

    t += 500; // 0.5s
    expect(c.get('cursor', TOOLS_BASH)?.decision).toBe('allow');
    expect(c.get('claude-desktop', TOOLS_BASH)?.decision).toBe('deny');

    t += 1_001; // 1.5s — deny expired, allow still valid
    expect(c.get('cursor', TOOLS_BASH)?.decision).toBe('allow');
    expect(c.get('claude-desktop', TOOLS_BASH)).toBeNull();

    t += 60_000; // way past allow TTL
    expect(c.get('cursor', TOOLS_BASH)).toBeNull();
  });

  it('lazy GC: expired entries are evicted on read', () => {
    let t = 1_000_000;
    const c = new DanDecisionCache({ ttlAllowMs: 1_000, ttlDenyMs: 1_000, now: () => t });
    c.set('cursor', TOOLS_BASH, 'allow');
    expect(c.size()).toBe(1);
    t += 2_000;
    expect(c.get('cursor', TOOLS_BASH)).toBeNull();
    // After read, the entry should be evicted from the underlying map.
    expect(c.size()).toBe(0);
  });

  it('forgetApp clears all entries for an app, returns count', () => {
    const c = new DanDecisionCache();
    c.set('cursor', TOOLS_BASH, 'allow');
    c.set('cursor', TOOLS_SQL, 'deny');
    c.set('claude-desktop', TOOLS_BASH, 'allow');
    expect(c.forgetApp('cursor')).toBe(2);
    expect(c.get('cursor', TOOLS_BASH)).toBeNull();
    expect(c.get('cursor', TOOLS_SQL)).toBeNull();
    expect(c.get('claude-desktop', TOOLS_BASH)?.decision).toBe('allow');
  });

  it('forgetApp returns 0 when no entries for that app', () => {
    const c = new DanDecisionCache();
    expect(c.forgetApp('cursor')).toBe(0);
  });

  it('clear drops everything', () => {
    const c = new DanDecisionCache();
    c.set('cursor', TOOLS_BASH, 'allow');
    c.set('claude-desktop', TOOLS_BASH, 'allow');
    c.clear();
    expect(c.get('cursor', TOOLS_BASH)).toBeNull();
    expect(c.get('claude-desktop', TOOLS_BASH)).toBeNull();
    expect(c.size()).toBe(0);
  });

  it('size() only counts unexpired entries', () => {
    let t = 1_000_000;
    const c = new DanDecisionCache({ ttlAllowMs: 1_000, ttlDenyMs: 1_000, now: () => t });
    c.set('cursor', TOOLS_BASH, 'allow');
    c.set('claude-desktop', TOOLS_BASH, 'allow');
    expect(c.size()).toBe(2);
    t += 2_000;
    expect(c.size()).toBe(0);
  });

  it('latest decision overwrites prior (deny then allow)', () => {
    const c = new DanDecisionCache();
    c.set('cursor', TOOLS_BASH, 'deny');
    expect(c.get('cursor', TOOLS_BASH)?.decision).toBe('deny');
    c.set('cursor', TOOLS_BASH, 'allow');
    expect(c.get('cursor', TOOLS_BASH)?.decision).toBe('allow');
  });
});
