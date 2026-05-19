// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-035 — PROOF parity helpers (NFR-10).

import { describe, it, expect } from 'vitest';

import {
  parseLogicsRuleIds,
  scanRuleAnnotations,
  computeParity,
  renderMarkdownReport,
  __internals,
  type DeclaredRule,
  type AnnotatedRule,
} from '../aegis-proxy/proof-parity.js';

// ─── parseLogicsRuleIds ──────────────────────────────────────────────────────

describe('ASD-T-035 — parseLogicsRuleIds', () => {
  it('extracts ASD-NNN headings as Layer A', () => {
    const md = [
      '## Layer A',
      '### ASD-001: The Local LLM Proxy Binds Only To Loopback',
      'body',
      '### ASD-012: Root CA Installation Requires Explicit Named Consent',
      '',
    ].join('\n');
    const ids = parseLogicsRuleIds(md);
    expect(ids).toEqual([
      { id: 'ASD-001', layer: 'A', title: 'The Local LLM Proxy Binds Only To Loopback' },
      {
        id: 'ASD-012',
        layer: 'A',
        title: 'Root CA Installation Requires Explicit Named Consent',
      },
    ]);
  });

  it('extracts ASD-YK-NNN as Layer B and INF-ASD-NNN as Layer C', () => {
    const md = [
      '### ASD-YK-001: PreToolUse Latency Budget',
      '### INF-ASD-001: If Proxy Bound To Non-Loopback, Then Hard Stop',
    ].join('\n');
    const ids = parseLogicsRuleIds(md);
    expect(ids.find((r) => r.id === 'ASD-YK-001')?.layer).toBe('B');
    expect(ids.find((r) => r.id === 'INF-ASD-001')?.layer).toBe('C');
  });

  it('ignores rule-shaped strings in body text (only matches start-of-line ###)', () => {
    const md = [
      '### ASD-001: Real rule',
      'Body text mentions ### ASD-002: not-a-heading',
      'and "see also ASD-003" without a heading.',
    ].join('\n');
    const ids = parseLogicsRuleIds(md);
    expect(ids).toHaveLength(1);
    expect(ids[0]?.id).toBe('ASD-001');
  });

  it('de-dupes a doubled heading (last one wins on title equality)', () => {
    const md = ['### ASD-001: First', '', '### ASD-001: Second'].join('\n');
    const ids = parseLogicsRuleIds(md);
    expect(ids).toHaveLength(1);
    expect(ids[0]?.title).toBe('First');
  });

  it('strips backticks from titles', () => {
    const md = '### ASD-001: Title with `code` in it';
    expect(parseLogicsRuleIds(md)[0]?.title).toBe('Title with code in it');
  });
});

// ─── scanRuleAnnotations ─────────────────────────────────────────────────────

describe('ASD-T-035 — scanRuleAnnotations', () => {
  it('counts per-line @rule: occurrences with file de-dupe', () => {
    const files = [
      {
        path: 'a.ts',
        content: '// @rule:ASD-001\nfn();\n// @rule:ASD-001 — second site same file\n',
      },
      { path: 'b.ts', content: '// @rule:ASD-001 in file b\n// @rule:ASD-005' },
    ];
    const annotated = scanRuleAnnotations(files);
    expect(annotated).toEqual([
      { id: 'ASD-001', count: 3, files: ['a.ts', 'b.ts'] },
      { id: 'ASD-005', count: 1, files: ['b.ts'] },
    ]);
  });

  it('captures foreign IDs (FR-*, SDK-*, typos) as annotations too', () => {
    const files = [{ path: 'x.ts', content: '// @rule:FR-7\n// @rule:SDK-001\n// @rule:ASD-001' }];
    const annotated = scanRuleAnnotations(files);
    const ids = annotated.map((a) => a.id).sort();
    expect(ids).toEqual(['ASD-001', 'FR-7', 'SDK-001']);
  });

  it('returns an empty array on no annotations', () => {
    expect(scanRuleAnnotations([{ path: 'empty.ts', content: 'no annotations here' }])).toEqual([]);
  });

  it('returns IDs sorted', () => {
    const files = [
      { path: 'a.ts', content: '// @rule:ASD-005' },
      { path: 'b.ts', content: '// @rule:ASD-001' },
    ];
    const annotated = scanRuleAnnotations(files);
    expect(annotated.map((a) => a.id)).toEqual(['ASD-001', 'ASD-005']);
  });
});

// ─── computeParity ───────────────────────────────────────────────────────────

