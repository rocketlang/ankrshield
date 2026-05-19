// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — Telegram inbound DAN poller (ASD-T-034)
//
// Long-running poller that calls Telegram's getUpdates with offset+1
// semantics, parses each message for a DAN-reply shape ("y a1b2c3" /
// "no a1b2c3"), and resolves the matching pending hold via callback.
//
// Why polling rather than webhook: Telegram's getUpdates is the native
// zero-infrastructure path (no public hostname, no ngrok, no Meta
// Business account). Polls every 5s by default (DanInboundConfigStore
// controls the interval, range 2-60s).
//
// Lifecycle: start() begins the timer. stop() clears it. Idempotent.
// On each tick: GET /bot{token}/getUpdates?offset={last+1}&timeout=0
// → for each update, advance offset; if message.text parses → resolve.
//
// Behavior on errors: log + swallow, never throw upward. A degraded
// Telegram API must not crash the proxy. Auth errors (bot token wrong)
// are logged at most once per minute to avoid log spam.
//
// @rule:ASD-008 — DAN gate carrier inbound path.
// @rule:ASD-003 — bot token loaded from OS keychain only; never read here directly.
// @rule:ASD-008 — zero default surface; poller starts only when toggled on.

import type { PendingDanQueue } from './pending-dan-queue.js';
import { getTelegramCreds, type TelegramCredentials } from './dan-carrier-credentials.js';
import { parseDanReply } from './dan-inbound-parser.js';

export interface TelegramInboundPollerOptions {
  /** Injection for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Override credential loader. Defaults to reading the OS keychain. */
  loadCreds?: () => TelegramCredentials | null;
  /** Override clock for tests. */
  now?: () => number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id?: number };
  };
}

/**
 * Result of dispatching one update — used by tests + diagnostics.
 *   resolved: a pending DAN was resolved by this update's text
 *   parsed:   text parsed as a DAN reply but no matching pending hold
 *   ignored:  text did not parse as a DAN reply (or no text at all)
 *   wrong-chat: message came from a chat_id other than the configured one
 */
export type UpdateDispatchResult =
  | { kind: 'resolved'; pendingId: string; decision: 'allow' | 'deny' }
  | { kind: 'parsed'; nonce: string }
  | { kind: 'ignored' }
  | { kind: 'wrong-chat' };

export class TelegramInboundPoller {
  private readonly fetchImpl: typeof fetch;
  private readonly loadCreds: () => TelegramCredentials | null;
  private readonly nowFn: () => number;

  private readonly pendingDan: PendingDanQueue;

  private timer: NodeJS.Timeout | null = null;
  private offset = 0;
  /** Updates we've already dispatched — extra guard against double-tick. */
  private readonly seen = new Set<number>();
  /** Last time we logged an auth error; used to throttle log noise. */
  private lastAuthErrorAt = 0;

  private inFlight = false;

  constructor(pendingDan: PendingDanQueue, opts: TelegramInboundPollerOptions = {}) {
    this.pendingDan = pendingDan;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.loadCreds = opts.loadCreds ?? getTelegramCreds;
    this.nowFn = opts.now ?? Date.now;
  }

  /**
   * Begin periodic polling. If already running, no-op.
   * Returns true if started, false if creds missing / already running.
   */
  start(intervalMs: number): boolean {
    if (this.timer) return false;
    const creds = this.loadCreds();
    if (!creds) {
      // eslint-disable-next-line no-console
      console.warn('[aegis-proxy] Telegram inbound poller not started: credentials unset.');
      return false;
    }
    this.timer = setInterval(() => void this.tick(), intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    // eslint-disable-next-line no-console
    console.log(`[aegis-proxy] Telegram inbound poller started (interval ${intervalMs}ms).`);
    return true;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // eslint-disable-next-line no-console
      console.log('[aegis-proxy] Telegram inbound poller stopped.');
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Single poll iteration. Public for tests + IPC manual trigger.
   * Returns an array of per-update results in receipt order. Empty array
   * when there are no new updates OR the poller is mid-flight (re-entrant
   * tick is suppressed; the next interval picks up).
   */
  async tick(): Promise<UpdateDispatchResult[]> {
    if (this.inFlight) return [];
    this.inFlight = true;
    try {
      const creds = this.loadCreds();
      if (!creds || !this.fetchImpl) return [];
      const url =
        `https://api.telegram.org/bot${encodeURIComponent(creds.bot_token)}/getUpdates` +
        `?offset=${this.offset + 1}&timeout=0`;
      let res: Response;
      try {
        res = await this.fetchImpl(url);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          '[aegis-proxy] Telegram inbound poll error:',
          err instanceof Error ? err.message : err
        );
        return [];
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) this.throttledAuthLog(res.status);
        return [];
      }
      let parsed: { ok?: boolean; result?: TelegramUpdate[] };
      try {
        parsed = (await res.json()) as { ok?: boolean; result?: TelegramUpdate[] };
      } catch {
        return [];
      }
      if (!parsed.ok || !Array.isArray(parsed.result)) return [];

      const out: UpdateDispatchResult[] = [];
      for (const upd of parsed.result) {
        if (typeof upd.update_id !== 'number') continue;
        // Advance offset regardless of dispatch result so we never re-fetch.
        if (upd.update_id > this.offset) this.offset = upd.update_id;
        if (this.seen.has(upd.update_id)) continue;
        this.seen.add(upd.update_id);
        // Bound seen-set so it doesn't grow unbounded over a long session.
        if (this.seen.size > 1000) {
          const it = this.seen.values();
          for (let i = 0; i < 500; i++) this.seen.delete(it.next().value as number);
        }
        out.push(this.dispatch(upd, creds));
      }
      return out;
    } finally {
      this.inFlight = false;
    }
  }

  /** Pure-ish dispatch — public so tests can call without HTTP setup. */
  dispatch(upd: TelegramUpdate, creds: TelegramCredentials): UpdateDispatchResult {
    if (!upd.message) return { kind: 'ignored' };
    // Only accept messages from the configured chat — bots may be in
    // multiple chats; we only honour replies from the user's own chat.
    const incomingChat = upd.message.chat?.id;
    if (incomingChat != null && String(incomingChat) !== String(creds.chat_id)) {
      return { kind: 'wrong-chat' };
    }
    const reply = parseDanReply(upd.message.text);
    if (!reply) return { kind: 'ignored' };
    const pendingId = this.pendingDan.resolveByNonce(reply.nonce, reply.decision);
    if (pendingId === null) return { kind: 'parsed', nonce: reply.nonce };
    return { kind: 'resolved', pendingId, decision: reply.decision };
  }

  private throttledAuthLog(status: number): void {
    const now = this.nowFn();
    if (now - this.lastAuthErrorAt < 60_000) return;
    this.lastAuthErrorAt = now;
    // eslint-disable-next-line no-console
    console.warn(
      `[aegis-proxy] Telegram inbound poll auth error (${status}); ` +
        'check bot token + chat id in Settings → DAN carriers.'
    );
  }
}
