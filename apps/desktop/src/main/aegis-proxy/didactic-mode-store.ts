// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — didactic mode toggle store (ASD-T-033 / FR-18)
//
// Persists the user's "didactic mode on/off" toggle at
// ~/.ankrshield/didactic.json. Default = OFF (ASD-008 zero-surface).
// When enabled, the renderer renders per-rule explanation slots on every
// consent / denial surface via the DidacticHint component.
//
// Persistence model mirrors apps-policy / audit-retention: in-memory state
// + debounced flush. Trivially small (≈30 bytes) but matched-style for
// consistency.
//
// @rule:ASD-008 — zero default surface; the user opts in to didactic mode.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_PATH = join(homedir(), '.ankrshield', 'didactic.json');
const DEFAULT_FLUSH_MS = 250;

export interface DidacticState {
  enabled: boolean;
  /** ISO timestamp of last user-driven change. Surfaced in Settings. */
  updated_at: string | null;
}

const DEFAULT_STATE: DidacticState = { enabled: false, updated_at: null };

export interface DidacticModeStoreOptions {
  /** Override file path (for tests). */
  filePath?: string;
  /** Debounce window for flush. Default 250ms; 0 = synchronous. */
  flushDebounceMs?: number;
  /** Clock override (for tests). */
  now?: () => Date;
}

export class DidacticModeStore {
  private readonly filePath: string;
  private readonly flushDebounceMs: number;
  private readonly nowFn: () => Date;
  private state: DidacticState = { ...DEFAULT_STATE };
  private flushTimer: NodeJS.Timeout | null = null;
  private pendingFlush: Promise<void> | null = null;

  constructor(opts: DidacticModeStoreOptions = {}) {
    this.filePath = opts.filePath ?? DEFAULT_PATH;
    this.flushDebounceMs = opts.flushDebounceMs ?? DEFAULT_FLUSH_MS;
    this.nowFn = opts.now ?? (() => new Date());
  }

  /**
   * Load from disk. Missing file → default state (off). Malformed file →
   * default state + log; we never refuse to start because of one bad JSON.
   */
  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.state = { ...DEFAULT_STATE };
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DidacticState>;
      this.state = {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
        updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
      };
    } catch {
      this.state = { ...DEFAULT_STATE };
    }
  }

  get(): Readonly<DidacticState> {
    return { ...this.state };
  }

  /**
   * Flip the toggle. Records the change timestamp so Settings can render
   * "Last changed: …". Schedules a debounced flush.
   */
  set(enabled: boolean): DidacticState {
    if (this.state.enabled === enabled) {
      // No-op — don't touch updated_at on a duplicate set.
      return this.get();
    }
    this.state = { enabled, updated_at: this.nowFn().toISOString() };
    this.scheduleFlush();
    return this.get();
  }

  /** For graceful shutdown: cancel pending timer + flush synchronously. */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingFlush) await this.pendingFlush;
    await this.flushNow();
  }

  private scheduleFlush(): void {
    if (this.flushDebounceMs === 0) {
      // Eager flush for tests — but don't block set().
      void this.flushNow();
      return;
    }
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushNow();
    }, this.flushDebounceMs);
  }

  private async flushNow(): Promise<void> {
    if (this.pendingFlush) return this.pendingFlush;
    this.pendingFlush = (async () => {
      try {
        await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
        await writeFile(this.filePath, JSON.stringify(this.state, null, 2) + '\n', {
          mode: 0o644,
        });
      } finally {
        this.pendingFlush = null;
      }
    })();
    return this.pendingFlush;
  }
}

export const __paths = { DEFAULT_PATH };
