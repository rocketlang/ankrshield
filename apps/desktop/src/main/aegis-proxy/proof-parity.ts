// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — PROOF parity helpers (ASD-T-035 / NFR-10)
//
// Pure helpers that answer one question: do the `at-rule` colon `RULE-ID`
// annotations in the source tree cover the rule IDs declared in the LOGICS
// doc? (Annotation syntax avoided literally in this comment so the scanner
// doesn't count its own documentation as a real annotation.)
//
// NFR-10 threshold: ≥ 90% of LOGICS-declared rules have ≥1 source annotation.
//
// Used by:
//   - scripts/proof-parity.ts        (orchestration: read LOGICS doc + walk
//                                     source tree + emit JSON + markdown)
//   - tests                          (verify the math: parser + computer)
//
// The helpers are pure: they take strings + arrays, return objects.
// IO lives in the script (Node-only). This keeps unit tests fast +
// platform-neutral.
//
// @rule:ASD-007 — read-only; this module never modifies code or docs.
// @rule:ASD-YK-006 — agentic safeguard's compliance posture is auditable.

/** Layer A / B / C as declared in the LOGICS doc. */
export type RuleLayer = 'A' | 'B' | 'C';

export interface DeclaredRule {
  id: string;
  layer: RuleLayer;
  /** Section heading text, for the report. */
  title: string;
}

export interface AnnotatedRule {
  /** Rule ID as written in the `@rule:` annotation. */
  id: string;
  /** Number of distinct annotation sites that name this ID. */
  count: number;
  /** File paths (relative to the walked root) where this rule is annotated. */
  files: string[];
}

export interface ParityReport {
  declared: DeclaredRule[];
  annotated: AnnotatedRule[];
  /** Rules declared in LOGICS AND annotated in source. */
  covered: string[];
  /** Rules declared in LOGICS but missing from source annotations. */
  uncovered: string[];
  /** Annotation IDs that don't match any LOGICS rule (typos, FR-*, SDK-*). */
  foreign: string[];
  /** covered.length / declared.length, in [0, 1]. */
  coverage: number;
  /** NFR-10 threshold (default 0.90). */
  threshold: number;
  /** True iff coverage >= threshold. */
  passes: boolean;
}

/**
 * Parse the LOGICS doc markdown for rule IDs. Matches the heading shape
 * used by the three layers:
 *   ### ASD-NNN: Title …
 *   ### ASD-YK-NNN: Title …
 *   ### INF-ASD-NNN: Title …
 *
 * Layer is inferred from prefix. Title is everything after the colon,
 * trimmed of trailing whitespace + escape backticks for safe markdown.
 */
