// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-013 PII boundary (own module, doctrine-corrected — see
// ankrshield-desktop-aegis--vivechana--formal--2026-05-18.md Part 2).

import { describe, it, expect } from 'vitest';

import {
  scanText,
  redactText,
  redactInJsonBody,
  PiiPolicyResolver,
  PII_PATTERNS,
} from '../aegis-proxy/pii-boundary.js';

describe('ASD-T-013 — scanText (Indian PII)', () => {
  it('detects Aadhaar 12-digit number (no separator)', () => {
    const matches = scanText('My number is 234567891234 ok');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.type).toBe('aadhaar');
    expect(matches[0]!.value).toBe('234567891234');
  });

  it('detects Aadhaar with space separators', () => {
    const matches = scanText('Aadhaar: 2345 6789 1234');
    expect(matches.find((m) => m.type === 'aadhaar')).toBeDefined();
  });

  it('detects Aadhaar with hyphen separators', () => {
    const matches = scanText('Aadhaar: 2345-6789-1234');
    expect(matches.find((m) => m.type === 'aadhaar')).toBeDefined();
  });

  it('detects PAN (5 letters + 4 digits + 1 letter)', () => {
    const matches = scanText('PAN: ABCDE1234F');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.type).toBe('pan');
    expect(matches[0]!.value).toBe('ABCDE1234F');
  });

  it('does NOT match malformed PAN', () => {
    const matches = scanText('PAN: ABCDE12345');
    expect(matches.find((m) => m.type === 'pan')).toBeUndefined();
  });

  it('detects UPI handle on known PSP suffix', () => {
    const matches = scanText('Pay me at john@paytm or jane@oksbi');
    const upi = matches.filter((m) => m.type === 'upi_handle');
    expect(upi).toHaveLength(2);
  });

  it('does NOT match arbitrary email as UPI handle', () => {
    const matches = scanText('Email me at user@gmail.com');
    expect(matches.find((m) => m.type === 'upi_handle')).toBeUndefined();
    expect(matches.find((m) => m.type === 'email')).toBeDefined();
  });
});

describe('ASD-T-013 — scanText (Western PII)', () => {
  it('detects SSN', () => {
    const matches = scanText('SSN: 123-45-6789');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.type).toBe('ssn');
  });

  it('detects email', () => {
    const matches = scanText('Contact: user@example.com');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.type).toBe('email');
  });

  it('detects Indian mobile (10-digit starting 6-9)', () => {
    const matches = scanText('Call 9876543210');
    expect(matches.find((m) => m.type === 'phone_india')).toBeDefined();
  });

  it('detects Indian mobile with +91', () => {
    const matches = scanText('+91 9876543210');
    expect(matches.find((m) => m.type === 'phone_india')).toBeDefined();
  });

  it('detects E.164 phone with country code', () => {
    const matches = scanText('UK: +442012345678');
    expect(matches.find((m) => m.type === 'phone_e164')).toBeDefined();
  });
});

describe('ASD-T-013 — scanText (multi-PII + dedupe)', () => {
  it('handles multiple PII types in one string', () => {
    const text = 'My Aadhaar is 234567891234, PAN ABCDE1234F, email me at j@x.com or pay j@paytm';
    const matches = scanText(text);
    const types = new Set(matches.map((m) => m.type));
    expect(types.has('aadhaar')).toBe(true);
    expect(types.has('pan')).toBe(true);
    expect(types.has('email')).toBe(true);
    expect(types.has('upi_handle')).toBe(true);
  });

  it('returns matches in left-to-right order', () => {
    const matches = scanText('e@x.com and 123-45-6789 and ABCDE1234F');
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.start).toBeGreaterThan(matches[i - 1]!.start);
    }
  });

  it('does not double-match overlapping spans (UPI matched before email)', () => {
    const matches = scanText('Pay alice@paytm now');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.type).toBe('upi_handle');
  });

  it('returns empty array for clean text', () => {
    expect(scanText('Hello world, nothing sensitive here.')).toEqual([]);
  });

  it('handles empty input', () => {
    expect(scanText('')).toEqual([]);
  });
});

