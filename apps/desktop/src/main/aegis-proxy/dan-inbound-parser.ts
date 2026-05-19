// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — inbound DAN reply parser (ASD-T-034 / FR-10 ext)
//
// Pure helper that recognises a "reply to a DAN gate prompt" text message:
//
//   "y a1b2c3"        → { decision: 'allow', nonce: 'a1b2c3' }
//   "yes a1b2c3"      → same
//   "approve a1b2c3"  → same
//   "n a1b2c3"        → { decision: 'deny',  nonce: 'a1b2c3' }
//   "no a1b2c3"       → same
//   "deny a1b2c3"     → same
//
// Anything else returns null. Matching is case-insensitive + whitespace
// tolerant + ignores leading/trailing decoration so a forwarded reply
// like "Re: 🛡 [y a1b2c3]" still parses.
//
// The nonce is the first 6 chars of the DanRequest.pendingId — embedded
// in the outgoing carrier message (dan-carrier-tg.ts / dan-carrier-wa.ts)
// so the inbound side can match without keeping a sent-message-id table.
//
// @rule:ASD-008 — DAN gate carrier inbound path
// @rule:ASD-YK-005 — per-app identity is best-effort; the nonce binds reply
//   to a specific in-flight hold, not to a verified user identity.

export type DanReplyDecision = 'allow' | 'deny';

export interface DanReply {
  decision: DanReplyDecision;
  /** 6-char lowercase hex prefix of the DanRequest pendingId. */
  nonce: string;
}

const ALLOW_WORDS = new Set(['y', 'yes', 'approve', 'allow', 'ok', 'okay']);
const DENY_WORDS = new Set(['n', 'no', 'deny', 'reject', 'stop']);

const NONCE_RE = /[0-9a-f]{6}/i;

/**
 * Parse a single inbound text message. Returns null on no-match.
 *
 * Liberal in what we accept: the user may type "y a1b2c3", "Y A1B2C3",
 * "yes - a1b2c3", or any forward-quoted variant. We tokenise on
 * whitespace, find the first word matching allow/deny vocab, then the
 * first 6-hex token; presence of both = a reply.
 */
export function parseDanReply(text: string | null | undefined): DanReply | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return null;

  const tokens = trimmed
    .toLowerCase()
    .split(/[\s,;:!?\[\](){}]+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;

  let decision: DanReplyDecision | null = null;
  for (const t of tokens) {
    if (ALLOW_WORDS.has(t)) {
      decision = 'allow';
      break;
    }
    if (DENY_WORDS.has(t)) {
      decision = 'deny';
      break;
    }
  }
  if (decision === null) return null;

  // Nonce must be exactly 6 lowercase hex chars as a standalone token.
  // We avoid substring matches (e.g., "a1b2c3def" should NOT match) by
  // anchoring against the tokenised form.
  let nonce: string | null = null;
  for (const t of tokens) {
    if (t.length === 6 && NONCE_RE.test(t)) {
      nonce = t.toLowerCase();
      break;
    }
  }
  if (nonce === null) return null;

  return { decision, nonce };
}

/**
 * Derive the 6-char nonce from a full pendingId. Outgoing carrier
 * messages embed this so inbound replies can match without a sent-message
 * table.
 */
export function nonceForPendingId(pendingId: string): string {
  return pendingId.slice(0, 6).toLowerCase();
}
