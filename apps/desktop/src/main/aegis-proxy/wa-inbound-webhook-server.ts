// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — WA inbound webhook server (ASD-T-038)
//
// Localhost-only HTTP server that Meta will POST to (via a user-managed
// tunnel: cloudflared / ngrok / Tailscale Funnel — any tunnel works).
//
// Endpoints:
//   GET  /webhook/whatsapp?hub.mode=…&hub.verify_token=…&hub.challenge=…
//     → Meta's first-time verification handshake; we echo the challenge
//       when verify_token matches the keychain-stored value.
//   POST /webhook/whatsapp
//     → Signed message delivery. We MUST verify X-Hub-Signature-256
//       against the keychain-stored app_secret BEFORE parsing the body
//       (ASD-004 deny-first). On success, parse via parseWaWebhookPayload
//       and dispatch text messages through parseDanReply →
//       pendingDan.resolveByNonce — same path the renderer uses.
//
// Architecture choice: plain node:http, not Fastify. The desktop app
// already uses node:http for the AEGIS proxy itself (apps/desktop/src/
// main/aegis-proxy/server.ts) — no new runtime dep, smaller binary.
//
// Bind address: 127.0.0.1 only. The user runs `cloudflared tunnel
// --url http://localhost:4859` to expose. Never expose on 0.0.0.0
// directly — this matches the ASD-001 invariant for the proxy.
//
// @rule:ASD-001 — webhook server binds loopback only.
// @rule:ASD-003 — app_secret + verify_token from OS keychain only.
// @rule:ASD-004 — failure mode is deny: bad sig → 401, bad token → 403.
// @rule:ASD-008 — DAN gate carrier inbound (WA half); off by default.
// @rule:ASD-YK-005 — nonce binds reply to a specific in-flight hold.

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import type { PendingDanQueue } from './pending-dan-queue.js';
import { parseDanReply } from './dan-inbound-parser.js';
import { parseWaWebhookPayload } from './wa-webhook-parser.js';
import { verifyMetaSignature } from './wa-webhook-signature.js';
import { getWaWebhookCreds, type WaWebhookCredentials } from './wa-webhook-creds.js';

const WEBHOOK_PATH = '/webhook/whatsapp';
const BIND_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 256 * 1024; // 256 KB — Meta payloads are small

export type WaInboundDispatchResult =
  | { kind: 'resolved'; pendingId: string; decision: 'allow' | 'deny' }
  | { kind: 'parsed-no-match'; nonce: string }
  | { kind: 'ignored'; reason: 'no-text' | 'unparseable' };

export interface WaInboundWebhookServerOptions {
  /** Override creds loader (tests). */
  loadCreds?: () => WaWebhookCredentials | null;
  /** Override clock (tests). */
  now?: () => number;
}

export class WaInboundWebhookServer {
  private readonly pendingDan: PendingDanQueue;
  private readonly loadCreds: () => WaWebhookCredentials | null;
  private readonly nowFn: () => number;

  private server: http.Server | null = null;
  private boundPort = 0;
  /** Last time we logged an auth error; rate-limit log noise. */
  private lastAuthErrorAt = 0;
  /** Total dispatched messages this session (diagnostic). */
  private dispatchCount = 0;
  /** Total signature failures this session (diagnostic). */
  private sigFailCount = 0;

  constructor(pendingDan: PendingDanQueue, opts: WaInboundWebhookServerOptions = {}) {
    this.pendingDan = pendingDan;
    this.loadCreds = opts.loadCreds ?? getWaWebhookCreds;
    this.nowFn = opts.now ?? Date.now;
  }

