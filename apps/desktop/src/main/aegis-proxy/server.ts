// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — HTTP forward proxy
//
// P1 scope (ASD-T-001): plain-HTTP forwarding only; HTTPS CONNECT responds
// 501 with a pointer to ASD-T-002 (CA generator) which lands the TLS termination.
// This is honest — the proxy is observable for plain HTTP from day one and
// tells the user clearly what is not yet supported.
//
// @rule:ASD-001 — loopback bind only (delegated to bind-validator)
// @rule:ASD-004 — failure mode is deny (proxy errors → 502, no upstream call)
// @rule:ASD-006 — single Electron main process (this module runs inside it)
// @rule:ASD-YK-004 — one proxy, multiple provider adapters (adapters land in T-004/T-005)

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

import { ASD_PROXY_DEFAULT_PORT, type AegisProxyConfig, type AegisProxyHandle } from './types.js';
import { validateBindAddress } from './bind-validator.js';
import { ensureRootCA } from './ca-store.js';

/**
 * Start the aegis-proxy HTTP forward proxy.
 *
 * Bind-address violations are fatal: the process exits with code 78 (EX_CONFIG)
 * per ASD-001 / INF-ASD-001. All other startup errors (port in use, etc.) are
 * surfaced via the returned rejected Promise so the caller can decide whether
 * to continue without the proxy.
 */
export function startAegisProxy(config: Partial<AegisProxyConfig> = {}): Promise<AegisProxyHandle> {
  const resolved: AegisProxyConfig = {
    bindAddress: config.bindAddress ?? '127.0.0.1',
    bindPort: config.bindPort ?? ASD_PROXY_DEFAULT_PORT,
  };

  // ASD-001: bind-address must be loopback. Non-loopback → exit 78.
  try {
    validateBindAddress(resolved.bindAddress);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    // Tests stub process.exit; production hits this path and dies.
    process.exit(78);
  }

  // ASD-002 / ASD-T-002: ensure the per-install root CA exists. Result is not
  // wired into TLS termination yet (that's the next subtask); for now we just
  // load-or-generate so first-run cost is paid early and the fingerprint is
  // visible in logs for the upcoming consent ceremony (ASD-T-003).
  void ensureRootCAAtStartup();

  const server = http.createServer(handleHttpRequest);
  server.on('connect', handleHttpConnect);

  return new Promise<AegisProxyHandle>((resolve, reject) => {
    const onErr = (e: Error) => {
      server.removeListener('listening', onListen);
      reject(e);
    };
    const onListen = () => {
      server.removeListener('error', onErr);
      // eslint-disable-next-line no-console
      console.log(
        `[aegis-proxy] listening on ${resolved.bindAddress}:${resolved.bindPort} ` +
          `(P1: plain HTTP only; HTTPS CONNECT returns 501 until ASD-T-002 lands)`
      );
      resolve({
        config: resolved,
        stop: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    };
    server.once('error', onErr);
    server.once('listening', onListen);
    server.listen(resolved.bindPort, resolved.bindAddress);
  });
}

/**
 * Load-or-generate the root CA. Non-fatal on failure (HTTP forwarding still
 * works without TLS termination); per ASD-004 we deny the TLS-termination
 * code path specifically when CA is unavailable, but the rest of the proxy
 * keeps serving.
 */
async function ensureRootCAAtStartup(): Promise<void> {
  try {
    const { ca, freshlyGenerated } = await ensureRootCA();
    // eslint-disable-next-line no-console
    console.log(
      `[aegis-proxy] root CA ${freshlyGenerated ? 'generated' : 'loaded'} ` +
        `(sha256: ${ca.fingerprintSha256.slice(0, 16)}…${ca.fingerprintSha256.slice(-8)}, ` +
        `valid until ${ca.validUntil.slice(0, 10)})`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[aegis-proxy] root CA not ready (HTTPS CONNECT will continue to 501):',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Plain-HTTP forward handler. Client sends `GET http://host/path HTTP/1.1`
 * with the absolute-form request URI typical of HTTP forward proxies.
 */
function handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
  const rawUrl = req.url ?? '';
  if (!/^https?:\/\//i.test(rawUrl)) {
    // Per RFC 7230 §5.3.2 — absolute-form is required for proxies.
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
    // ASD-004: deny by default — if not plain HTTP, refuse rather than fall through.
    res.writeHead(501, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      'aegis-proxy P1: only http: forwarding implemented. ' +
        'For https: targets, use HTTPS_PROXY which triggers CONNECT; ' +
        'HTTPS CONNECT requires the CA generator (ASD-T-002) — not yet implemented.'
    );
    return;
  }

  const upstream = http.request(
    {
      host: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: target.pathname + target.search,
      headers: stripHopByHopHeaders(req.headers),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end('aegis-proxy upstream error: ' + err.message);
  });

  req.pipe(upstream);
}

/**
 * CONNECT handler (used by clients for HTTPS).
 *
 * In P1 we deliberately refuse — TLS termination requires the per-install
 * root CA that ASD-T-002 generates. Returning 501 makes the limitation
 * legible at the protocol level (curl, fetch, HTTPS_PROXY-aware clients
 * surface a clear failure rather than silently falling back).
 *
 * P2 work (ASD-T-002 then renamed retrofit of this handler) replaces this
 * with a real TLS-terminating CONNECT.
 */
function handleHttpConnect(req: IncomingMessage, socket: net.Socket): void {
  const target = req.url ?? '';
  socket.write(
    'HTTP/1.1 501 Not Implemented\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Connection: close\r\n' +
      '\r\n' +
      `aegis-proxy P1: HTTPS CONNECT is not yet implemented (target: ${target}). ` +
      `TLS termination requires the per-install root CA from ASD-T-002. ` +
      `Plain http:// targets via HTTP_PROXY work today.\n`
  );
  socket.end();
}

/**
 * Hop-by-hop headers should not be forwarded by a proxy (RFC 7230 §6.1).
 */
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