export function parseLogicsRuleIds(markdown: string): DeclaredRule[] {
  const out: DeclaredRule[] = [];
  // Anchored at start-of-line to avoid picking up references in body text.
  const re = /^###\s+(ASD-(?:YK-)?\d{3}|INF-ASD-\d{3}):\s*(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const id = m[1]!;
    const title = m[2]!.replace(/`/g, '').trim();
    out.push({ id, layer: inferLayer(id), title });
  }
  // De-dupe by ID — same heading shouldn't appear twice, but be safe.
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

function inferLayer(id: string): RuleLayer {
  if (id.startsWith('ASD-YK-')) return 'B';
  if (id.startsWith('INF-')) return 'C';
  return 'A';
}

/**
 * Scan a flat list of `{path, content}` pairs for annotation occurrences.
 * Rule IDs must match the LOGICS doc shape (ASD-NNN | ASD-YK-NNN |
 * INF-ASD-NNN) — anything else is foreign and surfaced as such.
 *
 * Annotation count is per-site: one `@rule:` per line per file. The same
 * file can carry multiple annotations on different lines; each adds to
 * the count + file appears once in `files` (de-duped).
 */
export function scanRuleAnnotations(
  files: Array<{ path: string; content: string }>
): AnnotatedRule[] {
  // Foreign IDs are surfaced too — the regex permits any uppercase/digit/dash
  // token so we can categorise after, rather than silently dropping them.
  const re = /@rule:([A-Z][A-Z0-9-]+)/g;
  const tally = new Map<string, { count: number; files: Set<string> }>();
  for (const { path, content } of files) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const id = m[1]!;
      const slot = tally.get(id) ?? { count: 0, files: new Set<string>() };
      slot.count += 1;
      slot.files.add(path);
      tally.set(id, slot);
    }
    re.lastIndex = 0; // reset between files (g-flag carries state)
  }
  const out: AnnotatedRule[] = [];
  for (const [id, slot] of tally.entries()) {
    out.push({ id, count: slot.count, files: [...slot.files].sort() });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * Compute parity: cross-reference declared (LOGICS) vs annotated (source).
 * Foreign annotation IDs are surfaced separately — they're not failures
 * by themselves (FR-* refers to the requirements doc, SDK-* to the
 * vendored SDK), but a report consumer can choose to act on them.
 */
export function computeParity(
  declared: DeclaredRule[],
  annotated: AnnotatedRule[],
  threshold = 0.9
): ParityReport {
  const declaredIds = new Set(declared.map((d) => d.id));
  const annotatedIds = new Set(annotated.map((a) => a.id));

  const covered: string[] = [];
  const uncovered: string[] = [];
  for (const d of declared) {
    if (annotatedIds.has(d.id)) covered.push(d.id);
    else uncovered.push(d.id);
  }
  covered.sort();
  uncovered.sort();

  const foreign: string[] = [];
  for (const a of annotated) {
    if (!declaredIds.has(a.id)) foreign.push(a.id);
  }
  foreign.sort();

  const coverage = declared.length === 0 ? 0 : covered.length / declared.length;
  return {
    declared,
    annotated,
    covered,
    uncovered,
    foreign,
    coverage,
    threshold,
    passes: coverage >= threshold,
  };
}

/**
 * Render the parity report as markdown for stdout / report file.
 * Sorted, deterministic — diffable across runs.
 */
export function renderMarkdownReport(report: ParityReport, opts: { sourceDir: string }): string {
  const pct = (report.coverage * 100).toFixed(1);
  const thresholdPct = (report.threshold * 100).toFixed(1);
  const verdict = report.passes ? '✅ PASS' : '🟡 BELOW THRESHOLD';
  const layerCounts = countByLayer(report.declared);
  const coveredByLayer = countByLayer(report.declared.filter((d) => report.covered.includes(d.id)));
  const lines: string[] = [];
  lines.push(`# ankrshield-desktop — PROOF Parity Report (ASD-T-035 / NFR-10)`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Source tree:** \`${opts.sourceDir}\``);
  lines.push(`**Verdict:** ${verdict} — coverage ${pct}% vs threshold ${thresholdPct}%`);
  lines.push('');
  lines.push(`## Coverage by layer`);
  lines.push('');
  lines.push('| Layer | Declared | Covered | Coverage |');
  lines.push('|---|---:|---:|---:|');
  for (const layer of ['A', 'B', 'C'] as const) {
    const dec = layerCounts[layer];
    const cov = coveredByLayer[layer];
    const ratio = dec === 0 ? '—' : `${((cov / dec) * 100).toFixed(0)}%`;
    lines.push(`| ${layerLabel(layer)} | ${dec} | ${cov} | ${ratio} |`);
  }
  lines.push('');
  if (report.uncovered.length > 0) {
    lines.push(`## Uncovered rules (declared but no \`@rule:\` annotation)`);
    lines.push('');
    for (const id of report.uncovered) {
      const rule = report.declared.find((d) => d.id === id)!;
      lines.push(`- **${id}** (layer ${rule.layer}) — ${rule.title}`);
    }
    lines.push('');
  } else {
    lines.push(`## Uncovered rules`);
    lines.push('');
    lines.push('_None — every declared rule has ≥1 annotation._');
    lines.push('');
  }
  if (report.foreign.length > 0) {
    lines.push(`## Foreign annotations (annotated but not in LOGICS)`);
    lines.push('');
    lines.push('These IDs were annotated in source but are not declared in the LOGICS doc.');
    lines.push('They are not failures by themselves — `FR-*` refers to the requirements doc,');
    lines.push('`SDK-*` to the vendored SDK — but consider whether each should be:');
    lines.push('(a) reframed to its underlying ASD/INF rule, or');
    lines.push('(b) added to the LOGICS doc as a new rule.');
    lines.push('');
    for (const id of report.foreign) {
      const ann = report.annotated.find((a) => a.id === id)!;
      lines.push(
        `- **${id}** — ${ann.count} site${ann.count === 1 ? '' : 's'} across ${ann.files.length} file${ann.files.length === 1 ? '' : 's'}`
      );
    }
    lines.push('');
  }
  lines.push(`## Annotation tally (top 20 by count)`);
  lines.push('');
  lines.push('| Rule | Sites | Files |');
  lines.push('|---|---:|---:|');
  for (const a of [...report.annotated].sort((x, y) => y.count - x.count).slice(0, 20)) {
    lines.push(`| ${a.id} | ${a.count} | ${a.files.length} |`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

function countByLayer(rules: DeclaredRule[]): Record<RuleLayer, number> {
  const out: Record<RuleLayer, number> = { A: 0, B: 0, C: 0 };
  for (const r of rules) out[r.layer] += 1;
  return out;
}

function layerLabel(l: RuleLayer): string {
  return l === 'A' ? 'A — SHASTRA' : l === 'B' ? 'B — YUKTI' : 'C — VIVEKA';
}

export const __internals = { inferLayer, countByLayer, layerLabel };
