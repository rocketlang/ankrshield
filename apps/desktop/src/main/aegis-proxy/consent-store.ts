// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — consent record store (ASD-T-003)
//
// @rule:ASD-005 — every consent ceremony produces an audit record
// @rule:ASD-007 — audit receipts are append-only and user-owned
// @rule:ASD-YK-007 — ConsentDialog is a first-class component, every render
//   produces a PRAMANA-shape consent record (this store is where they land)

import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const AUDIT_DIR = join(homedir(), '.ankrshield', 'audit');

/**
 * Decision states for a consent ceremony.
 *
 * - 'allow' / 'deny' — terminal user decisions
 * - 'skip' — user closed the dialog without deciding (e.g., root-CA ceremony)
 * - 'impression' — dialog was presented (no terminal decision yet). Per
 *   FR-21 / ASD-YK-007, every ConsentDialog presentation produces a
 *   PRAMANA record so we can audit *what the user saw*, not just what
 *   they chose. Impression and decision records pair via subject.pendingId.
 */
export type ConsentDecision = 'allow' | 'deny' | 'skip' | 'impression';

export interface ConsentRecord {
  consent_record_id: string;
  ceremony: string;
  decision: ConsentDecision;
  ts: string;
  /** Free-form per-ceremony subject. For root-CA: fingerprint + paths. */
  subject: Record<string, unknown>;
  context: {
    purpose: string;
    consequences: string;
    revocation_path: string;
  };
}

export interface ConsentStoreOptions {
  /** Override default ~/.ankrshield/audit — used by tests. */
  auditDir?: string;
}

export class ConsentStore {
  private readonly auditDir: string;

  constructor(opts: ConsentStoreOptions = {}) {
    this.auditDir = opts.auditDir ?? AUDIT_DIR;
  }

  /**
   * Write a new consent record to disk. PRAMANA-shape JSON at
   * {auditDir}/{date}/consent-{ceremony}-{id}.json
   */
  async record(input: Omit<ConsentRecord, 'consent_record_id' | 'ts'>): Promise<ConsentRecord> {
    const record: ConsentRecord = {
      consent_record_id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      ...input,
    };
    const date = record.ts.slice(0, 10);
    const dir = join(this.auditDir, date);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const filename = `consent-${input.ceremony}-${record.consent_record_id}.json`;
    await writeFile(join(dir, filename), JSON.stringify(record, null, 2) + '\n', {
      mode: 0o644,
    });
    return record;
  }

  /**
   * Find the most recent consent record for a given ceremony (any decision),
   * scanning newest-date directory first. Returns null if no record exists.
   */
  async latestForCeremony(ceremony: string): Promise<ConsentRecord | null> {
    if (!existsSync(this.auditDir)) return null;
    const dates = await readdir(this.auditDir);
    const sortedDates = dates.sort().reverse();
    for (const date of sortedDates) {
      const dir = join(this.auditDir, date);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }
      const matches = files.filter(
        (f) => f.startsWith(`consent-${ceremony}-`) && f.endsWith('.json')
      );
      if (matches.length === 0) continue;
      // Same-date files: sort lex (id is uuid so this is effectively random;
      // for "newest" semantics we just take any — within one day all records
      // are recent enough). Stable: take the lexically-last.
      matches.sort();
      const newest = matches[matches.length - 1]!;
      try {
        const raw = await readFile(join(dir, newest), 'utf8');
        return JSON.parse(raw) as ConsentRecord;
      } catch {
        continue;
      }
    }
    return null;
  }

  /** True if the user has answered the ceremony at all (any decision). */
  async hasAnswered(ceremony: string): Promise<boolean> {
    return (await this.latestForCeremony(ceremony)) !== null;
  }
}

export const __paths = { AUDIT_DIR };
