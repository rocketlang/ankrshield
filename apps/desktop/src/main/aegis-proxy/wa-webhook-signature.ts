// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — Meta webhook signature verifier (ASD-T-038)
//
// Meta's WhatsApp Cloud API signs every POST body with
//   X-Hub-Signature-256: sha256=<hex>
// where <hex> = HMAC-SHA256(rawBody, appSecret).
//
// This module is the lone correctness primitive for the WA inbound path:
// without it any internet host could POST a forged DAN approval to the
// webhook port and resolve a hold. Constant-time comparison guards against
// timing side-channels.
//
// None of the four existing WhatsApp impls in the founder's tree
// (@ankr/messaging, chirpee, ankr-maritime, ankrtms) implement this —
// they rely on the transport boundary being trusted (e.g., webhook URL
// secrecy). For ankrshield-desktop the boundary is "the user's laptop +
// a cloudflared tunnel," which is much weaker; signature verification
// is mandatory.
//
// @rule:ASD-008 — DAN gate carrier inbound (WA half) must be authenticated.
// @rule:ASD-004 — failure mode is deny: missing/bad signature → 401, never
//   parse the body for content.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SIG_PREFIX = 'sha256=';

/**
 * Verify a Meta X-Hub-Signature-256 header against a raw request body.
 *
 * Returns true iff:
 *   - header is a non-empty string starting with "sha256="
 *   - the hex digest after the prefix has the right shape (64 lower-hex chars)
 *   - HMAC-SHA256(rawBody, appSecret) matches in constant time
 *
 * `rawBody` MUST be the exact bytes Meta sent — re-serialised JSON will
 * NOT match because Meta's serialiser sets its own key order + spacing.
 * Caller is responsible for capturing the raw body before any JSON parse.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string,
  headerValue: string | null | undefined,
  appSecret: string
): boolean {
  if (!headerValue || typeof headerValue !== 'string') return false;
  if (!headerValue.startsWith(SIG_PREFIX)) return false;
  const received = headerValue.slice(SIG_PREFIX.length).toLowerCase();
  if (received.length !== 64 || !/^[0-9a-f]{64}$/.test(received)) return false;
  if (!appSecret || typeof appSecret !== 'string') return false;

  const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = createHmac('sha256', appSecret).update(bodyBuf).digest('hex');

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false; // belt-and-braces; both are 64 here
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Compute the header value the way Meta would. Used by tests. */
export function computeMetaSignature(rawBody: Buffer | string, appSecret: string): string {
  const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const hex = createHmac('sha256', appSecret).update(bodyBuf).digest('hex');
  return `${SIG_PREFIX}${hex}`;
}
