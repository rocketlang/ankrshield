/**
 * @ankrshield/ai-warrior — LLM Client
 *
 * Wraps the Anthropic SDK. Handles retries, JSON parsing,
 * and graceful degradation when the API is unavailable.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface LLMMessage {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export class WarriorLLMClient {
  private client: Anthropic;
  private model: string;
  private maxRetries = 2;

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey, maxRetries: this.maxRetries });
    this.model = model;
  }

  /**
   * Send a prompt and get a plain-text response.
   */
  async complete(systemPrompt: string, userPrompt: string): Promise<LLMMessage> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: this.model,
    };
  }

  /**
   * Send a prompt expecting a JSON response.
   * Automatically parses and returns typed JSON.
   * Falls back to `fallback` value on parse failure.
   */
  async completeJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    fallback: T,
  ): Promise<T> {
    try {
      const msg = await this.complete(systemPrompt, userPrompt);

      // Extract JSON from fenced code blocks if present
      const jsonMatch =
        msg.content.match(/```json\s*([\s\S]*?)```/) ??
        msg.content.match(/```\s*([\s\S]*?)```/);

      const raw = jsonMatch ? jsonMatch[1].trim() : msg.content.trim();
      return JSON.parse(raw) as T;
    } catch {
      // LLM unavailable or returned bad JSON — return fallback silently
      return fallback;
    }
  }
}
