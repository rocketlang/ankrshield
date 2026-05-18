// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — OpenAI Chat Completions adapter (ASD-T-005)
//
// Detects requests to api.openai.com (and the typical chat-completions paths),
// parses model/messages/tool_choice/functions, and taps SSE streaming responses.
// OpenAI does NOT include token usage in streaming responses by default; the
// observer falls back to byte-counting unless the client opted in via
// stream_options.include_usage=true (we parse that signal regardless).
//
// @rule:ASD-YK-004 — one proxy, multiple provider adapters
// @rule:ASD-006 — observation only

import type {
  ObservedResponse,
  ParsedRequest,
  ProviderAdapter,
  RawRequestSnapshot,
  ResponseObserver,
} from './observer-types.js';

const OPENAI_HOSTS = new Set([
  'api.openai.com',
  // OpenAI-compatible endpoints (Azure, OpenRouter, Together) use different
  // hostnames; this adapter is OpenAI-proper only. Compatible hosts get their
  // own future adapters.
]);

const OPENAI_PATHS = [
  /^\/v\d+\/chat\/completions\b/,
  /^\/v\d+\/completions\b/, // legacy
  /^\/v\d+\/embeddings\b/,
];

export const openaiAdapter: ProviderAdapter = {
  provider: 'openai',

  matches(hostname: string, path: string): boolean {
    if (!OPENAI_HOSTS.has(hostname)) return false;
    return OPENAI_PATHS.some((re) => re.test(path));
  },

  parseRequest(snapshot: RawRequestSnapshot): ParsedRequest {
    const bodyStr = snapshot.body.toString('utf8');
    const json = bodyStr.length > 0 ? (JSON.parse(bodyStr) as OpenAIRequestBody) : {};

    const messages = Array.isArray(json.messages) ? json.messages : [];
    const systemPrompt = extractOpenAISystem(messages);
    const hasTools =
      (Array.isArray(json.tools) && json.tools.length > 0) ||
      (Array.isArray(json.functions) && json.functions.length > 0);

    return {
      provider: 'openai',
      hostname: snapshot.hostname,
      path: snapshot.path,
      method: snapshot.method,
      model: typeof json.model === 'string' ? json.model : null,
      isStreaming: json.stream === true,
      promptText: concatPromptText(messages),
      systemPrompt,
      hasTools,
      messageCount: messages.length,
      requestBytes: snapshot.body.length,
    };
  },

  createResponseObserver(): ResponseObserver {
    return new OpenAIResponseObserver();
  },
};

// ─── Internals ────────────────────────────────────────────────────────────────

interface OpenAIRequestBody {
  model?: string;
  stream?: boolean;
  messages?: OpenAIMessage[];
  tools?: unknown[];
  functions?: unknown[];
  stream_options?: { include_usage?: boolean };
}

interface OpenAIMessage {
  role?: string;
  content?: string | OpenAIContentPart[];
}

interface OpenAIContentPart {
  type?: string;
  text?: string;
}

function extractOpenAISystem(messages: OpenAIMessage[]): string | null {
  for (const m of messages) {
    if (m.role === 'system') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        const parts: string[] = [];
        for (const part of m.content) {
          if (typeof part?.text === 'string') parts.push(part.text);
        }
        if (parts.length > 0) return parts.join('\n');
      }
    }
  }
  return null;
}

function concatPromptText(messages: OpenAIMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      parts.push(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (typeof part?.text === 'string') parts.push(part.text);
      }
    }
  }
  return parts.join('\n');
}

class OpenAIResponseObserver implements ResponseObserver {
  private bytesObserved = 0;
  private buffer = '';
  private isStreaming = false;
  private promptTokens: number | null = null;
  private completionTokens: number | null = null;
  private finishReason: string | null = null;

  tap(chunk: Buffer): void {
    this.bytesObserved += chunk.length;
    const text = chunk.toString('utf8');
    this.buffer += text;
    if (!this.isStreaming && /(^|\n)data:/.test(this.buffer)) {
      this.isStreaming = true;
    }
    let idx;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      this.handleSseBlock(block);
    }
  }

  finalize(opts: { statusCode: number; latencyMs: number }): ObservedResponse {
    if (!this.isStreaming && this.buffer.length > 0) {
      try {
        const json = JSON.parse(this.buffer);
        if (json?.usage) {
          this.promptTokens = pickNumber(json.usage.prompt_tokens);
          this.completionTokens = pickNumber(json.usage.completion_tokens);
        }
        const choice = Array.isArray(json?.choices) ? json.choices[0] : null;
        if (choice && typeof choice.finish_reason === 'string') {
          this.finishReason = choice.finish_reason;
        }
      } catch {
        // not JSON — leave nulls
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
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    if (data === '[DONE]') return; // OpenAI's stream-end sentinel
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    // Choices[0].finish_reason populated on the final delta chunk.
    const choice = Array.isArray(json?.choices) ? json.choices[0] : null;
    if (choice && typeof choice.finish_reason === 'string') {
      this.finishReason = choice.finish_reason;
    }
    // Usage chunk only present when stream_options.include_usage=true.
    if (json?.usage) {
      this.promptTokens = pickNumber(json.usage.prompt_tokens);
      this.completionTokens = pickNumber(json.usage.completion_tokens);
    }
  }
}

function pickNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
