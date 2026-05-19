// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-038 — WA inbound webhook (signature + parser + server).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { verifyMetaSignature, computeMetaSignature } from '../aegis-proxy/wa-webhook-signature.js';
import { parseWaWebhookPayload } from '../aegis-proxy/wa-webhook-parser.js';
import {
  WaInboundWebhookServer,
  __internals as serverInternals,
} from '../aegis-proxy/wa-inbound-webhook-server.js';
import { PendingDanQueue } from '../aegis-proxy/pending-dan-queue.js';
import {
  __setBackendForTests,
  __resetBackendForTests,
  setWaWebhookCreds,
  getWaWebhookCreds,
  clearWaWebhookCreds,
  hasWaWebhookCreds,
} from '../aegis-proxy/wa-webhook-creds.js';
import type { CredentialBackend } from '../aegis-proxy/dan-carrier-credentials.js';

// ─── verifyMetaSignature ─────────────────────────────────────────────────────

describe('ASD-T-038 — verifyMetaSignature', () => {
  const secret = 'app-secret-test-value';
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('accepts a correct sha256 hex header from computeMetaSignature', () => {
    const header = computeMetaSignature(body, secret);
    expect(verifyMetaSignature(body, header, secret)).toBe(true);
  });

  it('rejects a flipped bit in the body', () => {
    const header = computeMetaSignature(body, secret);
    const tampered = body.replace('whatsapp_business_account', 'spoofed_payload______');
    expect(verifyMetaSignature(tampered, header, secret)).toBe(false);
  });

  it('rejects the wrong app secret', () => {
    const header = computeMetaSignature(body, secret);
    expect(verifyMetaSignature(body, header, 'wrong-secret')).toBe(false);
  });

  it('rejects header missing sha256= prefix', () => {
    expect(verifyMetaSignature(body, 'deadbeef'.repeat(8), secret)).toBe(false);
  });

  it('rejects header with wrong hex length', () => {
    expect(verifyMetaSignature(body, 'sha256=deadbeef', secret)).toBe(false);
  });

  it('rejects non-hex characters in header', () => {
    expect(verifyMetaSignature(body, 'sha256=' + 'zzzz'.repeat(16), secret)).toBe(false);
  });

  it('rejects null / empty / non-string header', () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, '', secret)).toBe(false);
  });

  it('rejects missing app secret', () => {
    const header = computeMetaSignature(body, secret);
    expect(verifyMetaSignature(body, header, '')).toBe(false);
  });

  it('works with Buffer body as well as string', () => {
    const header = computeMetaSignature(body, secret);
    expect(verifyMetaSignature(Buffer.from(body, 'utf8'), header, secret)).toBe(true);
  });
});

// ─── parseWaWebhookPayload ───────────────────────────────────────────────────

describe('ASD-T-038 — parseWaWebhookPayload', () => {
  it('extracts a single text message with from / id / timestamp_iso', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.abc123',
                    from: '15551234567',
                    type: 'text',
                    text: { body: 'y a1b2c3' },
                    timestamp: '1747640400', // 2025-05-19T07:40:00Z
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = parseWaWebhookPayload(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      message_id: 'wamid.abc123',
      from: '15551234567',
      type: 'text',
      text: 'y a1b2c3',
    });
    expect(messages[0]?.timestamp_iso).toBe('2025-05-19T07:40:00.000Z');
  });

  it('skips wrong-object payloads', () => {
    expect(parseWaWebhookPayload({ object: 'page', entry: [] })).toEqual([]);
  });

  it('returns [] on malformed payloads (null, missing entry, etc.)', () => {
    expect(parseWaWebhookPayload(null)).toEqual([]);
    expect(parseWaWebhookPayload({})).toEqual([]);
    expect(parseWaWebhookPayload({ object: 'whatsapp_business_account' })).toEqual([]);
    expect(
      parseWaWebhookPayload({ object: 'whatsapp_business_account', entry: 'not-an-array' })
    ).toEqual([]);
  });

  it('returns text=null on non-text message types', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'm1', from: '15551234567', type: 'image', timestamp: '1747640400' },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = parseWaWebhookPayload(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBeNull();
    expect(messages[0]?.type).toBe('image');
  });

  it('flattens multiple entries × changes × messages', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'm1', from: 'A', type: 'text', text: { body: 'one' }, timestamp: '1' },
                  { id: 'm2', from: 'A', type: 'text', text: { body: 'two' }, timestamp: '2' },
                ],
              },
            },
          ],
        },
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'm3', from: 'B', type: 'text', text: { body: 'three' }, timestamp: '3' },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = parseWaWebhookPayload(payload);
    expect(messages.map((m) => m.message_id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('ignores status updates (only consumes messages)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'm1', status: 'delivered', timestamp: '1' }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWaWebhookPayload(payload)).toEqual([]);
  });
});

