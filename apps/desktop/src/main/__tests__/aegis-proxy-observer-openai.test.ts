// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-005 OpenAI adapter.

import { describe, it, expect } from 'vitest';

import { openaiAdapter } from '../aegis-proxy/observer-openai.js';

describe('ASD-T-005 — OpenAI adapter', () => {
  describe('matches()', () => {
    it.each([
      ['api.openai.com', '/v1/chat/completions', true],
      ['api.openai.com', '/v2/chat/completions', true],
      ['api.openai.com', '/v1/embeddings', true],
      ['api.openai.com', '/v1/completions', true],
      ['api.openai.com', '/v1/audio/speech', false],
      ['api.anthropic.com', '/v1/chat/completions', false],
    ])('matches(%s, %s) → %s', (host, path, expected) => {
      expect(openaiAdapter.matches(host, path)).toBe(expected);
    });
  });

  describe('parseRequest()', () => {
    it('parses model, messages, system message, tools/functions, streaming flag', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'gpt-4o',
          stream: true,
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' },
            { role: 'user', content: 'How are you?' },
          ],
          tools: [{ type: 'function', function: { name: 'get_weather' } }],
        })
      );
      const obs = openaiAdapter.parseRequest({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.provider).toBe('openai');
      expect(obs.model).toBe('gpt-4o');
      expect(obs.isStreaming).toBe(true);
      expect(obs.systemPrompt).toBe('You are helpful.');
      expect(obs.messageCount).toBe(4);
      expect(obs.hasTools).toBe(true);
      expect(obs.promptText).toContain('Hi');
      expect(obs.promptText).toContain('How are you?');
      expect(obs.requestBytes).toBe(body.length);
    });

    it('handles legacy "functions" param as hasTools=true', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'x' }],
          functions: [{ name: 'foo', parameters: {} }],
        })
      );
      const obs = openaiAdapter.parseRequest({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.hasTools).toBe(true);
    });

    it('handles multi-modal content array in messages', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe' },
                { type: 'image_url', image_url: { url: 'https://...' } },
                { type: 'text', text: 'this' },
              ],
            },
          ],
        })
      );
      const obs = openaiAdapter.parseRequest({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.promptText).toContain('Describe');
      expect(obs.promptText).toContain('this');
    });

    it('isStreaming=false when stream omitted', () => {
      const body = Buffer.from(
        JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })
      );
      const obs = openaiAdapter.parseRequest({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.isStreaming).toBe(false);
    });
  });

  describe('createResponseObserver()', () => {
    it('parses non-streaming JSON response for usage + finish_reason', () => {
      const observer = openaiAdapter.createResponseObserver();
      const responseJson = JSON.stringify({
        id: 'chatcmpl_1',
        choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
      });
      observer.tap(Buffer.from(responseJson));
      const obs = observer.finalize({ statusCode: 200, latencyMs: 42 });
      expect(obs.statusCode).toBe(200);
      expect(obs.isStreaming).toBe(false);
      expect(obs.promptTokens).toBe(8);
      expect(obs.completionTokens).toBe(2);
      expect(obs.finishReason).toBe('stop');
    });

    it('parses streaming SSE chunks and finish_reason from last delta', () => {
      const observer = openaiAdapter.createResponseObserver();
      const sse = [
        'data: {"id":"x","choices":[{"delta":{"role":"assistant"}}]}',
        '',
        'data: {"id":"x","choices":[{"delta":{"content":"Hi"}}]}',
        '',
        'data: {"id":"x","choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n');
      observer.tap(Buffer.from(sse));
      const obs = observer.finalize({ statusCode: 200, latencyMs: 99 });
      expect(obs.isStreaming).toBe(true);
      expect(obs.finishReason).toBe('stop');
      // Usage NOT present in default streaming → tokens stay null.
      expect(obs.promptTokens).toBeNull();
      expect(obs.completionTokens).toBeNull();
    });

    it('extracts usage from streaming when stream_options.include_usage=true', () => {
      const observer = openaiAdapter.createResponseObserver();
      const sse = [
        'data: {"id":"x","choices":[{"delta":{"content":"Hi"}}]}',
        '',
        'data: {"id":"x","choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        // Final chunk with usage (when include_usage is set).
        'data: {"id":"x","choices":[],"usage":{"prompt_tokens":15,"completion_tokens":3,"total_tokens":18}}',
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n');
      observer.tap(Buffer.from(sse));
      const obs = observer.finalize({ statusCode: 200, latencyMs: 50 });
      expect(obs.promptTokens).toBe(15);
      expect(obs.completionTokens).toBe(3);
    });

    it('handles chunk boundary mid-event', () => {
      const observer = openaiAdapter.createResponseObserver();
      const sse = 'data: {"id":"x","choices":[{"delta":{},"finish_reason":"length"}]}\n\n';
      for (const ch of sse) observer.tap(Buffer.from(ch));
      const obs = observer.finalize({ statusCode: 200, latencyMs: 1 });
      expect(obs.finishReason).toBe('length');
    });
  });
});
