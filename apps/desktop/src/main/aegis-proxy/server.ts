// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — HTTP/HTTPS forward proxy with TLS termination
//
// P1 scope:
//   - ASD-T-001: loopback bind + plain-HTTP forwarding + bind validator
//   - ASD-T-002: per-install root CA in OS keychain
//   - ASD-T-002b (this file's retrofit): HTTPS CONNECT → real TLS termination
//     via per-host leaf cert minting + LeafCertCache, decrypted requests
//     forwarded to upstream over a fresh outbound TLS connection.
//
// @rule:ASD-001 — loopback bind only (delegated to bind-validator)
// @rule:ASD-002 — per-install root CA signs leaf certs (delegated to leaf-cert)
// @rule:ASD-004 — failure mode is deny (proxy errors → 502/501, no upstream call)
// @rule:ASD-006 — single Electron main process (this module runs inside it)
// @rule:ASD-YK-004 — one proxy, multiple provider adapters (T-004/T-005)
// @rule:INF-ASD-010 — TLS handshake failure on tunnel → cert-pinning signal

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { URL } from 'node:url';

import {
  ASD_PROXY_DEFAULT_PORT,
  type AegisProxyConfig,
  type AegisProxyHandle,
  type RootCA,
} from './types.js';
import { validateBindAddress } from './bind-validator.js';
import { ensureRootCA } from './ca-store.js';
import { LeafCertCache } from './leaf-cert.js';

/**
 * Start the aegis-proxy.
 *
 * Bind-address violations are fatal: the process exits with code 78 (EX_CONFIG)
 * per ASD-001 / INF-ASD-001. The root CA is loaded synchronously at startup so
 * the CONNECT handler can mint leaf certs without async fetches in the hot path.
 * Other startup errors (port in use, etc.) surface via the rejected Promise so
 * the caller can decide whether to continue without the proxy.
 */
export async function startAegisProxy(
  config: Partial<AegisProxyConfig> = {}
): Promise<AegisProxyHandle> {
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
    process.exit(78);
  }

  // ASD-002 / ASD-T-002: load the per-install root CA before opening the socket
  // so TLS-termination of HTTPS CONNECT has a signer ready.
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
    // Non-fatal: HTTP forwarding still works without TLS termination per ASD-006.
    // eslint-disable-next-line no-console
    console.warn(
      '[aegis-proxy] root CA unavailable; HTTPS CONNECT will refuse with 502:',
      err instanceof Error ? err.message : err
    );
  }

  const server = http.createServer(handleHttpRequest);
  server.on('connect', (req, socket, head) =>
    // Node types `socket` as Duplex on the connect event but in practice it's
    // a net.Socket for TCP/IP-served HTTP; cast at the boundary.
    handleHttpConnect(req, socket as net.Socket, head, leafCache)
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
          `(HTTP forward + ${tlsReady ? 'HTTPS terminated via per-install CA' : 'HTTPS CONNECT disabled (no CA)'})`
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

// ─── plain HTTP forward ───────────────────────────────────────────────────────

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
      'aegis-proxy: HTTP forward handler only supports http: targets. ' +
        'For https: targets, use HTTPS_PROXY which triggers CONNECT (terminated by aegis-proxy).'
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

// ─── HTTPS CONNECT — real TLS termination (ASD-T-002b) ────────────────────────

interface ConnectTarget {
  host: string;
  port: number;
}

function parseConnectTarget(raw: string): ConnectTarget | null {
  // RFC 7230 §4.3.6: authority-form `host:port`.
  // Handles IPv6 bracket form too: `[::1]:443`.
  if (!raw) return null;
  const ipv6 = raw.match(/^\[([^\]]+)\]:(\d+)$/);
  if (ipv6) return { host: ipv6[1]!, port: Number(ipv6[2]) };
  const m = raw.match(/^([^:]+):(\d+)$/);
  if (!m) return null;
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: m[1]!, port };
}

/**
 * Terminate TLS for an HTTPS CONNECT, then forward decrypted requests
 * to the real upstream over a fresh outbound TLS connection.
 *
 * Flow:
 *   1. Client → CONNECT api.example.com:443
 *   2. We mint a leaf cert for api.example.com (signed by our root CA)
 *   3. We respond 200 Connection Established
 *   4. We wrap the now-tunneled socket as a TLS server using the leaf cert
 *   5. Client TLS-handshakes against our cert (succeeds iff client trusts our root)
 *   6. Decrypted HTTP requests are handed to handleDecryptedHttps()
 *   7. handleDecryptedHttps re-encrypts via https.request to the real upstream
 */
function handleHttpConnect(
  req: IncomingMessage,
  clientSocket: net.Socket,
  head: Buffer,
  leafCache: LeafCertCache | null
): void {
  const target = parseConnectTarget(req.url ?? '');
  if (!target) {
    clientSocket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    clientSocket.end();
    return;
  }

  if (!leafCache) {
    // CA failed to load at startup; refuse cleanly per ASD-004.
    clientSocket.write(
      'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n' +
        'aegis-proxy: root CA unavailable; cannot terminate TLS for CONNECT.\n'
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

  // Accept the tunnel. From here the client begins TLS handshake on this socket.
  clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: aegis-proxy\r\n\r\n');

  // Some clients send TLS ClientHello bytes alongside CONNECT headers — those
  // arrive in `head`. Replay them onto the socket so the TLS server sees them.
  if (head && head.length > 0) {
    clientSocket.unshift(head);
  }

  // Per-CONNECT https.Server. Slightly wasteful vs a long-lived TLS server with
  // SNI dispatch, but vastly simpler and correct. Performance can come later.
  const innerServer = https.createServer(
    {
      cert: leaf.certPem,
      key: leaf.keyPem,
      // Restrict ALPN to http/1.1; our outbound is http/1.1 (node `https.request`).
      // HTTP/2 upstream would require http2 module wiring — out of P1 scope.
      ALPNProtocols: ['http/1.1'],
    },
    (req2, res2) => handleDecryptedHttps(req2, res2, target)
  );

  innerServer.on('tlsClientError', (err, sock) => {
    // INF-ASD-010 — client refused our cert (most common: cert pinning).
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

/**
 * Forward a decrypted HTTPS request to the real upstream over a fresh outbound
 * TLS connection. Streaming pass-through for SSE / streaming completions.
 */
function handleDecryptedHttps(
  req: IncomingMessage,
  res: ServerResponse,
  target: ConnectTarget
): void {
  const upstream = https.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      // Inside a TLS-terminated tunnel the proxy is acting as origin server,
      // so the request URL arrives in origin-form (/path?qs). Pass through.
      path: req.url,
      headers: stripHopByHopHeaders(req.headers),
      // Default: verify against system trust store. We deliberately do NOT
      // downgrade verification — upstream certs must be real per ASD-004.
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
    res.end(`aegis-proxy upstream TLS error: ${err.message}\n`);
  });

  req.pipe(upstream);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Re-export for tests + future modules that need direct parsing.
export const __testHooks = { parseConnectTarget };
