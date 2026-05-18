// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — audit retention config (ASD-T-028 / FR-14)
//
// Per Vivechana Decision 4: default 90 days + weekly digests preserved
// indefinitely. User may flip to "keep indefinitely" (retention_days = null)
// or to a shorter window (min 7 days — anything less and the report card's
// rolling-7d window can't survive a worker pass).
//
// Single source of truth on disk: ~/.ankrshield/audit-retention.json.
// Same debounced-flush pattern as the other config stores. Worker reads
// this on every periodic tick so config changes take effect within one
// tick (default tick: 1 hour).
//
// @rule:ASD-007 — append-only audit; retention worker only PRUNES (deletes
//   files older than the policy), never edits in place.
// @rule:Decision-4 — weekly digests preserved indefinitely; retention
//   applies only to per-day audit files (consent-* and future request-*).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const CONFIG_FILE = join(homedir(), '.ankrshield', 'audit-retention.json');

export const RETENTION_DAYS_DEFAULT = 90;
export const RETENTION_DAYS_MIN = 7;
export const RETENTION_DAYS_MAX = 3650; // 10 years — anything more is "indefinite"

export interface AuditRetentionConfig {
  /** Days to keep per-day audit files. null = keep indefinitely. */
  retention_days: number | null;
  /** Whether to keep weekly digests indefinitely (Decision 4). Default true. */
  keep_weekly_digests: boolean;
  /** Whether to gzip prior-day audit files on the next pass. Default true. */
  compress_prior_day: boolean;
}

export interface AuditRetentionStoreOptions {
  filePath?: string;
  flushDebounceMs?: number;
}

const DEFAULT_CONFIG: AuditRetentionConfig = {
  retention_days: RETENTION_DAYS_DEFAULT,
  keep_weekly_digests: true,
  compress_prior_day: true,
};

export class AuditRetentionStore {
  private cfg: AuditRetentionConfig = { ...DEFAULT_CONFIG };
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  private readonly flushDebounceMs: number;

  constructor(opts: AuditRetentionStoreOptions = {}) {
    this.filePath = opts.filePath ?? CONFIG_FILE;
    this.flushDebounceMs = opts.flushDebounceMs ?? 1000;
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.cfg = { ...DEFAULT_CONFIG };
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.cfg = sanitiseLoaded(JSON.parse(raw));
    } catch {
      this.cfg = { ...DEFAULT_CONFIG };
    }
  }

  get(): AuditRetentionConfig {
    return { ...this.cfg };
  }

  /**
   * Update fields. `retention_days` is clamped: null (indefinite) stays null;
   * a number is clamped to [MIN, MAX]. Booleans pass through.
   */
  set(input: Partial<AuditRetentionConfig>): AuditRetentionConfig {
    if ('retention_days' in input) {
      const v = input.retention_days;
      this.cfg.retention_days = v === null ? null : clampDays(Number(v));
    }
    if (typeof input.keep_weekly_digests === 'boolean') {
      this.cfg.keep_weekly_digests = input.keep_weekly_digests;
    }
    if (typeof input.compress_prior_day === 'boolean') {
      this.cfg.compress_prior_day = input.compress_prior_day;
    }
    this.markDirty();
    return this.get();
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeFile(this.filePath, JSON.stringify(this.cfg, null, 2) + '\n', { mode: 0o644 });
    } catch (err) {
      this.dirty = true;
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushDebounceMs);
  }
}

function clampDays(v: number): number {
  if (!Number.isFinite(v)) return RETENTION_DAYS_DEFAULT;
  if (v < RETENTION_DAYS_MIN) return RETENTION_DAYS_MIN;
  if (v > RETENTION_DAYS_MAX) return RETENTION_DAYS_MAX;
  return Math.round(v);
}

function sanitiseLoaded(raw: unknown): AuditRetentionConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
  const o = raw as Partial<AuditRetentionConfig>;
  return {
    retention_days:
      o.retention_days === null
        ? null
        : typeof o.retention_days === 'number'
          ? clampDays(o.retention_days)
          : RETENTION_DAYS_DEFAULT,
    keep_weekly_digests: typeof o.keep_weekly_digests === 'boolean' ? o.keep_weekly_digests : true,
    compress_prior_day: typeof o.compress_prior_day === 'boolean' ? o.compress_prior_day : true,
  };
}

export const __limits = { RETENTION_DAYS_DEFAULT, RETENTION_DAYS_MIN, RETENTION_DAYS_MAX };
export const __paths = { CONFIG_FILE };