  /**
   * Begin listening on the given port. Returns true if bound, false if
   * already running OR credentials missing OR port already in use. Never
   * throws.
   */
  async start(port: number): Promise<boolean> {
    if (this.server) return false;
    const creds = this.loadCreds();
    if (!creds) {
      // eslint-disable-next-line no-console
      console.warn(
        '[aegis-proxy] WA inbound webhook not started: app_secret + verify_token unset.'
      );
      return false;
    }
    const srv = http.createServer((req, res) => this.handle(req, res));
    return new Promise<boolean>((resolve) => {
      const onErr = (err: Error) => {
        srv.removeAllListeners('listening');
        // eslint-disable-next-line no-console
        console.warn(`[aegis-proxy] WA inbound webhook failed to bind ${port}: ${err.message}`);
        resolve(false);
      };
      srv.once('error', onErr);
      srv.once('listening', () => {
        srv.removeListener('error', onErr);
        this.server = srv;
        // OS picks the port when caller passes 0 (tests). Read it back.
        const addr = srv.address();
        this.boundPort =
          addr && typeof addr === 'object' && typeof addr.port === 'number' ? addr.port : port;
        // eslint-disable-next-line no-console
        console.log(
          `[aegis-proxy] WA inbound webhook listening on ${BIND_HOST}:${this.boundPort} (path ${WEBHOOK_PATH}).`
        );
        resolve(true);
      });
      srv.listen(port, BIND_HOST);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    this.boundPort = 0;
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    // eslint-disable-next-line no-console
    console.log('[aegis-proxy] WA inbound webhook stopped.');
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  stats(): { running: boolean; port: number; dispatched: number; sigFailures: number } {
    return {
      running: this.isRunning(),
      port: this.boundPort,
      dispatched: this.dispatchCount,
      sigFailures: this.sigFailCount,
    };
  }

  // ─── Request handling ───────────────────────────────────────────────────

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = req.url ?? '';
      const path = url.split('?')[0];
      if (path !== WEBHOOK_PATH) {
        this.respond(res, 404, { error: 'not found' });
        return;
      }
      const creds = this.loadCreds();
      if (!creds) {
        this.respond(res, 503, { error: 'credentials missing' });
        return;
      }
      if (req.method === 'GET') {
        this.handleVerification(req, res, creds);
        return;
      }
      if (req.method === 'POST') {
        await this.handlePost(req, res, creds);
        return;
      }
      this.respond(res, 405, { error: 'method not allowed' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[aegis-proxy] WA inbound webhook handler error:',
        err instanceof Error ? err.message : err
      );
      this.respond(res, 500, { error: 'internal error' });
    }
  }

  private handleVerification(
    req: IncomingMessage,
    res: ServerResponse,
    creds: WaWebhookCredentials
  ): void {
    const url = req.url ?? '';
    const qIndex = url.indexOf('?');
    const params = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : '');
    const mode = params.get('hub.mode');
    const token = params.get('hub.verify_token');
    const challenge = params.get('hub.challenge');
    if (mode !== 'subscribe' || token !== creds.verify_token || !challenge) {
      this.throttledAuthLog('GET verify failed');
      this.respond(res, 403, { error: 'verification failed' });
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain');
    res.end(challenge);
  }

  /**
   * Public for tests: dispatch one ParsedWaMessage through the DAN path.
   * Mirrors TelegramInboundPoller.dispatch shape so test patterns match.
   */
  dispatchOne(message: {
    text: string | null;
    from: string;
    message_id: string;
  }): WaInboundDispatchResult {
    if (typeof message.text !== 'string' || message.text.length === 0) {
      return { kind: 'ignored', reason: 'no-text' };
    }
    const reply = parseDanReply(message.text);
    if (!reply) return { kind: 'ignored', reason: 'unparseable' };
    const pendingId = this.pendingDan.resolveByNonce(reply.nonce, reply.decision);
    if (pendingId === null) return { kind: 'parsed-no-match', nonce: reply.nonce };
    this.dispatchCount += 1;
    return { kind: 'resolved', pendingId, decision: reply.decision };
  }

  private async handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    creds: WaWebhookCredentials
  ): Promise<void> {
    let rawBody: Buffer;
    try {
      rawBody = await readBodyBounded(req, MAX_BODY_BYTES);
    } catch (err) {
      this.respond(res, 413, { error: err instanceof Error ? err.message : 'body read failed' });
      return;
    }
    const sigHeader = req.headers['x-hub-signature-256'];
    const sigValue = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!verifyMetaSignature(rawBody, sigValue ?? null, creds.app_secret)) {
      this.sigFailCount += 1;
      this.throttledAuthLog('POST signature mismatch');
      this.respond(res, 401, { error: 'signature mismatch' });
      return;
    }
    // Always 200 fast — process async per Meta's webhook best practice.
    this.respond(res, 200, { status: 'ok' });
    setImmediate(() => {
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return;
      }
      const messages = parseWaWebhookPayload(payload);
      for (const m of messages) {
        const result = this.dispatchOne(m);
        if (result.kind === 'resolved') {
          // eslint-disable-next-line no-console
          console.log(
            `[aegis-proxy] ASD-T-038: WA reply resolved ${result.pendingId} → ${result.decision} (from ${m.from})`
          );
        }
      }
    });
  }

  private respond(res: ServerResponse, status: number, body: object): void {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  private throttledAuthLog(label: string): void {
    const now = this.nowFn();
    if (now - this.lastAuthErrorAt < 60_000) return;
    this.lastAuthErrorAt = now;
    // eslint-disable-next-line no-console
    console.warn(`[aegis-proxy] WA inbound webhook: ${label}`);
  }
}

/**
 * Read up to `max` bytes from an incoming request body. Rejects with a
 * 413 if the client sends more (defense against a malicious sender —
 * Meta payloads are <10 KB in practice).
 */
function readBodyBounded(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > max) {
        reject(new Error(`body exceeds ${max} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const __internals = { WEBHOOK_PATH, BIND_HOST, MAX_BODY_BYTES };
