// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — PII boundary (ASD-T-013, doctrine-corrected)
//
// DOCTRINE NOTE: The P1 doc set initially mis-named @xshieldai/lakshmanrekha
// as this module's implementation. lakshmanrekha is an LLM endpoint posture
// probe suite (8 attack probes + refusal classifier), not a per-request PII
// redactor. This module is our own implementation, scoped to per-request
// outbound prompt scanning. LakshmanRekha may be wired later for its actual
// purpose (periodic posture probes against upstream LLM endpoints).
// See: ankrshield-desktop-aegis--vivechana--formal--2026-05-18.md Part 2.
//
// @rule:ASD-011 — Streaming redaction cannot falsify tokens. Matched PII
//   is replaced with [REDACTED:type] markers, never substitute fake content.
// @rule:ASD-004 — failure mode is deny; scan errors → fail closed (block).
// @rule:ASD-YK-001 — synchronous scan, target ≤ 30 ms for prompts ≤ 8 KB.
//
// Indian-context PII (Aadhaar / PAN / UPI handles) is the highest-leverage
// coverage for the Samsung Galaxy / Indian-market pitch. Western patterns
// (SSN / email / E.164 phone) round out the universal set.

export type PiiType =
  | 'aadhaar'
  | 'pan'
  | 'upi_handle'
  | 'ssn'
  | 'email'
  | 'phone_india'
  | 'phone_e164';

export interface PiiMatch {
  type: PiiType;
  /** Matched text (unredacted). */
  value: string;
  /** Byte/char offset into the scanned string. */
  start: number;
  end: number;
}

export interface RedactResult {
  /** The redacted string with [REDACTED:type] markers. */
  redacted: string;
  /** Original matches (positions in the ORIGINAL string, not the redacted one). */
  matches: PiiMatch[];
}

/**
 * Per-PII-type regex patterns. Ordering matters — UPI handles are matched
 * BEFORE generic email since they share the `name@domain` shape but UPI's
 * domain is restricted to known PSP suffixes. Phone-India matched before
 * generic E.164 for same reason.
 */
export const PII_PATTERNS: ReadonlyArray<{ type: PiiType; pattern: RegExp }> = [
  // Indian PII — highest-priority for the target market.
  {
    type: 'aadhaar',
    // 12 digits, optionally separated by space or hyphen in 4-4-4 groups.
    // Negative lookbehind for `+` prevents matching the 12 trailing digits of
    // an international phone number like `+442012345678` (12 digits after +)
    // which would otherwise eat the bytes phone_e164 should claim.
    pattern: /(?<!\+)\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  },
  {
    type: 'pan',
    // 5 uppercase letters + 4 digits + 1 uppercase letter (PAN format).
    pattern: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
  },
  {
    type: 'upi_handle',
    // Known PSP suffixes only — tighter than generic email to avoid false +.
    pattern:
      /\b[\w.-]+@(?:upi|paytm|paypal|ybl|axl|axis(?:bank)?|icici|hdfc|sbi|airtel|jio|okhdfcbank|okicici|oksbi|okaxis|fbl|kotak|yesbank|indus|pnb|barodampay)\b/gi,
  },

  // Western / international.
  {
    type: 'ssn',
    // US Social Security Number — xxx-xx-xxxx.
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: 'phone_india',
    // Indian mobile: optional +91 prefix, then [6-9]+9 digits.
    pattern: /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/g,
  },
  {
    type: 'phone_e164',
    // E.164: + followed by 7-15 digits (broad — catches international numbers).
    pattern: /\+\d{1,3}[\s-]?\d{6,14}\b/g,
  },
  {
    type: 'email',
    // Standard email — matched LAST so UPI handles capture first.
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
];

/**
 * Scan text for PII matches across all patterns. Returns matches in
 * left-to-right order, deduplicated (a span matched by an earlier pattern
 * is not re-matched by a later pattern).
 */
export function scanText(text: string): PiiMatch[] {
  if (!text) return [];
  const claimed: Array<{ start: number; end: number }> = [];
  const all: PiiMatch[] = [];

  for (const { type, pattern } of PII_PATTERNS) {
    // Reset regex state (g flag carries lastIndex).
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      // Skip if any byte of this match is already claimed.
      const overlaps = claimed.some((c) => start < c.end && end > c.start);
      if (overlaps) continue;
      claimed.push({ start, end });
      all.push({ type, value: m[0], start, end });
    }
  }

  // Sort by start position.
  all.sort((a, b) => a.start - b.start);
  return all;
}

