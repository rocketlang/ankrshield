// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-017 TelegramDanCarrier.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { TelegramDanCarrier } from '../aegis-proxy/dan-carrier-tg.js';
import type { DanRequest } from '../aegis-proxy/pending-dan-queue.js';

const REQ: DanRequest = {
  pendingId: 'p-2',
  appId: 'claude-desktop',
  hostname: 'api.openai.com',
  heldAt: '2026-05-18T10:00:00.000Z',
  timeoutMs: 30000,
  highRiskTools: [{ name: 'execute_sql', category: 'database_ddl', matchedBy: 'name:sql' }],
};

const VALID_CREDS = { bot_token: '1234567:AAHelloWorld', chat_id: '987654321' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let warnSpy: any;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

function flushAllPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flushFetchChain(fetchMock: ReturnType<typeof vi.fn>): Promise<void> {
  const last = fetchMock.mock.results[fetchMock.mock.results.length - 1];
  if (last && last.value && typeof (last.value as Promise<unknown>).then === 'function') {
    try {
      await last.value;
    } catch {
      // intentional — rejection still queues .catch handler
    }
  }
  await flushAllPromises();
}

describe('ASD-T-017 — TelegramDanCarrier', () => {
  it('no-ops when credentials unset', () => {
    const fetchImpl = vi.fn();
    const carrier = new TelegramDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => null,
    });
    carrier.notify(REQ);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs to sendMessage with bot token in URL + chat_id in body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const carrier = new TelegramDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    carrier.notify(REQ);
    await flushAllPromises();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.telegram.org/bot${encodeURIComponent(VALID_CREDS.bot_token)}/sendMessage`
    );
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe(VALID_CREDS.chat_id);
    expect(body.text).toContain('claude-desktop');
    expect(body.text).toContain('execute_sql');
    expect(body.text).toContain('database_ddl');
    expect(body.text).toContain('api.openai.com');
  });

  it('logs (does not throw) on fetch rejection', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('timeout'));
    const carrier = new TelegramDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    expect(() => carrier.notify(REQ)).not.toThrow();
    await flushFetchChain(fetchImpl);
    expect(warnSpy).toHaveBeenCalled();
    const warnText = warnSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('|');
    expect(warnText).toMatch(/Telegram DAN notify error/);
  });

  it('logs non-2xx upstream responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{"ok":false,"error_code":401,"description":"Unauthorized"}', { status: 401 })
      );
    const carrier = new TelegramDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    carrier.notify(REQ);
    await flushFetchChain(fetchImpl);
    const warnText = warnSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('|');
    expect(warnText).toMatch(/Telegram DAN notify failed 401/);
  });

  it('URL-encodes bot tokens that contain special characters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const carrier = new TelegramDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => ({ bot_token: 'bot/with:slash?weird=stuff', chat_id: '1' }),
    });
    carrier.notify(REQ);
    await flushAllPromises();
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent('bot/with:slash?weird=stuff'));
    expect(url).not.toContain('?weird=stuff');
  });

  it('no-op when fetch unavailable in runtime', () => {
    const carrier = new TelegramDanCarrier({
      fetchImpl: undefined as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    expect(() => carrier.notify(REQ)).not.toThrow();
  });
});
