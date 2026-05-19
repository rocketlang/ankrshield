// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — DAN inbound polling config (ASD-T-034)
//
// Persists `{tg_polling_enabled, wa_polling_enabled, poll_interval_ms}` at
// ~/.ankrshield/dan-inbound.json. Default: BOTH off (ASD-008 zero-surface).
//
// WhatsApp inbound is scaffolded but not yet implemented (T-034 ships
// Telegram-only inbound — WhatsApp needs Meta Business webhook setup,
// out of scope for this round). The wa_polling_enabled flag exists so
// a future task can flip it without a schema migration.
//
// Same shape as audit-retention-config + didactic-mode-store: in-memory
// state + debounced flush. Tiny payload (~80 bytes) but matched-style
// for consistency.
//
// @rule:ASD-008 — zero default surface; inbound polling is opt-in.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_PATH = join(homedir(), '.ankrshield', 'dan-inbound.json');
const DEFAULT_FLUSH_MS = 250;

export const POLL_INTERVAL_DEFAULT_MS = 5_000;
export const POLL_INTERVAL_MIN_MS = 2_000;
export const POLL_INTERVAL_MAX_MS = 60_000;

// WA webhook port — defaults to 4859 (adjacent to the proxy's 4857; 4858
// is taken by bitmaskos on the ANKR dev VM per ports.json — picking 4859
// so the desktop avoids collision when developing against the fleet).
// User binds this to ngrok / cloudflared to expose to Meta.
export const WA_WEBHOOK_PORT_DEFAULT = 4859;
export const WA_WEBHOOK_PORT_MIN = 1024;
export const WA_WEBHOOK_PORT_MAX = 65535;

export interface DanInboundConfig {
  tg_polling_enabled: boolean;
  /**
   * WA inbound enabled. When ON + WaWebhookCredentials present, the
   * WA inbound webhook server (ASD-T-038) binds wa_webhook_port on
   * 127.0.0.1. User then exposes via cloudflared / ngrok.
   */
  wa_polling_enabled: boolean;
  /** Telegram getUpdates poll interval (T-034). */
  poll_interval_ms: number;
  /** WA inbound webhook localhost-bind port (T-038). */
  wa_webhook_port: number;
  updated_at: string | null;
}

const DEFAULT_STATE: DanInboundConfig = {
  tg_polling_enabled: false,
  wa_polling_enabled: false,
  poll_interval_ms: POLL_INTERVAL_DEFAULT_MS,
  wa_webhook_port: WA_WEBHOOK_PORT_DEFAULT,
  updated_at: null,
};

export interface DanInboundConfigStoreOptions {
  filePath?: string;
  flushDebounceMs?: number;
  now?: () => Date;
}

export class DanInboundConfigStore {
  private readonly filePath: string;
  private readonly flushDebounceMs: number;
  private readonly nowFn: () => Date;
  private state: DanInboundConfig = { ...DEFAULT_STATE };
  private flushTimer: NodeJS.Timeout | null = null;
  private pendingFlush: Promise<void> | null = null;

  constructor(opts: DanInboundConfigStoreOptions = {}) {
    this.filePath = opts.filePath ?? DEFAULT_PATH;
    this.flushDebounceMs = opts.flushDebounceMs ?? DEFAULT_FLUSH_MS;
    this.nowFn = opts.now ?? (() => new Date());
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.state = { ...DEFAULT_STATE };
      return;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DanInboundConfig>;
      this.state = {
        tg_polling_enabled:
          typeof parsed.tg_polling_enabled === 'boolean' ? parsed.tg_polling_enabled : false,
        wa_polling_enabled:
          typeof parsed.wa_polling_enabled === 'boolean' ? parsed.wa_polling_enabled : false,
        poll_interval_ms: clampInterval(
          typeof parsed.poll_interval_ms === 'number'
            ? parsed.poll_interval_ms
            : POLL_INTERVAL_DEFAULT_MS
        ),
        wa_webhook_port: clampWebhookPort(
          typeof parsed.wa_webhook_port === 'number'
            ? parsed.wa_webhook_port
            : WA_WEBHOOK_PORT_DEFAULT
        ),
        updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
      };
    } catch {
      this.state = { ...DEFAULT_STATE };
    }
  }

  get(): Readonly<DanInboundConfig> {
    return { ...this.state };
  }

  /**
   * Patch — accepts a partial; missing keys are left alone. Always bumps
   * updated_at if any field actually changed.
   */
  set(patch: Partial<Omit<DanInboundConfig, 'updated_at'>>): DanInboundConfig {
    let changed = false;
    if (
      patch.tg_polling_enabled != null &&
      patch.tg_polling_enabled !== this.state.tg_polling_enabled
    ) {
      this.state.tg_polling_enabled = !!patch.tg_polling_enabled;
      changed = true;
    }
    if (
      patch.wa_polling_enabled != null &&
      patch.wa_polling_enabled !== this.state.wa_polling_enabled
    ) {
      this.state.wa_polling_enabled = !!patch.wa_polling_enabled;
      changed = true;
    }
    if (patch.poll_interval_ms != null) {
      const clamped = clampInterval(patch.poll_interval_ms);
      if (clamped !== this.state.poll_interval_ms) {
        this.state.poll_interval_ms = clamped;
        changed = true;
      }
    }
    if (patch.wa_webhook_port != null) {
      const clamped = clampWebhookPort(patch.wa_webhook_port);
      if (clamped !== this.state.wa_webhook_port) {
        this.state.wa_webhook_port = clamped;
        changed = true;
      }
    }
    if (changed) {
      this.state.updated_at = this.nowFn().toISOString();
      this.scheduleFlush();
    }
    return this.get();
  }

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

export function clampInterval(ms: number): number {
  if (!Number.isFinite(ms)) return POLL_INTERVAL_DEFAULT_MS;
  return Math.min(POLL_INTERVAL_MAX_MS, Math.max(POLL_INTERVAL_MIN_MS, Math.round(ms)));
}

export function clampWebhookPort(p: number): number {
  if (!Number.isFinite(p)) return WA_WEBHOOK_PORT_DEFAULT;
  return Math.min(WA_WEBHOOK_PORT_MAX, Math.max(WA_WEBHOOK_PORT_MIN, Math.round(p)));
}

export const __paths = { DEFAULT_PATH };
