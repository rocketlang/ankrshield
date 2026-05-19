// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — WA Cloud API webhook payload parser (ASD-T-038)
//
// Meta payload shape (simplified — there are many other event types we
// intentionally don't consume here):
//
//   {
//     object: 'whatsapp_business_account',
//     entry: [
//       {
//         changes: [
//           {
//             value: {
//               messages: [
//                 { id, from, type: 'text', text: { body }, timestamp }
//               ],
//               // ... or `statuses` (delivery receipts — ignored)
//             }
//           }
//         ]
//       }
//     ]
//   }
//
// Mirrors @ankr/messaging's MessagingService.handleWhatsAppWebhook shape
// (libs/messaging-service.ts:280), narrowed to just the fields the DAN
// reply path needs: from + text + message_id. Other types (image, button,
// location) are returned with `text: null` so the caller can decide
// (currently: skip — only text replies resolve a DAN hold).
//
// Pure: payload-in, array-out. No IO, no side effects.
//
// @rule:ASD-008 — DAN gate carrier inbound; parser is the boundary between
//   Meta-shaped JSON and our internal DanReply shape.

export interface ParsedWaMessage {
  /** Meta-issued message id (wamid.xxx). Stable per-message. */
  message_id: string;
  /** Sender's phone number in E.164 (no leading +). */
  from: string;
  /** ISO-8601 UTC. Meta sends unix-seconds string; we convert. */
  timestamp_iso: string;
  /** Plain text body. Null for non-text message types. */
  text: string | null;
  /** Original type from Meta — useful for logging / future routing. */
  type: string;
}

/**
 * Best-effort parse of a Meta WhatsApp Cloud API webhook payload. Returns
 * the flat list of inbound text-eligible messages across all
 * entry/change/value scopes. Never throws — malformed shapes return [].
 */
export function parseWaWebhookPayload(payload: unknown): ParsedWaMessage[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  if (p.object !== 'whatsapp_business_account') return [];
  const entries = Array.isArray(p.entry) ? p.entry : [];
  const out: ParsedWaMessage[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: unknown[] }).changes
      : [];
    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== 'object') continue;
      const messages = Array.isArray((value as { messages?: unknown }).messages)
        ? (value as { messages: unknown[] }).messages
        : [];
      for (const m of messages) {
        const parsed = parseSingleMessage(m);
        if (parsed) out.push(parsed);
      }
    }
  }
  return out;
}

function parseSingleMessage(m: unknown): ParsedWaMessage | null {
  if (!m || typeof m !== 'object') return null;
  const msg = m as Record<string, unknown>;
  if (typeof msg.id !== 'string' || typeof msg.from !== 'string') return null;
  const type = typeof msg.type === 'string' ? msg.type : 'unknown';
  let text: string | null = null;
  if (type === 'text' && msg.text && typeof msg.text === 'object') {
    const body = (msg.text as { body?: unknown }).body;
    if (typeof body === 'string') text = body;
  }
  // Meta sends timestamp as a string of unix seconds.
  const tsStr = typeof msg.timestamp === 'string' ? msg.timestamp : '';
  const tsNum = Number(tsStr);
  const timestamp_iso =
    Number.isFinite(tsNum) && tsNum > 0
      ? new Date(tsNum * 1000).toISOString()
      : new Date().toISOString();
  return {
    message_id: msg.id,
    from: msg.from,
    type,
    text,
    timestamp_iso,
  };
}
