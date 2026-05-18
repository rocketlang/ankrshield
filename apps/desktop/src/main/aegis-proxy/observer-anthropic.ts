// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — Anthropic Messages API adapter (ASD-T-004)
//
// Detects requests to api.anthropic.com (and the typical streaming/non-streaming
// paths under it), parses the JSON body for model/system/messages/tools, and
// taps the streaming SSE response to extract token usage + finish reason from
// the final `message_delta` and `message_stop` events.
//
// @rule:ASD-YK-004 — one proxy, multiple provider adapters
// @rule:ASD-006 — observation only; no modification of request or response

import type {
  ObservedRequest,
  ObservedResponse,
  ProviderAdapter,
  RawRequestSnapshot,
  ResponseObserver,
} from './observer-types.js';

const ANTHROPIC_HOSTS = new Set([
  'api.anthropic.com',
  // Future proofing for regional variants if Anthropic introduces them.
]);

const ANTHROPIC_PATHS = [
  /^\/v\d+\/messages\b/, // /v1/messages, /v2/messages, etc.
  /^\/v\d+\/complete\b/, // legacy Text Completion API
];

export const anthropicAdapter: ProviderAdapter = {
  provider: 'anthropic',

  matches(hostname: string, path: string): boolean {
    if (!ANTHROPIC_HOSTS.has(hostname)) return false;
    return ANTHROPIC_PATHS.some((re) => re.test(path));
  },

  parseRequest(snapshot: RawRequestSnapshot): ObservedRequest {
    const bodyStr = snapshot.body.toString('utf8');
    // Throw on malformed JSON — caller emits a parse_failed event.
    const json = bodyStr.length > 0 ? (JSON.parse(bodyStr) as AnthropicRequestBody) : {};

    const messages = Array.isArray(json.messages) ? json.messages : [];
    const systemPrompt = extractAnthropicSystem(json.system);

    return {
      provider: 'anthropic',
      hostname: snapshot.hostname,
      path: snapshot.path,
      method: snapshot.method,
      model: typeof json.model === 'string' ? json.model : null,
      isStreaming: json.stream === true,
      promptText: concatPromptText(messages, systemPrompt),
      systemPrompt,
      hasTools: Array.isArray(json.tools) && json.tools.length > 0,
      messageCount: messages.length,
      requestBytes: snapshot.body.length,
    };
  },

  createResponseObserver(): ResponseObserver {
    return new AnthropicResponseObserver();
  },
};

// ─── Internals ────────────────────────────────────────────────────────────────

interface AnthropicRequestBody {
  model?: string;
  stream?: boolean;
  messages?: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  tools?: unknown[];
  // ... other fields ignored
}

interface AnthropicMessage {
  role?: string;
  content?: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

/**
 * Anthropic's `system` is either a plain string OR an array of content blocks
 * (each with optional `text`). Normalise both shapes to a single string.
 */
function extractAnthropicSystem(
  system: string | AnthropicContentBlock[] | undefined
): string | null {
  if (!system) return null;
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    const parts: string[] = [];
    for (const block of system) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }
  return null;
}

/**
 * Flatten Anthropic messages array into one prompt string for P2 PII scanning.
 * Concatenates user/assistant text content blocks plus system prompt.
 */
function concatPromptText(messages: AnthropicMessage[], system: string | null): string {
  const parts: string[] = [];
  if (system) parts.push(system);
  for (const m of messages) {
    if (typeof m.content === 'string') {
      parts.push(m.content);
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (typeof block?.text === 'string') parts.push(block.text);
      }
    }
  }
  return parts.join('\n');
}

class AnthropicResponseObserver implements ResponseObserver {
  private bytesObserved = 0;
  private buffer = '';
  private isStreaming = false;
  private promptTokens: number | null = null;
  private completionTokens: number | null = null;
  private finishReason: string | null = null;

  tap(chunk: Buffer): void {
    this.bytesObserved += chunk.length;
    // SSE events arrive as ASCII text. Decode incrementally; complete events
    // are terminated by blank lines. We only need a few specific events
    // (message_start, message_delta) so a tiny line buffer is enough.
    const text = chunk.toString('utf8');
    this.buffer += text;
    // Detect any SSE framing — `data:` at line start signals streaming.
    if (!this.isStreaming && /(^|\n)data:/.test(this.buffer)) {
      this.isStreaming = true;
    }
    // Process complete SSE events (separated by \n\n).
    let idx;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const eventBlock = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      this.handleSseBlock(eventBlock);
    }
  }

  finalize(opts: { statusCode: number; latencyMs: number }): ObservedResponse {
    // Non-streaming responses arrive as a single JSON blob — try to parse the
    // tail of the buffer if we haven't classified yet.
    if (!this.isStreaming && this.buffer.length > 0) {
      try {
        const json = JSON.parse(this.buffer);
        if (json?.usage) {
          this.promptTokens = pickNumber(json.usage.input_tokens);
          this.completionTokens = pickNumber(json.usage.output_tokens);
        }
        if (typeof json?.stop_reason === 'string') {
          this.finishReason = json.stop_reason;
        }
      } catch {
        // Not JSON — leave fields null.
      }
    }
    return {
      statusCode: opts.statusCode,
      responseBytes: this.bytesObserved,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      finishReason: this.finishReason,
      isStreaming: this.isStreaming,
      latencyMs: opts.latencyMs,
    };
  }

  private handleSseBlock(block: string): void {
    // An SSE event may have multiple `data:` lines; concatenate.
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    // Anthropic event types we care about:
    //   message_start  — has message.usage.input_tokens
    //   message_delta  — has delta.stop_reason + usage.output_tokens
    if (json?.type === 'message_start' && json.message?.usage) {
      this.promptTokens = pickNumber(json.message.usage.input_tokens);
      // The early output_tokens count (usually 1-3) refines later via message_delta.
      this.completionTokens = pickNumber(json.message.usage.output_tokens);
    } else if (json?.type === 'message_delta') {
      if (json.usage) {
        this.completionTokens = pickNumber(json.usage.output_tokens);
      }
      if (typeof json.delta?.stop_reason === 'string') {
        this.finishReason = json.delta.stop_reason;
      }
    }
  }
}

function pickNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
