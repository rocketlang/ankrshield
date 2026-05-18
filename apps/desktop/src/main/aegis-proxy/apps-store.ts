// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — observe-only apps store (ASD-T-007)
//
// P1 scope: observation only. Records every distinct app_id that sends a
// request through the proxy: first_seen, last_seen, request_count, known
// executables. NO decision field, NO budget, NO TOFU prompt — those land
// in P2 ASD-T-015. This store exists so AgentFeed can surface "this is the
// first time Cursor has used the proxy" labels in a future iteration, and
// so P2's TOFU dialog has a stable data shape to extend.
//
// @rule:ASD-005 — stored decision is namespaced + revocable (P2 extends this)
// @rule:ASD-007 — append-only is a P2 promise for the audit log; THIS store
//   is mutable per-record (counters update) but the structure is forward-
//   compatible with adding immutable decision history later.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const APPS_DIR = join(homedir(), '.ankrshield');
const APPS_FILE = join(APPS_DIR, 'apps.json');

export interface AppRecord {
  /** ISO-8601 UTC — first request from this app_id. */
  first_seen: string;
  /** ISO-8601 UTC — most recent request. */
  last_seen: string;
  /** Total observed requests across the lifetime of this install. */
  request_count: number;
  /** Distinct executable basenames seen for this app_id. */
  executables: string[];
}

export type AppsMap = Record<string, AppRecord>;

export interface AppsStoreOptions {
  /** Override default ~/.ankrshield/apps.json — used by tests. */
  filePath?: string;
  /** Coalesce window for writes; default 1000 ms. */
  flushDebounceMs?: number;
}

/**
 * In-memory cache of the apps registry, debounced-flushed to disk.
 *
 * Concurrency model: single Electron main process is the only writer. Tests
 * may instantiate multiple stores against different file paths.
 */
export class AppsStore {
  private map: AppsMap = {};
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  private readonly flushDebounceMs: number;

  constructor(opts: AppsStoreOptions = {}) {
    this.filePath = opts.filePath ?? APPS_FILE;
    this.flushDebounceMs = opts.flushDebounceMs ?? 1000;
  }

  /** Load existing registry from disk. Idempotent — safe to call multiple times. */
  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.map = {};
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      this.map = sanitiseLoaded(parsed);
    } catch {
      // Corrupted file — start fresh rather than crash. The lost data is
      // observation history, not user-set policy.
      this.map = {};
    }
  }

  /**
   * Record one observed request from app_id. Updates counters in memory
   * + schedules a debounced flush. Returns the post-update record.
   */
  recordRequest(appId: string, executable: string | null): AppRecord {
    const now = new Date().toISOString();
    const existing = this.map[appId];
    if (existing) {
      existing.last_seen = now;
      existing.request_count += 1;
      if (executable && !existing.executables.includes(executable)) {
        existing.executables.push(executable);
      }
      this.markDirty();
      return existing;
    }
    const fresh: AppRecord = {
      first_seen: now,
      last_seen: now,
      request_count: 1,
      executables: executable ? [executable] : [],
    };
    this.map[appId] = fresh;
    this.markDirty();
    return fresh;
  }

  /** Return a shallow copy of the full registry. */
  getAll(): AppsMap {
    const out: AppsMap = {};
    for (const k of Object.keys(this.map)) out[k] = { ...this.map[k]! };
    return out;
  }

  get(appId: string): AppRecord | null {
    const rec = this.map[appId];
    return rec ? { ...rec } : null;
  }

  /**
   * Write current state to disk immediately. Called by the debounce timer
   * and by stop() on graceful shutdown.
   */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.map, null, 2) + '\n');
    } catch (err) {
      // Persistence failed — set dirty again so the next change triggers retry.
      this.dirty = true;
      throw err;
    }
  }

  /** Cancel pending flush + write synchronously-then-async one last time. */
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

/**
 * Best-effort schema check on loaded JSON. Drops keys whose value doesn't
 * look like an AppRecord. Lenient because the file may be from an older
 * schema version and we want to preserve as much as possible.
 */
function sanitiseLoaded(raw: unknown): AppsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: AppsMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Partial<AppRecord>;
    if (
      typeof r.first_seen === 'string' &&
      typeof r.last_seen === 'string' &&
      typeof r.request_count === 'number'
    ) {
      out[k] = {
        first_seen: r.first_seen,
        last_seen: r.last_seen,
        request_count: r.request_count,
        executables: Array.isArray(r.executables)
          ? r.executables.filter((e): e is string => typeof e === 'string')
          : [],
      };
    }
  }
  return out;
}

export const __paths = { APPS_DIR, APPS_FILE };
