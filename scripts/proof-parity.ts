#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop — Forja PROOF parity check (ASD-T-035 / NFR-10).
//
// Reads the LOGICS doc for declared rule IDs, walks the aegis-proxy source
// tree for `@rule:` annotations, computes coverage, writes:
//
//   - JSON  → /root/proposals/ankrshield-desktop-aegis--proof-parity.json
//   - MD    → /root/proposals/ankrshield-desktop-aegis--proof-parity-report--formal--{YYYY-MM-DD}.md
//
// Exit codes:
//   0   coverage >= threshold (PASS)
//   2   coverage < threshold (BELOW THRESHOLD)
//   78  config / IO error
//
// Per the doctrine framing in /root/proposals/ankrshield-desktop-aegis--
// remaining-work--formal--2026-05-18.md §3.5, this is the script form of
// the Forja `/api/v2/forja/proof` endpoint for this service. A future
// integration can expose the same helpers via Mercurius if needed; for
// the NFR-10 P3 close-out, a CLI report is sufficient.

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  parseLogicsRuleIds,
  scanRuleAnnotations,
  computeParity,
  renderMarkdownReport,
} from '../apps/desktop/src/main/aegis-proxy/proof-parity.js';

const REPO_ROOT = '/mnt/storage/projects/ankrshield';
const LOGICS_DOC = '/root/proposals/ankrshield-desktop-aegis--logics--formal--2026-05-18.md';
const SOURCE_DIR = join(REPO_ROOT, 'apps/desktop/src/main/aegis-proxy');
const OUT_JSON = '/root/proposals/ankrshield-desktop-aegis--proof-parity.json';
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_MD = `/root/proposals/ankrshield-desktop-aegis--proof-parity-report--formal--${TODAY}.md`;
const THRESHOLD = 0.9;

async function walk(dir: string, suffix = '.ts'): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir);
  for (const e of entries) {
    if (e === '__tests__') continue; // tests aren't load-bearing for PROOF
    const p = join(dir, e);
    const s = await stat(p);
    if (s.isDirectory()) {
      out.push(...(await walk(p, suffix)));
    } else if (s.isFile() && p.endsWith(suffix)) {
      out.push(p);
    }
  }
  return out;
}

async function main(): Promise<number> {
  // 1. Parse LOGICS doc → declared rule IDs.
  const md = await readFile(LOGICS_DOC, 'utf8');
  const declared = parseLogicsRuleIds(md);
  if (declared.length === 0) {
    process.stderr.write(`[proof-parity] no rule IDs parsed from ${LOGICS_DOC}\n`);
    return 78;
  }

  // 2. Walk source tree → @rule: annotations.
  const files = await walk(SOURCE_DIR);
  const fileContents = await Promise.all(
    files.map(async (p) => ({
      path: relative(REPO_ROOT, p),
      content: await readFile(p, 'utf8'),
    }))
  );
  const annotated = scanRuleAnnotations(fileContents);

  // 3. Compute parity.
  const report = computeParity(declared, annotated, THRESHOLD);

  // 4. Persist JSON + markdown.
  const jsonOut = {
    ...report,
    generated_at: new Date().toISOString(),
    source_dir: relative(REPO_ROOT, SOURCE_DIR),
    logics_doc: LOGICS_DOC,
    files_scanned: fileContents.length,
  };
  await writeFile(OUT_JSON, JSON.stringify(jsonOut, null, 2) + '\n');

  const mdReport = renderMarkdownReport(report, {
    sourceDir: relative(REPO_ROOT, SOURCE_DIR),
  });
  await writeFile(OUT_MD, mdReport);

  // 5. Console summary.
  const pct = (report.coverage * 100).toFixed(1);
  const thrPct = (THRESHOLD * 100).toFixed(0);
  const verdict = report.passes ? '✅ PASS' : '🟡 BELOW THRESHOLD';
  process.stdout.write(
    `[proof-parity] ${verdict} — ${report.covered.length}/${report.declared.length} rules covered ` +
      `(${pct}%, threshold ${thrPct}%) · ${report.foreign.length} foreign · ` +
      `${fileContents.length} files scanned\n`
  );
  if (!report.passes) {
    process.stdout.write(`[proof-parity] uncovered: ${report.uncovered.join(', ')}\n`);
  }
  if (report.foreign.length > 0) {
    process.stdout.write(`[proof-parity] foreign:   ${report.foreign.join(', ')}\n`);
  }
  process.stdout.write(`[proof-parity] JSON → ${OUT_JSON}\n`);
  process.stdout.write(`[proof-parity] MD   → ${OUT_MD}\n`);

  return report.passes ? 0 : 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`[proof-parity] FATAL: ${err instanceof Error ? err.message : err}\n`);
    process.exit(78);
  });