/**
 * Redact PII in text — replace each match with `[REDACTED:type]`.
 * Returns the redacted string + the match list (with positions in the original).
 */
export function redactText(text: string): RedactResult {
  const matches = scanText(text);
  if (matches.length === 0) return { redacted: text, matches: [] };

  // Apply replacements right-to-left so earlier offsets stay valid.
  let redacted = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    const replacement = `[REDACTED:${m.type}]`;
    redacted = redacted.slice(0, m.start) + replacement + redacted.slice(m.end);
  }
  return { redacted, matches };
}

// ─── Provider body walking (Anthropic + OpenAI) ──────────────────────────────

/**
 * Walk a parsed request body and apply text-level redaction to:
 *   - top-level `system` (string OR array of {type:"text", text})
 *   - `messages[].content` (string OR array of {type:"text", text})
 *
 * Matches both Anthropic Messages and OpenAI Chat Completions request shapes.
 * Mutates the parsed object in place. Caller re-serializes back to a Buffer
 * before forwarding upstream.
 *
 * Returns the union of matches found across all walked fields.
 */
export function redactInJsonBody(body: unknown): PiiMatch[] {
  if (!body || typeof body !== 'object') return [];
  const matches: PiiMatch[] = [];

  const root = body as Record<string, unknown>;

  // top-level `system` (Anthropic) — string OR content-block array.
  if ('system' in root) {
    root.system = redactField(root.system, matches);
  }

  // `messages` (both providers) — array of { role, content }.
  if (Array.isArray(root.messages)) {
    for (const msg of root.messages) {
      if (msg && typeof msg === 'object' && 'content' in msg) {
        (msg as Record<string, unknown>).content = redactField(
          (msg as Record<string, unknown>).content,
          matches
        );
      }
    }
  }

  return matches;
}

/** Recursively redact a field that may be string OR an array of content blocks. */
function redactField(field: unknown, sink: PiiMatch[]): unknown {
  if (typeof field === 'string') {
    const { redacted, matches } = redactText(field);
    sink.push(...matches);
    return redacted;
  }
  if (Array.isArray(field)) {
    return field.map((block) => {
      if (
        block &&
        typeof block === 'object' &&
        'type' in block &&
        (block as { type?: unknown }).type === 'text'
      ) {
        const b = block as Record<string, unknown>;
        if (typeof b.text === 'string') {
          const { redacted, matches } = redactText(b.text);
          sink.push(...matches);
          return { ...b, text: redacted };
        }
      }
      return block;
    });
  }
  return field;
}

// ─── Per-app policy ──────────────────────────────────────────────────────────

export type PiiPolicy = 'redact' | 'block' | 'off';

/**
 * Resolve the policy for an app. P2 step 2 default: 'redact' for all apps.
 * P2 step 4 (TOFU dialog, ASD-T-015) will replace this with a lookup against
 * apps.json's per-app pii_policy field.
 */
export class PiiPolicyResolver {
  private readonly overrides = new Map<string, PiiPolicy>();

  resolve(_appId: string): PiiPolicy {
    return this.overrides.get(_appId) ?? 'redact';
  }

  /** Test/UI override for P2 ASD-T-015 wiring. */
  setOverride(appId: string, policy: PiiPolicy): void {
    this.overrides.set(appId, policy);
  }

  snapshot(): Record<string, PiiPolicy> {
    return Object.fromEntries(this.overrides);
  }
}
