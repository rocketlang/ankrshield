// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — audit retention worker (ASD-T-028 / FR-14)
//
// Periodic worker that maintains ~/.ankrshield/audit/:
//
//   - Daily prune of date-dir contents older than retention_days
//     (per AuditRetentionStore config). Per Decision 4, retention_days = null
//     means "keep indefinitely" — worker still runs to generate digests but
//     never deletes.
//   - Gzip prior-day audit files (yesterday's date dir) once per day if
//     compress_prior_day is true. Saves disk vs the raw JSON.
//   - Weekly digest generation: every Sunday-00:00 UTC pass, aggregate the
//     past 7 days of consent records + EventTallyStore counters into a
//     digest JSON at audit/digests/weekly-{ISO-week}.json. Digests are
//     preserved indefinitely regardless of retention_days.
//
// Worker tick: hourly. Cheap on most ticks (state checked, no work done).
// Heavy work (prune, gzip, digest) only on the right hour of the day /
// week of the year. State is in-memory only — restart re-reads timestamps
// from existing files to decide whether work is due.
//
// @rule:ASD-007 — append-only; worker only deletes / gzips / appends digests.
// @rule:Decision-4 — weekly digests preserved indefinitely.

import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat as statAsync, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzip as gzipCb } from 'node:zlib';
import { promisify } from 'node:util';

import type { ConsentStore } from './consent-store.js';
import type { EventTallyStore } from './event-tally-store.js';
import type { AuditRetentionStore } from './audit-retention-config.js';

const gzip = promisify(gzipCb);

const AUDIT_DIR = join(homedir(), '.ankrshield', 'audit');
const DIGEST_DIR = join(AUDIT_DIR, 'digests');

const DEFAULT_TICK_MS = 60 * 60 * 1000; // 1 hour

export interface AuditRetentionWorkerOptions {
  /** Override audit root (for tests). */
  auditDir?: string;
  /** Tick interval. Default 1 hour. */
  tickMs?: number;
  /** Override clock. */
  now?: () => Date;
}

export interface RetentionStats {
  pruned: number;
  gzipped: number;
  digestsWritten: number;
}

export class AuditRetentionWorker {
  private readonly auditDir: string;
  private readonly digestDir: string;
  private readonly tickMs: number;
  private readonly nowFn: () => Date;
  private timer: NodeJS.Timeout | null = null;
  /** Date-key (YYYY-MM-DD) of the last day the heavy pass ran. */
  private lastHeavyPassDay: string | null = null;

  constructor(
    private readonly stores: {
      retention: AuditRetentionStore;
      tally: EventTallyStore;
      consents: ConsentStore;
    },
    opts: AuditRetentionWorkerOptions = {}
  ) {
    this.auditDir = opts.auditDir ?? AUDIT_DIR;
    this.digestDir = join(this.auditDir, 'digests');
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS;
    this.nowFn = opts.now ?? (() => new Date());
  }

  /** Start the periodic tick. Idempotent. */
  start(): void {
    if (this.timer) return;
    // Fire a tick immediately so first-run housekeeping doesn't wait.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    // Don't keep the process alive just for this — production runs in
    // Electron main where the app lifecycle owns the wake.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Single tick — decides whether the heavy pass is due and runs it.
   * Public for tests / manual IPC trigger.
   */
  async tick(): Promise<RetentionStats> {
    const today = dayKey(this.nowFn());
    if (this.lastHeavyPassDay === today) {
      // Already ran today's heavy pass; nothing to do.
      return { pruned: 0, gzipped: 0, digestsWritten: 0 };
    }
    const stats = await this.runHeavyPass();
    this.lastHeavyPassDay = today;
    return stats;
  }

  /** Force the heavy pass regardless of last-run state (for IPC + tests). */
  async runHeavyPass(): Promise<RetentionStats> {
    const cfg = this.stores.retention.get();
    const now = this.nowFn();
    let pruned = 0;
    let gzipped = 0;
    let digestsWritten = 0;

    await mkdir(this.auditDir, { recursive: true, mode: 0o700 });
    await mkdir(this.digestDir, { recursive: true, mode: 0o700 });

    // 1. Weekly digest — write THIS week's snapshot (idempotent: filename
    //    keyed by ISO-week so re-writing replaces in place). Worth doing
    //    even if today isn't Sunday so a freshly-installed app gets a
    //    digest immediately rather than waiting up to 7 days.
    const digest = await this.writeWeeklyDigest(now);
    if (digest) digestsWritten = 1;

    // 2. Prune — drop date-dirs older than retention_days (Decision 4:
    //    null retention = never prune; digest dir always preserved).
    if (cfg.retention_days != null) {
      pruned = await this.pruneOldDateDirs(cfg.retention_days, now);
    }

    // 3. Gzip prior-day files — yesterday's JSON files become .json.gz
    //    so disk pressure stays low. We don't touch today's dir to avoid
    //    racing the live writer.
    if (cfg.compress_prior_day) {
      gzipped = await this.gzipPriorDay(now);
    }

    return { pruned, gzipped, digestsWritten };
  }

  // ─── Heavy-pass primitives ────────────────────────────────────────────────

  /**
   * Aggregate the past 7 days of activity into a single weekly digest JSON.
   * Filename keyed by ISO week so the same week's digest replaces in place
   * if the worker runs multiple times that week.
   */
  private async writeWeeklyDigest(now: Date): Promise<{ path: string } | null> {
    const isoWeek = isoWeekKey(now);
    const filePath = join(this.digestDir, `weekly-${isoWeek}.json`);
    // Aggregate per-app tally over the last 7 days for every known app.
    const apps = this.stores.tally.knownAppIds();
    const perApp: Record<string, unknown> = {};
    for (const appId of apps) {
      perApp[appId] = this.stores.tally.rollup(appId, 7);
    }
    // Count consent records in the past 7 days from disk.
    const consentCounts = await countConsentRecords(this.auditDir, now, 7);
    const digest = {
      isoWeek,
      generated_at: now.toISOString(),
      window_days: 7,
      apps_seen: apps,
      per_app_tally: perApp,
      consent_records: consentCounts,
    };
    await writeFile(filePath, JSON.stringify(digest, null, 2) + '\n', { mode: 0o644 });
    return { path: filePath };
  }

  /**
   * Walk audit/ for YYYY-MM-DD subdirs older than retention_days; delete.
   * digests/ subdir always preserved.
   */
  private async pruneOldDateDirs(retentionDays: number, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffKey = dayKey(cutoff);
    let pruned = 0;
    let entries: string[];
    try {
      entries = await readdir(this.auditDir);
    } catch {
      return 0;
    }
    for (const e of entries) {
      if (e === 'digests') continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) continue;
      if (e >= cutoffKey) continue;
      try {
        await rm(join(this.auditDir, e), { recursive: true, force: true });
        pruned += 1;
      } catch {
        // ignore — locked or already deleted
      }
    }
    return pruned;
  }

