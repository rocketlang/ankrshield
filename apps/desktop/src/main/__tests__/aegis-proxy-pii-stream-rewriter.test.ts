// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-021 provider SSE stream rewriters (Anthropic + OpenAI).

import { describe, it, expect } from 'vitest';

import {
  AnthropicStreamRewriter,
  OpenAIStreamRewriter,
  PassThroughStreamRewriter,
  makeStreamRewriter,
} from '../aegis-proxy/pii-stream-rewriter.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function anthropicTextDelta(text: string, index = 0): string {
  const payload = JSON.stringify({
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  });
  return `event: content_block_delta\ndata: ${payload}\n\n`;
}

function openaiContentDelta(content: string, id = 'chatcmpl-1', model = 'gpt-4'): string {
  const payload = JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created: 1700000000,
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
  return `data: ${payload}\n\n`;
}

function feedAll(
  rewriter: { feed: (b: Buffer) => Buffer; finalize: () => Buffer },
  chunks: string[]
): string {
  const out: string[] = [];
  for (const c of chunks) {
    const b = rewriter.feed(Buffer.from(c, 'utf8'));
    if (b.length > 0) out.push(b.toString('utf8'));
  }
  const tail = rewriter.finalize();
  if (tail.length > 0) out.push(tail.toString('utf8'));
  return out.join('');
}

function extractAnthropicText(sse: string): string {
  // Concatenate all text_delta payloads in document order.
  const parts: string[] = [];
  for (const block of sse.split('\n\n')) {
    const dataLines = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (dataLines.length === 0) continue;
    try {
      const json = JSON.parse(dataLines.join('\n'));
      if (json?.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
        parts.push(String(json.delta.text ?? ''));
      }
    } catch {
      // ignore
    }
  }
  return parts.join('');
}

function extractOpenAIText(sse: string): string {
  const parts: string[] = [];
  for (const block of sse.split('\n\n')) {
    const dataLines = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (dataLines.length === 0) continue;
    const dataText = dataLines.join('\n');
    if (dataText === '[DONE]') continue;
    try {
      const json = JSON.parse(dataText);
      const content = json?.choices?.[0]?.delta?.content;
      if (typeof content === 'string') parts.push(content);
    } catch {
      // ignore
    }
  }
  return parts.join('');
}

// ─── PassThrough ──────────────────────────────────────────────────────────────

describe('ASD-T-021 — PassThroughStreamRewriter', () => {
  it('feed returns chunk unchanged', () => {
    const r = new PassThroughStreamRewriter();
    const b = Buffer.from('anything');
    expect(r.feed(b).equals(b)).toBe(true);
    expect(r.finalize().length).toBe(0);
    expect(r.totalMatches()).toBe(0);
  });
});

// ─── AnthropicStreamRewriter ──────────────────────────────────────────────────

describe('ASD-T-021 — AnthropicStreamRewriter', () => {
  it('passes through non-text events untouched', () => {
    const r = new AnthropicStreamRewriter();
    const start = 'event: message_start\ndata: {"type":"message_start","message":{"id":"x"}}\n\n';
    const stop = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    const out = feedAll(r, [start, stop]);
    expect(out).toContain('message_start');
    expect(out).toContain('message_stop');
    expect(r.totalMatches()).toBe(0);
  });

  it('redacts Aadhaar emitted as text_delta', () => {
    const r = new AnthropicStreamRewriter();
    const text = 'User aadhaar is 1234-5678-9012 done.';
    // One big text_delta (no streaming split) to keep things simple.
    const padding = 'x'.repeat(300); // push past holdBack mid-stream
    const out = feedAll(r, [anthropicTextDelta(padding), anthropicTextDelta(text)]);
    const concatenated = extractAnthropicText(out);
    expect(concatenated).not.toContain('1234-5678-9012');
    expect(concatenated).toContain('[REDACTED:aadhaar]');
    expect(r.totalMatches()).toBe(1);
    expect(r.countsSnapshot()).toEqual({ aadhaar: 1 });
  });

  it('redacts PAN split across two text_delta events', () => {
    const r = new AnthropicStreamRewriter();
    const padding = 'x'.repeat(300);
    const out = feedAll(r, [
      anthropicTextDelta(padding + ' PAN: ABCD'),
      anthropicTextDelta('E1234F end.'),
    ]);
    const concatenated = extractAnthropicText(out);
    expect(concatenated).not.toContain('ABCDE1234F');
    expect(concatenated).toContain('[REDACTED:pan]');
    expect(r.totalMatches()).toBe(1);
  });

  it('preserves total non-PII content (modulo replacement length)', () => {
    const r = new AnthropicStreamRewriter();
    const plain = 'Hello world, just text. ' + 'x'.repeat(200) + ' end.';
    const out = feedAll(r, [anthropicTextDelta(plain)]);
    const concatenated = extractAnthropicText(out);
    expect(concatenated).toBe(plain);
    expect(r.totalMatches()).toBe(0);
  });

  it('finalize emits the held tail as a synthetic content_block_delta', () => {
    const r = new AnthropicStreamRewriter();
    const out = feedAll(r, [anthropicTextDelta('short tail with 1234-5678-9012')]);
    const concatenated = extractAnthropicText(out);
    expect(concatenated).toContain('[REDACTED:aadhaar]');
  });

  it('handles chunk splits at arbitrary byte boundaries', () => {
    const r = new AnthropicStreamRewriter();
    const event = anthropicTextDelta('x'.repeat(300) + ' 1234-5678-9012 done');
    // Split into 50-byte chunks.
    const chunks: string[] = [];
    for (let i = 0; i < event.length; i += 50) chunks.push(event.slice(i, i + 50));
    const out = feedAll(r, chunks);
    const concatenated = extractAnthropicText(out);
    expect(concatenated).toContain('[REDACTED:aadhaar]');
    expect(concatenated).not.toContain('1234-5678-9012');
  });

  it('drops text_delta events that are entirely buffered', () => {
    const r = new AnthropicStreamRewriter();
    // Single small text_delta — all buffered, no emit until finalize.
    const out1 = r.feed(Buffer.from(anthropicTextDelta('hi'), 'utf8'));
    expect(out1.length).toBe(0); // dropped
    const tail = r.finalize();
    expect(tail.toString('utf8')).toContain('hi');
  });

  it('handles non-JSON data lines gracefully', () => {
    const r = new AnthropicStreamRewriter();
    const out = feedAll(r, ['event: ping\ndata: not-json\n\n']);
    expect(out).toContain('ping');
  });

  it('non-text content_block (e.g. tool_use) passes through', () => {
    const r = new AnthropicStreamRewriter();
    const toolEvent =
      'event: content_block_delta\n' +
      'data: ' +
      JSON.stringify({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"key":"value"}' },
      }) +
      '\n\n';
    const out = feedAll(r, [toolEvent]);
    expect(out).toContain('input_json_delta');
    expect(r.totalMatches()).toBe(0);
  });
});