describe('ASD-T-013 — redactText', () => {
  it('replaces matches with [REDACTED:type] markers', () => {
    const { redacted, matches } = redactText('Aadhaar 234567891234 PAN ABCDE1234F');
    expect(redacted).toBe('Aadhaar [REDACTED:aadhaar] PAN [REDACTED:pan]');
    expect(matches).toHaveLength(2);
  });

  it('redacts left-to-right correctly even with length-changing replacements', () => {
    const { redacted } = redactText('a@x.com b@y.com');
    expect(redacted).toBe('[REDACTED:email] [REDACTED:email]');
  });

  it('returns original string when no matches', () => {
    const r = redactText('Nothing to see here');
    expect(r.redacted).toBe('Nothing to see here');
    expect(r.matches).toEqual([]);
  });
});

describe('ASD-T-013 — redactInJsonBody (Anthropic shape)', () => {
  it('redacts top-level string system + messages[].content strings', () => {
    const body: Record<string, unknown> = {
      model: 'claude-opus-4-7',
      system: 'My PAN is ABCDE1234F please be careful',
      messages: [
        { role: 'user', content: 'My Aadhaar is 234567891234 — help me' },
        { role: 'assistant', content: 'OK' },
      ],
    };
    const matches = redactInJsonBody(body);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(body.system).toContain('[REDACTED:pan]');
    expect((body.messages as Array<{ content: string }>)[0]!.content).toContain(
      '[REDACTED:aadhaar]'
    );
  });

  it('redacts array-form content (Anthropic content blocks)', () => {
    const body: Record<string, unknown> = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Email user@example.com please' },
            { type: 'image', source: { url: 'x' } },
            { type: 'text', text: 'And SSN 123-45-6789' },
          ],
        },
      ],
    };
    const matches = redactInJsonBody(body);
    expect(matches.length).toBe(2);
    const blocks = (body.messages as Array<{ content: Array<{ type: string; text?: string }> }>)[0]!
      .content;
    expect(blocks[0]!.text).toContain('[REDACTED:email]');
    expect(blocks[2]!.text).toContain('[REDACTED:ssn]');
    // Image block untouched.
    expect(blocks[1]!.type).toBe('image');
  });

  it('redacts array-form system (Anthropic system content blocks)', () => {
    const body: Record<string, unknown> = {
      system: [
        { type: 'text', text: 'PAN ABCDE1234F' },
        { type: 'text', text: 'no pii here' },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    };
    const matches = redactInJsonBody(body);
    expect(matches).toHaveLength(1);
    expect((body.system as Array<{ text: string }>)[0]!.text).toBe('PAN [REDACTED:pan]');
  });

  it('handles missing fields gracefully', () => {
    expect(redactInJsonBody({})).toEqual([]);
    expect(redactInJsonBody({ messages: [] })).toEqual([]);
    expect(redactInJsonBody(null)).toEqual([]);
  });
});

describe('ASD-T-013 — PiiPolicyResolver', () => {
  it('defaults to redact for all apps', () => {
    const r = new PiiPolicyResolver();
    expect(r.resolve('cursor')).toBe('redact');
    expect(r.resolve('claude-desktop')).toBe('redact');
    expect(r.resolve('unknown:12345')).toBe('redact');
  });

  it('setOverride replaces the policy for one app', () => {
    const r = new PiiPolicyResolver();
    r.setOverride('cursor', 'block');
    expect(r.resolve('cursor')).toBe('block');
    expect(r.resolve('other')).toBe('redact');
  });

  it('off policy disables scanning for that app', () => {
    const r = new PiiPolicyResolver();
    r.setOverride('research-tool', 'off');
    expect(r.resolve('research-tool')).toBe('off');
  });

  it('snapshot returns overrides', () => {
    const r = new PiiPolicyResolver();
    r.setOverride('a', 'block');
    r.setOverride('b', 'off');
    expect(r.snapshot()).toEqual({ a: 'block', b: 'off' });
  });
});

describe('ASD-T-013 — PII_PATTERNS', () => {
  it('exports patterns for the 7 documented types', () => {
    const types = new Set(PII_PATTERNS.map((p) => p.type));
    expect(types.size).toBe(7);
    for (const t of ['aadhaar', 'pan', 'upi_handle', 'ssn', 'email', 'phone_india', 'phone_e164']) {
      expect(types.has(t as never)).toBe(true);
    }
  });
});