// ─── wa-webhook-creds (with injected backend) ─────────────────────────────────

function makeFakeBackend(): CredentialBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getPassword: (s, a) => store.get(`${s}/${a}`) ?? null,
    setPassword: (s, a, v) => store.set(`${s}/${a}`, v),
    deletePassword: (s, a) => store.delete(`${s}/${a}`),
  };
}

describe('ASD-T-038 — wa-webhook-creds', () => {
  beforeEach(() => __setBackendForTests(makeFakeBackend()));
  afterEach(() => __resetBackendForTests());

  it('getWaWebhookCreds returns null when nothing stored', () => {
    expect(getWaWebhookCreds()).toBeNull();
    expect(hasWaWebhookCreds()).toEqual({ configured: false });
  });

  it('setWaWebhookCreds round-trips both fields and auto-generates verify_token', () => {
    const creds = setWaWebhookCreds({ app_secret: 'sec' });
    expect(creds.app_secret).toBe('sec');
    expect(creds.verify_token).toMatch(/^[0-9a-f]{32}$/);
    const loaded = getWaWebhookCreds();
    expect(loaded).toEqual(creds);
  });

  it('setWaWebhookCreds honours user-supplied verify_token', () => {
    const creds = setWaWebhookCreds({ app_secret: 'sec', verify_token: 'my-token' });
    expect(creds.verify_token).toBe('my-token');
  });

  it('setWaWebhookCreds rejects empty app_secret', () => {
    expect(() => setWaWebhookCreds({ app_secret: '' })).toThrow(/app_secret is required/);
  });

  it('clearWaWebhookCreds removes the entry', () => {
    setWaWebhookCreds({ app_secret: 'sec' });
    expect(clearWaWebhookCreds()).toBe(true);
    expect(getWaWebhookCreds()).toBeNull();
  });

  it('hasWaWebhookCreds surfaces an 8-char token preview', () => {
    setWaWebhookCreds({ app_secret: 'sec', verify_token: '1234567890abcdef' });
    expect(hasWaWebhookCreds()).toEqual({
      configured: true,
      verify_token_preview: '12345678',
    });
  });
});

// ─── WaInboundWebhookServer (end-to-end against a real socket) ────────────────