// ─── OpenAIStreamRewriter ─────────────────────────────────────────────────────

describe('ASD-T-021 — OpenAIStreamRewriter', () => {
  it('redacts email split across two content deltas', () => {
    const r = new OpenAIStreamRewriter();
    const padding = 'x'.repeat(300);
    const out = feedAll(r, [
      openaiContentDelta(padding + ' contact alice@'),
      openaiContentDelta('example.com later'),
      'data: [DONE]\n\n',
    ]);
    const concatenated = extractOpenAIText(out);
    expect(concatenated).not.toContain('alice@example.com');
    expect(concatenated).toContain('[REDACTED:email]');
    expect(r.totalMatches()).toBe(1);
  });

  it('passes through [DONE] terminator unchanged', () => {
    const r = new OpenAIStreamRewriter();
    const padding = 'x'.repeat(300);
    const out = feedAll(r, [openaiContentDelta(padding), 'data: [DONE]\n\n']);
    expect(out).toContain('data: [DONE]');
  });

  it('preserves id/model/created in re-serialized chunks', () => {
    const r = new OpenAIStreamRewriter();
    const padding = 'x'.repeat(300);
    const out = feedAll(r, [openaiContentDelta(padding, 'chatcmpl-zzz', 'gpt-4o-mini')]);
    expect(out).toContain('chatcmpl-zzz');
    expect(out).toContain('gpt-4o-mini');
  });

  it('finalize synthesises a tail chunk reusing last id/model', () => {
    const r = new OpenAIStreamRewriter();
    const out = feedAll(r, [openaiContentDelta('tail with 1234-5678-9012', 'chatcmpl-z', 'gpt-x')]);
    const concatenated = extractOpenAIText(out);
    expect(concatenated).toContain('[REDACTED:aadhaar]');
    expect(out).toContain('chatcmpl-z');
    expect(out).toContain('gpt-x');
  });

  it('handles chunks split at arbitrary bytes', () => {
    const r = new OpenAIStreamRewriter();
    const event = openaiContentDelta('x'.repeat(300) + ' 1234-5678-9012 done');
    const chunks: string[] = [];
    for (let i = 0; i < event.length; i += 30) chunks.push(event.slice(i, i + 30));
    const out = feedAll(r, chunks);
    const concatenated = extractOpenAIText(out);
    expect(concatenated).toContain('[REDACTED:aadhaar]');
    expect(concatenated).not.toContain('1234-5678-9012');
  });

  it('preserves plain text exactly', () => {
    const r = new OpenAIStreamRewriter();
    const plain = 'Just a plain string with no PII anywhere. ' + 'a'.repeat(200);
    const out = feedAll(r, [openaiContentDelta(plain)]);
    const concatenated = extractOpenAIText(out);
    expect(concatenated).toBe(plain);
    expect(r.totalMatches()).toBe(0);
  });

  it('drops chunks where the entire content is buffered', () => {
    const r = new OpenAIStreamRewriter();
    const out1 = r.feed(Buffer.from(openaiContentDelta('hi'), 'utf8'));
    // Held back — should be empty.
    expect(out1.length).toBe(0);
    const tail = r.finalize().toString('utf8');
    expect(tail).toContain('hi');
  });
});

describe('ASD-T-021 — makeStreamRewriter factory', () => {
  it('returns Anthropic rewriter for anthropic provider', () => {
    const r = makeStreamRewriter('anthropic');
    expect(r).toBeInstanceOf(AnthropicStreamRewriter);
  });
  it('returns OpenAI rewriter for openai provider', () => {
    const r = makeStreamRewriter('openai');
    expect(r).toBeInstanceOf(OpenAIStreamRewriter);
  });
  it('returns pass-through for unknown provider', () => {
    const r = makeStreamRewriter('unknown');
    expect(r).toBeInstanceOf(PassThroughStreamRewriter);
  });
});
