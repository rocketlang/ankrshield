// LakshmanRekha — Probe Execution Engine
// @rule:ASMAI-S-005 — BYOK: customer API key used only within scan window; never logged plaintext
// @rule:ASMAI-S-006 — ownership verification required before probe execution

import { classifyResponse } from './classifier.js';
import type { ProbeDefinition, ProbeVerdict } from './registry.js';

export interface RunProbeOptions {
  probe: ProbeDefinition;
  endpoint_url: string;
  api_key: string;
  api_type: 'openai' | 'anthropic' | 'azure' | 'ankr_proxy';
  timeout_ms?: number;
}

export interface ProbeRunResult {
  probe_id: string;
  verdict: ProbeVerdict;
  duration_ms: number;
  response_snippet: string; // first 200 chars only — never log full response
  error?: string;
}

// @rule:ASMAI-S-005 — mask API key in logs; only first 4 + last 4 chars visible
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// Build OpenAI-compatible messages array from probe payload
function buildOpenAIMessages(
  payload: string | string[]
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  if (typeof payload === 'string') {
    return [{ role: 'user', content: payload }];
  }

  return payload.map((turn) => {
    if (turn.startsWith('__system__:')) {
      return { role: 'system' as const, content: turn.slice('__system__:'.length) };
    }
    if (turn.startsWith('__assistant__:')) {
      return { role: 'assistant' as const, content: turn.slice('__assistant__:'.length) };
    }
    // Default: user turn (strips __user__: prefix if present)
    const content = turn.startsWith('__user__:') ? turn.slice('__user__:'.length) : turn;
    return { role: 'user' as const, content };
  });
}

// Build Anthropic-compatible messages from payload
function buildAnthropicPayload(payload: string | string[]): {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const messages = buildOpenAIMessages(payload);
  const systemMsg = messages.find((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system') as Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  return {
    system: systemMsg?.content,
    messages: nonSystem,
  };
}

async function callOpenAICompat(
  endpoint_url: string,
  api_key: string,
  messages: Array<{ role: string; content: string }>,
  timeout_ms: number
): Promise<string> {
  const base = endpoint_url.replace(/\/$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api_key}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 512,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data?.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(
  endpoint_url: string,
  api_key: string,
  payload: { system?: string; messages: Array<{ role: string; content: string }> },
  timeout_ms: number
): Promise<string> {
  const base = endpoint_url.replace(/\/$/, '');
  const url = base.endsWith('/messages') ? base : `${base}/messages`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const body: Record<string, unknown> = {
      model: 'claude-haiku-20240307',
      max_tokens: 512,
      messages: payload.messages,
    };
    if (payload.system) body['system'] = payload.system;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return data?.content?.find((c) => c.type === 'text')?.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}

async function callAnkrProxy(
  endpoint_url: string,
  api_key: string,
  messages: Array<{ role: string; content: string }>,
  timeout_ms: number
): Promise<string> {
  // ANKR AI proxy uses OpenAI-compatible format with Bearer auth
  return callOpenAICompat(endpoint_url, api_key, messages, timeout_ms);
}

// @rule:ASMAI-S-001 — probe execution produces deterministic binary verdict
// @rule:ASMAI-S-005 — API key never written to logs or DB; only masked form logged
export async function runProbe(opts: RunProbeOptions): Promise<ProbeRunResult> {
  const { probe, endpoint_url, api_key, api_type, timeout_ms = 15000 } = opts;
  const t0 = Date.now();

  // Mask key for any logging — never log plaintext
  const _maskedKey = maskKey(api_key);

  try {
    let responseText = '';

    if (api_type === 'anthropic') {
      const anthropicPayload = buildAnthropicPayload(probe.payload);
      responseText = await callAnthropic(endpoint_url, api_key, anthropicPayload, timeout_ms);
    } else if (api_type === 'ankr_proxy') {
      const messages = buildOpenAIMessages(probe.payload);
      responseText = await callAnkrProxy(endpoint_url, api_key, messages, timeout_ms);
    } else {
      // openai or azure — both use OpenAI-compatible format
      const messages = buildOpenAIMessages(probe.payload);
      responseText = await callOpenAICompat(endpoint_url, api_key, messages, timeout_ms);
    }

    // @rule:ASMAI-S-003 — classification is deterministic
    const verdict = classifyResponse(responseText, probe.id);
    const duration_ms = Date.now() - t0;

    // Only store first 200 chars of response — never log full response
    const response_snippet = responseText.slice(0, 200);

    return {
      probe_id: probe.id,
      verdict,
      duration_ms,
      response_snippet,
    };
  } catch (err) {
    const duration_ms = Date.now() - t0;
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      probe_id: probe.id,
      verdict: 'errored',
      duration_ms,
      response_snippet: '',
      error: errorMsg.slice(0, 200),
    };
  }
}
