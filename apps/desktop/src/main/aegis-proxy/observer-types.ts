// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — provider observation types
//
// @rule:ASD-YK-004 — one proxy, multiple provider adapters

/** Which upstream LLM provider this request is going to. */
export type Provider = 'anthropic' | 'openai' | 'unknown';

/** What the adapter understood about the request before forwarding. */
export interface ObservedRequest {
  provider: Provider;
  hostname: string;
  path: string;
  method: string;
  /** Adapter-extracted model name, or null if unknown. */
  model: string | null;
  /** True if the client asked for streaming (SSE). */
  isStreaming: boolean;
  /** Concatenated prompt text — used by P2 LakshmanRekha PII scan. */
  promptText: string;
  /** System prompt if present (Anthropic top-level / OpenAI system message). */
  systemPrompt: string | null;
  /** True if the request declared tool/function definitions. */
  hasTools: boolean;
  /** Count of messages in the message array (rough conversation length signal). */
  messageCount: number;
  /** Byte length of the original request body. */
  requestBytes: number;
}

/** What the adapter learned from the upstream response (after it completed). */
export interface ObservedResponse {
  statusCode: number;
  /** Byte length of the upstream response (sum of streamed chunks). */
  responseBytes: number;
  /** Adapter-extracted prompt tokens if provider reported them. */
  promptTokens: number | null;
  /** Adapter-extracted completion tokens if provider reported them. */
  completionTokens: number | null;
  /** Provider-reported finish reason (end_turn / stop / length / etc.) */
  finishReason: string | null;
  /** Whether response was SSE-encoded streaming. */
  isStreaming: boolean;
  /** Total time client request → final response chunk, in milliseconds. */
  latencyMs: number;
}

/** Input the adapter parses to produce ObservedRequest. */
export interface RawRequestSnapshot {
  hostname: string;
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** Pluggable provider adapter interface. */
export interface ProviderAdapter {
  provider: Provider;
  /** Decide if this request is targeted at this provider. */
  matches(hostname: string, path: string): boolean;
  /** Parse a fully-buffered request body. Throw on malformed input. */
  parseRequest(snapshot: RawRequestSnapshot): ObservedRequest;
  /**
   * Build a response observer that watches each chunk. Returns a `tap()`
   * to feed chunks through and a `finalize()` to call when the stream ends.
   */
  createResponseObserver(): ResponseObserver;
}

export interface ResponseObserver {
  /** Feed each response chunk through (must not modify, just observe). */
  tap(chunk: Buffer): void;
  /** Mark stream complete, statusCode provided, latency calculated externally. */
  finalize(opts: { statusCode: number; latencyMs: number }): ObservedResponse;
}