describe('ASD-T-035 — computeParity', () => {
  const declared: DeclaredRule[] = [
    { id: 'ASD-001', layer: 'A', title: 'Loopback' },
    { id: 'ASD-002', layer: 'A', title: 'Root CA' },
    { id: 'ASD-YK-001', layer: 'B', title: 'Latency' },
    { id: 'INF-ASD-001', layer: 'C', title: 'Hard stop' },
  ];

  it('1 declared / 1 annotated → 100% PASS', () => {
    const r = computeParity(
      [{ id: 'ASD-001', layer: 'A', title: 't' }],
      [{ id: 'ASD-001', count: 1, files: ['a.ts'] }]
    );
    expect(r.coverage).toBe(1);
    expect(r.passes).toBe(true);
    expect(r.covered).toEqual(['ASD-001']);
    expect(r.uncovered).toEqual([]);
  });

  it('half coverage at default threshold 0.9 → BELOW THRESHOLD', () => {
    const annotated: AnnotatedRule[] = [
      { id: 'ASD-001', count: 1, files: ['a.ts'] },
      { id: 'ASD-YK-001', count: 1, files: ['b.ts'] },
    ];
    const r = computeParity(declared, annotated);
    expect(r.coverage).toBe(0.5);
    expect(r.passes).toBe(false);
    expect(r.covered).toEqual(['ASD-001', 'ASD-YK-001']);
    expect(r.uncovered).toEqual(['ASD-002', 'INF-ASD-001']);
  });

  it('surfaces foreign IDs separately (not a coverage failure)', () => {
    const annotated: AnnotatedRule[] = [
      ...declared.map((d) => ({ id: d.id, count: 1, files: [`${d.id}.ts`] })),
      { id: 'FR-7', count: 1, files: ['foreign.ts'] },
      { id: 'SDK-001', count: 1, files: ['sdk.ts'] },
    ];
    const r = computeParity(declared, annotated);
    expect(r.coverage).toBe(1);
    expect(r.passes).toBe(true);
    expect(r.foreign).toEqual(['FR-7', 'SDK-001']);
  });

  it('empty declared returns coverage 0 + passes=false', () => {
    const r = computeParity([], [{ id: 'ASD-001', count: 1, files: ['a.ts'] }]);
    expect(r.coverage).toBe(0);
    expect(r.passes).toBe(false);
  });

  it('custom threshold honoured', () => {
    const annotated: AnnotatedRule[] = [{ id: 'ASD-001', count: 1, files: ['a.ts'] }];
    const r = computeParity(declared, annotated, 0.25);
    expect(r.coverage).toBe(0.25);
    expect(r.passes).toBe(true);
  });
});

// ─── inferLayer ──────────────────────────────────────────────────────────────

describe('ASD-T-035 — inferLayer', () => {
  it('maps prefix to layer', () => {
    expect(__internals.inferLayer('ASD-001')).toBe('A');
    expect(__internals.inferLayer('ASD-YK-001')).toBe('B');
    expect(__internals.inferLayer('INF-ASD-001')).toBe('C');
  });
});

// ─── renderMarkdownReport ────────────────────────────────────────────────────

describe('ASD-T-035 — renderMarkdownReport', () => {
  it('renders the verdict, coverage %, and per-layer table', () => {
    const declared: DeclaredRule[] = [
      { id: 'ASD-001', layer: 'A', title: 'Loopback' },
      { id: 'ASD-YK-001', layer: 'B', title: 'Latency' },
    ];
    const annotated: AnnotatedRule[] = [{ id: 'ASD-001', count: 2, files: ['a.ts', 'b.ts'] }];
    const r = computeParity(declared, annotated, 0.5);
    const md = renderMarkdownReport(r, { sourceDir: '/src' });
    expect(md).toMatch(/Coverage by layer/);
    expect(md).toMatch(/coverage 50\.0% vs threshold 50\.0%/);
    expect(md).toMatch(/✅ PASS/);
    expect(md).toMatch(/ASD-YK-001.*Latency/);
  });

  it('renders BELOW THRESHOLD verdict when coverage < threshold', () => {
    const declared: DeclaredRule[] = [
      { id: 'ASD-001', layer: 'A', title: 'a' },
      { id: 'ASD-002', layer: 'A', title: 'b' },
    ];
    const r = computeParity(declared, [{ id: 'ASD-001', count: 1, files: ['x.ts'] }], 0.9);
    const md = renderMarkdownReport(r, { sourceDir: '/src' });
    expect(md).toMatch(/🟡 BELOW THRESHOLD/);
    expect(md).toMatch(/Uncovered rules/);
    expect(md).toMatch(/\*\*ASD-002\*\*/);
  });
});
