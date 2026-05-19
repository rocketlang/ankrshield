// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — Telegram DAN carrier (ASD-T-017)
//
// Sends a text message via the Telegram Bot API
// (https://api.telegram.org/bot{token}/sendMessage). Same pattern as the
// WhatsApp carrier: lazy credential load from OS keychain, graceful no-op
// when unset, fire-and-forget POST, failures logged + swallowed.
//
// @rule:ASD-008 — DAN gate carrier
// @rule:ASD-003 — bot token only ever lives in OS keychain

import type { DanNotifier, DanRequest, DanOutcome } from './pending-dan-queue.js';
import { getTelegramCreds, type TelegramCredentials } from './dan-carrier-credentials.js';
import { nonceForPendingId } from './dan-inbound-parser.js';

export interface TelegramDanCarrierOptions {
  /** Injection for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Override credential loader. Defaults to reading the OS keychain. */
  loadCreds?: () => TelegramCredentials | null;
}

export class TelegramDanCarrier implements DanNotifier {
  private readonly fetchImpl: typeof fetch;
  private readonly loadCreds: () => TelegramCredentials | null;

  constructor(opts: TelegramDanCarrierOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.loadCreds = opts.loadCreds ?? getTelegramCreds;
  }

  notify(req: DanRequest): void {
    const creds = this.loadCreds();
    if (!creds) {
      // eslint-disable-next-line no-console
      console.warn(
        `[aegis-proxy] Telegram DAN carrier no-op for ${req.appId} → ${req.hostname}: ` +
          `credentials unset. Configure via Settings → DAN carriers.`
      );
      return;
    }
    if (!this.fetchImpl) {
      // eslint-disable-next-line no-console
      console.warn('[aegis-proxy] Telegram DAN carrier no-op: fetch unavailable in runtime.');
      return;
    }
    const url = `https://api.telegram.org/bot${encodeURIComponent(creds.bot_token)}/sendMessage`;
    const body = {
      chat_id: creds.chat_id,
      text: buildMessage(req),
      // Use MarkdownV2 only if we escape; simpler to leave plain text for v1.
    };
    void this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await safeReadText(res);
          // eslint-disable-next-line no-console
          console.warn(
            `[aegis-proxy] Telegram DAN notify failed ${res.status} for ${req.appId}: ${text.slice(0, 200)}`
          );
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[aegis-proxy] Telegram DAN notify error for ${req.appId}:`,
          err instanceof Error ? err.message : err
        );
      });
  }

  onResolved?(_pendingId: string, _outcome: DanOutcome): void {
    /* future: send "decision recorded" follow-up */
  }
}

function buildMessage(req: DanRequest): string {
  const top = req.highRiskTools[0];
  const more = req.highRiskTools.length - 1;
  const what = top ? `${top.name} (${top.category})` : 'an unknown HIGH-category tool';
  const moreStr = more > 0 ? ` + ${more} more` : '';
  const nonce = nonceForPendingId(req.pendingId);
  return (
    `🛡 ankrshield DAN gate\n\n` +
    `App: ${req.appId}\n` +
    `Tool: ${what}${moreStr}\n` +
    `→ ${req.hostname}\n\n` +
    `Open ankrshield to approve. Held at ${req.heldAt.slice(11, 19)} UTC. ` +
    `Auto-deny in ${Math.round(req.timeoutMs / 1000)}s.\n\n` +
    `Reply with "y ${nonce}" to approve or "n ${nonce}" to deny.`
  );
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<read failed>';
  }
}
