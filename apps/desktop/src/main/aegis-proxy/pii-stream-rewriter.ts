// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — provider SSE stream rewriters (ASD-T-021)
//
// Two stream rewriters, one per provider adapter, that route the streaming
// text-delta payload through a StreamingPiiRedactor before re-serializing
// and forwarding to the client. Non-text events (message_start, ping,
// usage updates, [DONE], etc.) pass through verbatim.
//
// The rewriters maintain their own line-buffer for incomplete SSE events
// (split across upstream TCP chunks). When the upstream chunk contains
// multiple `\n\n`-separated events, each event is processed independently.
//
// Anthropic SSE shape (event: content_block_delta):
//   event: content_block_delta
//   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}
//
// OpenAI SSE shape:
//   data: {"choices":[{"delta":{"content":"Hello "}}]}
//   data: [DONE]
//
// @rule:ASD-006 — observation-side, no falsification beyond [REDACTED:type] markers
// @rule:ASD-011 — replace, never invent

import type { Provider } from './observer-types.js';
import { StreamingPiiRedactor } from './pii-stream-redactor.js';

export interface StreamRewriter {
  /**
   * Feed an upstream chunk; returns the rewritten bytes to emit to the
   * client. May return an empty Buffer (entire chunk buffered for context).
   */
  feed(chunk: Buffer): Buffer;
  /**
   * Stream ended (upstream `end` or aborted). Returns any final synthetic
   * event bytes the rewriter needs to flush (the held-back tail of the
   * redactor, wrapped in a provider-specific event envelope).
   */
  finalize(): Buffer;
  /** Per-type redaction counts so far. */
  countsSnapshot(): Record<string, number>;
  totalMatches(): number;
}

/**
 * Pass-through rewriter for non-redacting policies. Returns chunks
 * untouched; counts always empty. Used when pii_policy === 'off'.
 */
export class PassThroughStreamRewriter implements StreamRewriter {
  feed(chunk: Buffer): Buffer {
    return chunk;
  }
  finalize(): Buffer {
    return Buffer.alloc(0);
  }
  countsSnapshot(): Record<string, number> {
    return {};
  }
  totalMatches(): number {
    return 0;
  }
}

/**
 * Anthropic Messages SSE rewriter. Touches `content_block_delta` events with
 * `delta.type === 'text_delta'`; all other event types pass through. The
 * `delta.text` payload is fed through the redactor; events where the
 * redactor emits empty text (still buffering) are dropped so client sees
 * only events with actual text.
 *
 * Final flush: emits a synthetic `content_block_delta` event carrying the
 * held-back tail BEFORE the upstream's terminal `message_stop`. We emit it
 * with index 0 — matches the most common single-content-block case.
 */
export class AnthropicStreamRewriter implements StreamRewriter {
  private readonly redactor = new StreamingPiiRedactor();
  private partial = '';

  feed(chunk: Buffer): Buffer {
    this.partial += chunk.toString('utf8');
    const out: string[] = [];
    let idx;
    while ((idx = this.partial.indexOf('\n\n')) !== -1) {
      const eventBlock = this.partial.slice(0, idx);
      this.partial = this.partial.slice(idx + 2);
      const rewritten = this.rewriteEventBlock(eventBlock);
      if (rewritten !== null) out.push(rewritten + '\n\n');
    }
    return Buffer.from(out.join(''), 'utf8');
  }

  finalize(): Buffer {
    const tail = this.redactor.flush();
    const out: string[] = [];
    if (tail.length > 0) {
      const synthetic = JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: tail },
      });
      out.push(`event: content_block_delta\ndata: ${synthetic}\n\n`);
    }
    // Forward any trailing partial event (rare — upstream usually ends on \n\n).
    if (this.partial.length > 0) {
      out.push(this.partial);
      this.partial = '';
    }
    return Buffer.from(out.join(''), 'utf8');
  }

  countsSnapshot(): Record<string, number> {
    return this.redactor.countsSnapshot();
  }

  totalMatches(): number {
    return this.redactor.totalMatches();
  }

  /**
   * Returns the rewritten block (without trailing \n\n) or null if the
   * block should be dropped (text_delta with no safe-to-emit text yet).
   */
  private rewriteEventBlock(block: string): string | null {
    const lines = block.split('\n');
    const dataLines: string[] = [];
    const otherLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      else otherLines.push(line);
    }
    if (dataLines.length === 0) return block; // event with no data — pass through
    const dataText = dataLines.join('\n');
    let json: unknown;
    try {
      json = JSON.parse(dataText);
    } catch {
      return block; // non-JSON data — pass through
    }
    if (
      !json ||
      typeof json !== 'object' ||
      (json as { type?: string }).type !== 'content_block_delta'
    ) {
      return block;
    }
    const obj = json as {
      type: string;
      index?: number;
      delta?: { type?: string; text?: string };
    };
    if (obj.delta?.type !== 'text_delta' || typeof obj.delta.text !== 'string') {
      return block;
    }
    const inputText = obj.delta.text;
    const safe = this.redactor.feed(inputText);
    if (safe.length === 0) return null; // held back — drop the event
    const newObj = { ...obj, delta: { ...obj.delta, text: safe } };
    const newData = JSON.stringify(newObj);
    return [...otherLines.filter((l) => l.length > 0), `data: ${newData}`].join('\n');
  }
}

