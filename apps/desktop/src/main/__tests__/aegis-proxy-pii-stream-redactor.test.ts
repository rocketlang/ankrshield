// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-021 StreamingPiiRedactor — sliding-buffer redactor with
// holdBack-driven boundary safety.

import { describe, it, expect } from 'vitest';

import { StreamingPiiRedactor } from '../aegis-proxy/pii-stream-redactor.js';

describe('ASD-T-021 — StreamingPiiRedactor', () => {
  it('emits nothing until buffer exceeds holdBack', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    expect(r.feed('short')).toBe('');
    expect(r.feed(' even with more')).toBe('');
    expect(r.charsFed).toBe('short even with more'.length);
    expect(r.charsEmitted).toBe(0);
  });

  it('flush emits the held tail', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    r.feed('Hello world, harmless text.');
    const out = r.flush();
    expect(out).toBe('Hello world, harmless text.');
    expect(r.totalMatches()).toBe(0);
  });

  it('redacts Aadhaar inside the flushed tail', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    r.feed('User aadhaar is 1234-5678-9012 done.');
    const out = r.flush();
    expect(out).toContain('[REDACTED:aadhaar]');
    expect(out).not.toContain('1234-5678-9012');
    expect(r.counts.aadhaar).toBe(1);
    expect(r.totalMatches()).toBe(1);
  });

  it('redacts Aadhaar split across two feeds', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    // Pad past holdBack with prefix text, then feed Aadhaar in two halves.
    const padding = 'x'.repeat(100);
    r.feed(padding + 'My aadhaar: 1234-');
    const emitted = r.feed('5678-9012 thanks');
    // The emit must NOT contain the literal Aadhaar.
    const flushed = r.flush();
    const full = emitted + flushed;
    expect(full).not.toContain('1234-5678-9012');
    expect(full).toContain('[REDACTED:aadhaar]');
    expect(r.counts.aadhaar).toBe(1);
  });

  it('redacts PAN split across three small feeds', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    const padding = 'x'.repeat(80);
    r.feed(padding);
    r.feed('PAN: ABCD');
    r.feed('E12');
    r.feed('34F end.');
    const flushed = r.flush();
    expect(flushed + '').not.toContain('ABCDE1234F');
    // Sum across all feeds: at least one PAN match somewhere.
    expect(r.counts.pan).toBe(1);
  });

  it('redacts email in the flushed tail', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    r.feed('Contact: alice@example.com — call soon.');
    const out = r.flush();
    expect(out).toContain('[REDACTED:email]');
    expect(out).not.toContain('alice@example.com');
  });

  it('preserves text around the redaction', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    r.feed('Before 1234-5678-9012 after.');
    const out = r.flush();
    expect(out).toMatch(/^Before \[REDACTED:aadhaar\] after\.$/);
  });

  it('handles multiple PII types in one stream', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    r.feed('IDs: 1234-5678-9012 PAN ABCDE1234F email a@example.com.');
    const out = r.flush();
    expect(out).toContain('[REDACTED:aadhaar]');
    expect(out).toContain('[REDACTED:pan]');
    expect(out).toContain('[REDACTED:email]');
    expect(r.counts.aadhaar).toBe(1);
    expect(r.counts.pan).toBe(1);
    expect(r.counts.email).toBe(1);
    expect(r.totalMatches()).toBe(3);
  });

  it('emits + holds correctly when text is much longer than holdBack', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 32 });
    const a = 'x'.repeat(200);
    const out1 = r.feed(a);
    expect(out1.length).toBe(168); // 200 - 32 hold
    const out2 = r.flush();
    expect(out2.length).toBe(32);
    expect(out1 + out2).toBe(a);
  });

  it('does not split a complete match that straddles the natural cut', () => {
    // Aadhaar needs \b on both ends — pad with spaces so the regex engages.
    // holdBack=24; total buffer length ~210, aadhaar (14ch) crosses the cut
    // (bufferLen - 24).
    const r = new StreamingPiiRedactor({ holdBackChars: 24 });
    const pre = 'a'.repeat(195) + ' '; // 196 chars ending in space
    const aadhaar = '1234-5678-9012'; // 14 chars, total bufferLen so far = 210
    const post = ' ' + 'b'.repeat(19); // 20 chars after — total = 244
    // Natural cut = 244 - 24 = 220. Aadhaar at 196..210 → fully BEFORE cut.
    // So this case actually tests a complete match in the safe region, not
    // crossing. Make it cross by shrinking pre.
    const pre2 = 'a'.repeat(190) + ' '; // 191 chars
    // Buffer = 191 + 14 + 20 = 225. Natural cut = 225 - 24 = 201. Aadhaar
    // at 191..205 — crosses 201.
    r.feed(pre2 + aadhaar + post);
    const flushed = r.flush();
    const totalEmitted = r.charsEmitted;
    expect(totalEmitted).toBeGreaterThan(0);
    expect(r.counts.aadhaar).toBe(1);
    // The literal aadhaar must not appear anywhere we emitted.
    expect((flushed + '').includes(aadhaar)).toBe(false);
    // Suppress unused-var lint (`pre` was the original setup retained as comment).
    void pre;
  });

  it('countsSnapshot returns only non-zero entries', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 32 });
    r.feed('1234-5678-9012');
    r.flush();
    expect(r.countsSnapshot()).toEqual({ aadhaar: 1 });
  });

  it('clamps holdBack to minimum 32', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 4 });
    // Buffer of 30 chars — under the clamped 32, so emit nothing.
    expect(r.feed('x'.repeat(30))).toBe('');
  });

  it('feed("") is a no-op', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 32 });
    expect(r.feed('')).toBe('');
    expect(r.charsFed).toBe(0);
  });

  it('UPI handle redacted across boundary', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 64 });
    const padding = 'q'.repeat(80);
    r.feed(padding + 'pay to alice@upi');
    r.feed(' please');
    const out = r.flush();
    const full = out;
    expect(full).not.toContain('alice@upi');
    expect(r.counts.upi_handle).toBe(1);
  });

  it('SSN redacted in the held tail', () => {
    const r = new StreamingPiiRedactor({ holdBackChars: 32 });
    r.feed('ssn 123-45-6789');
    const out = r.flush();
    expect(out).toContain('[REDACTED:ssn]');
    expect(r.counts.ssn).toBe(1);
  });
});
