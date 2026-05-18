// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — HTTP/HTTPS forward proxy with TLS termination + observers
//
// P1 scope:
//   - ASD-T-001: loopback bind + plain-HTTP forwarding + bind validator
//   - ASD-T-002: per-install root CA in OS keychain
//   - ASD-T-002b: HTTPS CONNECT → real TLS termination via per-host leaf certs
//   - ASD-T-004: Anthropic Messages API observer (this commit)
//   - ASD-T-005: OpenAI Chat Completions observer (this commit)
//
// @rule:ASD-001 — loopback bind only
// @rule:ASD-002 — per-install root CA signs leaf certs
// @rule:ASD-004 — failure mode is deny
// @rule:ASD-006 — single Electron main process
// @rule:ASD-YK-004 — one proxy, multiple provider adapters
// @rule:INF-ASD-010 — TLS handshake failure on tunnel → cert-pinning signal

import crypto from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { URL } from 'node:url';

import {
  ASD_PROXY_DEFAULT_PORT,
  type AegisProxyConfig,
  type AegisProxyHandle,
  type IsBlockedFn,
  type RootCA,
} from './types.js';
import { validateBindAddress } from './bind-validator.js';
import { ensureRootCA } from './ca-store.js';
import { LeafCertCache } from './leaf-cert.js';
import { AegisProxyEventBus } from './event-bus.js';
import { pickAdapter } from './observer-dispatcher.js';
import type { ObservedRequest, ProviderAdapter, ResponseObserver } from './observer-types.js';
import { resolveAppId } from './app-identifier.js';
import { AppsStore } from './apps-store.js';

/**
 * Start the aegis-proxy.
 *
 * Bind-address violations are fatal: exits with code 78 (EX_CONFIG) per
 * ASD-001 / INF-ASD-001. Root CA loaded synchronously at startup so CONNECT
 * has a signer ready. Other startup errors (port in use, etc.) surface via
 * rejected Promise.
 */
export async function startAegisProxy(
  config: Partial<AegisProxyConfig> = {}
): Promise<AegisProxyHandle> {
  const resolved: AegisProxyConfig = {
    bindAddress: config.bindAddress ?? '127.0.0.1',
    bindPort: config.bindPort ?? ASD_PROXY_DEFAULT_PORT,
    isBlocked: config.isBlocked,
  };

  // ASD-001: bind-address must be loopback. Non-loopback → exit 78.
  try {
    validateBindAddress(resolved.bindAddress);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(78);
  }

  // ASD-002 / ASD-T-002: load the per-install root CA before opening the socket.
  let rootCA: RootCA | null = null;
  let leafCache: LeafCertCache | null = null;
  try {
    const ensured = await ensureRootCA();
    rootCA = ensured.ca;
    leafCache = new LeafCertCache({ rootCA });
    // eslint-disable-next-line no-console
    console.log(
      `[aegis-proxy] root CA ${ensured.freshlyGenerated ? 'generated' : 'loaded'} ` +
        `(sha256: ${rootCA.fingerprintSha256.slice(0, 16)}…${rootCA.fingerprintSha256.slice(-8)}, ` +
        `valid until ${rootCA.validUntil.slice(0, 10)})`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[aegis-proxy] root CA unavailable; HTTPS CONNECT will refuse with 502:',
      err instanceof Error ? err.message : err
    );
  }

  const events = new AegisProxyEventBus();

  // ASD-T-007: load apps registry; observation-only in P1, written debounced.
  const appsStore = new AppsStore();
  try {
    await appsStore.load();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[aegis-proxy] apps.json load failed; starting fresh:',
      err instanceof Error ? err.message : err
    );
  }

  const proxyPort = resolved.bindPort;
  const isBlocked = resolved.isBlocked ?? (async () => false);

  const server = http.createServer((req, res) =>
    handleHttpRequest(req, res, events, appsStore, proxyPort, isBlocked)
  );
  server.on('connect', (req, socket, head) =>
    // Node types `socket` as Duplex on the connect event; in practice it's a
    // net.Socket for TCP-served HTTP. Cast at the boundary.
    handleHttpConnect(
      req,
      socket as net.Socket,
      head,
      leafCache,
      events,
      appsStore,
      proxyPort,
      isBlocked
    )
  );

  return new Promise<AegisProxyHandle>((resolve, reject) => {
    const onErr = (e: Error) => {
      server.removeListener('listening', onListen);
      reject(e);
    };
    const onListen = () => {
      server.removeListener('error', onErr);
      const tlsReady = leafCache !== null;
      // eslint-disable-next-line no-console
      console.log(
        `[aegis-proxy] listening on ${resolved.bindAddress}:${resolved.bindPort} ` +
          `(HTTP forward + ${tlsReady ? 'HTTPS terminated via per-install CA' : 'HTTPS CONNECT disabled (no CA)'}` +
          `, observers: anthropic+openai)`
      );
      resolve({
        config: resolved,
        events,
        stop: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => {
              // Final flush of apps registry on graceful stop.
              appsStore.stop().catch(() => {});
              err ? rej(err) : res();
            })
          ),
      });
    };
    server.once('error', onErr);
    server.once('listening', onListen);
    server.listen(resolved.bindPort, resolved.bindAddress);
  });
}

