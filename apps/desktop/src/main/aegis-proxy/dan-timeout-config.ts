// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — DAN timeout config (ASD-T-018)
//
// Per Vivechana Decision 3: DAN gate timeout default 30s, range [15s, 120s].
// Stored at ~/.ankrshield/dan-timeout.json with a global default + optional
// per-app overrides. Same debounced-flush JSON pattern as AppsPolicyStore.
// Out-of-range values are clamped on write so the persisted file is always
// trustworthy; PendingDanQueue still re-clamps defensively at hold time.
//
// @rule:ASD-008 — DAN gate config user-controllable, never sealed
// @rule:INF-ASD-008 — timeout fires deny; ranged so users can't disable

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const CONFIG_FILE = join(homedir(), '.ankrshield', 'dan-timeout.json');

export const DAN_TIMEOUT_DEFAULT_MS = 30_000;
export const DAN_TIMEOUT_MIN_MS = 15_000;
export const DAN_TIMEOUT_MAX_MS = 120_000;

export interface DanTimeoutConfigShape {
  /** Global default in ms. Defaults to DAN_TIMEOUT_DEFAULT_MS. */
  global_ms: number;
  /** Per-app overrides; missing → use global_ms. */
  per_app: Record<string, number>;
}

export interface DanTimeoutStoreOptions {
  filePath?: string;
  flushDebounceMs?: number;
}

export class DanTimeoutStore {
  private cfg: DanTimeoutConfigShape = { global_ms: DAN_TIMEOUT_DEFAULT_MS, per_app: {} };
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  private readonly flushDebounceMs: number;

  constructor(opts: DanTimeoutStoreOptions = {}) {
    this.filePath = opts.filePath ?? CONFIG_FILE;
    this.flushDebounceMs = opts.flushDebounceMs ?? 1000;
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.cfg = { global_ms: DAN_TIMEOUT_DEFAULT_MS, per_app: {} };
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.cfg = sanitiseLoaded(JSON.parse(raw));
    } catch {
      this.cfg = { global_ms: DAN_TIMEOUT_DEFAULT_MS, per_app: {} };
    }
  }

  /**
   * Resolve the timeout for an app. Per-app override wins over global.
   * Always returns a clamped value in [DAN_TIMEOUT_MIN_MS, DAN_TIMEOUT_MAX_MS].
   */
  resolve(appId: string): number {
    const v = this.cfg.per_app[appId];
    return clampTimeout(typeof v === 'number' ? v : this.cfg.global_ms);
  }

  getGlobal(): number {
    return clampTimeout(this.cfg.global_ms);
  }

  setGlobal(ms: number): number {
    const clamped = clampTimeout(ms);
    this.cfg.global_ms = clamped;
    this.markDirty();
    return clamped;
  }

  getOverride(appId: string): number | null {
    const v = this.cfg.per_app[appId];
    return typeof v === 'number' ? clampTimeout(v) : null;
  }

  setOverride(appId: string, ms: number): number {
    const clamped = clampTimeout(ms);
    this.cfg.per_app[appId] = clamped;
    this.markDirty();
    return clamped;
  }

  clearOverride(appId: string): boolean {
    if (!(appId in this.cfg.per_app)) return false;
    delete this.cfg.per_app[appId];
    this.markDirty();
    return true;
  }

  /** For diagnostics + tests. */
  snapshot(): Readonly<DanTimeoutConfigShape> {
    return {
      global_ms: clampTimeout(this.cfg.global_ms),
      per_app: { ...this.cfg.per_app },
    };
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

function sanitiseLoaded(raw: unknown): DanTimeoutConfigShape {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { global_ms: DAN_TIMEOUT_DEFAULT_MS, per_app: {} };
  }
  const o = raw as Partial<DanTimeoutConfigShape>;
  const global_ms =
    typeof o.global_ms === 'number' ? clampTimeout(o.global_ms) : DAN_TIMEOUT_DEFAULT_MS;
  const per_app: Record<string, number> = {};
  if (o.per_app && typeof o.per_app === 'object' && !Array.isArray(o.per_app)) {
    for (const [k, v] of Object.entries(o.per_app as Record<string, unknown>)) {
      if (typeof v === 'number') per_app[k] = clampTimeout(v);
    }
  }
  return { global_ms, per_app };
}

function clampTimeout(v: number): number {
  if (!Number.isFinite(v)) return DAN_TIMEOUT_DEFAULT_MS;
  if (v < DAN_TIMEOUT_MIN_MS) return DAN_TIMEOUT_MIN_MS;
  if (v > DAN_TIMEOUT_MAX_MS) return DAN_TIMEOUT_MAX_MS;
  return v;
}

export const __limits = { DAN_TIMEOUT_DEFAULT_MS, DAN_TIMEOUT_MIN_MS, DAN_TIMEOUT_MAX_MS };
export const __paths = { CONFIG_FILE };
