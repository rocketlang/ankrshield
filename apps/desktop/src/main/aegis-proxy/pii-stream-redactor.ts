// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — streaming PII redactor (ASD-T-021)
//
// Text-in, redacted-text-out sliding-buffer redactor for LLM SSE responses.
// Holds back the last `holdBackChars` characters before emitting so a PII
// match that straddles a stream-chunk boundary is fully visible by the time
// we decide to emit. Patterns in pii-boundary.ts top out at ~30 chars (email
// up to ~254 by RFC, but realistic emails are far shorter); 256 default is
// comfortably above all current patterns.
//
// Strategy per feed():
//   1. Append new text to buffer.
//   2. If buffer ≤ holdBack: emit nothing (still collecting context).
//   3. Else: scan the FULL buffer for complete PII matches. Any complete
//      match that crosses the (bufferLen - holdBack) line extends the cut
//      point to AFTER the match — so we never split a match.
//   4. Emit the redacted prefix [0, cutAt); retain [cutAt, end) for next feed.
//   5. Tally per-type counts so the proxy can emit a pii.stream.redacted
//      summary event.
//
// On flush(): emit everything in the buffer (last chance — stream is done).
//
// Why hold a tail at all? A pattern starting near the buffer-end may be
// incomplete; emitting it unscanned would leak the PII. Holding 256 chars
// guarantees any pattern of length ≤ 256 will be complete by the time it
// reaches the emit line.
//
// @rule:ASD-011 — streaming redaction cannot falsify; replace with [REDACTED:type] markers
// @rule:ASD-004 — fail closed: scan errors propagate, caller decides

import { redactText, scanText, type PiiType } from './pii-boundary.js';

export interface StreamingPiiRedactorOptions {
  /**
   * Bytes/chars to hold back from emission while waiting for more context.
   * Must be ≥ longest possible PII match length. Default 256.
   */
  holdBackChars?: number;
}

export class StreamingPiiRedactor {
  private buffer = '';
  private readonly holdBackChars: number;
  /** Per-type tally of matches redacted so far. */
  readonly counts: Partial<Record<PiiType, number>> = {};
  /** Total characters of input fed (for diagnostics). */
  charsFed = 0;
  /** Total characters of redacted output emitted (for diagnostics). */
  charsEmitted = 0;

  constructor(opts: StreamingPiiRedactorOptions = {}) {
    this.holdBackChars = Math.max(32, opts.holdBackChars ?? 256);
  }

  /**
   * Feed a new text fragment. Returns the (possibly empty) redacted output
   * that is now safe to emit downstream.
   */
  feed(text: string): string {
    if (!text) return '';
    this.buffer += text;
    this.charsFed += text.length;

    if (this.buffer.length <= this.holdBackChars) {
      // Still need more context — emit nothing yet.
      return '';
    }

    // Cut point: never split a complete match. Start at the natural cut
    // (bufferLen - holdBack), then extend past any match that crosses it.
    const naturalCut = this.buffer.length - this.holdBackChars;
    let cutAt = naturalCut;
    const matchesInBuffer = scanText(this.buffer);
    for (const m of matchesInBuffer) {
      if (m.start < naturalCut && m.end > naturalCut) {
        // Match straddles the natural cut — extend cut to after the match.
        if (m.end > cutAt) cutAt = m.end;
      }
    }

    const prefix = this.buffer.slice(0, cutAt);
    const { redacted, matches } = redactText(prefix);
    for (const m of matches) {
      this.counts[m.type] = (this.counts[m.type] ?? 0) + 1;
    }
    this.buffer = this.buffer.slice(cutAt);
    this.charsEmitted += redacted.length;
    return redacted;
  }

  /**
   * Flush the remaining buffer (stream is ending or aborting). Subsequent
   * feed() calls will start over with an empty buffer; the caller is
   * responsible for not feeding after flush.
   */
  flush(): string {
    if (!this.buffer) return '';
    const { redacted, matches } = redactText(this.buffer);
    for (const m of matches) {
      this.counts[m.type] = (this.counts[m.type] ?? 0) + 1;
    }
    this.buffer = '';
    this.charsEmitted += redacted.length;
    return redacted;
  }

  /** Sum of counts across all types (for the pii.stream.redacted event). */
  totalMatches(): number {
    let n = 0;
    for (const v of Object.values(this.counts)) n += v ?? 0;
    return n;
  }

  /** Plain JSON for the renderer event. */
  countsSnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.counts)) {
      if (v != null && v > 0) out[k] = v;
    }
    return out;
  }
}
