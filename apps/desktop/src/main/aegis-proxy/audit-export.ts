// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — audit export to ZIP (ASD-T-029 / FR-20)
//
// Streams ~/.ankrshield/audit/{date-range}/* + matching weekly digests
// into a single ZIP at a user-chosen path. Uses the zero-dep STORE ZIP
// writer (zip-writer.ts) since the prior-day files are already gzipped
// by the retention worker (T-028) and today's plain JSON is small.
//
// Range semantics:
//   { from: '2026-04-01', to: '2026-05-01' }  →  inclusive on both ends.
//   Omitted `from` means "all available"; omitted `to` means "through today".
//
// Output layout in archive:
//   2026-04-01/consent-tofu-consent-xxx.json
//   2026-04-01/consent-dan-gate-yyy.json
//   2026-04-02/...
//   digests/weekly-2026-W14.json       (any digest whose ISO-week falls
//                                       in or touches the range)
//   manifest.json                       — metadata about the export itself
//
// @rule:ASD-007 — append-only; export only READS the audit dir, never edits.
// @rule:Decision-4 — digests are always considered, regardless of retention.

import { Buffer } from 'node:buffer';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { ZipWriter } from './zip-writer.js';
import { isoWeekKey } from './audit-retention-worker.js';

const DEFAULT_AUDIT_DIR = join(homedir(), '.ankrshield', 'audit');

export interface ExportRange {
  /** YYYY-MM-DD inclusive; missing = earliest available date. */
  from?: string;
  /** YYYY-MM-DD inclusive; missing = today (UTC). */
  to?: string;
}

export interface ExportOptions {
  /** Override audit root (for tests). */
  auditDir?: string;
  /** Override clock for "to = today" resolution. */
  now?: () => Date;
}

export interface ExportResult {
  outputPath: string;
  byteLength: number;
  entryCount: number;
  daysCovered: string[];
  digestsIncluded: string[];
}

/**
 * Stream all matching audit files into a ZIP at `outputPath`. Resolves once
 * the write stream finishes flushing. Skips files quietly if read fails
 * (e.g., file disappeared mid-walk — keep going rather than abort).
 */
export async function exportAuditZip(
  outputPath: string,
  range: ExportRange = {},
  opts: ExportOptions = {}
): Promise<ExportResult> {
  const auditDir = opts.auditDir ?? DEFAULT_AUDIT_DIR;
  const now = (opts.now ?? (() => new Date()))();
  const today = dayKey(now);
  const from = range.from ?? '0000-00-00';
  const to = range.to ?? today;
  if (from > to) {
    throw new Error(`exportAuditZip: from (${from}) > to (${to})`);
  }

  await mkdir(dirname(outputPath), { recursive: true });

  const daysCovered: string[] = [];
  const digestsIncluded: string[] = [];

  // Pre-walk to compute manifest + sanity-check existence.
  const entries = existsSync(auditDir) ? await readdir(auditDir) : [];
  const dayDirs = entries
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e))
    .filter((e) => e >= from && e <= to)
    .sort();

  // ZIP write — create stream + writer; pump entries one file at a time.
  const out = createWriteStream(outputPath);
  const finished = new Promise<void>((resolve, reject) => {
    out.on('finish', () => resolve());
    out.on('error', reject);
  });

  const zip = new ZipWriter({ write: (chunk) => out.write(chunk) });

  // 1. Per-day files
  for (const day of dayDirs) {
    daysCovered.push(day);
    const dir = join(auditDir, day);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        const data = await readFile(join(dir, f));
        const mtimeStat = await stat(join(dir, f));
        zip.add({ path: `${day}/${f}`, data, mtime: mtimeStat.mtime });
      } catch {
        // File vanished or unreadable — skip and continue.
      }
    }
  }

  // 2. Digests — include any weekly digest whose ISO week intersects the range.
  const digestDir = join(auditDir, 'digests');
  if (existsSync(digestDir)) {
    let digests: string[];
    try {
      digests = await readdir(digestDir);
    } catch {
      digests = [];
    }
    const fromWeek = from === '0000-00-00' ? '0000-W00' : isoWeekKey(new Date(from + 'T00:00:00Z'));
    const toWeek = isoWeekKey(new Date(to + 'T23:59:59Z'));
    for (const f of digests) {
      const m = f.match(/^weekly-(.+)\.json$/);
      if (!m) continue;
      const wk = m[1]!;
      if (wk >= fromWeek && wk <= toWeek) {
        try {
          const data = await readFile(join(digestDir, f));
          const mtimeStat = await stat(join(digestDir, f));
          zip.add({ path: `digests/${f}`, data, mtime: mtimeStat.mtime });
          digestsIncluded.push(f);
        } catch {
          // skip
        }
      }
    }
  }

  // 3. manifest.json — metadata so the recipient can self-verify the export.
  const manifest = {
    generated_at: now.toISOString(),
    audit_dir: auditDir,
    range: { from, to },
    days_covered: daysCovered,
    digests_included: digestsIncluded,
    schema_version: 1,
    notes:
      'STORE-method ZIP. Per-day files retain original on-disk format (.json or .json.gz). ' +
      'Generated by ankrshield-desktop audit-export (ASD-T-029).',
  };
  zip.add({
    path: 'manifest.json',
    data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'),
    mtime: now,
  });

  zip.end();
  out.end();
  await finished;

  return {
    outputPath,
    byteLength: zip.byteLength(),
    entryCount: zip.entryCount(),
    daysCovered,
    digestsIncluded,
  };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const __internals = { dayKey };
export const __paths = { DEFAULT_AUDIT_DIR };
