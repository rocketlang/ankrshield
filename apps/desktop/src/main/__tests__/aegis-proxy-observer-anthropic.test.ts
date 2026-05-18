// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-004 Anthropic adapter.

import { describe, it, expect } from 'vitest';

import { anthropicAdapter } from '../aegis-proxy/observer-anthropic.js';

describe('ASD-T-004 — Anthropic adapter', () => {
  describe('matches()', () => {
    it.each([
      ['api.anthropic.com', '/v1/messages', true],
      ['api.anthropic.com', '/v1/messages?beta=1', true],
      ['api.anthropic.com', '/v2/messages', true],
      ['api.anthropic.com', '/v1/complete', true],
      ['api.anthropic.com', '/v1/files', false],
      ['api.anthropic.com', '/', false],
      ['api.openai.com', '/v1/messages', false],
      ['example.com', '/v1/messages', false],
    ])('matches(%s, %s) → %s', (host, path, expected) => {
      expect(anthropicAdapter.matches(host, path)).toBe(expected);
    });
  });

  describe('parseRequest()', () => {
    it('parses model, messages, system, tools, streaming flag', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'claude-opus-4-7',
          stream: true,
          system: 'You are a helpful assistant.',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
            { role: 'user', content: 'How are you?' },
          ],
          tools: [{ name: 'get_weather', description: 'weather lookup' }],
        })
      );
      const obs = anthropicAdapter.parseRequest({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.provider).toBe('anthropic');
      expect(obs.model).toBe('claude-opus-4-7');
      expect(obs.isStreaming).toBe(true);
      expect(obs.systemPrompt).toBe('You are a helpful assistant.');
      expect(obs.messageCount).toBe(3);
      expect(obs.hasTools).toBe(true);
      expect(obs.promptText).toContain('You are a helpful assistant');
      expect(obs.promptText).toContain('Hello');
      expect(obs.promptText).toContain('How are you?');
      expect(obs.requestBytes).toBe(body.length);
    });

    it('handles array-form system prompt (content blocks)', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'claude-opus-4-7',
          system: [
            { type: 'text', text: 'First instruction.' },
            { type: 'text', text: 'Second instruction.' },
          ],
          messages: [{ role: 'user', content: 'x' }],
        })
      );
      const obs = anthropicAdapter.parseRequest({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.systemPrompt).toBe('First instruction.\nSecond instruction.');
    });

    it('handles array-form message content (content blocks)', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'claude-opus-4-7',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Look at this image:' },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: '...' } },
                { type: 'text', text: 'What do you see?' },
              ],
            },
          ],
        })
      );
      const obs = anthropicAdapter.parseRequest({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.promptText).toContain('Look at this image:');
      expect(obs.promptText).toContain('What do you see?');
      expect(obs.messageCount).toBe(1);
    });

    it('isStreaming=false when stream omitted', () => {
      const body = Buffer.from(
        JSON.stringify({
          model: 'claude-opus-4-7',
          messages: [{ role: 'user', content: 'hi' }],
        })
      );
      const obs = anthropicAdapter.parseRequest({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body,
      });
      expect(obs.isStreaming).toBe(false);
    });

    it('throws on malformed JSON', () => {
      const body = Buffer.from('not valid json');
      expect(() =>
        anthropicAdapter.parseRequest({
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {},
          body,
        })
      ).toThrow();
    });
  });

  describe('createResponseObserver()', () => {
    it('parses non-streaming JSON response for usage + stop_reason', () => {
      const observer = anthropicAdapter.createResponseObserver();
      const responseJson = JSON.stringify({
        id: 'msg_01',
        type: 'message',
        content: [{ type: 'text', text: 'Hello back' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 4 },
      });
      observer.tap(Buffer.from(responseJson));
      const obs = observer.finalize({ statusCode: 200, latencyMs: 87 });
      expect(obs.statusCode).toBe(200);
      expect(obs.isStreaming).toBe(false);
      expect(obs.promptTokens).toBe(12);
      expect(obs.completionTokens).toBe(4);
      expect(obs.finishReason).toBe('end_turn');
      expect(obs.responseBytes).toBe(responseJson.length);
      expect(obs.latencyMs).toBe(87);
    });

    it('parses streaming SSE message_start + message_delta', () => {
      const observer = anthropicAdapter.createResponseObserver();
      const events = [
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":50,"output_tokens":1}}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":17}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
        '',
      ].join('\n');
      // Feed in two chunks to verify boundary handling.
      observer.tap(Buffer.from(events.slice(0, 120)));
      observer.tap(Buffer.from(events.slice(120)));
      const obs = observer.finalize({ statusCode: 200, latencyMs: 1234 });
      expect(obs.isStreaming).toBe(true);
      expect(obs.promptTokens).toBe(50);
      expect(obs.completionTokens).toBe(17);
      expect(obs.finishReason).toBe('end_turn');
    });

    it('handles chunk boundary mid-event without losing data', () => {
      const observer = anthropicAdapter.createResponseObserver();
      const eventStr =
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":99,"output_tokens":1}}}\n\n';
      // Split at every byte to stress-test buffer reassembly.
      for (const ch of eventStr) observer.tap(Buffer.from(ch));
      const obs = observer.finalize({ statusCode: 200, latencyMs: 1 });
      expect(obs.promptTokens).toBe(99);
    });
  });
});
