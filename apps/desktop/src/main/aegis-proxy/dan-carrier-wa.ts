// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — WhatsApp DAN carrier (ASD-T-017)
//
// Sends a text message via the WhatsApp Cloud API
// (https://graph.facebook.com/v18.0/{phone_number_id}/messages). The user
// must have set credentials via the renderer's Settings → DAN page (see
// dan-carrier-credentials.ts). If unset, notify() is a no-op + warns to the
// console — the proxy still works (OS carrier in the same hold remains
// authoritative). Reply-to-approve is a future task — for now the user
// still resolves the gate via the desktop UI.
//
// fetch is injectable for tests. In production we use globalThis.fetch
// (Node ≥ 18 has it). Failures are logged + swallowed so a carrier outage
// can't block the proxy's hold path.
//
// @rule:ASD-008 — DAN gate carrier (alongside OS + Telegram)
// @rule:ASD-003 — credentials only ever live in OS keychain

import type { DanNotifier, DanRequest, DanOutcome } from './pending-dan-queue.js';
import { getWhatsAppCreds, type WhatsAppCredentials } from './dan-carrier-credentials.js';

export interface WhatsAppDanCarrierOptions {
  /** Injection for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Override credential loader. Defaults to reading the OS keychain.
   * If returns null, notify() no-ops.
   */
  loadCreds?: () => WhatsAppCredentials | null;
  /** WhatsApp Cloud API version segment, default 'v18.0'. */
  graphApiVersion?: string;
}

export class WhatsAppDanCarrier implements DanNotifier {
  private readonly fetchImpl: typeof fetch;
  private readonly loadCreds: () => WhatsAppCredentials | null;
  private readonly graphApiVersion: string;

  constructor(opts: WhatsAppDanCarrierOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.loadCreds = opts.loadCreds ?? getWhatsAppCreds;
    this.graphApiVersion = opts.graphApiVersion ?? 'v18.0';
  }

  notify(req: DanRequest): void {
    const creds = this.loadCreds();
    if (!creds) {
      // eslint-disable-next-line no-console
      console.warn(
        `[aegis-proxy] WhatsApp DAN carrier no-op for ${req.appId} → ${req.hostname}: ` +
          `credentials unset. Configure via Settings → DAN carriers.`
      );
      return;
    }
    if (!this.fetchImpl) {
      // eslint-disable-next-line no-console
      console.warn('[aegis-proxy] WhatsApp DAN carrier no-op: fetch unavailable in runtime.');
      return;
    }
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${encodeURIComponent(
      creds.phone_number_id
    )}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: creds.to_number,
      type: 'text',
      text: { body: buildMessage(req) },
    };
    void this.fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${creds.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await safeReadText(res);
          // eslint-disable-next-line no-console
          console.warn(
            `[aegis-proxy] WhatsApp DAN notify failed ${res.status} for ${req.appId}: ${text.slice(0, 200)}`
          );
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[aegis-proxy] WhatsApp DAN notify error for ${req.appId}:`,
          err instanceof Error ? err.message : err
        );
      });
  }

  // No cleanup needed — fire-and-forget send. onResolved omitted intentionally
  // (per DanNotifier optional hook contract).
  onResolved?(_pendingId: string, _outcome: DanOutcome): void {
    /* future: send "decision recorded" follow-up */
  }
}

function buildMessage(req: DanRequest): string {
  const top = req.highRiskTools[0];
  const more = req.highRiskTools.length - 1;
  const what = top ? `${top.name} (${top.category})` : 'an unknown HIGH-category tool';
  const moreStr = more > 0 ? ` + ${more} more` : '';
  return (
    `🛡 ankrshield DAN gate\n\n` +
    `App: ${req.appId}\n` +
    `Tool: ${what}${moreStr}\n` +
    `→ ${req.hostname}\n\n` +
    `Open ankrshield to approve. Held at ${req.heldAt.slice(11, 19)} UTC. ` +
    `Auto-deny in ${Math.round(req.timeoutMs / 1000)}s.`
  );
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<read failed>';
  }
}
