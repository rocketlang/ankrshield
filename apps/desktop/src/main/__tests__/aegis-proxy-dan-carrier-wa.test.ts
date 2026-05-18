// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-017 WhatsAppDanCarrier.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { WhatsAppDanCarrier } from '../aegis-proxy/dan-carrier-wa.js';
import type { DanRequest } from '../aegis-proxy/pending-dan-queue.js';

const REQ: DanRequest = {
  pendingId: 'p-1',
  appId: 'cursor',
  hostname: 'api.anthropic.com',
  heldAt: '2026-05-18T10:00:00.000Z',
  timeoutMs: 30000,
  highRiskTools: [{ name: 'bash', category: 'shell_exec', matchedBy: 'name:bash' }],
};

const VALID_CREDS = {
  phone_number_id: '987654',
  access_token: 'EAAxxx',
  to_number: '+15551234567',
};

// vitest's spyOn generic narrowing changed across versions — let TS infer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let warnSpy: any;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

/** Drain pending microtasks + a macrotask so fetch→then→text→warn settles. */
function flushAllPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flushFetchChain(fetchMock: ReturnType<typeof vi.fn>): Promise<void> {
  // First wait for the fetch promise itself to settle, then drain.
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

describe('ASD-T-017 — WhatsAppDanCarrier', () => {
  it('no-ops when credentials are unset', () => {
    const fetchImpl = vi.fn();
    const carrier = new WhatsAppDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => null,
    });
    carrier.notify(REQ);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('POSTs to Graph API messages endpoint with bearer auth', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"messages":[{"id":"x"}]}', { status: 200 }));
    const carrier = new WhatsAppDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    carrier.notify(REQ);
    await flushAllPromises();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://graph.facebook.com/v18.0/${encodeURIComponent(VALID_CREDS.phone_number_id)}/messages`
    );
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${VALID_CREDS.access_token}`);
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe(VALID_CREDS.to_number);
    expect(body.type).toBe('text');
    expect(body.text.body).toContain('cursor');
    expect(body.text.body).toContain('bash');
    expect(body.text.body).toContain('shell_exec');
    expect(body.text.body).toContain('api.anthropic.com');
  });

  it('honours graphApiVersion override', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const carrier = new WhatsAppDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
      graphApiVersion: 'v20.0',
    });
    carrier.notify(REQ);
    await flushAllPromises();
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('/v20.0/');
  });

  it('logs (but does not throw) when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const carrier = new WhatsAppDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    expect(() => carrier.notify(REQ)).not.toThrow();
    await flushFetchChain(fetchImpl);
    expect(warnSpy).toHaveBeenCalled();
    const warnText = warnSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('|');
    expect(warnText).toMatch(/WhatsApp DAN notify error/);
  });

  it('logs non-2xx upstream responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"invalid token"}', { status: 401 }));
    const carrier = new WhatsAppDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    carrier.notify(REQ);
    await flushFetchChain(fetchImpl);
    const warnText = warnSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('|');
    expect(warnText).toMatch(/WhatsApp DAN notify failed 401/);
  });

  it('multiple HIGH tools surface "+ N more" in message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const carrier = new WhatsAppDanCarrier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    carrier.notify({
      ...REQ,
      highRiskTools: [
        { name: 'bash', category: 'shell_exec', matchedBy: 'x' },
        { name: 'execute_sql', category: 'database_ddl', matchedBy: 'x' },
        { name: 'charge_card', category: 'payment_api_call', matchedBy: 'x' },
      ],
    });
    await flushAllPromises();
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.text.body).toMatch(/\+ 2 more/);
  });

  it('no-op when fetch is unavailable in runtime', () => {
    const carrier = new WhatsAppDanCarrier({
      fetchImpl: undefined as unknown as typeof fetch,
      loadCreds: () => VALID_CREDS,
    });
    expect(() => carrier.notify(REQ)).not.toThrow();
  });
});