/**
 * OpenAI Chat Completions SSE rewriter. Touches the per-chunk
 * `choices[0].delta.content` string; preserves `data: [DONE]` and other
 * fields. Multi-choice responses: redacts each choice independently
 * (rare in practice; most streaming uses n=1).
 *
 * On flush: emits one synthetic chunk carrying the held-back tail BEFORE
 * the upstream's terminating `[DONE]`. The synthetic chunk reuses the
 * `id` + `model` from the last seen chunk if known.
 */
export class OpenAIStreamRewriter implements StreamRewriter {
  private readonly redactor = new StreamingPiiRedactor();
  private partial = '';
  private lastSeenId: string | null = null;
  private lastSeenModel: string | null = null;
  private lastSeenCreated: number | null = null;

  feed(chunk: Buffer): Buffer {
    this.partial += chunk.toString('utf8');
    const out: string[] = [];
    let idx;
    while ((idx = this.partial.indexOf('\n\n')) !== -1) {
      const eventBlock = this.partial.slice(0, idx);
      this.partial = this.partial.slice(idx + 2);
      const rewritten = this.rewriteEventBlock(eventBlock);
      if (rewritten !== null) out.push(rewritten + '\n\n');
    }
    return Buffer.from(out.join(''), 'utf8');
  }

  finalize(): Buffer {
    const tail = this.redactor.flush();
    const out: string[] = [];
    if (tail.length > 0) {
      const synthetic = {
        id: this.lastSeenId ?? 'ankrshield-synthetic',
        object: 'chat.completion.chunk',
        created: this.lastSeenCreated ?? Math.floor(Date.now() / 1000),
        model: this.lastSeenModel ?? 'unknown',
        choices: [{ index: 0, delta: { content: tail }, finish_reason: null }],
      };
      out.push(`data: ${JSON.stringify(synthetic)}\n\n`);
    }
    if (this.partial.length > 0) {
      out.push(this.partial);
      this.partial = '';
    }
    return Buffer.from(out.join(''), 'utf8');
  }

  countsSnapshot(): Record<string, number> {
    return this.redactor.countsSnapshot();
  }

  totalMatches(): number {
    return this.redactor.totalMatches();
  }

  private rewriteEventBlock(block: string): string | null {
    const lines = block.split('\n');
    const dataLines: string[] = [];
    const otherLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      else otherLines.push(line);
    }
    if (dataLines.length === 0) return block;
    const dataText = dataLines.join('\n');
    if (dataText === '[DONE]') return block; // terminating marker — pass through

    let json: unknown;
    try {
      json = JSON.parse(dataText);
    } catch {
      return block;
    }
    if (!json || typeof json !== 'object') return block;
    const obj = json as {
      id?: string;
      model?: string;
      created?: number;
      choices?: Array<{ delta?: { content?: string } }>;
    };
    if (typeof obj.id === 'string') this.lastSeenId = obj.id;
    if (typeof obj.model === 'string') this.lastSeenModel = obj.model;
    if (typeof obj.created === 'number') this.lastSeenCreated = obj.created;
    if (!Array.isArray(obj.choices) || obj.choices.length === 0) return block;

    let anyChanged = false;
    let anyEmitted = false;
    const newChoices = obj.choices.map((choice) => {
      const content = choice?.delta?.content;
      if (typeof content !== 'string' || content.length === 0) return choice;
      const safe = this.redactor.feed(content);
      anyChanged = true;
      if (safe.length === 0) return null; // signal: drop this choice
      anyEmitted = true;
      return { ...choice, delta: { ...choice.delta, content: safe } };
    });

    if (!anyChanged) return block; // no text deltas in this chunk — pass through

    const keptChoices = newChoices.filter((c) => c !== null);
    if (keptChoices.length === 0 && !anyEmitted) return null; // entire chunk held back

    const newObj = { ...obj, choices: keptChoices };
    const newData = JSON.stringify(newObj);
    return [...otherLines.filter((l) => l.length > 0), `data: ${newData}`].join('\n');
  }
}

/** Factory: pick the right rewriter for a provider when policy === 'redact'. */
export function makeStreamRewriter(provider: Provider): StreamRewriter {
  if (provider === 'anthropic') return new AnthropicStreamRewriter();
  if (provider === 'openai') return new OpenAIStreamRewriter();
  return new PassThroughStreamRewriter();
}