describe('ASD-T-038 — WaInboundWebhookServer', () => {
  const creds = { app_secret: 'app-sec', verify_token: 'verify-tok' };
  let queue: PendingDanQueue;
  let server: WaInboundWebhookServer;
  let port: number;
  let nonce: string;
  let pendingId: string;

  beforeEach(async () => {
    queue = new PendingDanQueue({ timeoutMs: 60_000 });
    queue.hold({
      appId: 'cursor.app',
      hostname: 'api.openai.com',
      highRiskTools: [{ name: 'shell', category: 'shell_exec', matchedBy: 'test' }],
    });
    pendingId = queue.list()[0]!.pendingId;
    nonce = pendingId.slice(0, 6).toLowerCase();
    server = new WaInboundWebhookServer(queue, { loadCreds: () => creds });
    // 0 = let the OS pick a free port — guards against parallel-run collisions.
    const ok = await server.start(0);
    expect(ok).toBe(true);
    port = (server as unknown as { boundPort: number }).boundPort;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('GET handshake echoes hub.challenge on correct verify_token', async () => {
    const url =
      `http://127.0.0.1:${port}/webhook/whatsapp?` +
      `hub.mode=subscribe&hub.verify_token=verify-tok&hub.challenge=42`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('42');
  });

  it('GET handshake returns 403 on wrong verify_token', async () => {
    const url =
      `http://127.0.0.1:${port}/webhook/whatsapp?` +
      `hub.mode=subscribe&hub.verify_token=NOPE&hub.challenge=42`;
    const res = await fetch(url);
    expect(res.status).toBe(403);
  });

  it('POST without signature returns 401', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(res.status).toBe(401);
  });

  it('POST with valid signature + matching nonce resolves the held DAN', async () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.x',
                    from: '15551234567',
                    type: 'text',
                    text: { body: `y ${nonce}` },
                    timestamp: '1747640400',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = computeMetaSignature(body, creds.app_secret);
    const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
      body,
    });
    expect(res.status).toBe(200);
    // Wait for setImmediate dispatch.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(queue.list().some((q) => q.pendingId === pendingId)).toBe(false);
    expect(server.stats().dispatched).toBe(1);
  });

  it('POST with valid signature but unrelated text is ignored gracefully', async () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.y',
                    from: '15551234567',
                    type: 'text',
                    text: { body: 'hello there' },
                    timestamp: '1747640400',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = computeMetaSignature(body, creds.app_secret);
    const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
      body,
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(queue.list()).toHaveLength(1); // pending hold still there
    expect(server.stats().dispatched).toBe(0);
  });

  it('POST with tampered body fails signature → 401, DAN untouched', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const sig = computeMetaSignature(body, creds.app_secret);
    const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
      body: body + 'TAMPER',
    });
    expect(res.status).toBe(401);
    expect(server.stats().sigFailures).toBe(1);
    expect(queue.list()).toHaveLength(1);
  });

  it('GET to wrong path returns 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/some/other/path`);
    expect(res.status).toBe(404);
  });

  it('unsupported method returns 405', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, { method: 'PUT' });
    expect(res.status).toBe(405);
  });

  it('start() returns false if creds missing', async () => {
    const noCredsServer = new WaInboundWebhookServer(queue, { loadCreds: () => null });
    expect(await noCredsServer.start(0)).toBe(false);
  });

  it('start() returns false if already running', async () => {
    expect(await server.start(0)).toBe(false);
  });

  it('dispatchOne handles "no-text" + "unparseable" correctly', () => {
    expect(server.dispatchOne({ text: null, from: 'x', message_id: 'm' })).toEqual({
      kind: 'ignored',
      reason: 'no-text',
    });
    expect(server.dispatchOne({ text: 'just chatting', from: 'x', message_id: 'm' })).toEqual({
      kind: 'ignored',
      reason: 'unparseable',
    });
    expect(server.dispatchOne({ text: 'y ffffff', from: 'x', message_id: 'm' })).toEqual({
      kind: 'parsed-no-match',
      nonce: 'ffffff',
    });
  });
});

describe('ASD-T-038 — module constants', () => {
  it('bind host is loopback only (ASD-001 invariant for the webhook)', () => {
    expect(serverInternals.BIND_HOST).toBe('127.0.0.1');
  });
  it('webhook path is /webhook/whatsapp', () => {
    expect(serverInternals.WEBHOOK_PATH).toBe('/webhook/whatsapp');
  });
  it('body cap is 256 KB (Meta payloads are <10 KB; this is defense-in-depth)', () => {
    expect(serverInternals.MAX_BODY_BYTES).toBe(256 * 1024);
  });
});
