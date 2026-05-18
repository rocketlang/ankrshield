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
import { AegisGate, AegisLiteError } from './aegis-gate.js';
import { redactInJsonBody, PiiPolicyResolver } from './pii-boundary.js';
import { BudgetLedger, BudgetConfigResolver, hourBucket } from './budget-ledger.js';
import { computeCost } from './cost-rates.js';
import { AppsPolicyStore } from './apps-policy.js';
import { PendingConsentQueue } from './pending-consent-queue.js';
import { categorizeHighRiskTools, extractToolDeclarations } from './dan-categorizer.js';
import { PendingDanQueue } from './pending-dan-queue.js';
import { OsNotificationDanCarrier } from './dan-carrier-os.js';
import { DanDecisionCache } from './dan-decision-cache.js';

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

  // ASD-T-012: AEGIS lite gate — per-app trust_mask check on every observed
  // request. P2 ASD-T-015 (TOFU) will populate non-default masks; for now
  // every app gets DESKTOP_AGENT_MASK so the gate is a no-op in practice
  // until the user explicitly downgrades.
  const aegisGate = new AegisGate();

  // ASD-T-013 (doctrine-corrected — see vivechana Part 2): per-request PII
  // boundary. Default policy = 'redact' for all apps; P2 ASD-T-015 (TOFU)
  // will let users override per-app to 'block' or 'off'.
  const piiPolicy = new PiiPolicyResolver();

  // ASD-T-014: per-app hourly budget governor — JSON-backed in-memory ledger
  // (SQLite migration deferred to ASD-T-024 per the budget-ledger memory note).
  // Default budget = unlimited; P2 ASD-T-015 TOFU will set per-app caps.
  const budgetLedger = new BudgetLedger();
  try {
    await budgetLedger.load();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[aegis-proxy] budget-ledger.json load failed; starting fresh:',
      err instanceof Error ? err.message : err
    );
  }
  const budgetConfig = new BudgetConfigResolver();

  // ASD-T-015 TOFU: per-app policy store (decision + budget + pii + dan) and
  // the pending-consent queue used to hold first-request from unseen apps.
  const appsPolicy = new AppsPolicyStore();
  try {
    await appsPolicy.load();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[aegis-proxy] apps-policy.json load failed; starting fresh:',
      err instanceof Error ? err.message : err
    );
  }
  // Hydrate budget + pii resolvers from any previously-stored policies.
  for (const [appId, policy] of Object.entries(appsPolicy.getAll())) {
    if (policy.decision === 'allow' && policy.hourly_limit_usd != null) {
      budgetConfig.setOverride(appId, { hourly_limit_usd: policy.hourly_limit_usd });
    }
    piiPolicy.setOverride(appId, policy.pii_policy);
  }

  const pendingConsent = new PendingConsentQueue({
    onPendingAdded: (req) => {
      events.emit({
        kind: 'consent.pending',
        requestId: req.pendingId, // pendingId stands in here for paired requestId
        timestamp: req.heldAt,
        pendingId: req.pendingId,
        appId: req.appId,
        hostname: req.hostname,
        timeoutMs: req.timeoutMs,
      });
    },
    onResolved: (pendingId, outcome) => {
      events.emit({
        kind: 'consent.resolved',
        requestId: pendingId,
        timestamp: new Date().toISOString(),
        pendingId,
        appId: '', // filled by renderer-side via pendingId lookup
        decision: outcome.decision,
        timedOut: outcome.timedOut,
      });
    },
  });

  // ASD-T-016 DAN gate: HIGH-category tool declarations hold the request
  // pending user approval via OS notification (default carrier). Session
  // decision cache prevents prompt fatigue for repeat agentic sessions.
  const danDecisionCache = new DanDecisionCache();
  const pendingDan = new PendingDanQueue({
    carriers: [new OsNotificationDanCarrier()],
    onPendingAdded: (req) => {
      events.emit({
        kind: 'dan.held',
        requestId: req.pendingId,
        timestamp: req.heldAt,
        pendingId: req.pendingId,
        appId: req.appId,
        hostname: req.hostname,
        timeoutMs: req.timeoutMs,
        highRiskTools: req.highRiskTools.map((t) => ({ name: t.name, category: t.category })),
      });
    },
    onResolved: (pendingId, outcome) => {
      events.emit({
        kind: 'dan.resolved',
        requestId: pendingId,
        timestamp: new Date().toISOString(),
        pendingId,
        appId: '',
        decision: outcome.decision,
        timedOut: outcome.timedOut,
      });
    },
  });

  const server = http.createServer((req, res) =>
    handleHttpRequest(
      req,
      res,
      events,
      appsStore,
      proxyPort,
      isBlocked,
      aegisGate,
      piiPolicy,
      budgetLedger,
      budgetConfig,
      appsPolicy,
      pendingConsent,
      pendingDan,
      danDecisionCache
    )
  );
  server.on('connect', (req, socket, head) =>
    handleHttpConnect(
      req,
      socket as net.Socket,
      head,
      leafCache,
      events,
      appsStore,
      proxyPort,
      isBlocked,
      aegisGate,
      piiPolicy,
      budgetLedger,
      budgetConfig,
      appsPolicy,
      pendingConsent,
      pendingDan,
      danDecisionCache
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
        appsPolicy,
        pendingConsent,
        pendingDan,
        danDecisionCache,
        stop: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => {
              // Final flush of apps registry + budget ledger + policy on graceful stop.
              // Drain pending consents + DAN holds (timeout-deny each).
              pendingConsent.drain();
              pendingDan.drain();
              appsStore.stop().catch(() => {});
              budgetLedger.stop().catch(() => {});
              appsPolicy.stop().catch(() => {});
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
  isBlocked: IsBlockedFn,
  aegisGate: AegisGate,
  piiPolicy: PiiPolicyResolver,
  budgetLedger: BudgetLedger,
  budgetConfig: BudgetConfigResolver,
  appsPolicy: AppsPolicyStore,
  pendingConsent: PendingConsentQueue,
  pendingDan: PendingDanQueue,
  danDecisionCache: DanDecisionCache
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
    aegisGate,
    piiPolicy,
    budgetLedger,
    budgetConfig,
    appsPolicy,
    pendingConsent,
    pendingDan,
    danDecisionCache,
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
  isBlocked: IsBlockedFn,
  aegisGate: AegisGate,
  piiPolicy: PiiPolicyResolver,
  budgetLedger: BudgetLedger,
  budgetConfig: BudgetConfigResolver,
  appsPolicy: AppsPolicyStore,
  pendingConsent: PendingConsentQueue,
  pendingDan: PendingDanQueue,
  danDecisionCache: DanDecisionCache
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
        aegisGate,
        piiPolicy,
        budgetLedger,
        budgetConfig,
        appsPolicy,
        pendingConsent,
        pendingDan,
        danDecisionCache,
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
  aegisGate: AegisGate;
  piiPolicy: PiiPolicyResolver;
  budgetLedger: BudgetLedger;
  budgetConfig: BudgetConfigResolver;
  appsPolicy: AppsPolicyStore;
  pendingConsent: PendingConsentQueue;
  pendingDan: PendingDanQueue;
  danDecisionCache: DanDecisionCache;
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
    aegisGate,
    piiPolicy,
    budgetLedger,
    budgetConfig,
    appsPolicy,
    pendingConsent,
    pendingDan,
    danDecisionCache,
  } = args;
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const adapter: ProviderAdapter | null = pickAdapter(upstreamHost, upstreamPath);
  const clientPort = req.socket?.remotePort ?? 0;

  const bodyChunks: Buffer[] = [];
  req.on('data', (c: Buffer) => bodyChunks.push(c));
  req.on('end', () => {
    const requestBody = Buffer.concat(bodyChunks);

    // ASD-T-006 + T-007 + T-012: resolve identity → record → AEGIS gate → forward.
    //
    // P1 was fire-and-forget (observation only, upstream forwarded in parallel).
    // P2 moves the upstream forward INSIDE the async block because we now
    // enforce via AEGIS lite: a denied request must NOT reach the upstream.
    // Cost: per-request latency rises by the ss lookup time (50-500 ms) — the
    // user-visible response is delayed by that much. Acceptable trade-off
    // because the alternative (allow-while-checking) is wrong for enforcement.
    void (async () => {
      const identity = await resolveAppId({ clientPort, proxyPort });
      appsStore.recordRequest(identity.appId, identity.executable);

      // ASD-T-015 TOFU gate. Runs BEFORE AEGIS / PII / budget gates.
      //   - If the app has a stored deny: 403 immediately.
      //   - If the app has a stored allow: continue with its stored policy.
      //   - If unseen: hold in pending queue → user decides via UI → continue or 403.
      // Timed-out pending (60s default) treated as deny per INF-ASD-004.
      let policy = appsPolicy.get(identity.appId);
      if (!policy) {
        const outcome = await pendingConsent.hold(identity.appId, upstreamHost);
        if (outcome.decision === 'allow' && outcome.hourly_limit_usd != null) {
          // Persist + hydrate resolvers.
          appsPolicy.recordAllow(identity.appId, {
            hourly_limit_usd: outcome.hourly_limit_usd,
            pii_policy: outcome.pii_policy,
            dan_carrier: outcome.dan_carrier,
          });
          budgetConfig.setOverride(identity.appId, {
            hourly_limit_usd: outcome.hourly_limit_usd,
          });
          piiPolicy.setOverride(identity.appId, outcome.pii_policy);
          policy = appsPolicy.get(identity.appId);
        } else {
          // Denied (explicit or timeout). Persist + 403.
          appsPolicy.recordDeny(identity.appId);
          piiPolicy.setOverride(identity.appId, 'block');
          if (!res.headersSent) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
          }
          res.end(
            `aegis-proxy: ASD-005-tofu-denied — ${identity.appId} ` +
              `(${outcome.timedOut ? 'consent dialog timeout' : 'user denied'}).\n`
          );
          return;
        }
      } else if (policy.decision === 'deny') {
        if (!res.headersSent) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        }
        res.end(
          `aegis-proxy: ASD-005-tofu-denied — ${identity.appId} (stored deny). ` +
            `Revoke via Settings to re-prompt.\n`
        );
        return;
      }

      // Parse request via adapter (if matched) — we need hasTools + isStreaming
      // for the AEGIS capability mapping (resolveCapability).
      let parsed: ReturnType<ProviderAdapter['parseRequest']> | null = null;
      if (adapter) {
        try {
          parsed = adapter.parseRequest({
            hostname: upstreamHost,
            path: upstreamPath,
            method: req.method ?? 'GET',
            headers: req.headers,
            body: requestBody,
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
          // Parse-failed requests still get the AEGIS gate check below
          // (with conservative hasTools=false defaults).
        }
      }

      // ASD-T-012: AEGIS lite gate. O(1) bitmask check via vendored lite SDK.
      try {
        aegisGate.guard({
          appId: identity.appId,
          hasTools: parsed?.hasTools ?? false,
          isStreaming: parsed?.isStreaming ?? false,
        });
      } catch (err) {
        if (err instanceof AegisLiteError) {
          events.emit({
            kind: 'aegis.denied',
            requestId,
            timestamp: new Date().toISOString(),
            appId: identity.appId,
            hostname: upstreamHost,
            capability_hex: `0x${err.capability.toString(16).padStart(8, '0')}`,
            trust_mask_hex: `0x${err.trust_mask.toString(16).padStart(8, '0')}`,
            reason: err.message,
          });
          if (!res.headersSent) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
          }
          res.end(
            `aegis-proxy: ASD-004 — AEGIS gate denied request from ${identity.appId}.\n` +
              `${err.message}\n`
          );
          return; // do NOT forward upstream
        }
        // Unknown error from gate — fail closed per ASD-004 (deny on error).
        if (!res.headersSent) {
          res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
        }
        res.end(
          `aegis-proxy: AEGIS gate threw unexpected error; per ASD-004 the request is denied.\n` +
            `${err instanceof Error ? err.message : String(err)}\n`
        );
        return;
      }

      // ASD-T-013 (doctrine-corrected, see vivechana Part 2): per-request PII
      // boundary. Default policy = redact (replace PII with [REDACTED:type]);
      // per-app override to 'block' returns 403; 'off' skips.
      let bodyToForward = requestBody;
      if (parsed && requestBody.length > 0) {
        const policy = piiPolicy.resolve(identity.appId);
        if (policy !== 'off') {
          try {
            const parsedBody = JSON.parse(requestBody.toString('utf8'));
            const matches = redactInJsonBody(parsedBody);
            if (matches.length > 0) {
              const counts: Record<string, number> = {};
              for (const m of matches) counts[m.type] = (counts[m.type] ?? 0) + 1;
              if (policy === 'block') {
                events.emit({
                  kind: 'pii.blocked',
                  requestId,
                  timestamp: new Date().toISOString(),
                  appId: identity.appId,
                  hostname: upstreamHost,
                  counts,
                  total: matches.length,
                });
                if (!res.headersSent) {
                  res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
                }
                res.end(
                  `aegis-proxy: ASD-011-pii-blocked — request from ${identity.appId} ` +
                    `contained ${matches.length} PII span(s) and per-app policy is 'block'.\n`
                );
                return; // do NOT forward upstream
              }
              // policy === 'redact' — replace body with redacted version
              bodyToForward = Buffer.from(JSON.stringify(parsedBody), 'utf8');
              events.emit({
                kind: 'pii.redacted',
                requestId,
                timestamp: new Date().toISOString(),
                appId: identity.appId,
                hostname: upstreamHost,
                counts,
                total: matches.length,
              });
            }
          } catch {
            // Body wasn't JSON or parse failed — pass through unmodified.
            // Adapter-matched requests are always JSON; getting here means
            // either non-AI traffic or a malformed AI request. Either way,
            // skipping redaction is safer than crashing the proxy.
          }
        }
      }

      // ASD-T-014: per-app hourly budget check. The check uses the CURRENT-HOUR
      // spend snapshot (from prior recorded responses) — we don't have the new
      // request's cost yet (it's computed post-response). This means one request
      // can cross the threshold; subsequent requests in the same hour throttle.
      // Acceptable for v1; per the budget-ledger memory, SQLite migration in
      // P3 would unlock pre-charge reservation if needed.
      const budgetCfg = budgetConfig.resolve(identity.appId);
      if (budgetCfg.hourly_limit_usd != null && budgetCfg.hourly_limit_usd > 0) {
        const currentSpend = budgetLedger.currentHourSpend(identity.appId);
        if (currentSpend.cost_usd >= budgetCfg.hourly_limit_usd) {
          events.emit({
            kind: 'budget.throttled',
            requestId,
            timestamp: new Date().toISOString(),
            appId: identity.appId,
            hostname: upstreamHost,
            currentSpendUsd: currentSpend.cost_usd,
            hourlyLimitUsd: budgetCfg.hourly_limit_usd,
            bucket: hourBucket(),
          });
          if (!res.headersSent) {
            res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8' });
          }
          res.end(
            `aegis-proxy: ASD-007-budget-throttled — ${identity.appId} has spent ` +
              `$${currentSpend.cost_usd.toFixed(4)} this hour, exceeding ` +
              `the per-app cap of $${budgetCfg.hourly_limit_usd.toFixed(2)}.\n`
          );
          return; // do NOT forward upstream
        }
      }

      // ASD-T-016 DAN gate. Run after budget pass + before upstream forward.
      // Scope: parse the request body's `tools` declarations (when adapter
      // matched — same JSON the adapter already parsed); classify into HIGH
      // categories; if any HIGH, hold the request pending user approval. The
      // OS notification carrier fires from PendingDanQueue.hold. The session
      // decision cache prevents re-prompting on every call within the same
      // tool-set; cache TTL = 1h for allow, 1min for deny.
      if (parsed && requestBody.length > 0) {
        let highRiskTools: ReturnType<typeof categorizeHighRiskTools> = [];
        try {
          const declarations = extractToolDeclarations(JSON.parse(requestBody.toString('utf8')));
          highRiskTools = categorizeHighRiskTools(declarations);
        } catch {
          // body wasn't valid JSON or had no tools — no DAN gate
        }
        if (highRiskTools.length === 0) {
          events.emit({
            kind: 'dan.skipped',
            requestId,
            timestamp: new Date().toISOString(),
            appId: identity.appId,
            hostname: upstreamHost,
            reason: 'no-high-tools',
          });
        } else {
          const cached = danDecisionCache.get(identity.appId, highRiskTools);
          if (cached) {
            events.emit({
              kind: 'dan.skipped',
              requestId,
              timestamp: new Date().toISOString(),
              appId: identity.appId,
              hostname: upstreamHost,
              reason: cached.decision === 'allow' ? 'cached-allow' : 'cached-deny',
            });
            if (cached.decision === 'deny') {
              if (!res.headersSent) {
                res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
              }
              res.end(
                `aegis-proxy: ASD-008-dan-cached-deny — ${identity.appId} ` +
                  `previously denied access to HIGH-category tool(s) ` +
                  `${highRiskTools.map((t) => t.name).join(', ')}. Wait 60s or revoke via Settings.\n`
              );
              return;
            }
          } else {
            const outcome = await pendingDan.hold({
              appId: identity.appId,
              hostname: upstreamHost,
              highRiskTools,
            });
            danDecisionCache.set(identity.appId, highRiskTools, outcome.decision);
            if (outcome.decision === 'deny') {
              if (!res.headersSent) {
                res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
              }
              res.end(
                `aegis-proxy: ASD-008-dan-${outcome.timedOut ? 'timeout-denied' : 'denied'} — ` +
                  `${identity.appId} requested ` +
                  `${highRiskTools.length} HIGH-category tool(s) (` +
                  `${highRiskTools.map((t) => `${t.name}:${t.category}`).join(', ')}) ` +
                  `${outcome.timedOut ? `and the 30s DAN gate timed out.` : `and the user denied.`}\n`
              );
              return;
            }
          }
        }
      }

      // Allow — emit request.observed (if adapter parsed) and forward upstream.
      if (parsed) {
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
      }

      // Build outbound request (TLS or plaintext).
      const httpModule = useTls ? https : http;
      const upstream = httpModule.request(
        {
          host: upstreamHost,
          port: upstreamPort,
          method: req.method,
          path: upstreamPath,
          headers:
            bodyToForward !== requestBody
              ? {
                  ...stripHopByHopHeaders(req.headers),
                  'content-length': String(bodyToForward.length),
                }
              : stripHopByHopHeaders(req.headers),
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

              // ASD-T-014: record cost in the budget ledger. Compute via
              // cost-rates lookup using the parsed model + observation tokens.
              // Failures here are non-fatal — the response already flowed.
              if (parsed) {
                const costUsd = computeCost(
                  parsed.provider,
                  parsed.model,
                  observation.promptTokens,
                  observation.completionTokens
                );
                if (costUsd > 0) {
                  try {
                    budgetLedger.recordCost(identity.appId, costUsd);
                    events.emit({
                      kind: 'cost.recorded',
                      requestId,
                      timestamp: new Date().toISOString(),
                      appId: identity.appId,
                      model: parsed.model,
                      costUsd,
                      promptTokens: observation.promptTokens,
                      completionTokens: observation.completionTokens,
                    });
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.warn(
                      `[aegis-proxy] budget ledger recordCost failed for ${identity.appId}:`,
                      err instanceof Error ? err.message : err
                    );
                  }
                }
              }
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

      if (bodyToForward.length > 0) upstream.write(bodyToForward);
      upstream.end();
    })();
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