  /**
   * Find yesterday's date-dir, gzip every plain .json file in place
   * (skip if .json.gz already exists). Today's dir is left alone so the
   * live writer doesn't race.
   */
  private async gzipPriorDay(now: Date): Promise<number> {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dir = join(this.auditDir, dayKey(yesterday));
    if (!existsSync(dir)) return 0;
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return 0;
    }
    let gzipped = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const src = join(dir, f);
      const dst = `${src}.gz`;
      if (existsSync(dst)) continue;
      try {
        const raw = await readFile(src);
        const compressed = await gzip(raw);
        await writeFile(dst, compressed, { mode: 0o644 });
        await rm(src, { force: true });
        gzipped += 1;
      } catch {
        // ignore individual file failures
      }
    }
    return gzipped;
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  /** List digest filenames + sizes for the renderer. */
  async listDigests(): Promise<Array<{ name: string; sizeBytes: number; isoWeek: string }>> {
    if (!existsSync(this.digestDir)) return [];
    let entries: string[];
    try {
      entries = await readdir(this.digestDir);
    } catch {
      return [];
    }
    const out: Array<{ name: string; sizeBytes: number; isoWeek: string }> = [];
    for (const f of entries) {
      if (!f.startsWith('weekly-') || !f.endsWith('.json')) continue;
      try {
        const s = await statAsync(join(this.digestDir, f));
        const m = f.match(/^weekly-(.+)\.json$/);
        out.push({ name: f, sizeBytes: s.size, isoWeek: m?.[1] ?? '' });
      } catch {
        // ignore
      }
    }
    out.sort((a, b) => (b.isoWeek > a.isoWeek ? 1 : -1));
    return out;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ISO-8601 week of year: YYYY-Www. Per the spec, week 1 is the week with the
 * first Thursday of the calendar year; week starts Monday. Simpler local
 * implementation since we don't have an i18n dep available.
 */
export function isoWeekKey(d: Date): string {
  // Copy to a UTC date so we don't double-count timezone shifts.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Day of week: Mon=1..Sun=7.
  const dayOfWeek = target.getUTCDay() || 7;
  // Shift target to the Thursday of this week (ISO anchor).
  target.setUTCDate(target.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Walk the audit dir for the past N days; count consent files per ceremony.
 * Cheap-ish — N is small (7 for weekly digests).
 */
async function countConsentRecords(
  auditDir: string,
  now: Date,
  days: number
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dir = join(auditDir, dayKey(d));
    if (!existsSync(dir)) continue;
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.startsWith('consent-')) continue;
      // Filename shape: consent-{ceremony}-{uuid}.json[.gz]
      const m = f.match(/^consent-(.+?)-[0-9a-f]{8,}/);
      if (m) {
        const ceremony = m[1]!;
        out[ceremony] = (out[ceremony] ?? 0) + 1;
      }
    }
  }
  return out;
}

export const __internals = { dayKey, isoWeekKey, countConsentRecords };
export const __paths = { AUDIT_DIR, DIGEST_DIR };
// Lift the lint-noise about unused symbols at this stage of plumbing.
void statSync;
