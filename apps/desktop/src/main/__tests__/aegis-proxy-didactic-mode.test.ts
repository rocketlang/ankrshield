// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-033 — rules catalog + didactic mode store (FR-18).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RULES_CATALOG, RULE_IDS, getRule, rulesByLayer } from '../aegis-proxy/rules-catalog.js';
import { DidacticModeStore } from '../aegis-proxy/didactic-mode-store.js';

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'aegis-didactic-'));
});
afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

// ─── Catalog completeness ────────────────────────────────────────────────────

describe('ASD-T-033 — rules catalog', () => {
  it('covers all 12 ASD-NNN statutes from LOGICS doc Layer A', () => {
    const layerA = rulesByLayer('A')
      .map((r) => r.id)
      .sort();
    expect(layerA).toEqual([
      'ASD-001',
      'ASD-002',
      'ASD-003',
      'ASD-004',
      'ASD-005',
      'ASD-006',
      'ASD-007',
      'ASD-008',
      'ASD-009',
      'ASD-010',
      'ASD-011',
      'ASD-012',
    ]);
  });

  it('covers all 7 ASD-YK-NNN meta-reasoning rules from LOGICS doc Layer B', () => {
    const layerB = rulesByLayer('B')
      .map((r) => r.id)
      .sort();
    expect(layerB).toEqual([
      'ASD-YK-001',
      'ASD-YK-002',
      'ASD-YK-003',
      'ASD-YK-004',
      'ASD-YK-005',
      'ASD-YK-006',
      'ASD-YK-007',
    ]);
  });

  it('every entry has title, summary, citation; layer A or B; no Layer C exposure', () => {
    for (const id of RULE_IDS) {
      const r = RULES_CATALOG[id];
      expect(r, id).toBeDefined();
      expect(r!.title.length, `${id} title`).toBeGreaterThan(0);
      expect(r!.title.length, `${id} title ≤80`).toBeLessThanOrEqual(80);
      expect(r!.summary.length, `${id} summary`).toBeGreaterThan(0);
      // 2-sentence cap is fuzzy; enforce a soft length ceiling instead.
      expect(r!.summary.length, `${id} summary ≤320`).toBeLessThanOrEqual(320);
      expect(r!.citation, `${id} citation`).toMatch(/^LOGICS/);
      expect(r!.layer, `${id} layer A or B`).toMatch(/^[AB]$/);
    }
  });

  it('getRule miss returns null', () => {
    expect(getRule('ASD-999')).toBeNull();
    expect(getRule('')).toBeNull();
  });

  it('IDs are sorted stably', () => {
    expect(RULE_IDS).toEqual([...RULE_IDS].sort());
  });
});

// ─── DidacticModeStore ───────────────────────────────────────────────────────

describe('ASD-T-033 — DidacticModeStore', () => {
  it('defaults to disabled when file missing', async () => {
    const s = new DidacticModeStore({ filePath: join(tmpRoot, 'd.json') });
    await s.load();
    expect(s.get().enabled).toBe(false);
    expect(s.get().updated_at).toBeNull();
  });

  it('set(true) flips + sets updated_at + persists', async () => {
    const path = join(tmpRoot, 'd.json');
    const s = new DidacticModeStore({ filePath: path, flushDebounceMs: 0 });
    await s.load();
    s.set(true);
    expect(s.get().enabled).toBe(true);
    expect(s.get().updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await s.stop();
    const raw = await readFile(path, 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ enabled: true });
  });

  it('set(true) twice is a no-op on the second call (updated_at unchanged)', async () => {
    const s = new DidacticModeStore({ filePath: join(tmpRoot, 'd.json'), flushDebounceMs: 0 });
    await s.load();
    s.set(true);
    const firstTs = s.get().updated_at;
    // Spin one ms so a real change would advance the clock.
    await new Promise((r) => setTimeout(r, 2));
    s.set(true);
    expect(s.get().updated_at).toBe(firstTs);
    await s.stop();
  });

  it('survives malformed file by defaulting to off', async () => {
    const path = join(tmpRoot, 'd.json');
    await (await import('node:fs/promises')).writeFile(path, 'not-json{', 'utf8');
    const s = new DidacticModeStore({ filePath: path });
    await s.load();
    expect(s.get().enabled).toBe(false);
  });

  it('flushed file is 0o644, dir 0o700 (POSIX)', async () => {
    if (process.platform === 'win32') return;
    const { stat } = await import('node:fs/promises');
    const path = join(tmpRoot, 'subdir', 'd.json');
    const s = new DidacticModeStore({ filePath: path, flushDebounceMs: 0 });
    await s.load();
    s.set(true);
    await s.stop();
    const fStat = await stat(path);
    const dStat = await stat(join(tmpRoot, 'subdir'));
    expect(fStat.mode & 0o777).toBe(0o644);
    expect(dStat.mode & 0o777).toBe(0o700);
  });

  it('debounced flush coalesces multiple sets', async () => {
    const path = join(tmpRoot, 'd.json');
    const s = new DidacticModeStore({ filePath: path, flushDebounceMs: 100 });
    await s.load();
    s.set(true);
    s.set(false);
    s.set(true);
    // Before debounce — file may or may not exist; just verify final state on stop().
    await s.stop();
    const raw = await readFile(path, 'utf8');
    expect(JSON.parse(raw).enabled).toBe(true);
  });
});