// ─── plain HTTP forward ───────────────────────────────────────────────────────

/**
 * Plain-HTTP forward handler. Client sends `GET http://host/path HTTP/1.1`
 * (absolute-form request URI per RFC 7230 §5.3.2).
 */
async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  events: AegisProxyEventBus,
  appsStore: AppsStore,
  proxyPort: number,
  isBlocked: IsBlockedFn
): Promise<void> {
  const rawUrl = req.url ?? '';
  if (!/^https?:\/\//i.test(rawUrl)) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      'aegis-proxy expects absolute-form request URI (HTTP forward proxy). ' +
        'Got origin-form: ' +
        rawUrl
    );
    return;
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('aegis-proxy: malformed request URL: ' + rawUrl);
    return;
  }

  if (target.protocol !== 'http:') {
    // ASD-004: deny by default.
    res.writeHead(501, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      'aegis-proxy: HTTP forward handler only supports http: targets. ' +
        'For https: targets, use HTTPS_PROXY which triggers CONNECT (terminated by aegis-proxy).'
    );
    return;
  }

  // @rule:ASD-010 / INF-ASD-009 — privacy-engine chains BEFORE AEGIS.
  // A request to a known tracker/blocked host is refused here, without
  // forwarding upstream and without recording cost.
  if (await isHostBlocked(isBlocked, target.hostname, events, 'http')) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`aegis-proxy: ASD-010-privacy-blocked — privacy engine refused ${target.hostname}.\n`);
    return;
  }

  forwardWithObservation({
    req,
    res,
    upstreamHost: target.hostname,
    upstreamPort: target.port ? Number(target.port) : 80,
    upstreamPath: target.pathname + target.search,
    useTls: false,
    events,
    appsStore,
    proxyPort,
  });
}

// ─── HTTPS CONNECT — real TLS termination (ASD-T-002b) ────────────────────────

interface ConnectTarget {
  host: string;
  port: number;
}

function parseConnectTarget(raw: string): ConnectTarget | null {
  if (!raw) return null;
  const ipv6 = raw.match(/^\[([^\]]+)\]:(\d+)$/);
  if (ipv6) return { host: ipv6[1]!, port: Number(ipv6[2]) };
  const m = raw.match(/^([^:]+):(\d+)$/);
  if (!m) return null;
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: m[1]!, port };
}

async function handleHttpConnect(
  req: IncomingMessage,
  clientSocket: net.Socket,
  head: Buffer,
  leafCache: LeafCertCache | null,
  events: AegisProxyEventBus,
  appsStore: AppsStore,
  proxyPort: number,
  isBlocked: IsBlockedFn
): Promise<void> {
  const target = parseConnectTarget(req.url ?? '');
  if (!target) {
    clientSocket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    clientSocket.end();
    return;
  }

  if (!leafCache) {
    clientSocket.write(
      'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n' +
        'aegis-proxy: root CA unavailable; cannot terminate TLS for CONNECT.\n'
    );
    clientSocket.end();
    return;
  }

  // @rule:ASD-010 — privacy-engine block runs BEFORE leaf cert mint. Saves
  // both compute (no cert mint for a host we'd block anyway) AND fingerprint
  // leakage (no leaf cert generated for tracker domains).
  if (await isHostBlocked(isBlocked, target.host, events, 'connect')) {
    const body = `aegis-proxy: ASD-010-privacy-blocked — privacy engine refused ${target.host}.\n`;
    clientSocket.write(
      'HTTP/1.1 403 Forbidden\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        'Connection: close\r\n\r\n' +
        body
    );
    clientSocket.end();
    return;
  }

  let leaf;
  try {
    leaf = leafCache.getOrMint(target.host);
  } catch (err) {
    clientSocket.write(
      'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n' +
        'aegis-proxy: leaf cert mint failed: ' +
        (err instanceof Error ? err.message : String(err)) +
        '\n'
    );
    clientSocket.end();
    return;
  }

  clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: aegis-proxy\r\n\r\n');
  if (head && head.length > 0) {
    clientSocket.unshift(head);
  }

  const innerServer = https.createServer(
    {
      cert: leaf.certPem,
      key: leaf.keyPem,
      ALPNProtocols: ['http/1.1'],
    },
    (req2, res2) =>
      forwardWithObservation({
        req: req2,
        res: res2,
        upstreamHost: target.host,
        upstreamPort: target.port,
        upstreamPath: req2.url ?? '/',
        useTls: true,
        events,
        appsStore,
        proxyPort,
      })
  );

  innerServer.on('tlsClientError', (err, sock) => {
    events.emit({
      kind: 'tls.client_error',
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      hostname: target.host,
      error: err.message,
    });
    // eslint-disable-next-line no-console
    console.warn(
      `[aegis-proxy] TLS client error on tunnel to ${target.host} ` +
        `(likely cert pinning; INF-ASD-010): ${err.message}`
    );
    try {
      sock.destroy();
    } catch {
      // already torn down
    }
  });

  innerServer.emit('connection', clientSocket);
}

