/**
 * @ankrshield/ai-warrior — LLM Client
 *
 * Two backends, selected via constructor options:
 *
 *   1. ANKR AI Proxy  (default in demo/dev)
 *      POST http://localhost:4444/api/ai/complete
 *      Requires no API key — routes via free_first strategy (DeepSeek/Groq/etc.)
 *
 *   2. Anthropic SDK  (production / Claude Max)
 *      Direct API call — requires ANTHROPIC_API_KEY
 *
 * Priority: if proxyUrl is set → use proxy; else use Anthropic SDK.
 */

import AnthropicSDK from '@anthropic-ai/sdk';

export interface LLMMessage {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface WarriorLLMOptions {
  /** ANKR AI proxy base URL (e.g. http://localhost:4444). If set, proxy is used. */
  proxyUrl?: string;
  /** Routing strategy for the proxy (default: 'free_first') */
  proxyStrategy?: 'free_first' | 'cheapest' | 'fastest' | 'quality';
  /** Anthropic API key — only used when proxyUrl is NOT set */
  anthropicApiKey?: string;
  /** Model name used when calling Anthropic directly */
  model?: string;
}

export class WarriorLLMClient {
  private proxyUrl: string | undefined;
  private proxyStrategy: string;
  private anthropic: AnthropicSDK | undefined;
  private model: string;

  constructor(opts: WarriorLLMOptions) {
    this.proxyUrl = opts.proxyUrl?.replace(/\/$/, '');
    this.proxyStrategy = opts.proxyStrategy ?? 'free_first';
    this.model = opts.model ?? 'claude-sonnet-4-6';

    if (!this.proxyUrl) {
      if (!opts.anthropicApiKey) {
        throw new Error('WarriorLLMClient: either proxyUrl or anthropicApiKey must be provided');
      }
      this.anthropic = new AnthropicSDK({ apiKey: opts.anthropicApiKey, maxRetries: 2 });
    }
  }

  /** Send a prompt and get a plain-text response. */
  async complete(systemPrompt: string, userPrompt: string): Promise<LLMMessage> {
    if (this.proxyUrl) {
      return this.completeViaProxy(systemPrompt, userPrompt);
    }
    return this.completeViaAnthropic(systemPrompt, userPrompt);
  }

  /** Send a prompt expecting a JSON response. Falls back to `fallback` on error. */
  async completeJSON<T>(systemPrompt: string, userPrompt: string, fallback: T): Promise<T> {
    try {
      const msg = await this.complete(systemPrompt, userPrompt);
      const jsonMatch =
        msg.content.match(/```json\s*([\s\S]*?)```/) ?? msg.content.match(/```\s*([\s\S]*?)```/);
      const raw = jsonMatch ? jsonMatch[1].trim() : msg.content.trim();
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async completeViaProxy(systemPrompt: string, userPrompt: string): Promise<LLMMessage> {
    // Combine system + user prompts for single-turn proxy API
    const combined = systemPrompt ? `${systemPrompt}\n\n---\n\n${userPrompt}` : userPrompt;

    const res = await fetch(`${this.proxyUrl}/api/ai/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: combined,
        strategy: this.proxyStrategy,
        persona: 'GENERAL',
      }),
    });

    if (!res.ok) {
      throw new Error(`ANKR AI proxy returned ${res.status}`);
    }

    const data = (await res.json()) as {
      content: string;
      provider?: string;
      latencyMs?: number;
    };

    return {
      content: data.content ?? '',
      inputTokens: 0,
      outputTokens: 0,
      model: data.provider ?? 'ankr-proxy',
    };
  }

  private async completeViaAnthropic(
    systemPrompt: string,
    userPrompt: string
  ): Promise<LLMMessage> {
    if (!this.anthropic) throw new Error('Anthropic client not initialised');

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: this.model,
    };
  }
}