// ─── Shared forward + observation path (ASD-T-004 / ASD-T-005) ────────────────

interface ForwardArgs {
  req: IncomingMessage;
  res: ServerResponse;
  upstreamHost: string;
  upstreamPort: number;
  upstreamPath: string;
  useTls: boolean;
  events: AegisProxyEventBus;
  appsStore: AppsStore;
  proxyPort: number;
}

/**
 * Forward a single request (HTTP or decrypted HTTPS) to the upstream while
 * emitting observation events at request-parsed and response-complete points.
 *
 * Buffers the request body so the provider adapter can parse it. AI requests
 * are typically < 100 KB; large uploads aren't a target use case for the
 * desktop AEGIS proxy.
 */
function forwardWithObservation(args: ForwardArgs): void {
  const {
    req,
    res,
    upstreamHost,
    upstreamPort,
    upstreamPath,
    useTls,
    events,
    appsStore,
    proxyPort,
  } = args;
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const adapter: ProviderAdapter | null = pickAdapter(upstreamHost, upstreamPath);
  const clientPort = req.socket?.remotePort ?? 0;

  const bodyChunks: Buffer[] = [];
  req.on('data', (c: Buffer) => bodyChunks.push(c));
  req.on('end', () => {
    const requestBody = Buffer.concat(bodyChunks);

    // ASD-T-006: resolve per-app identity from the socket. Best-effort, never throws.
    void (async () => {
      const identity = await resolveAppId({ clientPort, proxyPort });

      // ASD-T-007: record the request in apps registry (debounced flush to disk).
      appsStore.recordRequest(identity.appId, identity.executable);

      // Emit request observation if an adapter matched.
      if (adapter) {
        try {
          const parsed = adapter.parseRequest({
            hostname: upstreamHost,
            path: upstreamPath,
            method: req.method ?? 'GET',
            headers: req.headers,
            body: requestBody,
          });
          const observation: ObservedRequest = {
            ...parsed,
            appId: identity.appId,
            pid: identity.pid,
            executable: identity.executable,
          };
          events.emit({
            kind: 'request.observed',
            requestId,
            timestamp: new Date().toISOString(),
            observation,
          });
        } catch (err) {
          events.emit({
            kind: 'request.parse_failed',
            requestId,
            timestamp: new Date().toISOString(),
            provider: adapter.provider,
            hostname: upstreamHost,
            path: upstreamPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    // Build outbound request (TLS or plaintext).
    const httpModule = useTls ? https : http;
    const upstream = httpModule.request(
      {
        host: upstreamHost,
        port: upstreamPort,
        method: req.method,
        path: upstreamPath,
        headers: stripHopByHopHeaders(req.headers),
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);

        // If an adapter matched, install its response observer.
        const responseObserver: ResponseObserver | null = adapter
          ? adapter.createResponseObserver()
          : null;

        upstreamRes.on('data', (chunk: Buffer) => {
          if (responseObserver) responseObserver.tap(chunk);
          res.write(chunk);
        });

        upstreamRes.on('end', () => {
          res.end();
          if (responseObserver) {
            const observation = responseObserver.finalize({
              statusCode: upstreamRes.statusCode ?? 0,
              latencyMs: Date.now() - startTime,
            });
            events.emit({
              kind: 'response.observed',
              requestId,
              timestamp: new Date().toISOString(),
              observation,
            });
          }
        });

        upstreamRes.on('error', () => {
          if (!res.writableEnded) res.end();
        });
      }
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end(
        useTls
          ? `aegis-proxy upstream TLS error: ${err.message}\n`
          : `aegis-proxy upstream error: ${err.message}\n`
      );
    });

    if (requestBody.length > 0) upstream.write(requestBody);
    upstream.end();
  });

  req.on('error', () => {
    // client aborted; nothing to do.
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHopByHopHeaders(headers: IncomingMessage['headers']): IncomingMessage['headers'] {
  const drop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'proxy-connection',
  ]);
  const out: IncomingMessage['headers'] = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!drop.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/**
 * Run the privacy-engine block check + emit + log. Fail-open: if the check
 * throws, the request proceeds (we'd rather over-allow than break the entire
 * LLM workflow when the privacy engine is degraded). ASD-004 still applies
 * to AEGIS checks; this is for upstream policy from a sibling subsystem.
 */
async function isHostBlocked(
  fn: IsBlockedFn,
  hostname: string,
  events: AegisProxyEventBus,
  via: 'http' | 'connect'
): Promise<boolean> {
  let blocked: boolean;
  try {
    blocked = await fn(hostname);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[aegis-proxy] privacy-engine isBlocked(${hostname}) threw; allowing through:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
  if (blocked) {
    events.emit({
      kind: 'privacy.blocked',
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      hostname,
      via,
    });
  }
  return blocked;
}

export const __testHooks = { parseConnectTarget, isHostBlocked };
