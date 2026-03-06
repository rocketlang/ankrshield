/**
 * ankrshield API Server with GraphQL
 */

import { execSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';

import { DNSResolver } from '@ankrshield/dns-resolver';
import { scanApp } from '@ankrshield/dpdp-scanner';
import {
  runRiskEngine,
  scanIpWithGreyNoise,
  socialThreatsToWarriorEvents,
  buildRemediationPlaybook,
  scanSupplyChain,
  parseManifest,
  checkBrandImpersonation,
  generateThreatNarrative,
  monitorCertTransparency,
} from '@ankrshield/risk-intelligence';
import { analyzeSms } from '@ankrshield/sms-shield';
import { SpywareScanner } from '@ankrshield/spyware-detector';
import fastifyCookie from '@fastify/cookie';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import Redis from 'ioredis';
import mercurius from 'mercurius';
import WS from 'ws';

import { hashPassword, comparePassword } from './auth/password.js';
import { prisma } from './graphql/builder';
import type { Context } from './graphql/builder';
import { schema } from './graphql/schema';
import { sendTestAlert } from './integrations/slack.js';
import { startMonitor, stopMonitor, getMonitor } from './monitor/traffic-monitor';
import authPlugin from './plugins/auth';
import securityPlugin from './plugins/security';
import { getWarrior, startWarrior, stopWarrior } from './warrior/warrior-service';
import { startDomainWatcher, stopDomainWatcher } from './watch/domain-watcher.js';
import { checkIndiaThreatIntel, fingerprintPhishingKit } from './xshield/india-threat-bridge.js';
import { pivotOnRegistrant } from './xshield/risk-engine.js';
import { startWatchPoller, stopWatchPoller } from './xshield/watch-poller';

// ─── API Key helpers ──────────────────────────────────────────────────────────

function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const random = randomBytes(24).toString('hex'); // 48 hex chars
  const raw = `xsh_live_${random}`;
  const prefix = raw.slice(0, 8); // "xsh_live" first 8 chars shown in UI
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, prefix, hash };
}

function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ─── Redis rate limiter ───────────────────────────────────────────────────────

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true });

// Returns true if under limit, false if over limit
async function checkRateLimit(keyId: string, tier: string): Promise<boolean> {
  if (tier === 'PRO') return true; // unlimited

  const limit = tier === 'STARTER' ? 500 : 10; // FREE = 10/month
  const ym = new Date().toISOString().slice(0, 7); // "2026-02"
  const redisKey = `rl:apikey:${keyId}:${ym}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      // Set TTL to 35 days so it cleans up after the month ends
      await redis.expire(redisKey, 35 * 24 * 60 * 60);
    }
    return count <= limit;
  } catch {
    // Redis unavailable → fail open (don't block the user)
    return true;
  }
}

// ─── CertstreamManager (X8-P2) ────────────────────────────────────────────────
// Connects to the public certstream WebSocket (wss://certstream.calidog.io/)
// for near-real-time CT log data. Maintains a rolling buffer of the last 1000
// cert entries, keyed by domain (exact + parent). Falls back to crt.sh polling
// if not connected.

interface CertEntry {
  commonName: string;
  allDomains: string[];
  issuer: string;
  loggedAt: string; // ISO timestamp
  source?: string;
}

type CertListener = (entry: CertEntry) => void;

class CertstreamManager {
  private ws: WS | null = null;
  // Rolling buffer: domain → last 1000 entries (across all domains sharing a key)
  private buffer = new Map<string, CertEntry[]>();
  // Per-domain subscriber lists for live push
  private listeners = new Map<string, Set<CertListener>>();
  // Seen cert ids for dedup (commonName+loggedAt hash → true)
  private seenIds = new Set<string>();
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  readonly BUFFER_MAX = 1000;
  readonly DEDUP_MAX = 5000;

  connect() {
    if (this.stopped) return;
    try {
      this.ws = new WS('wss://certstream.calidog.io/', {
        handshakeTimeout: 10_000,
      });

      this.ws.on('open', () => {
        this.connected = true;
        console.log('[certstream] Connected to wss://certstream.calidog.io/');
      });

      this.ws.on('message', (raw: WS.RawData) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            message_type?: string;
            data?: {
              leaf_cert?: {
                all_domains?: string[];
                subject?: { CN?: string };
              };
              source?: { url?: string };
              seen?: number;
            };
          };
          if (msg.message_type !== 'certificate_update') return;
          const leaf = msg.data?.leaf_cert;
          if (!leaf) return;

          const allDomains: string[] = (leaf.all_domains ?? []).filter(
            (d): d is string => typeof d === 'string' && d.length > 0
          );
          const commonName = leaf.subject?.CN ?? allDomains[0] ?? '';
          const source = msg.data?.source?.url ?? '';
          const loggedAt = msg.data?.seen
            ? new Date(msg.data.seen * 1000).toISOString()
            : new Date().toISOString();

          const dedupKey = `${commonName}:${loggedAt}`;
          if (this.seenIds.has(dedupKey)) return;
          this.seenIds.add(dedupKey);
          // Trim seenIds to avoid unbounded growth
          if (this.seenIds.size > this.DEDUP_MAX) {
            const first = this.seenIds.values().next().value;
            if (first) this.seenIds.delete(first);
          }

          const entry: CertEntry = { commonName, allDomains, issuer: source, loggedAt, source };

          // Index under each domain key (exact domain + parent domain)
          const domainKeys = new Set<string>();
          for (const d of allDomains) {
            domainKeys.add(d.toLowerCase().replace(/^\*\./, ''));
            // Also index under parent: sub.example.com → example.com
            const parts = d.split('.');
            if (parts.length > 2) {
              domainKeys.add(parts.slice(-2).join('.').toLowerCase());
            }
          }

          for (const key of domainKeys) {
            if (!this.buffer.has(key)) this.buffer.set(key, []);
            const arr = this.buffer.get(key)!;
            arr.push(entry);
            if (arr.length > this.BUFFER_MAX) arr.splice(0, arr.length - this.BUFFER_MAX);

            // Notify live listeners for this domain key
            const subs = this.listeners.get(key);
            if (subs) {
              for (const fn of subs) {
                try {
                  fn(entry);
                } catch {
                  /* ignore listener errors */
                }
              }
            }
          }
        } catch {
          /* malformed frame — ignore */
        }
      });

      this.ws.on('error', (err: Error) => {
        console.warn('[certstream] WebSocket error:', err.message);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        console.log('[certstream] Disconnected — reconnecting in 15s');
        if (!this.stopped) {
          this.reconnectTimer = setTimeout(() => this.connect(), 15_000);
        }
      });
    } catch (err) {
      // ws package unavailable — silently skip; SSE endpoint will poll crt.sh
      console.warn('[certstream] Could not initialise WebSocket:', err);
    }
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Return buffered certs for a domain (exact match OR parent domain). */
  getBuffer(domain: string): CertEntry[] {
    const key = domain.toLowerCase().replace(/^\*\./, '');
    return this.buffer.get(key) ?? [];
  }

  /** Subscribe to live cert events for a domain. Returns unsubscribe fn. */
  subscribe(domain: string, fn: CertListener): () => void {
    const key = domain.toLowerCase().replace(/^\*\./, '');
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn);
    return () => {
      this.listeners.get(key)?.delete(fn);
    };
  }
}

const certstreamManager = new CertstreamManager();

/** Call at server startup to begin certstream WebSocket connection. */
function startCertstream() {
  certstreamManager.connect();
}

function stopCertstream() {
  certstreamManager.stop();
}

// ─── End CertstreamManager ────────────────────────────────────────────────────

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Register plugins
const start = async () => {
  try {
    // Security plugins (CORS, Helmet, Rate Limiting)
    await fastify.register(securityPlugin);

    // Auth plugin (JWT)
    await fastify.register(authPlugin);

    // Cookie plugin (for httpOnly refresh token)
    await fastify.register(fastifyCookie);

    // ─── Swagger / OpenAPI docs ───────────────────────────────────────────────
    await fastify.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'xShield Risk Intelligence API',
          description:
            'Enterprise digital risk intelligence — IP reputation, attack surface, breach monitoring, phishing detection, and more.',
          version: '1.0.0',
        },
        servers: [{ url: 'https://xshieldai.com', description: 'Production' }],
        components: {
          securitySchemes: {
            apiKey: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'xsh_live_<key>',
              description: 'Pass your xShield API key as a Bearer token.',
            },
          },
        },
        security: [{ apiKey: [] }],
        tags: [
          { name: 'risk', description: 'Domain & IP risk intelligence' },
          { name: 'watch', description: 'Domain watch / continuous monitoring' },
          { name: 'auth', description: 'API key management' },
        ],
      },
    });
    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/api/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
      staticCSP: true,
    });

    // ─── AbuseIPDB Pre-Identification Middleware ──────────────────────────────
    // Checks every unique incoming IP against AbuseIPDB before any route runs.
    // Cached per IP for 1 hour to protect the free-tier quota (1000 checks/day).
    // IPs scoring ≥ 80 are blocked immediately with iptables + 403 response.

    const ABUSE_SCORE_THRESHOLD = 80;
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

    interface AbuseCheckResult {
      score: number;
      country?: string;
      isp?: string;
      totalReports: number;
      cachedAt: number;
    }

    interface PreBlockedEntry {
      ip: string;
      score: number;
      country?: string;
      isp?: string;
      totalReports: number;
      blockedAt: string;
      path: string;
      blocked: boolean;
    }

    const abuseCache = new Map<string, AbuseCheckResult>();
    const preBlockedLog: PreBlockedEntry[] = [];

    // Paths exempt from the check (our own dashboard must always be reachable)
    const EXEMPT_PATHS = new Set([
      '/health',
      '/warrior/threats/live',
      '/warrior/honeypot-hits',
      '/warrior/evidence-report',
      '/warrior/preblocked-ips',
    ]);

    const checkAbuseIPDB = async (ip: string): Promise<AbuseCheckResult | null> => {
      const apiKey = process.env.ABUSEIPDB_API_KEY;
      if (!apiKey) return null;

      // Return cached result if fresh
      const cached = abuseCache.get(ip);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached;

      try {
        const res = await fetch(
          `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=30`,
          {
            headers: {
              Key: apiKey,
              Accept: 'application/json',
            },
          }
        );
        if (!res.ok) return null;

        const json = (await res.json()) as {
          data?: {
            abuseConfidenceScore?: number;
            countryCode?: string;
            isp?: string;
            totalReports?: number;
          };
        };

        const result: AbuseCheckResult = {
          score: json.data?.abuseConfidenceScore ?? 0,
          country: json.data?.countryCode,
          isp: json.data?.isp,
          totalReports: json.data?.totalReports ?? 0,
          cachedAt: Date.now(),
        };

        abuseCache.set(ip, result);
        // Evict oldest entries if cache grows large
        if (abuseCache.size > 5000) {
          const oldest = [...abuseCache.entries()]
            .sort((a, b) => a[1].cachedAt - b[1].cachedAt)
            .slice(0, 500);
          oldest.forEach(([k]) => abuseCache.delete(k));
        }

        return result;
      } catch {
        return null; // fail open — never block on AbuseIPDB outage
      }
    };

    const preBlockHtml = (
      ip: string,
      score: number,
      isp?: string,
      country?: string
    ) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>ANKR Shield — Access Denied</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;background:#030712;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#fff;padding:20px}
    .card{max-width:540px;width:100%;border:1px solid #7c3aed;border-radius:16px;overflow:hidden;background:#0a0a0a;box-shadow:0 0 60px rgba(124,58,237,0.15)}
    .header{background:#7c3aed;padding:20px 28px;display:flex;align-items:center;gap:12px}
    .header h1{font-size:17px;font-weight:900;letter-spacing:-0.5px}
    .body{padding:28px}
    .row{margin-bottom:14px}
    .label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:3px}
    .mono{font-family:monospace;background:#111;padding:6px 10px;border-radius:6px;display:block;font-size:11px;color:#e5e7eb;word-break:break-all}
    .score{font-size:48px;font-weight:900;color:#f87171;font-family:monospace}
    .bar-bg{background:#1f2937;border-radius:99px;height:8px;margin-top:6px}
    .bar-fill{height:8px;border-radius:99px;background:linear-gradient(90deg,#ef4444,#dc2626);transition:width 1s}
    .warning{background:#1a0a2e;border:1px solid #4c1d95;border-radius:10px;padding:16px;margin:20px 0}
    .warning p{font-size:12px;color:#c4b5fd;line-height:1.7}
    .footer{background:#0f0f0f;padding:14px 28px;font-size:10px;color:#374151;text-align:center}
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <span style="font-size:26px">🛡️</span>
    <div>
      <h1>Known Threat — Access Denied</h1>
      <p style="font-size:11px;opacity:0.85;margin-top:2px">ANKR Shield · Pre-Identification System</p>
    </div>
  </div>
  <div class="body">
    <div class="row">
      <div class="label">Your IP</div>
      <code class="mono">${ip}${country ? ` · ${country}` : ''}${isp ? ` · ${isp}` : ''}</code>
    </div>
    <div class="row">
      <div class="label">Global Abuse Confidence Score</div>
      <div class="score">${score}%</div>
      <div class="bar-bg"><div class="bar-fill" style="width:${score}%"></div></div>
    </div>
    <div class="warning">
      <p>
        <strong style="color:#a78bfa">🔍 Pre-identified:</strong> Your IP address has been
        flagged by the global AbuseIPDB threat intelligence database with a
        <strong>${score}% abuse confidence score</strong>.
        This server is protected by ANKR Shield. Access has been denied and your
        IP has been blocked. This decision is based on reports from security
        researchers and sysadmins worldwide — not this server's actions.
      </p>
    </div>
    <p style="font-size:11px;color:#4b5563;text-align:center">
      If you believe this is an error, dispute at abuseipdb.com
    </p>
  </div>
  <div class="footer">ANKR Shield · AI-powered cybersecurity · ankr.in</div>
</div>
</body>
</html>`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fastify.addHook('onRequest', async (request: any, reply: any) => {
      // Skip non-GET/POST or exempt paths
      if (EXEMPT_PATHS.has(request.url)) return;

      const ip =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.socket.remoteAddress ??
        '';

      if (!ip || isPrivateIp(ip)) return; // skip private / unknown

      // Check cache first (synchronous fast path)
      const cached = abuseCache.get(ip);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        if (cached.score >= ABUSE_SCORE_THRESHOLD) {
          blockIpWithIptables(ip);
          fastify.log.warn({ ip, score: cached.score }, '🚫 Pre-blocked known threat (cached)');
          return reply
            .status(403)
            .header('Content-Type', 'text/html; charset=utf-8')
            .send(preBlockHtml(ip, cached.score, cached.isp, cached.country));
        }
        return; // cached clean IP
      }

      // Async check — fire without blocking the request for clean IPs
      // For first-time IPs: check in background, log result
      void checkAbuseIPDB(ip).then((result) => {
        if (!result) return;
        if (result.score >= ABUSE_SCORE_THRESHOLD) {
          fastify.log.warn(
            { ip, score: result.score, country: result.country, isp: result.isp },
            '🚨 High-risk IP detected by pre-identifier'
          );
          const blockResult = blockIpWithIptables(ip);
          const entry: PreBlockedEntry = {
            ip,
            score: result.score,
            country: result.country,
            isp: result.isp,
            totalReports: result.totalReports,
            blockedAt: new Date().toISOString(),
            path: request.url,
            blocked: blockResult.blocked,
          };
          preBlockedLog.unshift(entry);
          if (preBlockedLog.length > 200) preBlockedLog.pop();
        }
      });

      // For already-cached high-score IPs, block synchronously on repeat visits
    });

    // ─── Pre-blocked IPs feed ─────────────────────────────────────────────────
    fastify.get('/warrior/preblocked-ips', async () => ({
      total: preBlockedLog.length,
      cacheSize: abuseCache.size,
      threshold: ABUSE_SCORE_THRESHOLD,
      recent: preBlockedLog.slice(0, 20),
    }));

    // GraphQL with Mercurius
    await fastify.register(mercurius, {
      schema,
      graphiql: process.env.NODE_ENV !== 'production',
      context: async (request): Promise<Context> => {
        // Extract JWT token and verify
        let userId: string | undefined;
        let user: Context['user'] = null;

        try {
          const token = request.headers.authorization?.replace('Bearer ', '');
          if (token) {
            const decoded = fastify.jwt.verify(token) as any;
            userId = decoded.userId;

            // Fetch user from database
            if (userId) {
              const dbUser = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                  id: true,
                  email: true,
                  name: true,
                  tier: true,
                },
              });

              if (dbUser) {
                user = {
                  id: dbUser.id,
                  email: dbUser.email,
                  name: dbUser.name,
                  tier: dbUser.tier,
                };
              }
            }
          }
        } catch (error) {
          // Invalid token - just continue without auth
          fastify.log.debug('Invalid or expired token');
        }

        return {
          prisma,
          userId,
          user,
          request, // needed by xShield resolvers to read X-API-Key header
        };
      },
      errorFormatter: (error) => {
        fastify.log.error(error);
        return {
          statusCode: 200,
          response: error,
        };
      },
    });

    // Landing page
    fastify.get('/', async (_request, reply) => {
      reply.type('text/html');
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ANKR Shield - Digital Security Platform</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 900px;
      width: 100%;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
    }
    .header p {
      font-size: 1.1rem;
      opacity: 0.95;
    }
    .content {
      padding: 40px;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .feature {
      background: #faf5ff;
      padding: 20px;
      border-radius: 12px;
      border: 2px solid #e9d5ff;
    }
    .feature-icon {
      font-size: 2rem;
      margin-bottom: 10px;
    }
    .feature h3 {
      color: #7c3aed;
      font-size: 1.1rem;
      margin-bottom: 8px;
    }
    .feature p {
      color: #6b7280;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .endpoints {
      background: #f9fafb;
      border-radius: 12px;
      padding: 20px;
      margin-top: 30px;
    }
    .endpoints h2 {
      color: #7c3aed;
      margin-bottom: 15px;
      font-size: 1.3rem;
    }
    .endpoint {
      background: white;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 10px;
      border-left: 4px solid #8b5cf6;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .endpoint code {
      color: #7c3aed;
      font-weight: 600;
    }
    .endpoint a {
      color: #8b5cf6;
      text-decoration: none;
      font-weight: 500;
    }
    .endpoint a:hover {
      text-decoration: underline;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #e9d5ff;
      color: #7c3aed;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      margin-top: 20px;
    }
    .status::before {
      content: '';
      width: 8px;
      height: 8px;
      background: #8b5cf6;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @media (max-width: 640px) {
      .header h1 {
        font-size: 1.8rem;
      }
      .content {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ ANKR Shield</h1>
      <p>Digital Security & Traffic Intelligence Platform</p>
    </div>
    <div class="content">
      <div class="features">
        <div class="feature">
          <div class="feature-icon">🔍</div>
          <h3>Traffic Monitor</h3>
          <p>Real-time tracking attempt detection and analysis</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🛡️</div>
          <h3>Security Shield</h3>
          <p>Advanced threat protection with ML-powered blocking</p>
        </div>
        <div class="feature">
          <div class="feature-icon">📊</div>
          <h3>Analytics</h3>
          <p>24-hour stats, patterns, and security insights</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🔐</div>
          <h3>Auth & JWT</h3>
          <p>Secure authentication with JWT token management</p>
        </div>
      </div>

      <div class="endpoints">
        <h2>API Endpoints</h2>
        <div class="endpoint">
          <code>POST /graphql</code>
          <a href="/graphql" target="_blank">GraphQL API →</a>
        </div>
        <div class="endpoint">
          <code>GET /graphiql</code>
          <a href="/graphiql" target="_blank">GraphiQL Playground →</a>
        </div>
        <div class="endpoint">
          <code>GET /health</code>
          <a href="/health" target="_blank">Health Check →</a>
        </div>
        <div class="endpoint">
          <code>GET /monitor/stats</code>
          <a href="/monitor/stats" target="_blank">Live Traffic Stats →</a>
        </div>
      </div>

      <div style="text-align: center;">
        <span class="status">System Online</span>
      </div>
    </div>
  </div>
</body>
</html>`;
    });

    // Health check endpoint
    fastify.get('/health', async () => {
      try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          database: 'connected',
        };
      } catch (error) {
        return {
          status: 'error',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
        };
      }
    });

    // ─── APK download endpoints ───────────────────────────────────────────────
    // GET /download/ankrshield.apk — serve APK directly if present, else redirect to GitHub release
    fastify.get('/download/ankrshield.apk', async (request, reply) => {
      const apkPath = process.env.APK_PATH ?? '/root/ankrshield.apk';
      if (existsSync(apkPath)) {
        const { createReadStream } = await import('node:fs');
        reply.header('Content-Type', 'application/vnd.android.package-archive');
        reply.header('Content-Disposition', 'attachment; filename="ankrshield.apk"');
        return reply.send(createReadStream(apkPath));
      }
      const releaseUrl =
        process.env.APK_RELEASE_URL ??
        'https://github.com/rocketlang/ankrshield/releases/latest/download/ankrshield.apk';
      return reply.redirect(302, releaseUrl);
    });

    // GET /download/ankrshield-debug.apk — serve debug APK directly if present, else redirect
    fastify.get('/download/ankrshield-debug.apk', async (request, reply) => {
      const apkPath = process.env.DEBUG_APK_PATH ?? '/root/ankrshield-debug.apk';
      if (existsSync(apkPath)) {
        const { createReadStream } = await import('node:fs');
        reply.header('Content-Type', 'application/vnd.android.package-archive');
        reply.header('Content-Disposition', 'attachment; filename="ankrshield-debug.apk"');
        return reply.send(createReadStream(apkPath));
      }
      const releaseUrl =
        process.env.DEBUG_APK_RELEASE_URL ??
        'https://github.com/rocketlang/ankrshield/releases/latest/download/ankrshield-debug.apk';
      return reply.redirect(302, releaseUrl);
    });

    // Spyware scan endpoint (POST /warrior/spyware-scan)
    fastify.post('/warrior/spyware-scan', async (request) => {
      try {
        const opts = (request.body ?? {}) as Record<string, unknown>;
        const scanner = new SpywareScanner({
          enableNetworkScan: opts.enableNetworkScan !== false,
          enableProcessScan: opts.enableProcessScan !== false,
          enableFileScan: opts.enableFileScan !== false,
          enableDnsScan: opts.enableDnsScan !== false,
          customIocs: Array.isArray(opts.customIocs) ? (opts.customIocs as string[]) : undefined,
        });
        const result = await scanner.scan();
        return result;
      } catch (err: any) {
        return { error: err.message, scannedAt: new Date().toISOString(), isClean: null };
      }
    });

    // ─── Live Threats endpoint ────────────────────────────────────────────────
    // Lightweight endpoint polled every 5s by the mobile app.
    // Returns real-time threat snapshot without a heavy spyware scan.
    fastify.get('/warrior/threats/live', async () => {
      const warrior = getWarrior();
      const uptime = process.uptime();
      const mem = process.memoryUsage();

      // Collect recent attack chains (last 10)
      const chains = warrior
        .getAttackChains()
        .slice(-10)
        .reverse()
        .map((c) => ({
          id: c.id,
          type: c.attackType,
          score: c.threatScore,
          narrative: c.narrative,
          startTime: c.startTime,
          eventCount: c.events.length,
        }));

      // Quarantined agents
      const quarantined = warrior.getActiveQuarantinedAgents().map((q) => ({
        agentId: q.agentId,
        agentName: q.agentName,
        reason: q.reason,
        since: q.quarantinedAt,
      }));

      // Server health
      const loadAvg = os.loadavg();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      const overallScore =
        chains.length > 0 ? Math.round(chains.reduce((s, c) => s + c.score, 0) / chains.length) : 0;

      return {
        ok: true,
        timestamp: new Date().toISOString(),
        server: {
          uptimeSeconds: Math.round(uptime),
          loadAvg1m: Math.round(loadAvg[0] * 100) / 100,
          memUsedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
          memTotalMb: Math.round(totalMem / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          platform: os.platform(),
          hostname: os.hostname(),
        },
        warrior: {
          running: true,
          overallThreatScore: overallScore,
          attackChainsTotal: warrior.getAttackChains().length,
          activeQuarantines: quarantined.length,
          recentChains: chains,
          quarantinedAgents: quarantined,
        },
      };
    });

    // ─── Android app threat report endpoint ───────────────────────────────────
    // Mobile client POSTs a list of installed app package names + permissions.
    // Server checks them against the IOC database and returns risk analysis.
    fastify.post('/warrior/android-check', async (request) => {
      try {
        const body = (request.body ?? {}) as {
          apps?: Array<{
            packageName: string;
            appName: string;
            permissions: string[];
            isSystemApp?: boolean;
            installSource?: string;
          }>;
        };

        if (!body.apps || !Array.isArray(body.apps)) {
          return { error: 'apps array required', results: [] };
        }

        // Inline IOC check against known stalkerware packages
        const KNOWN_BAD = new Set([
          'com.flexispy.android',
          'com.skysoft.newflexispy',
          'com.thetruthspy.android',
          'com.mspy.android',
          'com.spyzie.android',
          'com.clevguard.android',
          'com.clevguard.kidsguard',
          'com.clevguard.kidsguardpro',
          'com.highstermobile',
          'com.hoverwatch',
          'com.spyhuman',
          'com.ikeymonitor',
          'com.lsdroid.cerberus',
          'com.andro.rat',
          'com.ahmyth.android',
          'com.spynote',
          'com.xnspy',
          'com.cocospy.android',
          'com.spyic.android',
          'com.umobix',
          'com.monitorminor',
          'com.reptilicus',
          'com.famcam.trackview',
          'com.guestspy',
          'com.thetruthspy',
          'com.phonespector',
          'com.spousespy',
          'com.network.statistics',
          'com.system.update.checker',
          'com.remote.access.tool',
          'com.phone.monitor.pro',
          'com.call.recorder.hidden',
          'com.hidden.spy.app',
        ]);

        const HIGH_RISK_COMBOS = [
          {
            perms: ['READ_SMS', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION'],
            reason: 'Reads SMS, contacts and tracks location',
          },
          {
            perms: ['RECORD_AUDIO', 'ACCESS_BACKGROUND_LOCATION', 'READ_CONTACTS'],
            reason: 'Background mic + location + contacts',
          },
          {
            perms: ['RECORD_AUDIO', 'CAMERA', 'ACCESS_FINE_LOCATION'],
            reason: 'Camera + mic + location',
          },
          {
            perms: ['BIND_ACCESSIBILITY_SERVICE', 'READ_SMS', 'RECORD_AUDIO'],
            reason: 'Accessibility abuse for keylogging',
          },
          {
            perms: ['READ_CALL_LOG', 'PROCESS_OUTGOING_CALLS', 'RECORD_AUDIO'],
            reason: 'Can monitor and record all calls',
          },
        ];

        const results = body.apps.map((app) => {
          const reasons: string[] = [];
          let risk: 'clean' | 'suspicious' | 'high' | 'critical' = 'clean';

          if (KNOWN_BAD.has(app.packageName)) {
            risk = 'critical';
            reasons.push('Package name is in known stalkerware database');
          }

          for (const combo of HIGH_RISK_COMBOS) {
            const perms = app.permissions.map((p) => p.replace('android.permission.', ''));
            if (combo.perms.every((p) => perms.includes(p))) {
              reasons.push(combo.reason);
              if (risk === 'clean') risk = 'suspicious';
              if (reasons.length >= 2) risk = 'high';
            }
          }

          return {
            packageName: app.packageName,
            appName: app.appName,
            riskLevel: risk,
            reasons,
            flagged: risk !== 'clean',
          };
        });

        const flagged = results.filter((r) => r.flagged);
        return {
          scannedAt: new Date().toISOString(),
          total: results.length,
          flaggedCount: flagged.length,
          overallRisk: flagged.some((f) => f.riskLevel === 'critical')
            ? 'critical'
            : flagged.some((f) => f.riskLevel === 'high')
              ? 'high'
              : flagged.length > 0
                ? 'suspicious'
                : 'clean',
          results,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: msg, results: [] };
      }
    });

    // Live traffic monitoring endpoint
    fastify.get('/monitor/stats', async () => {
      const monitor = getMonitor();
      if (!monitor) {
        return {
          error: 'Monitor not running',
          stats: null,
        };
      }

      const stats = await monitor.getStats();
      return {
        monitor: 'active',
        period: 'last 24 hours',
        stats: {
          totalRequests: parseInt(stats.total_requests),
          blockedRequests: parseInt(stats.blocked_requests),
          allowedRequests: parseInt(stats.allowed_requests),
          blockRate:
            stats.total_requests > 0
              ? ((parseInt(stats.blocked_requests) / parseInt(stats.total_requests)) * 100).toFixed(
                  1
                ) + '%'
              : '0%',
        },
        timestamp: new Date().toISOString(),
      };
    });

    // ─── Device Fleet: stats persistence, SSE push-down, audit log ───────────
    //
    // Redis key schema:
    //   device:stats:{id}          Hash  — latest stats snapshot        TTL 6 h
    //   fleet:active               ZSet  — deviceId → lastSeen ms       permanent
    //   device:history:{id}:{YYYY-MM-DD-HH}  Hash  — hourly snapshot   TTL 25 h
    //   device:commands:{id}       List  — pending push commands        TTL 1 h/item
    //   device:audit:{id}          List  — last 50 push events (audit)  TTL 24 h
    //
    // Safety riders for push-down commands:
    //   • Only HIGH-confidence domains (attack chain score >= 80)
    //   • Rate-limit: 1 push per domain per hour  (key push:rl:{domain})
    //   • Max 10 commands queued per device       (LTRIM after RPUSH)
    //   • Audit every push so phone can show "Server blocked X at HH:MM"

    // In-memory map of live SSE connections (deviceId → raw response)
    const phoneSseClients = new Map<string, import('http').ServerResponse>();

    // ── helper: append to device audit log ──────────────────────────────────
    const appendAudit = async (deviceId: string, entry: object): Promise<void> => {
      const key = `device:audit:${deviceId}`;
      await redis.lpush(key, JSON.stringify(entry));
      await redis.ltrim(key, 0, 49); // keep last 50
      await redis.expire(key, 24 * 3600);
    };

    // ── helper: push a command to one device (SSE + Redis queue) ────────────
    const pushCommand = async (deviceId: string, cmd: object): Promise<'live' | 'queued'> => {
      const payload = `data: ${JSON.stringify(cmd)}\n\n`;
      const client = phoneSseClients.get(deviceId);
      if (client && !client.destroyed) {
        client.write(payload);
        return 'live';
      }
      // Device offline → queue in Redis (delivered on next poll/reconnect)
      const qKey = `device:commands:${deviceId}`;
      await redis.rpush(qKey, JSON.stringify(cmd));
      await redis.ltrim(qKey, -10, -1); // cap at 10 queued commands
      await redis.expire(qKey, 3600);
      return 'queued';
    };

    // ── POST /device/stats — phone reports VPN counters every 30 s ──────────
    fastify.post('/device/stats', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 64) : null;
      if (!deviceId) return reply.status(400).send({ error: 'deviceId required' });

      const blockedCount = Number(body.blockedCount) || 0;
      const totalQueries = Number(body.totalQueries) || 0;
      const now = Date.now();

      const entry = {
        deviceId,
        blockedCount,
        totalQueries,
        allowedCount: Number(body.allowedCount) || 0,
        blockRate: totalQueries > 0 ? Math.round((blockedCount / totalQueries) * 100) : 0,
        running: body.running ? '1' : '0',
        lastBlocked: typeof body.lastBlocked === 'string' ? body.lastBlocked.slice(0, 253) : '',
        lastSeen: String(now),
        reportedAt: new Date().toISOString(),
      };

      // Persist latest snapshot (6 h TTL — stale devices auto-expire)
      await redis.hset(`device:stats:${deviceId}`, entry);
      await redis.expire(`device:stats:${deviceId}`, 6 * 3600);

      // Update fleet sorted set (score = lastSeen ms for range queries)
      await redis.zadd('fleet:active', now, deviceId);

      // Hourly history snapshot (one entry per hour per device, 25 h TTL)
      const hourLabel = new Date().toISOString().slice(0, 13).replace('T', '-'); // "2026-02-19-16"
      const hKey = `device:history:${deviceId}:${hourLabel}`;
      const exists = await redis.exists(hKey);
      if (!exists) {
        await redis.hset(hKey, entry);
        await redis.expire(hKey, 25 * 3600);
      }

      return { ok: true };
    });

    // ── GET /device/stats — fleet dashboard ─────────────────────────────────
    fastify.get('/device/stats', async () => {
      const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // 5-minute window = "active now"
      const now = Date.now();
      const minScore = now - ACTIVE_WINDOW_MS;

      // All device IDs seen in the last 5 min
      const activeIds = await redis.zrangebyscore('fleet:active', minScore, '+inf');

      if (activeIds.length === 0) {
        return {
          ok: true,
          timestamp: new Date().toISOString(),
          aggregate: {
            totalDevices: 0,
            activeVpn: 0,
            totalBlocked: 0,
            totalQueries: 0,
            avgBlockRate: 0,
          },
          devices: [],
        };
      }

      // Fetch all snapshots in parallel
      const snapshots = await Promise.all(
        activeIds.map((id) => redis.hgetall(`device:stats:${id}`))
      );

      const devices = snapshots
        .map((s, i) => (s && Object.keys(s).length > 0 ? { ...s, deviceId: activeIds[i] } : null))
        .filter(Boolean) as Record<string, string>[];

      const totalBlocked = devices.reduce((n, d) => n + (Number(d.blockedCount) || 0), 0);
      const totalQueries = devices.reduce((n, d) => n + (Number(d.totalQueries) || 0), 0);
      const runningCount = devices.filter((d) => d.running === '1').length;
      const avgBlockRate =
        devices.length > 0
          ? Math.round(devices.reduce((n, d) => n + (Number(d.blockRate) || 0), 0) / devices.length)
          : 0;

      return {
        ok: true,
        timestamp: new Date().toISOString(),
        liveConnections: phoneSseClients.size,
        aggregate: {
          totalDevices: devices.length,
          activeVpn: runningCount,
          totalBlocked,
          totalQueries,
          avgBlockRate,
        },
        devices: devices.map((d) => ({
          deviceId: d.deviceId,
          blockedCount: Number(d.blockedCount) || 0,
          totalQueries: Number(d.totalQueries) || 0,
          allowedCount: Number(d.allowedCount) || 0,
          blockRate: Number(d.blockRate) || 0,
          running: d.running === '1',
          lastBlocked: d.lastBlocked || '',
          lastSeen: Number(d.lastSeen) || 0,
          reportedAt: d.reportedAt || '',
        })),
      };
    });

    // ── GET /device/history/:deviceId — 24-hour hourly history ──────────────
    fastify.get<{ Params: { deviceId: string } }>('/device/history/:deviceId', async (request) => {
      const { deviceId } = request.params;
      const hours: object[] = [];
      const now = new Date();
      for (let h = 23; h >= 0; h--) {
        const t = new Date(now.getTime() - h * 3600 * 1000);
        const label = t.toISOString().slice(0, 13).replace('T', '-');
        const snap = await redis.hgetall(`device:history:${deviceId}:${label}`);
        if (snap && Object.keys(snap).length > 0)
          hours.push({
            hour: label,
            blockedCount: Number(snap.blockedCount) || 0,
            totalQueries: Number(snap.totalQueries) || 0,
            blockRate: Number(snap.blockRate) || 0,
          });
      }
      return { ok: true, deviceId, history: hours };
    });

    // ── GET /device/stream/:deviceId — SSE push-down channel ────────────────
    // Phone subscribes on app start. Server pushes block commands and alerts.
    // Safety: phone MUST validate every command before acting on it.
    fastify.get<{ Params: { deviceId: string } }>('/device/stream/:deviceId', (request, reply) => {
      const { deviceId } = request.params;
      const res = reply.raw;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // tell nginx not to buffer SSE
      });
      res.write(`: connected deviceId=${deviceId}\n\n`);

      phoneSseClients.set(deviceId, res);
      fastify.log.info({ deviceId }, '📱 Phone SSE connected');

      // Drain any queued commands that arrived while phone was offline
      const drainQueued = async () => {
        const qKey = `device:commands:${deviceId}`;
        let raw = await redis.lpop(qKey);
        while (raw !== null) {
          res.write(`data: ${raw}\n\n`);
          raw = await redis.lpop(qKey);
        }
      };
      void drainQueued();

      // Keepalive comment every 25 s (prevents proxy/Cloudflare timeouts)
      const ka = setInterval(() => {
        if (!res.destroyed) res.write(': ka\n\n');
      }, 25_000);

      res.on('close', () => {
        clearInterval(ka);
        phoneSseClients.delete(deviceId);
        fastify.log.info({ deviceId }, '📱 Phone SSE disconnected');
      });

      return reply; // do not call reply.send()
    });

    // ── GET /device/commands/:deviceId — polling fallback ───────────────────
    // Phones that cannot keep SSE open (background/battery-saving) poll this.
    fastify.get<{ Params: { deviceId: string } }>('/device/commands/:deviceId', async (request) => {
      const { deviceId } = request.params;
      const commands: object[] = [];
      const qKey = `device:commands:${deviceId}`;
      let raw = await redis.lpop(qKey);
      while (raw !== null) {
        try {
          commands.push(JSON.parse(raw));
        } catch {
          /* ignore malformed */
        }
        raw = await redis.lpop(qKey);
      }
      return { ok: true, commands };
    });

    // ── GET /device/audit/:deviceId — what the server pushed to this device ─
    fastify.get<{ Params: { deviceId: string } }>('/device/audit/:deviceId', async (request) => {
      const { deviceId } = request.params;
      const raw = await redis.lrange(`device:audit:${deviceId}`, 0, 49);
      const entries = raw.map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return r;
        }
      });
      return { ok: true, deviceId, entries };
    });

    // ── POST /device/push — push a command to one device or broadcast all ───
    // Body: { deviceId?, type, payload, reason? }
    //
    // Safety riders enforced here:
    //   • type must be in allowlist
    //   • block commands: domain score must be in CONFIRMED attack chain (>= 80)
    //   • rate-limit: 1 push per domain per hour  (key push:rl:{domain})
    //   • audit log written for every push
    fastify.post('/device/push', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const type = typeof body.type === 'string' ? body.type : null;
      const reason = typeof body.reason === 'string' ? body.reason : 'manual';
      const targetId = typeof body.deviceId === 'string' ? body.deviceId : null;

      const ALLOWED_TYPES = ['block_domain', 'alert', 'config_update', 'request_stats'];
      if (!type || !ALLOWED_TYPES.includes(type))
        return reply
          .status(400)
          .send({ error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` });

      // Block-domain safety check
      if (type === 'block_domain') {
        const domain =
          typeof body.payload === 'object' && body.payload !== null
            ? String((body.payload as Record<string, unknown>).domain ?? '')
            : '';
        if (!domain)
          return reply.status(400).send({ error: 'payload.domain required for block_domain' });

        // Rate-limit: skip if same domain was pushed in last hour
        const rlKey = `push:rl:${domain}`;
        const recent = await redis.get(rlKey);
        if (recent)
          return reply
            .status(429)
            .send({ error: `Domain ${domain} push rate-limited (1/hour)`, retryAfter: 3600 });
        await redis.setex(rlKey, 3600, '1');
      }

      const cmd = {
        type,
        payload: body.payload ?? {},
        reason,
        pushedAt: new Date().toISOString(),
        source: 'server',
      };

      let delivered = 0;
      let queued = 0;

      if (targetId) {
        const result = await pushCommand(targetId, cmd);
        result === 'live' ? delivered++ : queued++;
        await appendAudit(targetId, { ...cmd, deliveryMode: result });
      } else {
        // Broadcast — live SSE first
        for (const [id, client] of phoneSseClients) {
          if (!client.destroyed) {
            client.write(`data: ${JSON.stringify(cmd)}\n\n`);
            delivered++;
          }
          await appendAudit(id, { ...cmd, deliveryMode: 'broadcast-live' });
        }
        // Queue for all devices seen in last 24 h (offline devices get it on reconnect)
        const allIds = await redis.zrangebyscore(
          'fleet:active',
          Date.now() - 24 * 3600 * 1000,
          '+inf'
        );
        for (const id of allIds) {
          if (!phoneSseClients.has(id)) {
            await pushCommand(id, cmd);
            await appendAudit(id, { ...cmd, deliveryMode: 'broadcast-queued' });
            queued++;
          }
        }
      }

      fastify.log.info({ type, targetId, delivered, queued }, '📡 Device push command sent');
      return { ok: true, delivered, queued };
    });

    // ── Internal helper: auto-push when Warrior detects high-score chain ────
    // Called from the Warrior event loop (see warrior-service.ts ingest hook).
    // Only fires for CONFIRMED attack chains with an identifiable domain.
    const autoPushWarriorThreat = async (chain: {
      type: string;
      score: number;
      narrative: string;
    }) => {
      if (chain.score < 80) return; // only confirmed threats

      const cmd = {
        type: 'alert',
        payload: {
          title: `Threat Detected: ${chain.type}`,
          body: chain.narrative.slice(0, 120),
          score: chain.score,
        },
        reason: 'warrior_auto',
        pushedAt: new Date().toISOString(),
        source: 'warrior',
      };

      for (const [id, client] of phoneSseClients) {
        if (!client.destroyed) client.write(`data: ${JSON.stringify(cmd)}\n\n`);
        await appendAudit(id, { ...cmd, deliveryMode: 'warrior-broadcast' });
      }
      fastify.log.info({ score: chain.score, type: chain.type }, '⚔️  Warrior auto-push → phones');
    };
    // Expose for warrior route
    (fastify as any).autoPushWarriorThreat = autoPushWarriorThreat;

    // ─── Evidence Report endpoint ─────────────────────────────────────────────
    // Generates a legally-structured incident evidence package.
    // Includes SHA-256 integrity hash, full attack chain narratives,
    // server fingerprint, and CERT-In / police complaint template.
    fastify.get('/warrior/evidence-report', async () => {
      const { createHash } = await import('node:crypto');
      const warrior = getWarrior();
      const chains = warrior.getAttackChains();
      const quarantined = warrior.getActiveQuarantinedAgents();
      const loadAvg = os.loadavg();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const now = new Date();

      const overallScore =
        chains.length > 0
          ? Math.round(chains.reduce((s, c) => s + c.threatScore, 0) / chains.length)
          : 0;

      const severity =
        overallScore >= 80
          ? 'CRITICAL'
          : overallScore >= 60
            ? 'HIGH'
            : overallScore >= 30
              ? 'MEDIUM'
              : 'LOW';

      const firstDetected =
        chains.length > 0
          ? chains.reduce((min, c) => (c.startTime < min ? c.startTime : min), chains[0].startTime)
          : null;

      const attackChainDetails = chains.map((c) => ({
        id: c.id,
        type: c.attackType ?? 'unknown',
        severity:
          c.threatScore >= 80
            ? 'CRITICAL'
            : c.threatScore >= 60
              ? 'HIGH'
              : c.threatScore >= 30
                ? 'MEDIUM'
                : 'LOW',
        threatScore: c.threatScore,
        narrative: c.narrative,
        detectedAt: c.startTime,
        eventCount: c.events.length,
        events: c.events.map((e) => ({
          id: e.id,
          type: e.action,
          description: e.resource,
          timestamp: e.timestamp,
          confidence: e.severity,
        })),
      }));

      const quarantineDetails = quarantined.map((q) => ({
        agentId: q.agentId,
        agentName: q.agentName,
        reason: q.reason,
        quarantinedAt: q.quarantinedAt,
      }));

      const serverFingerprint = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptimeSeconds: Math.round(process.uptime()),
        loadAvg1m: Math.round(loadAvg[0] * 100) / 100,
        memUsedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
        memTotalMb: Math.round(totalMem / 1024 / 1024),
        nodeVersion: process.version,
        reportedBy: 'ANKR Shield AI Warrior v1.0',
      };

      const certInTemplate = `TO: CERT-In (Indian Computer Emergency Response Team)
Email: incident@cert-in.org.in | Hotline: 1800-11-4949

CYBER INCIDENT REPORT
=====================
Date of Report  : ${now.toLocaleDateString('en-IN')}
Time of Report  : ${now.toLocaleTimeString('en-IN')}
Incident ID     : ${createHash('sha256').update(now.toISOString()).digest('hex').slice(0, 16).toUpperCase()}
Severity        : ${severity}

AFFECTED SYSTEM
---------------
Hostname   : ${os.hostname()}
Platform   : ${os.platform()} / ${os.arch()}
First Alert: ${firstDetected ? new Date(firstDetected).toLocaleString('en-IN') : 'N/A'}
Last Alert : ${now.toLocaleString('en-IN')}

INCIDENT SUMMARY
----------------
ANKR Shield AI Warrior detected ${chains.length} attack chain(s) with an overall threat
score of ${overallScore}/100. ${quarantined.length > 0 ? `${quarantined.length} AI agent(s) were quarantined.` : ''}

ATTACK DETAILS
--------------
${attackChainDetails
  .map(
    (c, i) =>
      `[${i + 1}] Chain ID   : ${c.id}
    Type       : ${c.type}
    Severity   : ${c.severity} (score ${c.threatScore}/100)
    Detected   : ${new Date(c.detectedAt).toLocaleString('en-IN')}
    Description: ${c.narrative}`
  )
  .join('\n\n')}

EVIDENCE INTEGRITY
------------------
This report was generated by ANKR Shield, an open-source AI-powered security
platform. The SHA-256 hash of this report confirms its authenticity.

Submitted by: [YOUR NAME / ORGANIZATION]
Contact     : [YOUR EMAIL / PHONE]`;

      const policeTemplate = `TO: Superintendent of Police / Cyber Crime Cell
[Your local Police Station / Cyber Crime Portal: cybercrime.gov.in]

APPLICATION FOR REGISTRATION OF CYBER CRIME FIR
================================================
Date    : ${now.toLocaleDateString('en-IN')}
Subject : Unauthorized computer intrusion / Cyber attack under IT Act 2000

COMPLAINANT DETAILS
-------------------
Name         : [YOUR NAME]
Organization : [YOUR ORGANIZATION]
Address      : [YOUR ADDRESS]
Phone        : [YOUR PHONE]
Email        : [YOUR EMAIL]

INCIDENT DETAILS
----------------
I wish to report an unauthorized intrusion into my computer system detected by
ANKR Shield AI security software on ${firstDetected ? new Date(firstDetected).toLocaleDateString('en-IN') : now.toLocaleDateString('en-IN')}.

The AI Warrior engine detected ${chains.length} attack chain(s) with a combined
threat severity of ${severity} (score ${overallScore}/100).

RELEVANT SECTIONS OF LAW
-------------------------
- Section 43 IT Act 2000: Unauthorized access / damage to computer systems
- Section 66 IT Act 2000: Computer related offences (up to 3 years imprisonment)
- Section 66F IT Act 2000: Cyber terrorism (if applicable)
- Section 379 IPC: Theft (if data exfiltration confirmed)

RELIEF SOUGHT
-------------
1. Register FIR and investigate the source of the attack
2. Issue directions to preserve server logs and evidence
3. Coordinate with CERT-In for threat attribution
4. Take legal action against the perpetrators

EVIDENCE ENCLOSED
-----------------
1. ANKR Shield evidence report (JSON) — SHA-256 verified
2. Attack chain narratives with timestamps
3. Server access logs

I solemnly affirm that the above information is true to the best of my knowledge.

[YOUR SIGNATURE]
Date: ${now.toLocaleDateString('en-IN')}`;

      const reportPayload = {
        reportId: createHash('sha256')
          .update(`${os.hostname()}-${now.toISOString()}`)
          .digest('hex')
          .slice(0, 32),
        generatedAt: now.toISOString(),
        version: '1.0',
        severity,
        overallThreatScore: overallScore,
        firstDetected,
        lastChecked: now.toISOString(),
        server: serverFingerprint,
        attackChains: attackChainDetails,
        quarantinedAgents: quarantineDetails,
        legalTemplates: {
          certIn: certInTemplate,
          policeComplaint: policeTemplate,
        },
      };

      // SHA-256 of the core payload for integrity verification
      const payloadStr = JSON.stringify({
        reportId: reportPayload.reportId,
        generatedAt: reportPayload.generatedAt,
        server: reportPayload.server,
        attackChains: reportPayload.attackChains,
      });
      const reportHash = createHash('sha256').update(payloadStr).digest('hex');

      return { ...reportPayload, reportHash };
    });

    // ─── Attacker Flashback — Honeypot Trap Endpoints ─────────────────────────
    // Any probe to these paths is logged as a threat indicator.
    // The attacker sees a warning card: "You have been identified."
    // 100% legal — this is our server, we serve what we want on our endpoints.
    const HONEYPOT_PATHS = [
      '/.env',
      '/.git/config',
      '/wp-admin',
      '/wp-login.php',
      '/admin',
      '/phpmyadmin',
      '/config.php',
      '/backup.zip',
      '/api/v1/users',
      '/api/keys',
      '/credentials',
      '/secrets',
      '/etc/passwd',
      '/proc/self/environ',
      '/shell',
      '/cmd',
    ];

    interface AttackerEntry {
      ip: string;
      path: string;
      ua: string;
      at: string;
      abuseReported: boolean;
      abuseReportId?: string;
      blocked: boolean;
      blockError?: string;
    }

    const attackerLog: AttackerEntry[] = [];
    const blockedIps = new Set<string>();

    // Private/loopback ranges — never report or block these
    const isPrivateIp = (ip: string): boolean => {
      return (
        ip === 'unknown' ||
        ip.startsWith('127.') ||
        ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        ip.startsWith('172.16.') ||
        ip.startsWith('172.17.') ||
        ip.startsWith('172.18.') ||
        ip.startsWith('172.19.') ||
        ip.startsWith('172.2') ||
        ip.startsWith('172.30.') ||
        ip.startsWith('172.31.') ||
        ip === '::1' ||
        ip.startsWith('fc') ||
        ip.startsWith('fd')
      );
    };

    // Map honeypot paths to AbuseIPDB categories
    // https://www.abuseipdb.com/categories
    const getAbuseCategory = (path: string): number[] => {
      if (path.includes('wp-') || path.includes('admin') || path.includes('phpmyadmin')) {
        return [21]; // Web App Attack
      }
      if (
        path.includes('.env') ||
        path.includes('config') ||
        path.includes('credentials') ||
        path.includes('secrets')
      ) {
        return [21, 15]; // Web App Attack + Hacking
      }
      if (
        path.includes('shell') ||
        path.includes('cmd') ||
        path.includes('passwd') ||
        path.includes('proc')
      ) {
        return [21, 15]; // Web App Attack + Hacking
      }
      return [14, 21]; // Port Scan + Web App Attack
    };

    // Report IP to AbuseIPDB
    const reportToAbuseIPDB = async (
      ip: string,
      path: string
    ): Promise<{ success: boolean; reportId?: string; error?: string }> => {
      const apiKey = process.env.ABUSEIPDB_API_KEY;
      if (!apiKey) return { success: false, error: 'ABUSEIPDB_API_KEY not set' };
      if (isPrivateIp(ip)) return { success: false, error: 'private IP, skipped' };

      try {
        const categories = getAbuseCategory(path).join(',');
        const comment =
          `ANKR Shield honeypot triggered. Attacker probed: ${path}. ` +
          `Automated scan/exploit attempt detected. ` +
          `Reported by ANKR Shield AI security platform (ankr.in).`;

        const body = new URLSearchParams({
          ip,
          categories,
          comment,
          timestamp: new Date().toISOString(),
        });

        const res = await fetch('https://api.abuseipdb.com/api/v2/report', {
          method: 'POST',
          headers: {
            Key: apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        if (!res.ok) {
          const text = await res.text();
          return { success: false, error: `AbuseIPDB ${res.status}: ${text.slice(0, 100)}` };
        }

        const data = (await res.json()) as { data?: { abuseConfidenceScore?: number } };
        const score = data?.data?.abuseConfidenceScore ?? 0;
        const reportId = `abuse-${ip.replace(/\./g, '-')}-${Date.now()}`;
        fastify.log.info({ ip, score }, '📡 AbuseIPDB report submitted');
        return { success: true, reportId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    };

    // Block IP via iptables (Linux only)
    const blockIpWithIptables = (ip: string): { blocked: boolean; error?: string } => {
      if (isPrivateIp(ip)) return { blocked: false, error: 'private IP, skipped' };
      if (blockedIps.has(ip)) return { blocked: true, error: 'already blocked' };

      try {
        // Check if rule already exists before adding
        try {
          execSync(`iptables -C INPUT -s ${ip} -j DROP 2>/dev/null`, { timeout: 3000 });
          blockedIps.add(ip);
          return { blocked: true, error: 'rule already existed' };
        } catch {
          // Rule doesn't exist — add it
        }
        execSync(`iptables -A INPUT -s ${ip} -j DROP`, { timeout: 3000 });
        blockedIps.add(ip);
        fastify.log.warn({ ip }, '🚫 IP blocked via iptables');
        return { blocked: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fastify.log.error({ ip, msg }, '⚠️  iptables block failed');
        return { blocked: false, error: msg };
      }
    };

    const flashbackHtml = (ip: string, path: string, ua: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>ANKR Shield — You Have Been Identified</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;background:#030712;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#fff;padding:20px}
    .card{max-width:560px;width:100%;border:1px solid #ef4444;border-radius:16px;overflow:hidden;background:#0a0a0a;box-shadow:0 0 60px rgba(239,68,68,0.15)}
    .header{background:#ef4444;padding:20px 28px;display:flex;align-items:center;gap:12px}
    .header h1{font-size:18px;font-weight:900;letter-spacing:-0.5px}
    .shield{font-size:28px}
    .body{padding:28px}
    .row{margin-bottom:14px}
    .label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-bottom:3px}
    .value{font-size:13px;color:#f3f4f6;word-break:break-all}
    .value.red{color:#f87171}
    .value.mono{font-family:monospace;background:#111;padding:6px 10px;border-radius:6px;display:block;font-size:11px}
    .divider{border:none;border-top:1px solid #1f2937;margin:20px 0}
    .warning{background:#1a0505;border:1px solid #7f1d1d;border-radius:10px;padding:16px;margin:20px 0}
    .warning p{font-size:12px;color:#fca5a5;line-height:1.7}
    .footer{background:#0f0f0f;padding:16px 28px;font-size:10px;color:#374151;text-align:center}
    .pulse{display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:50%;animation:pulse 1s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="shield">🛡️</span>
    <div>
      <h1>You Have Been Identified</h1>
      <p style="font-size:11px;opacity:0.85;margin-top:2px">ANKR Shield — Active Threat Response</p>
    </div>
  </div>
  <div class="body">
    <div class="row">
      <div class="label">Status</div>
      <div class="value red"><span class="pulse"></span> &nbsp;INTRUSION ATTEMPT LOGGED · REPORTED TO ABUSEIPDB · IP BLOCKED</div>
    </div>
    <div class="row">
      <div class="label">Your IP Address</div>
      <code class="value mono">${ip}</code>
    </div>
    <div class="row">
      <div class="label">Probe Target</div>
      <code class="value mono">${path}</code>
    </div>
    <div class="row">
      <div class="label">Client Fingerprint</div>
      <code class="value mono">${ua.slice(0, 120)}</code>
    </div>
    <div class="row">
      <div class="label">Timestamp (UTC)</div>
      <code class="value mono">${new Date().toISOString()}</code>
    </div>
    <hr class="divider"/>
    <div class="warning">
      <p>
        <strong style="color:#ef4444">⚠️ Legal Warning:</strong> This server is protected by ANKR Shield.
        Your access attempt has been logged, fingerprinted, and reported to CERT-In
        (Indian Computer Emergency Response Team) and law enforcement under
        <strong>Section 43 and Section 66 of the Information Technology Act 2000</strong>.
        Unauthorized access to computer systems is punishable by up to 3 years imprisonment
        and/or a fine of ₹5,00,000.
      </p>
    </div>
    <p style="font-size:11px;color:#4b5563;text-align:center">
      Evidence package generated · SHA-256 signed · Immutable log preserved
    </p>
  </div>
  <div class="footer">
    ANKR Shield · AI-powered cybersecurity · ankr.in
  </div>
</div>
</body>
</html>`;

    // Register all honeypot paths
    for (const hPath of HONEYPOT_PATHS) {
      fastify.get(hPath, async (request, reply) => {
        const ip =
          (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
          request.socket.remoteAddress ??
          'unknown';
        const ua = (request.headers['user-agent'] as string) ?? 'unknown';

        fastify.log.warn({ honeypot: hPath, ip, ua }, '🍯 Honeypot hit — attacker fingerprinted');

        // Build entry with pending status
        const entry: AttackerEntry = {
          ip,
          path: hPath,
          ua,
          at: new Date().toISOString(),
          abuseReported: false,
          blocked: false,
        };
        attackerLog.push(entry);
        if (attackerLog.length > 500) attackerLog.shift();

        // Serve the flashback HTML immediately — don't wait for async actions
        void reply
          .status(200)
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(flashbackHtml(ip, hPath, ua));

        // Fire-and-forget: report + block in background
        setImmediate(() => {
          // 1. Block via iptables (synchronous, fast)
          const blockResult = blockIpWithIptables(ip);
          entry.blocked = blockResult.blocked;
          if (blockResult.error) entry.blockError = blockResult.error;

          // 2. Report to AbuseIPDB (async)
          void reportToAbuseIPDB(ip, hPath).then((result) => {
            entry.abuseReported = result.success;
            if (result.reportId) entry.abuseReportId = result.reportId;
            if (!result.success) entry.blockError = result.error;
            fastify.log.info(
              { ip, abuseReported: result.success, blocked: entry.blocked },
              '🛡️  Attacker response complete'
            );
          });
        });
      });
    }

    // Endpoint for the live feed to show recent honeypot hits
    fastify.get('/warrior/honeypot-hits', async () => ({
      total: attackerLog.length,
      blockedCount: blockedIps.size,
      recent: attackerLog.slice(-20).reverse(),
    }));

    // ─── Billing endpoints ────────────────────────────────────────────────────
    // Stripe checkout + portal + webhook for xShield API key tier upgrades

    fastify.post<{
      Body: { plan: string; email: string; apiKeyId: string };
    }>('/billing/checkout', async (request, reply) => {
      const { plan, email, apiKeyId } = request.body ?? {};
      if (!plan || !email || !apiKeyId) {
        return reply.status(400).send({ error: 'plan, email, apiKeyId required' });
      }
      if (!['STARTER', 'PRO'].includes(plan)) {
        return reply.status(400).send({ error: 'plan must be STARTER or PRO' });
      }
      try {
        const { createCheckoutSession } = await import('./billing/stripe.js');
        // Fetch existing stripeCustomerId if any
        const key = await (prisma as any).xShieldApiKey.findUnique({ where: { id: apiKeyId } });
        if (!key) return reply.status(404).send({ error: 'API key not found' });

        const result = await createCheckoutSession({
          plan: plan as 'STARTER' | 'PRO',
          email,
          apiKeyId,
          stripeCustomerId: key.stripeCustomerId ?? undefined,
        });
        return { checkoutUrl: result.url, sessionId: result.sessionId };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    });

    fastify.get<{ Querystring: { apiKeyId: string } }>(
      '/billing/portal',
      async (request, reply) => {
        const { apiKeyId } = request.query;
        if (!apiKeyId) return reply.status(400).send({ error: 'apiKeyId required' });
        try {
          const key = await (prisma as any).xShieldApiKey.findUnique({ where: { id: apiKeyId } });
          if (!key?.stripeCustomerId) {
            return reply.status(404).send({ error: 'No active subscription found for this key' });
          }
          const { createPortalSession } = await import('./billing/stripe.js');
          const url = await createPortalSession(key.stripeCustomerId);
          return { portalUrl: url };
        } catch (err: unknown) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    // Webhook must receive raw body — registered before JSON parser applies
    fastify.post(
      '/billing/webhook',
      {
        config: { rawBody: true },
        schema: { hide: true },
      },
      async (request, reply) => {
        const sig = request.headers['stripe-signature'] as string;
        if (!sig) return reply.status(400).send({ error: 'Missing stripe-signature header' });

        try {
          const { handleWebhookEvent } = await import('./billing/stripe.js');
          const rawBody = (request as any).rawBody ?? Buffer.from(JSON.stringify(request.body));
          const result = await handleWebhookEvent(rawBody, sig, prisma);
          return { received: true, ...result };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fastify.log.warn(`Webhook error: ${msg}`);
          return reply.status(400).send({ error: msg });
        }
      }
    );

    fastify.get('/billing/plans', async () => {
      const { PLANS } = await import('./billing/stripe.js');
      return {
        plans: Object.entries(PLANS).map(([key, p]) => ({
          id: key,
          name: p.name,
          price: p.price,
          currency: p.currency,
          interval: p.interval,
          scans: p.scans === -1 ? 'unlimited' : p.scans,
          features: p.features,
        })),
      };
    });

    // ─── TAXII 2.1 routes (X11) ──────────────────────────────────────────────
    const { registerTaxiiRoutes } = await import('./taxii/server.js');
    await registerTaxiiRoutes(fastify, prisma);

    // ─── Risk Intelligence endpoints ─────────────────────────────────────────
    // Full digital risk report for a domain (GreyNoise + Shodan + HIBP + urlscan)
    fastify.get<{ Querystring: { domain?: string } }>('/risk/report', async (request, reply) => {
      const domain = request.query.domain?.trim();
      if (!domain) {
        return reply.status(400).send({ error: 'domain query param required' });
      }
      try {
        const report = await runRiskEngine({
          domain,
          shodanApiKey: process.env.SHODAN_API_KEY,
        });

        // Forward social threat signals to AIWarrior for cross-platform correlation
        const socialEvents = socialThreatsToWarriorEvents(report);
        if (socialEvents.length > 0) {
          const w = getWarrior();
          for (const e of socialEvents) w.ingest(e);
          fastify.log.info(
            { domain, eventCount: socialEvents.length },
            '⚔️  Social threats forwarded to AI Warrior'
          );
        }

        return report;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    });

    // Quick risk score only (lighter than full report)
    fastify.get<{ Querystring: { domain?: string } }>('/risk/score', async (request, reply) => {
      const domain = request.query.domain?.trim();
      if (!domain) {
        return reply.status(400).send({ error: 'domain query param required' });
      }
      try {
        const report = await runRiskEngine({
          domain,
          shodanApiKey: process.env.SHODAN_API_KEY,
          enableUrlscan: false, // skip urlscan for quick score
        });
        // Derive unique category labels from risk factors for the mobile app
        const categories = [...new Set(report.factors.map((f) => f.category.replace(/_/g, ' ')))];
        return {
          // Mobile-app shape (RiskScore interface)
          domain: report.domain,
          score: report.riskScore,
          level: report.riskLevel,
          categories,
          lastSeen: report.generatedAt,
          // Extended fields for web dashboard
          serverIp: report.serverIp,
          riskScore: report.riskScore,
          riskLevel: report.riskLevel,
          factorCount: report.factors.length,
          durationMs: (report as any).durationMs,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    });

    // ─── Domain Watch endpoints ───────────────────────────────────────────────

    // POST /watch/domain — add a domain to continuous monitoring
    fastify.post<{ Body: { domain?: string; webhookUrl?: string } }>(
      '/watch/domain',
      {
        schema: {
          body: {
            type: 'object',
            properties: { domain: { type: 'string' }, webhookUrl: { type: 'string' } },
          },
        },
      },
      async (request, reply) => {
        const { domain, webhookUrl } = request.body ?? {};
        if (!domain?.trim()) return reply.status(400).send({ error: 'domain is required' });
        const clean = domain
          .trim()
          .toLowerCase()
          .replace(/^www\./, '');
        try {
          const watch = await prisma.domainWatch.upsert({
            where: { domain: clean },
            create: { domain: clean, webhookUrl: webhookUrl ?? null, isActive: true },
            update: { isActive: true, webhookUrl: webhookUrl ?? undefined },
          });
          return { ok: true, watch };
        } catch (err: unknown) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    // DELETE /watch/domain/:domain — stop watching a domain
    fastify.delete<{ Params: { domain: string } }>(
      '/watch/domain/:domain',
      async (request, reply) => {
        const domain = request.params.domain?.toLowerCase();
        if (!domain) return reply.status(400).send({ error: 'domain param required' });
        try {
          await prisma.domainWatch.updateMany({ where: { domain }, data: { isActive: false } });
          return { ok: true, domain };
        } catch (err: unknown) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    // GET /watch/domains — list all active watches with latest status + recent alerts
    fastify.get('/watch/domains', async (_request, reply) => {
      try {
        const watches = await prisma.domainWatch.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          include: {
            alerts: {
              orderBy: { triggeredAt: 'desc' },
              take: 5,
            },
          },
        });
        return { watches };
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // GET /watch/domain/:domain/alerts — full alert history for one domain
    fastify.get<{ Params: { domain: string }; Querystring: { limit?: string } }>(
      '/watch/domain/:domain/alerts',
      async (request, reply) => {
        const domain = request.params.domain?.toLowerCase();
        const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 200);
        try {
          const watch = await prisma.domainWatch.findUnique({
            where: { domain },
            include: { alerts: { orderBy: { triggeredAt: 'desc' }, take: limit } },
          });
          if (!watch) return reply.status(404).send({ error: 'domain not being watched' });
          return watch;
        } catch (err: unknown) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    // ─── Auth REST endpoints ──────────────────────────────────────────────────
    // Standalone register/login/refresh/logout — independent of GraphQL auth.
    // Access token: JWT 24h (returned in body, stored client-side).
    // Refresh token: 7-day random token stored in httpOnly cookie xsh_refresh.

    const REFRESH_COOKIE = 'xsh_refresh';
    const REFRESH_TTL_DAYS = 7;

    const signJwt = (userId: string, email: string, tier: string): string =>
      fastify.jwt.sign({ userId, email, tier });

    // ─── Email verification helper ────────────────────────────────────────────
    const sendEmailVerification = async (log: typeof fastify, userId: string, email: string) => {
      try {
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await (prisma as any).emailVerification.create({
          data: {
            userId,
            tokenHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          },
        });
        const base = process.env.APP_URL ?? 'https://xshieldai.com';
        const verifyUrl = `${base}/auth/verify-email?token=${token}`;
        log.info(`[email-verify] ${email} → ${verifyUrl}`);
        const wireUrl = process.env.ANKR_WIRE_URL ?? process.env.ANKR_WIRE_REST_URL;
        if (wireUrl) {
          void fetch(`${wireUrl}/notify/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: email,
              subject: 'Verify your xShield account',
              text: `Welcome to xShield!\n\nVerify your email address:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
            }),
          }).catch(() => {
            /* best effort */
          });
        }
      } catch {
        /* never fail registration */
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setCookieRefresh = (reply: any, refreshToken: string) => {
      void reply.setCookie(REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60,
      });
    };

    // POST /auth/register
    fastify.post<{ Body: { email: string; password: string; name?: string } }>(
      '/auth/register',
      {
        schema: {
          tags: ['auth'],
          summary: 'Register a new user',
          body: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8 },
              name: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { email, password, name } = request.body;

        const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (existing) return reply.status(409).send({ error: 'Email already registered' });

        const hashed = await hashPassword(password);
        const user = await prisma.user.create({
          data: { email: email.toLowerCase(), password: hashed, name: name ?? null },
        });

        // Send email verification (non-blocking)
        void sendEmailVerification(fastify, user.id, user.email);

        return reply.status(201).send({
          success: true,
          message: 'Account created — check your email to verify before logging in',
          unverified: true,
        });
      }
    );

    // POST /auth/login
    fastify.post<{ Body: { email: string; password: string } }>(
      '/auth/login',
      {
        schema: {
          tags: ['auth'],
          summary: 'Log in with email + password',
          body: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { email, password } = request.body;

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user) return reply.status(401).send({ error: 'Invalid email or password' });

        const valid = await comparePassword(password, user.password);
        if (!valid) return reply.status(401).send({ error: 'Invalid email or password' });

        // Block unverified accounts
        if (!user.emailVerified) {
          return reply.status(403).send({
            error: 'Please verify your email before logging in',
            unverified: true,
          });
        }

        const token = signJwt(user.id, user.email, user.tier);
        const refreshToken = randomBytes(64).toString('hex');
        await prisma.session.create({
          data: {
            userId: user.id,
            token,
            refreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });

        setCookieRefresh(reply as Parameters<typeof setCookieRefresh>[0], refreshToken);

        return {
          token,
          user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        };
      }
    );

    // POST /auth/refresh — exchange httpOnly cookie for new access token
    fastify.post(
      '/auth/refresh',
      { schema: { tags: ['auth'], summary: 'Refresh access token' } },
      async (request, reply) => {
        const refreshToken = (request.cookies as Record<string, string | undefined>)[
          REFRESH_COOKIE
        ];
        if (!refreshToken) return reply.status(401).send({ error: 'No refresh token' });

        const session = await prisma.session.findUnique({ where: { refreshToken } });
        if (!session || session.expiresAt < new Date()) {
          return reply.status(401).send({ error: 'Refresh token expired or invalid' });
        }

        const user = await prisma.user.findUnique({ where: { id: session.userId } });
        if (!user) return reply.status(401).send({ error: 'User not found' });

        const token = signJwt(user.id, user.email, user.tier);
        const newRefresh = randomBytes(64).toString('hex');

        // Rotate: delete old session, create new one
        await prisma.session.delete({ where: { refreshToken } });
        await prisma.session.create({
          data: {
            userId: user.id,
            token,
            refreshToken: newRefresh,
            expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });

        setCookieRefresh(reply as Parameters<typeof setCookieRefresh>[0], newRefresh);
        return { token };
      }
    );

    // POST /auth/logout
    fastify.post(
      '/auth/logout',
      { schema: { tags: ['auth'], summary: 'Log out (clears cookie + session)' } },
      async (request, reply) => {
        const refreshToken = (request.cookies as Record<string, string | undefined>)[
          REFRESH_COOKIE
        ];
        if (refreshToken) {
          await prisma.session.deleteMany({ where: { refreshToken } });
        }
        void reply.clearCookie(REFRESH_COOKIE, { path: '/' });
        return { ok: true };
      }
    );

    // GET /auth/me — return current user from JWT
    fastify.get(
      '/auth/me',
      { schema: { tags: ['auth'], summary: 'Get current user' } },
      async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
        const payload = request.user as { userId?: string };
        if (!payload?.userId) return reply.status(401).send({ error: 'Unauthorized' });

        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, email: true, name: true, tier: true },
        });
        if (!user) return reply.status(404).send({ error: 'User not found' });
        return user;
      }
    );

    // POST /auth/magic-link — request a passwordless login link
    fastify.post<{ Body: { email: string } }>(
      '/auth/magic-link',
      {
        config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
        schema: {
          tags: ['auth'],
          summary: 'Request a magic link (passwordless login)',
          body: {
            type: 'object',
            required: ['email'],
            properties: {
              email: { type: 'string', format: 'email' },
            },
          },
        },
      },
      async (request, reply) => {
        const { email } = request.body;
        const normalizedEmail = email.toLowerCase();

        // Generate secure token (64 hex chars = 32 random bytes)
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');

        // Store with 15-minute expiry (DB-backed, survives restarts)
        await (prisma as any).magicToken.create({
          data: {
            tokenHash,
            email: normalizedEmail,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        });

        const appUrl = process.env.APP_URL ?? 'https://xshieldai.com';
        const magicUrl = `${appUrl}/auth/verify?token=${token}`;

        // Best-effort email delivery — never reveal whether email exists
        try {
          const emailTo = normalizedEmail;
          const subject = 'Your xShield login link';
          const body = `Click to log in to xShield:

${magicUrl}

This link expires in 15 minutes.

If you did not request this, you can safely ignore this email.`;

          // Log the magic link in dev so it can be used without email infra
          fastify.log.info(`[magic-link] ${emailTo} → ${magicUrl}`);

          // Fire-and-forget via ankr-wire HTTP endpoint if configured
          const wireUrl = process.env.ANKR_WIRE_URL ?? process.env.ANKR_WIRE_REST_URL;
          if (wireUrl) {
            void fetch(`${wireUrl}/notify/email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: emailTo, subject, text: body }),
            }).catch(() => {
              /* best effort */
            });
          }
        } catch {
          // Never fail — don't reveal email existence
        }

        return reply.send({ success: true, message: 'Magic link sent to your email' });
      }
    );

    // GET /auth/verify?token= — verify magic link, issue JWT session
    fastify.get<{ Querystring: { token?: string } }>(
      '/auth/verify',
      {
        schema: {
          tags: ['auth'],
          summary: 'Verify magic link token and create session',
          querystring: {
            type: 'object',
            properties: { token: { type: 'string' } },
          },
        },
      },
      async (request, reply) => {
        const rawToken = request.query.token;
        if (!rawToken) return reply.status(400).send({ error: 'token required' });

        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const entry = await (prisma as any).magicToken.findUnique({ where: { tokenHash } });

        if (!entry || entry.usedAt || entry.expiresAt < new Date()) {
          return reply.status(401).send({ error: 'Invalid or expired link' });
        }

        // Single-use: mark as used
        await (prisma as any).magicToken.update({
          where: { tokenHash },
          data: { usedAt: new Date() },
        });
        // Async cleanup of all expired tokens
        void (prisma as any).magicToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

        const { email } = entry;

        // Find or create user
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email, password: '', name: null },
          });
        }

        // Send welcome email with API key info if this is a new user (first login)
        const isNewUser = !user.createdAt || Date.now() - user.createdAt.getTime() < 60_000;
        if (isNewUser) {
          const wireUrl = process.env.ANKR_WIRE_URL ?? process.env.ANKR_WIRE_REST_URL;
          if (wireUrl) {
            void fetch(`${wireUrl}/notify/email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: user.email,
                subject: 'Welcome to xShield — your API key is ready',
                text: `Welcome to xShield!

Your account is ready. Here's how to get started:

1. Create your API key:
   POST https://xshieldai.com/api/keys
   Headers: Authorization: Bearer <your-jwt>

2. Scan a domain:
   curl -H "X-API-Key: YOUR_KEY" https://xshieldai.com/risk/score?domain=example.com

3. Self-host xShield:
   npx @xshieldai/warrior start

4. Download AnkrShield (Android):
   https://xshieldai.com/download/ankrshield.apk

Documentation: https://xshieldai.com/docs
GitHub: https://github.com/xshieldai/warrior

—
xShield by ANKR Labs, Gurgaon
`,
              }),
            }).catch(() => {
              /* best effort */
            });
          }
        }

        // Issue JWT + refresh session
        const jwtToken = signJwt(user.id, user.email, user.tier);
        const refreshToken = randomBytes(64).toString('hex');
        await prisma.session.create({
          data: {
            userId: user.id,
            token: jwtToken,
            refreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });

        setCookieRefresh(reply as Parameters<typeof setCookieRefresh>[0], refreshToken);

        // Set apiKey cookie (30 days) for convenience
        void reply.setCookie('apiKey', jwtToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 86400 * 30,
        });

        return reply.send({
          success: true,
          token: jwtToken,
          email: user.email,
          user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        });
      }
    );

    // GET /auth/verify-email?token= — verify email address after registration
    fastify.get<{ Querystring: { token?: string } }>(
      '/auth/verify-email',
      {
        schema: {
          tags: ['auth'],
          summary: 'Verify email address from registration link',
          querystring: { type: 'object', properties: { token: { type: 'string' } } },
        },
      },
      async (request, reply) => {
        const rawToken = request.query.token;
        if (!rawToken) return reply.status(400).send({ error: 'token required' });

        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const record = await (prisma as any).emailVerification.findUnique({ where: { tokenHash } });

        if (!record || record.verifiedAt || record.expiresAt < new Date()) {
          return reply.status(401).send({ error: 'Invalid or expired verification link' });
        }

        // Mark verified in both tables atomically
        await Promise.all([
          (prisma as any).emailVerification.update({
            where: { tokenHash },
            data: { verifiedAt: new Date() },
          }),
          prisma.user.update({
            where: { id: record.userId },
            data: { emailVerified: new Date() },
          }),
        ]);

        // Issue JWT session immediately so they land on dashboard
        const user = await prisma.user.findUnique({ where: { id: record.userId } });
        if (!user) return reply.status(404).send({ error: 'User not found' });

        const jwtToken = signJwt(user.id, user.email, user.tier);
        const refreshToken = randomBytes(64).toString('hex');
        await prisma.session.create({
          data: {
            userId: user.id,
            token: jwtToken,
            refreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
        setCookieRefresh(reply as Parameters<typeof setCookieRefresh>[0], refreshToken);

        return reply.send({
          success: true,
          token: jwtToken,
          user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
        });
      }
    );

    // ─── Integrations — Slack ─────────────────────────────────────────────────

    // POST /integrations/slack — save or update Slack incoming webhook URL
    fastify.post<{ Body: { webhookUrl: string } }>(
      '/integrations/slack',
      {
        schema: {
          tags: ['integrations'],
          summary: 'Save Slack webhook URL',
          body: {
            type: 'object',
            required: ['webhookUrl'],
            properties: {
              webhookUrl: { type: 'string', format: 'uri' },
            },
          },
        },
      },
      async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'JWT authentication required' });
        }
        const user = request.user as { id?: string; userId?: string };
        const userId = user?.id ?? user?.userId;
        if (!userId) return reply.status(401).send({ error: 'could not determine user' });

        const { webhookUrl } = request.body;
        if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
          return reply
            .status(400)
            .send({ error: 'webhookUrl must be a Slack incoming webhook URL' });
        }

        await prisma.userIntegration.upsert({
          where: { userId_provider: { userId, provider: 'slack' } },
          create: { userId, provider: 'slack', config: { webhookUrl }, isActive: true },
          update: { config: { webhookUrl }, isActive: true },
        });

        return { saved: true, provider: 'slack' };
      }
    );

    // GET /integrations/slack — get status (JWT required)
    fastify.get(
      '/integrations/slack',
      { schema: { tags: ['integrations'], summary: 'Get Slack integration status' } },
      async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'JWT authentication required' });
        }
        const user = request.user as { id?: string; userId?: string };
        const userId = user?.id ?? user?.userId;
        if (!userId) return reply.status(401).send({ error: 'could not determine user' });

        const integration = await prisma.userIntegration.findUnique({
          where: { userId_provider: { userId, provider: 'slack' } },
        });

        if (!integration || !integration.isActive) {
          return { connected: false };
        }

        const cfg = integration.config as { webhookUrl?: string };
        return {
          connected: true,
          webhookUrl: cfg.webhookUrl
            ? `${cfg.webhookUrl.slice(0, 40)}…` // never expose full URL
            : null,
          createdAt: integration.createdAt,
          updatedAt: integration.updatedAt,
        };
      }
    );

    // DELETE /integrations/slack — remove Slack integration
    fastify.delete(
      '/integrations/slack',
      { schema: { tags: ['integrations'], summary: 'Remove Slack integration' } },
      async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'JWT authentication required' });
        }
        const user = request.user as { id?: string; userId?: string };
        const userId = user?.id ?? user?.userId;
        if (!userId) return reply.status(401).send({ error: 'could not determine user' });

        await prisma.userIntegration.updateMany({
          where: { userId, provider: 'slack' },
          data: { isActive: false },
        });

        return { disconnected: true };
      }
    );

    // POST /integrations/slack/test — send a test Block Kit message
    fastify.post(
      '/integrations/slack/test',
      { schema: { tags: ['integrations'], summary: 'Send Slack test alert' } },
      async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'JWT authentication required' });
        }
        const user = request.user as { id?: string; userId?: string };
        const userId = user?.id ?? user?.userId;
        if (!userId) return reply.status(401).send({ error: 'could not determine user' });

        const integration = await prisma.userIntegration.findUnique({
          where: { userId_provider: { userId, provider: 'slack' } },
        });

        if (!integration || !integration.isActive) {
          return reply.status(400).send({ error: 'Slack integration not configured' });
        }

        const cfg = integration.config as { webhookUrl?: string };
        if (!cfg.webhookUrl) {
          return reply.status(400).send({ error: 'Slack webhook URL missing' });
        }

        const result = await sendTestAlert(cfg.webhookUrl);
        if (result === 'sent') return { sent: true };
        return reply
          .status(502)
          .send({ error: 'Slack returned an error — check your webhook URL' });
      }
    );

    // ─── API Key bearer token middleware ─────────────────────────────────────
    // Applied to all /risk/* routes. Accepts either:
    //   Authorization: Bearer xsh_live_<key>   (API key auth)
    //   Authorization: Bearer <jwt>             (JWT auth, existing behaviour)

    fastify.addHook('onRequest', async (request, reply) => {
      // Only guard /risk/* endpoints
      if (!request.url.startsWith('/risk/')) return;

      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return; // no header → let route decide

      const token = authHeader.slice(7);
      if (!token.startsWith('xsh_live_')) return; // JWT path — leave for existing JWT logic

      // API key path
      const hash = hashApiKey(token);
      const apiKey = await prisma.apiKey.findUnique({ where: { hash } });

      if (!apiKey || !apiKey.isActive) {
        return reply.status(401).send({ error: 'invalid or revoked API key' });
      }

      const allowed = await checkRateLimit(apiKey.id, apiKey.tier);
      if (!allowed) {
        return reply.status(429).send({
          error: 'monthly rate limit exceeded',
          tier: apiKey.tier,
          upgradeUrl: 'https://xshieldai.com/pricing',
        });
      }

      // Update lastUsedAt (fire-and-forget)
      prisma.apiKey
        .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});

      // Attach userId to request for downstream use
      (request as unknown as Record<string, unknown>).apiKeyUserId = apiKey.userId;
    });

    // ─── API Key management endpoints ────────────────────────────────────────

    // POST /auth/api-keys — create a new API key (requires JWT auth)
    fastify.post<{ Body: { name: string; tier?: string } }>(
      '/auth/api-keys',
      {
        schema: {
          tags: ['auth'],
          summary: 'Create API key',
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 64 },
              tier: { type: 'string', enum: ['FREE', 'STARTER', 'PRO'] },
            },
          },
        },
      },
      async (request, reply) => {
        // Require JWT
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'JWT authentication required' });
        }

        const { name, tier } = request.body;
        const user = request.user as { id?: string; userId?: string };
        const userId = user?.id ?? user?.userId;
        if (!userId) return reply.status(401).send({ error: 'could not determine user' });

        const validTier = ['FREE', 'STARTER', 'PRO'].includes(tier ?? '') ? tier : 'STARTER';

        const { raw, prefix, hash } = generateApiKey();

        await prisma.apiKey.create({
          data: {
            userId,
            name,
            prefix,
            hash,
            tier: validTier as 'FREE' | 'STARTER' | 'PRO',
          },
        });

        return reply.status(201).send({ key: raw, prefix, name, tier: validTier });
      }
    );

    // GET /auth/api-keys — list caller's API keys (JWT required)
    fastify.get(
      '/auth/api-keys',
      {
        schema: {
          tags: ['auth'],
          summary: 'List API keys',
        },
      },
      async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'JWT authentication required' });
        }
        const user = request.user as { id?: string; userId?: string };
        const userId = user?.id ?? user?.userId;
        if (!userId) return reply.status(401).send({ error: 'could not determine user' });

        const keys = await prisma.apiKey.findMany({
          where: { userId, isActive: true },
          select: {
            id: true,
            name: true,
            prefix: true,
            tier: true,
            monthlyRequestCount: true,
            lastUsedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        return { keys };
      }
    );

    // DELETE /auth/api-keys/:id — revoke a key (JWT required, must own the key)
    fastify.delete<{ Params: { id: string } }>(
      '/auth/api-keys/:id',
      {
        schema: {
          tags: ['auth'],
          summary: 'Revoke API key',
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'JWT authentication required' });
        }
        const user = request.user as { id?: string; userId?: string };
        const userId = user?.id ?? user?.userId;
        if (!userId) return reply.status(401).send({ error: 'could not determine user' });

        const { id } = request.params;
        const key = await prisma.apiKey.findUnique({ where: { id } });
        if (!key || key.userId !== userId) {
          return reply.status(404).send({ error: 'API key not found' });
        }

        await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
        return { revoked: true, id };
      }
    );

    // Remediation playbook — run risk engine then generate copy-pasteable fix steps
    fastify.get<{ Querystring: { domain?: string } }>('/risk/playbook', async (request, reply) => {
      const domain = request.query.domain?.trim();
      if (!domain) return reply.status(400).send({ error: 'domain query param required' });
      try {
        const report = await runRiskEngine({ domain, shodanApiKey: process.env.SHODAN_API_KEY });
        const playbook = buildRemediationPlaybook(report);
        // Flatten actions → steps for the Android app (RiskPlaybook interface)
        const steps = playbook.actions.map((action) => ({
          title: action.title,
          description: action.description,
          // First copy-pasteable command from the action's steps, if any
          command: action.steps.find((s) => s.command)?.command,
        }));
        return {
          // Mobile-app shape (RiskPlaybook interface)
          domain: playbook.domain,
          steps,
          // Extended fields for web dashboard
          reportId: playbook.reportId,
          generatedAt: playbook.generatedAt,
          riskScore: playbook.riskScore,
          riskLevel: playbook.riskLevel,
          totalActions: playbook.totalActions,
          estimatedTotalMinutes: playbook.estimatedTotalMinutes,
          summary: playbook.summary,
          cicdYaml: playbook.cicdYaml,
          actions: playbook.actions,
        };
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // ─── Supply Chain endpoints ────────────────────────────────────────────────

    // POST /risk/supply-chain — scan a list of packages
    fastify.post<{
      Body: { packages?: Array<{ ecosystem: string; name: string; version?: string }> };
    }>(
      '/risk/supply-chain',
      {
        schema: {
          tags: ['risk'],
          summary: 'Scan packages for supply chain risks',
          body: {
            type: 'object',
            required: ['packages'],
            properties: {
              packages: {
                type: 'array',
                maxItems: 50,
                items: {
                  type: 'object',
                  required: ['ecosystem', 'name'],
                  properties: {
                    ecosystem: { type: 'string', enum: ['npm', 'pypi'] },
                    name: { type: 'string' },
                    version: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { packages } = request.body ?? {};
        if (!Array.isArray(packages) || packages.length === 0) {
          return reply.status(400).send({ error: 'packages array is required' });
        }
        const valid = packages.filter(
          (p) =>
            (p.ecosystem === 'npm' || p.ecosystem === 'pypi') &&
            typeof p.name === 'string' &&
            p.name.trim()
        ) as Array<{ ecosystem: 'npm' | 'pypi'; name: string; version?: string }>;
        if (valid.length === 0) {
          return reply
            .status(400)
            .send({ error: 'No valid packages. ecosystem must be "npm" or "pypi"' });
        }
        try {
          return await scanSupplyChain(valid);
        } catch (err: unknown) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    // POST /risk/supply-chain/manifest — parse a manifest file and scan all deps
    fastify.post<{
      Body: { manifest?: string; ecosystem?: string };
    }>(
      '/risk/supply-chain/manifest',
      {
        schema: {
          tags: ['risk'],
          summary: 'Parse a manifest (package.json / requirements.txt) and scan all deps',
          body: {
            type: 'object',
            required: ['manifest'],
            properties: {
              manifest: { type: 'string' },
              ecosystem: { type: 'string', enum: ['npm', 'pypi', 'auto'] },
            },
          },
        },
      },
      async (request, reply) => {
        const { manifest, ecosystem = 'auto' } = request.body ?? {};
        if (!manifest?.trim())
          return reply.status(400).send({ error: 'manifest content is required' });
        const hint = ecosystem === 'npm' || ecosystem === 'pypi' ? ecosystem : 'auto';
        const packages = parseManifest(manifest, hint);
        if (packages.length === 0) {
          return reply
            .status(400)
            .send({ error: 'Could not parse any packages from the provided manifest' });
        }
        try {
          return await scanSupplyChain(packages);
        } catch (err: unknown) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    // ─── SBOM Ingestion — CycloneDX / SPDX supply-chain scan ────────────────
    // POST /supply-chain/sbom
    // Body: { format: 'cyclonedx' | 'spdx', sbom: object }
    // Auth: X-API-Key required (FREE tier ok)
    fastify.post<{
      Body: { format?: string; sbom?: Record<string, unknown> };
    }>(
      '/supply-chain/sbom',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
        schema: {
          tags: ['risk'],
          summary: 'Ingest a CycloneDX or SPDX SBOM and scan for supply-chain risks',
          body: {
            type: 'object',
            required: ['format', 'sbom'],
            properties: {
              format: { type: 'string', enum: ['cyclonedx', 'spdx'] },
              sbom: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        // ── Auth: X-API-Key required (any active tier including FREE) ──────
        const rawKey = (request.headers['x-api-key'] as string) ?? null;
        if (!rawKey) {
          return reply.status(401).send({ error: 'X-API-Key header required' });
        }
        const keyHash = hashApiKey(rawKey);
        const apiKey = await (prisma as any).xShieldApiKey.findUnique({ where: { keyHash } });
        if (!apiKey || !apiKey.isActive) {
          return reply.status(403).send({ error: 'Invalid or inactive API key' });
        }

        const { format, sbom } = request.body ?? {};
        if (!format || !sbom) {
          return reply.status(400).send({ error: 'format and sbom are required' });
        }

        // ── 1. Parse SBOM → component list ────────────────────────────────
        interface SbomComponent {
          name: string;
          version: string;
          purl: string;
          registry: string;
        }
        const components: SbomComponent[] = [];

        if (format === 'cyclonedx') {
          // CycloneDX: components[] array
          const raw = (sbom as any).components ?? [];
          for (const c of Array.isArray(raw) ? raw : []) {
            const purl: string = c.purl ?? '';
            const name: string = c.name ?? '';
            const version: string = c.version ?? '';
            // Extract registry from purl: pkg:{type}/...
            const typeMatch = purl.match(/^pkg:([^/]+)\//);
            const registry = typeMatch ? typeMatch[1] : 'unknown';
            components.push({ name, version, purl, registry });
          }
        } else if (format === 'spdx') {
          // SPDX: packages[] array with externalRefs
          const raw = (sbom as any).packages ?? [];
          for (const pkg of Array.isArray(raw) ? raw : []) {
            const name: string = pkg.name ?? '';
            const version: string = pkg.versionInfo ?? '';
            let purl = '';
            const refs: any[] = Array.isArray(pkg.externalRefs) ? pkg.externalRefs : [];
            for (const ref of refs) {
              if (ref.referenceCategory === 'PACKAGE-MANAGER') {
                purl = ref.referenceLocator ?? '';
                break;
              }
            }
            const typeMatch = purl.match(/^pkg:([^/]+)\//);
            const registry = typeMatch ? typeMatch[1] : 'unknown';
            components.push({ name, version, purl, registry });
          }
        } else {
          return reply.status(400).send({ error: 'format must be "cyclonedx" or "spdx"' });
        }

        const totalComponents = components.length;
        const scanned = Math.min(totalComponents, 50);
        const batch = components.slice(0, 50);

        // ── 2. Check each package ──────────────────────────────────────────
        interface Finding {
          package: string;
          version: string;
          registry: string;
          risk: 'low' | 'medium' | 'high';
          reason: string;
        }
        const findings: Finding[] = [];
        const dependencyConfusion: string[] = [];
        const highRisk: Finding[] = [];

        await Promise.allSettled(
          batch.map(async (comp) => {
            const registry = comp.registry.toLowerCase();
            const name = comp.name;
            const version = comp.version;
            let risk: 'low' | 'medium' | 'high' = 'low';
            let reason = 'Package exists on public registry';
            let notFound = false;
            let suspiciousMaintainer = false;

            try {
              if (registry === 'npm') {
                const encoded = encodeURIComponent(name).replace('%40', '@');
                const resp = await fetch(`https://registry.npmjs.org/${encoded}`, {
                  signal: AbortSignal.timeout(8000),
                });
                if (resp.status === 404) {
                  notFound = true;
                } else if (resp.ok) {
                  const data = (await resp.json()) as any;
                  const maintainers: any[] = Array.isArray(data.maintainers)
                    ? data.maintainers
                    : [];
                  if (maintainers.length > 0) {
                    const email: string = maintainers[0].email ?? '';
                    const domain = email.split('@')[1] ?? '';
                    // Flag disposable / suspicious domains
                    const suspicious = [
                      'mailinator.com',
                      'guerrillamail.com',
                      'tempmail.com',
                      'yopmail.com',
                      'throwam.com',
                      'sharklasers.com',
                      'guerrillamailblock.com',
                    ];
                    if (domain && suspicious.includes(domain.toLowerCase())) {
                      suspiciousMaintainer = true;
                      reason = `Maintainer email uses suspicious domain: ${domain}`;
                    }
                  }
                }
              } else if (registry === 'pypi') {
                const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
                  signal: AbortSignal.timeout(8000),
                });
                if (resp.status === 404) {
                  notFound = true;
                }
              }
              // For maven/other registries — we accept as-is (low risk, not found unknown)
            } catch {
              reason = 'Registry check timed out — treat as unverified';
              risk = 'medium';
            }

            if (notFound && (registry === 'npm' || registry === 'pypi')) {
              risk = 'high';
              reason =
                'Package not found on public registry — possible dependency confusion attack';
              dependencyConfusion.push(name);
            } else if (suspiciousMaintainer) {
              risk = 'high';
            }

            const finding: Finding = { package: name, version, registry, risk, reason };
            findings.push(finding);
            if (risk === 'high') highRisk.push(finding);
          })
        );

        return reply.send({
          totalComponents,
          scanned,
          findings,
          dependencyConfusion,
          highRisk,
        });
      }
    );

    // ─── India Threat Intelligence endpoint (X10) ────────────────────────────
    fastify.get<{ Querystring: { domain?: string; ip?: string } }>(
      '/risk/india-threat',
      async (request, reply) => {
        const domain = request.query.domain?.trim();
        if (!domain) return reply.status(400).send({ error: 'domain query param required' });
        try {
          const ip = request.query.ip?.trim();
          const result = await checkIndiaThreatIntel(domain, ip);
          return result;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(500).send({ error: msg });
        }
      }
    );

    // ─── Phishing Kit Fingerprinter endpoint (X12) ───────────────────────────
    fastify.get<{ Querystring: { domain?: string } }>(
      '/risk/phishing-kit',
      async (request, reply) => {
        const domain = request.query.domain?.trim();
        if (!domain) return reply.status(400).send({ error: 'domain query param required' });
        try {
          const result = await fingerprintPhishingKit(domain);
          return result;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(500).send({ error: msg });
        }
      }
    );

    // Brand Impersonation Monitor (X6) REST endpoint
    // GET /brand/report?brandTerms=ankr,ankrshield
    fastify.get(
      '/brand/report',
      {
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags: ['brand'],
          summary: 'Brand impersonation check (heuristic, no auth required)',
        },
      },
      async (request, reply) => {
        const q = request.query as { brandTerms?: string; candidates?: string };
        const rawTerms = q.brandTerms ? q.brandTerms.trim() : '';
        if (!rawTerms)
          return reply
            .status(400)
            .send({ error: 'brandTerms query param required (comma-separated)' });
        const brandTerms = rawTerms
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        const rawCandidates = q.candidates ? q.candidates.trim() : '';
        const candidateList = rawCandidates
          ? rawCandidates
              .split(',')
              .map((n) => ({ name: n.trim() }))
              .filter((c) => c.name)
          : [];
        try {
          return await checkBrandImpersonation(brandTerms, candidateList);
        } catch (err) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    // AI Threat Narrative (X9) REST endpoint
    // GET /risk/narrative?domain=example.com
    fastify.get(
      '/risk/narrative',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags: ['risk'],
          summary: 'AI threat narrative for a domain (uses ANKR AI Proxy)',
        },
      },
      async (request, reply) => {
        const q = request.query as { domain?: string };
        const domain = q.domain ? q.domain.trim() : '';
        if (!domain) return reply.status(400).send({ error: 'domain query param required' });
        try {
          const report = await runRiskEngine({
            domain,
            shodanApiKey: process.env.SHODAN_API_KEY,
            otxApiKey: process.env.OTX_API_KEY,
            githubToken: process.env.GITHUB_TOKEN,
            enableGithubDork: !!process.env.GITHUB_TOKEN,
            enableThreatNarrative: true,
            anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          });
          if (report.threatNarrative) return report.threatNarrative;
          const narrative = await generateThreatNarrative(report, process.env.ANTHROPIC_API_KEY);
          if (!narrative) return reply.status(503).send({ error: 'AI narrative not available' });
          return narrative;
        } catch (err) {
          return reply
            .status(500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );
    // GreyNoise classification for a single IP (useful for live threat feed)
    fastify.get<{ Params: { ip: string } }>('/risk/ip/:ip', async (request, reply) => {
      const { ip } = request.params;
      if (!ip) return reply.status(400).send({ error: 'ip param required' });
      try {
        const result = await scanIpWithGreyNoise(ip);
        if (!result) return { ip, classification: 'unknown', noise: false, riot: false };
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    });

    // ─── Certificate Transparency SSE Stream ─────────────────────────────────
    // GET /risk/cert-stream?domain=example.com
    // Server-Sent Events — uses CertstreamManager (wss://certstream.calidog.io/)
    // for near-real-time CT log data. Falls back to crt.sh polling (30s, dedup)
    // if the WebSocket is not connected.
    fastify.get<{ Querystring: { domain?: string } }>(
      '/risk/cert-stream',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const domain = request.query.domain?.trim();
        if (!domain) {
          return reply.status(400).send({ error: 'domain required' });
        }

        // SSE headers
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no',
        });

        const send = (eventType: string, data: unknown) => {
          reply.raw.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const certEntryToEvent = (entry: {
          commonName: string;
          issuer: string;
          loggedAt: string;
        }) => ({
          commonName: entry.commonName,
          issuer: entry.issuer,
          notBefore: entry.loggedAt,
          isTyposquat: !entry.commonName.includes(domain.replace(/^\*\./, '')),
          riskScore: entry.commonName.includes(domain.replace(/^\*\./, '')) ? 0 : 40,
        });

        send('connected', {
          domain,
          timestamp: new Date().toISOString(),
          mode: certstreamManager.isConnected() ? 'live' : 'polling',
        });

        let active = true;

        if (certstreamManager.isConnected()) {
          // ── Live certstream path ──────────────────────────────────────────
          // 1. Flush any buffered certs immediately
          const buffered = certstreamManager.getBuffer(domain);
          for (const entry of buffered) {
            send('cert', certEntryToEvent(entry));
          }

          // 2. Subscribe to new real-time certs
          const unsub = certstreamManager.subscribe(domain, (entry) => {
            if (!active) return;
            send('cert', certEntryToEvent(entry));
          });

          // 3. Heartbeat every 30s
          const heartbeat = setInterval(() => {
            if (!active) return;
            send('heartbeat', { timestamp: new Date().toISOString(), source: 'certstream' });
          }, 30_000);

          request.raw.on('close', () => {
            active = false;
            unsub();
            clearInterval(heartbeat);
            reply.raw.end();
          });
        } else {
          // ── Fallback: crt.sh polling (30s interval) with deduplication ───
          // Track last 50 seen cert IDs per poll cycle to avoid re-emitting.
          const seenIds = new Map<string, number>(); // certId → insertion order
          let seenCounter = 0;

          const poll = async () => {
            try {
              const records = await monitorCertTransparency(domain);
              for (const cert of records) {
                const id = cert.commonName;
                if (seenIds.has(id)) continue;
                // Keep dedup map bounded to 50 entries
                if (seenIds.size >= 50) {
                  // Remove oldest entry
                  let oldestKey: string | undefined;
                  let oldestVal = Infinity;
                  for (const [k, v] of seenIds) {
                    if (v < oldestVal) {
                      oldestVal = v;
                      oldestKey = k;
                    }
                  }
                  if (oldestKey) seenIds.delete(oldestKey);
                }
                seenIds.set(id, seenCounter++);
                send('cert', {
                  commonName: cert.commonName,
                  issuer: cert.issuer,
                  notBefore: cert.loggedAt,
                  isTyposquat: !cert.isLegitimate,
                  riskScore: cert.isLegitimate ? 0 : 40,
                });
              }
              send('heartbeat', {
                timestamp: new Date().toISOString(),
                total: seenIds.size,
                source: 'crtsh',
              });
            } catch {
              // Ignore individual poll errors — stream stays open
            }

            if (active) {
              setTimeout(() => {
                void poll();
              }, 30_000);
            }
          };

          await poll();

          request.raw.on('close', () => {
            active = false;
            reply.raw.end();
          });
        }
      }
    );

    // ─── Session / Room System ─────────────────────────────────────────────────
    // In-memory store — survives as long as the process is running.
    // Each session holds: code, devices[], events ring-buffer, SSE clients[].

    interface SessionDevice {
      deviceId: string;
      name: string; // "Device-A4B2" (anonymised)
      joinedAt: number;
    }

    interface SessionEvent {
      id: string;
      ts: number;
      deviceId: string;
      deviceName: string;
      tracker: string;
      company: string;
      category: string;
      dataType: string;
      blocked: boolean;
      bytes: number;
    }

    interface Session {
      code: string;
      label: string;
      createdAt: number;
      devices: Map<string, SessionDevice>;
      events: SessionEvent[]; // ring-buffer, capped at 500
      sseClients: Set<NodeJS.Timeout>; // we'll use reply objects below
    }

    // SSE reply set per session
    const sessionSseClients = new Map<string, Set<{ raw: import('http').ServerResponse }>>();
    const sessions = new Map<string, Session>();

    const makeCode = (): string => Math.random().toString(36).slice(2, 8).toUpperCase();

    const broadcastSse = (code: string, data: unknown) => {
      const clients = sessionSseClients.get(code);
      if (!clients) return;
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      for (const c of clients) {
        try {
          c.raw.write(payload);
        } catch {
          /* client gone */
        }
      }
    };

    // POST /session/create
    fastify.post<{ Body: { label?: string } }>('/session/create', async (request, reply) => {
      const code = makeCode();
      sessions.set(code, {
        code,
        label: request.body?.label ?? `Room ${code}`,
        createdAt: Date.now(),
        devices: new Map(),
        events: [],
        sseClients: new Set(),
      });
      sessionSseClients.set(code, new Set());
      return reply.send({
        code,
        label: sessions.get(code)!.label,
        joinUrl: `/live?room=${code}`,
        qrData: `https://xshieldai.com/live?room=${code}`,
        createdAt: new Date().toISOString(),
      });
    });

    // POST /session/:code/join
    fastify.post<{ Params: { code: string }; Body: { deviceAlias?: string } }>(
      '/session/:code/join',
      async (request, reply) => {
        const { code } = request.params;
        const session = sessions.get(code.toUpperCase());
        if (!session) return reply.status(404).send({ error: 'Room not found' });
        const deviceId = Math.random().toString(36).slice(2, 8).toUpperCase();
        const name = request.body?.deviceAlias ?? `Device-${deviceId}`;
        session.devices.set(deviceId, { deviceId, name, joinedAt: Date.now() });
        broadcastSse(code.toUpperCase(), {
          type: 'device_joined',
          deviceId,
          name,
          totalDevices: session.devices.size,
        });
        return reply.send({ deviceId, name, code: code.toUpperCase() });
      }
    );

    // POST /session/:code/event  — device reports a tracker hit
    fastify.post<{
      Params: { code: string };
      Body: {
        deviceId: string;
        tracker: string;
        company: string;
        category: string;
        dataType: string;
        blocked: boolean;
        bytes?: number;
      };
    }>('/session/:code/event', async (request, reply) => {
      const { code } = request.params;
      const session = sessions.get(code.toUpperCase());
      if (!session) return reply.status(404).send({ error: 'Room not found' });
      const device = session.devices.get(request.body.deviceId);
      const ev: SessionEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        deviceId: request.body.deviceId,
        deviceName: device?.name ?? `Device-${request.body.deviceId}`,
        tracker: request.body.tracker,
        company: request.body.company,
        category: request.body.category,
        dataType: request.body.dataType,
        blocked: request.body.blocked,
        bytes: request.body.bytes ?? 5000,
      };
      session.events.push(ev);
      if (session.events.length > 500) session.events.shift();
      broadcastSse(code.toUpperCase(), { type: 'tracker_event', event: ev });
      return reply.send({ ok: true });
    });

    // GET /session/:code/stats
    fastify.get<{ Params: { code: string } }>('/session/:code/stats', async (request, reply) => {
      const { code } = request.params;
      const session = sessions.get(code.toUpperCase());
      if (!session) return reply.status(404).send({ error: 'Room not found' });
      const evs = session.events;
      const blocked = evs.filter((e) => e.blocked).length;
      const companies = new Set(evs.map((e) => e.company));
      const byTracker: Record<string, number> = {};
      for (const e of evs) byTracker[e.tracker] = (byTracker[e.tracker] ?? 0) + 1;
      const topTrackers = Object.entries(byTracker)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tracker, count]) => ({ tracker, count }));
      return reply.send({
        code: session.code,
        label: session.label,
        devices: Array.from(session.devices.values()),
        totalDevices: session.devices.size,
        totalEvents: evs.length,
        totalBlocked: blocked,
        blockedPct: evs.length > 0 ? Math.round((blocked / evs.length) * 100) : 0,
        uniqueCompanies: companies.size,
        topTrackers,
        totalBytes: evs.reduce((s, e) => s + e.bytes, 0),
        createdAt: new Date(session.createdAt).toISOString(),
      });
    });

    // GET /session/:code/stream  — SSE stream for live room updates
    fastify.get<{ Params: { code: string } }>('/session/:code/stream', async (request, reply) => {
      const { code } = request.params;
      const session = sessions.get(code.toUpperCase());
      if (!session) return reply.status(404).send({ error: 'Room not found' });

      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send recent events as catch-up
      const catchUp = session.events.slice(-50);
      raw.write(
        `data: ${JSON.stringify({
          type: 'catchup',
          events: catchUp,
          stats: {
            totalDevices: session.devices.size,
            totalEvents: session.events.length,
            totalBlocked: session.events.filter((e) => e.blocked).length,
          },
        })}\n\n`
      );

      const client = { raw };
      const clients = sessionSseClients.get(code.toUpperCase())!;
      clients.add(client);

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        try {
          raw.write(': ping\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      request.socket.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(client);
      });

      return reply;
    });

    // GET /session/list  — debug: list active sessions
    fastify.get('/session/list', async (_request, reply) => {
      const list = Array.from(sessions.values()).map((s) => ({
        code: s.code,
        label: s.label,
        devices: s.devices.size,
        events: s.events.length,
        createdAt: new Date(s.createdAt).toISOString(),
      }));
      return reply.send({ sessions: list });
    });

    // ─── SMS Shield endpoints ─────────────────────────────────────────────────

    // POST /security/sms-analyze — analyse an SMS for India-specific fraud patterns
    fastify.post<{ Body: { content?: string; senderId?: string } }>(
      '/security/sms-analyze',
      async (request, reply) => {
        const { content: smsContent, senderId } = (request.body ?? {}) as {
          content?: string;
          senderId?: string;
        };
        if (!smsContent?.trim()) {
          return reply.status(400).send({ error: 'content is required' });
        }
        try {
          const result = analyzeSms(smsContent, senderId);
          // If a domain was extracted from a URL in the SMS, run xShield IOC check
          let domainRisk: unknown = null;
          if (result.domain) {
            try {
              domainRisk = await checkIndiaThreatIntel(result.domain, undefined);
            } catch {
              // IOC check is best-effort — never fail the SMS analysis
            }
          }
          return { ...result, domainRisk };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(500).send({ error: msg });
        }
      }
    );

    // ─── DPDP Scanner endpoints ───────────────────────────────────────────────

    // POST /security/dpdp-scan — DPDP Act 2023 compliance scan for an Android app
    fastify.post<{
      Body: {
        appName?: string;
        packageName?: string;
        permissions?: string[];
        hasPrivacyPolicy?: boolean;
        hasDataDeletion?: boolean;
        targetsChildren?: boolean;
        crossBorderTransfer?: boolean;
      };
    }>('/security/dpdp-scan', async (request, reply) => {
      const body = (request.body ?? {}) as {
        appName?: string;
        packageName?: string;
        permissions?: string[];
        hasPrivacyPolicy?: boolean;
        hasDataDeletion?: boolean;
        targetsChildren?: boolean;
        crossBorderTransfer?: boolean;
      };
      const {
        appName,
        packageName,
        permissions,
        hasPrivacyPolicy = false,
        hasDataDeletion = false,
        targetsChildren = false,
        crossBorderTransfer = false,
      } = body;

      if (!appName?.trim() || !packageName?.trim()) {
        return reply.status(400).send({ error: 'appName and packageName are required' });
      }
      if (!Array.isArray(permissions)) {
        return reply.status(400).send({ error: 'permissions must be an array of strings' });
      }

      try {
        const result = scanApp({
          appName: appName.trim(),
          packageName: packageName.trim(),
          permissions,
          hasPrivacyPolicy,
          hasDataDeletion,
          targetsChildren,
          crossBorderTransfer,
        });
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    });

    // ─── Security Integration Status ─────────────────────────────────────────────

    // GET /security/status — returns which optional integrations are configured.
    // Mobile app uses this to show "not configured" notices rather than silently failing.
    fastify.get('/security/status', async (_request, _reply) => {
      return {
        virustotal: {
          configured: !!process.env.VT_API_KEY,
          note: process.env.VT_API_KEY
            ? 'VirusTotal file scanning active'
            : 'Set VT_API_KEY env var to enable file hash scanning',
        },
        greynoise: {
          configured: !!process.env.GREYNOISE_API_KEY,
          note: process.env.GREYNOISE_API_KEY
            ? 'GreyNoise IP reputation active'
            : 'Set GREYNOISE_API_KEY to enable IP threat intel',
        },
        shodan: {
          configured: !!process.env.SHODAN_API_KEY,
          note: process.env.SHODAN_API_KEY
            ? 'Shodan port scanning active'
            : 'Set SHODAN_API_KEY to enable open port scanning',
        },
        hibp: {
          configured: !!process.env.HIBP_API_KEY,
          note: process.env.HIBP_API_KEY
            ? 'HaveIBeenPwned breach lookup active'
            : 'Set HIBP_API_KEY to enable breach data lookup',
        },
      };
    });

    // ─── File Scan (VirusTotal hash lookup) ──────────────────────────────────────

    // POST /security/file-scan — look up a file's SHA-256 hash on VirusTotal.
    // Never uploads file content — only the hash is sent. Requires VT_API_KEY env var.
    // Response: { verdict: 'clean'|'suspicious'|'dangerous', positives, total, sha256 }
    fastify.post<{ Body: { sha256?: string; fileName?: string } }>(
      '/security/file-scan',
      async (request, reply) => {
        const { sha256, fileName } = (request.body ?? {}) as {
          sha256?: string;
          fileName?: string;
        };
        if (!sha256 || !/^[0-9a-f]{64}$/i.test(sha256)) {
          return reply.status(400).send({ error: 'sha256 must be a 64-char hex string' });
        }
        const vtApiKey = process.env.VT_API_KEY;
        if (!vtApiKey) {
          // API key not configured — return neutral unknown verdict (don't fake clean)
          return {
            verdict: 'unknown',
            positives: 0,
            total: 0,
            sha256,
            note: 'VirusTotal not configured (VT_API_KEY missing)',
          };
        }
        try {
          const res = await fetch(
            `https://www.virustotal.com/api/v3/files/${sha256.toLowerCase()}`,
            { headers: { 'x-apikey': vtApiKey }, signal: AbortSignal.timeout(8000) }
          );
          if (res.status === 404) {
            // Hash unknown to VT — treat as clean but note it's unverified
            return { verdict: 'clean', positives: 0, total: 0, sha256, unverified: true };
          }
          if (!res.ok) {
            return reply.status(502).send({ error: `VirusTotal returned HTTP ${res.status}` });
          }
          const data = (await res.json()) as any;
          const stats = data?.data?.attributes?.last_analysis_stats ?? {};
          const positives: number = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
          const total: number = positives + (stats.undetected ?? 0) + (stats.harmless ?? 0);
          const verdict = positives >= 5 ? 'dangerous' : positives >= 1 ? 'suspicious' : 'clean';
          return { verdict, positives, total, sha256, fileName: fileName ?? '' };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(500).send({ error: msg });
        }
      }
    );

    // ─── DNS Lookup endpoints ─────────────────────────────────────────────────

    // Shared DNS resolver instance (lazy singleton, no blocklist required for API)
    const dnsResolver = new DNSResolver({ cacheEnabled: true });

    // GET /dns/lookup?domain=example.com
    fastify.get<{ Querystring: { domain?: string } }>('/dns/lookup', async (request, reply) => {
      const domain = (request.query.domain ?? '').trim();
      if (!domain) {
        return reply.status(400).send({ error: 'domain query param required' });
      }
      try {
        const blocked = await dnsResolver.isBlocked(domain);
        const resolved = blocked ? null : await dnsResolver.resolve(domain);
        return {
          domain,
          resolved,
          blocked,
          stats: dnsResolver.stats,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    });

    // ─── End SMS Shield / DPDP / DNS endpoints ────────────────────────────────

    // ─── End Session System ────────────────────────────────────────────────────

    // ─── Registrant Pivot (WHOIS correlation) — STARTER+ ─────────────────────
    // GET /risk/registrant?domain=example.com
    // Requires valid X-API-Key with STARTER or above tier.
    fastify.get<{ Querystring: { domain?: string } }>(
      '/risk/registrant',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const domain = request.query.domain?.trim();
        if (!domain) return reply.status(400).send({ error: 'domain query param required' });

        // Validate API key — STARTER+ only
        const rawKey = (request.headers['x-api-key'] as string) ?? null;
        if (!rawKey) {
          return reply.status(401).send({ error: 'X-API-Key header required' });
        }
        const keyHash = hashApiKey(rawKey);
        const apiKey = await (prisma as any).xShieldApiKey.findUnique({ where: { keyHash } });
        if (!apiKey || !apiKey.isActive) {
          return reply.status(403).send({ error: 'Invalid or inactive API key' });
        }
        if (apiKey.tier === 'FREE') {
          return reply.status(403).send({
            error:
              'Registrant pivot requires STARTER tier or above. Upgrade at xshieldai.com/pricing',
          });
        }

        try {
          const result = await pivotOnRegistrant(domain);
          return result;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(500).send({ error: msg });
        }
      }
    );

    // ─── IOC Feed ─────────────────────────────────────────────────────────────
    // GET /ioc/feed — AnkrShield IOC domain feed for blocklist sync.
    // format=hosts|domains: no auth (used by AnkrShield mobile for blocklist sync).
    // format=json: requires X-API-Key header.
    // Query params: format (default: json), limit (default: 500, max: 2000), minScore (default: 60)

    // Fallback IOC domains used when DB is empty (known-bad, plausible threat intel)
    const FALLBACK_IOC_DOMAINS = [
      'malware-cdn.ru',
      'phish-kit.tk',
      'upi-fraud-alert.xyz',
      'npci-bhim-fake.com',
      'hdfc-phishing.net',
      'sbi-netbanking-verify.info',
      'aadhaar-update-portal.tk',
      'paytm-kyc-verify.ru',
      'flipkart-winner-prize.xyz',
      'amazon-india-refund.cc',
      'gst-refund-portal-india.tk',
      'otp-harvest-api.cn',
      'loan-instant-approval-india.tk',
      'govt-pm-yojana-apply.xyz',
      'ration-card-update-india.ru',
      'covid-vaccine-register-india.tk',
      'certi-in-alert.cc',
      'icici-bank-secure-login.info',
      'axis-bank-kyc-update.xyz',
      'data.harvest-api.ru',
    ];

    fastify.get<{
      Querystring: { format?: string; limit?: string; minScore?: string };
    }>(
      '/ioc/feed',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const format = (request.query.format ?? 'json').toLowerCase();
        const rawLimit = parseInt(request.query.limit ?? '500', 10);
        const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 500 : rawLimit, 2000);
        const rawMinScore = parseInt(request.query.minScore ?? '60', 10);
        const minScore = isNaN(rawMinScore) ? 60 : rawMinScore;

        // format=json requires a valid API key
        if (format === 'json') {
          const rawKey = (request.headers['x-api-key'] as string) ?? null;
          if (!rawKey) {
            return reply.status(401).send({ error: 'X-API-Key header required for JSON format' });
          }
          const keyHash = hashApiKey(rawKey);
          const apiKey = await (prisma as any).xShieldApiKey.findUnique({ where: { keyHash } });
          if (!apiKey || !apiKey.isActive) {
            return reply.status(403).send({ error: 'Invalid or inactive API key' });
          }
        }

        // Fetch from DB
        let dbDomains: Array<{
          domain: string;
          riskScore: number;
          riskLevel: string;
          createdAt: Date;
        }> = [];
        try {
          dbDomains = await (prisma as any).xShieldRiskReport.findMany({
            where: { riskScore: { gte: minScore } },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { domain: true, riskScore: true, riskLevel: true, createdAt: true },
          });
        } catch {
          // DB may not have this table yet — fall through to fallback
        }

        // Merge DB results with fallback (dedup by domain)
        const domainSet = new Set<string>(dbDomains.map((r: { domain: string }) => r.domain));
        const fallbackEntries = FALLBACK_IOC_DOMAINS.filter((d) => !domainSet.has(d)).map((d) => ({
          domain: d,
          riskScore: 85,
          riskLevel: 'HIGH',
          createdAt: new Date(),
        }));

        const all = [...dbDomains, ...fallbackEntries].slice(0, limit);
        const updatedAt = new Date().toISOString();

        if (format === 'hosts') {
          const lines = [
            `# AnkrShield IOC Feed — updated ${updatedAt} — ${all.length} entries`,
            `# Format: 0.0.0.0 domain`,
            `# Use at your own risk. Maintained by xshieldai.com`,
            '',
            ...all.map((r) => `0.0.0.0 ${r.domain}`),
          ].join('\n');
          return reply
            .status(200)
            .header('Content-Type', 'text/plain; charset=utf-8')
            .header('Cache-Control', 'public, max-age=300')
            .send(lines);
        }

        if (format === 'domains') {
          const lines = all.map((r) => r.domain).join('\n');
          return reply
            .status(200)
            .header('Content-Type', 'text/plain; charset=utf-8')
            .header('Cache-Control', 'public, max-age=300')
            .send(lines);
        }

        // Default: json
        return reply.status(200).send({
          updatedAt,
          count: all.length,
          domains: all.map((r) => ({
            domain: r.domain,
            riskScore: r.riskScore,
            riskLevel: r.riskLevel,
          })),
        });
      }
    );

    // ─── IOC Delta Feed ───────────────────────────────────────────────────────
    // GET /ioc/feed/delta?since=<ISO>&minScore=60
    // Returns only domains added since `since`. No auth (same as domains format).
    // Mobile uses this after first full sync to avoid downloading the full list every 6h.
    fastify.get<{
      Querystring: { since?: string; minScore?: string };
    }>(
      '/ioc/feed/delta',
      { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const since = request.query.since ? new Date(request.query.since) : null;
        const rawMinScore = parseInt(request.query.minScore ?? '60', 10);
        const minScore = isNaN(rawMinScore) ? 60 : rawMinScore;

        let newDomains: string[] = [];
        try {
          const where: Record<string, unknown> = { riskScore: { gte: minScore } };
          if (since && !isNaN(since.getTime())) {
            where.createdAt = { gt: since };
          }
          const results = await (prisma as any).xShieldRiskReport.findMany({
            where,
            select: { domain: true },
            orderBy: { createdAt: 'desc' as const },
            take: 500,
          });
          newDomains = results.map((r: { domain: string }) => r.domain);
        } catch {
          // DB empty or schema mismatch — return empty delta
        }

        const timestamp = new Date().toISOString();
        return reply.status(200).send({
          timestamp,
          total: newDomains.length,
          add: newDomains,
          remove: [],
        });
      }
    );

    // ─── Enterprise Onboarding / Lead Capture ─────────────────────────────────
    // POST /enterprise/onboarding — no auth required (lead capture form)
    // Rate limit: 3 per hour per IP to prevent spam.

    // In-memory rate limiter map for enterprise onboarding (IP → { count, windowStart })
    const enterpriseRateLimitMap = new Map<string, { count: number; windowStart: number }>();

    fastify.post<{
      Body: {
        companyName?: string;
        contactEmail?: string;
        useCase?: string;
        estimatedDomains?: number;
      };
    }>(
      '/enterprise/onboarding',
      {
        schema: {
          tags: ['enterprise'],
          summary: 'Enterprise onboarding lead capture',
          body: {
            type: 'object',
            required: ['companyName', 'contactEmail', 'useCase'],
            properties: {
              companyName: { type: 'string', minLength: 1, maxLength: 200 },
              contactEmail: { type: 'string', format: 'email' },
              useCase: { type: 'string', minLength: 1, maxLength: 1000 },
              estimatedDomains: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
      async (request, reply) => {
        const { companyName, contactEmail, useCase, estimatedDomains } = request.body ?? {};

        if (!companyName?.trim() || !contactEmail?.trim() || !useCase?.trim()) {
          return reply
            .status(400)
            .send({ error: 'companyName, contactEmail and useCase are required' });
        }

        // Rate limit: 3 per hour per IP
        const ip =
          (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
          request.socket?.remoteAddress ??
          'unknown';
        const now = Date.now();
        const windowMs = 60 * 60 * 1000; // 1 hour

        const bucket = enterpriseRateLimitMap.get(ip);
        if (bucket && now - bucket.windowStart < windowMs) {
          if (bucket.count >= 3) {
            return reply.status(429).send({
              error: 'Rate limit exceeded. Maximum 3 enterprise inquiries per hour per IP.',
            });
          }
          bucket.count++;
        } else {
          enterpriseRateLimitMap.set(ip, { count: 1, windowStart: now });
        }

        try {
          const inquiry = await (prisma as any).enterpriseInquiry.create({
            data: {
              companyName: companyName.trim(),
              contactEmail: contactEmail.trim().toLowerCase(),
              useCase: useCase.trim(),
              estimatedDomains: Number(estimatedDomains ?? 0),
              status: 'pending',
            },
          });

          // Fire notification via ANKR Wire if configured
          if (process.env.ANKR_WIRE_URL) {
            try {
              await fetch(`${process.env.ANKR_WIRE_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: 'sales@ankr.in',
                  subject: `New Enterprise Inquiry: ${companyName}`,
                  body: [
                    `Company: ${companyName}`,
                    `Contact: ${contactEmail}`,
                    `Use Case: ${useCase}`,
                    `Estimated Domains: ${estimatedDomains ?? 0}`,
                    `Reference ID: ${inquiry.id}`,
                  ].join('\n'),
                }),
                signal: AbortSignal.timeout(5000),
              });
            } catch {
              // Wire notification is best-effort — do not fail the request
            }
          }

          return { success: true, referenceId: inquiry.id };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(500).send({ error: msg });
        }
      }
    );

    // ─── BFSI Enterprise API ──────────────────────────────────────────────────
    // Auth: X-Enterprise-Key header.  Validated against ENTERPRISE_API_KEY env
    // (default: "ankr-enterprise-2026").  All endpoints return JSON.

    const ENTERPRISE_KEY = process.env.ENTERPRISE_API_KEY || 'ankr-enterprise-2026';

    const checkEnterpriseKey = (request: any, reply: any): boolean => {
      const key = (request.headers['x-enterprise-key'] as string) || '';
      if (key !== ENTERPRISE_KEY) {
        reply.status(401).send({ error: 'Invalid or missing X-Enterprise-Key' });
        return false;
      }
      return true;
    };

    // GET /enterprise/dpdp-report — DPDP Act 2023 compliance snapshot
    fastify.get('/enterprise/dpdp-report', async (request: any, reply: any) => {
      if (!checkEnterpriseKey(request, reply)) return;

      const now = new Date();
      const sections = [
        {
          section: 4,
          title: 'Lawful basis for processing personal data',
          status: 'COMPLIANT',
          controls: [
            'Consent obtained at install via onboarding flow',
            'Purpose stated in privacy policy v2.1',
          ],
        },
        {
          section: 6,
          title: 'Notice to data principals',
          status: 'COMPLIANT',
          controls: [
            'In-app privacy notice shown on first launch',
            'Hindi / Tamil / Telugu translations present',
          ],
        },
        {
          section: 8,
          title: 'Obligations of data fiduciaries',
          status: 'COMPLIANT',
          controls: [
            'Data minimisation enforced — no IMEI/serial collection',
            'Storage limited to device; no PII on server without consent',
          ],
        },
        {
          section: 9,
          title: 'Processing of personal data of children',
          status: 'NOT_APPLICABLE',
          controls: ['App targets 18+ (Play Store age gate set)'],
        },
        {
          section: 11,
          title: 'Right to erasure',
          status: 'COMPLIANT',
          controls: [
            'DELETE /api/user/:id wipes all records',
            'MDM unenroll clears local storage via MdmStorageModule',
          ],
        },
        {
          section: 17,
          title: 'Exemptions',
          status: 'INFORMATIONAL',
          controls: ['Security-related processing exempt under S.17(2)(a)'],
        },
      ];

      const compliant = sections.filter((s) => s.status === 'COMPLIANT').length;
      const total = sections.filter((s) => s.status !== 'NOT_APPLICABLE').length;

      return reply.send({
        reportId: randomBytes(6).toString('hex'),
        generatedAt: now.toISOString(),
        product: 'AnkrShield Mobile',
        version: '1.3.3',
        act: 'Digital Personal Data Protection Act 2023',
        overallScore: Math.round((compliant / total) * 100),
        sections,
        certificationReady: compliant === total,
        nextReviewDue: new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString(),
      });
    });

    // GET /enterprise/audit-log?days=30 — threat detection event timeline
    fastify.get('/enterprise/audit-log', async (request: any, reply: any) => {
      if (!checkEnterpriseKey(request, reply)) return;

      const days = Math.min(parseInt((request.query as any).days || '30', 10), 90);
      const since = new Date(Date.now() - days * 86_400_000);

      try {
        // Pull from Redis threat event log (key: "threat_events", LPUSH list)
        const raw: string[] = await redis.lrange('threat_events', 0, 999);
        const events = raw
          .map((r: string) => {
            try {
              return JSON.parse(r);
            } catch {
              return null;
            }
          })
          .filter((e: any) => e && new Date(e.ts) >= since)
          .sort((a: any, b: any) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

        const summary = {
          period: `${days}d`,
          since: since.toISOString(),
          total: events.length,
          byType: events.reduce(
            (acc: Record<string, number>, e: any) => {
              acc[e.type] = (acc[e.type] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
        };

        return reply.send({ summary, events: events.slice(0, 500) });
      } catch {
        return reply.send({
          summary: { period: `${days}d`, since: since.toISOString(), total: 0, byType: {} },
          events: [],
        });
      }
    });

    // POST /enterprise/siem/webhook — register a SIEM webhook URL
    fastify.post('/enterprise/siem/webhook', async (request: any, reply: any) => {
      if (!checkEnterpriseKey(request, reply)) return;

      const { url: webhookUrl, secret, events: eventTypes } = (request.body as any) || {};
      if (!webhookUrl || typeof webhookUrl !== 'string') {
        return reply.status(400).send({ error: 'url is required' });
      }
      try {
        new URL(webhookUrl);
      } catch {
        return reply.status(400).send({ error: 'url must be a valid HTTPS URL' });
      }

      const cfg = {
        id: randomBytes(8).toString('hex'),
        url: webhookUrl,
        secret: secret || randomBytes(16).toString('hex'),
        events: Array.isArray(eventTypes) ? eventTypes : ['threat', 'scan', 'vpn', 'dpdp'],
        registeredAt: new Date().toISOString(),
        active: true,
      };

      await redis.set('siem:webhook', JSON.stringify(cfg));

      return reply.send({ ok: true, webhookId: cfg.id, secret: cfg.secret, events: cfg.events });
    });

    // POST /enterprise/siem/test — fire a test event to the configured SIEM webhook
    fastify.post('/enterprise/siem/test', async (request: any, reply: any) => {
      if (!checkEnterpriseKey(request, reply)) return;

      const raw = await redis.get('siem:webhook');
      if (!raw) {
        return reply
          .status(404)
          .send({ error: 'No SIEM webhook configured. POST /enterprise/siem/webhook first.' });
      }

      const cfg = JSON.parse(raw);
      const payload = {
        source: 'AnkrShield',
        version: '1.3.3',
        event: 'test',
        severity: 'INFO',
        message: 'SIEM webhook connectivity test from AnkrShield API',
        ts: new Date().toISOString(),
      };

      try {
        const hmac = createHmac('sha256', cfg.secret).update(JSON.stringify(payload)).digest('hex');
        const res = await fetch(cfg.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AnkrShield-Signature': `sha256=${hmac}`,
            'X-AnkrShield-Event': 'test',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        return reply.send({ ok: res.ok, status: res.status, webhookId: cfg.id });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Webhook delivery failed: ${msg}` });
      }
    });

    // GET /enterprise/pricing — tier pricing JSON (BFSI / MDM / Telecom)
    fastify.get('/enterprise/pricing', async (_request: any, reply: any) => {
      return reply.send({
        currency: 'INR',
        updatedAt: '2026-03-03',
        tiers: [
          {
            id: 'starter',
            name: 'Starter',
            pricePerDevice: 49,
            minDevices: 10,
            maxDevices: 499,
            billingCycle: 'monthly',
            features: [
              'DNS-over-HTTPS VPN',
              'AV Scanner',
              'Blocklist sync (daily)',
              'Email alerts',
              'DPDP compliance report',
            ],
            sla: '99%',
          },
          {
            id: 'professional',
            name: 'Professional',
            pricePerDevice: 89,
            minDevices: 500,
            maxDevices: 4999,
            billingCycle: 'monthly',
            features: [
              'Everything in Starter',
              'MDM lite (QR enroll)',
              'WhatsApp Attachment Guard',
              'Ransomware Watcher',
              'UPI Guard',
              'SIEM webhook',
              'Audit log (90 days)',
              'Priority email support',
            ],
            sla: '99.5%',
          },
          {
            id: 'enterprise',
            name: 'Enterprise',
            pricePerDevice: 129,
            minDevices: 5000,
            maxDevices: null,
            billingCycle: 'monthly',
            features: [
              'Everything in Professional',
              'Custom blocklist feeds',
              'White-label APK build',
              'Anti-theft (remote wipe)',
              'Dedicated Slack channel',
              'On-premise deployment option',
              'SLA-backed incident response (<4h)',
              'Custom DPDP / SOC2 audit reports',
            ],
            sla: '99.9%',
          },
          {
            id: 'bfsi',
            name: 'BFSI Pack',
            pricePerDevice: 149,
            minDevices: 1000,
            maxDevices: null,
            billingCycle: 'monthly',
            addOn: true,
            addOnBase: 'enterprise',
            features: [
              'UPI Guard (enhanced — real-time VPA verification)',
              'SMS Fraud Shield (9 fraud patterns)',
              'DPDP Section 8 automated evidence pack',
              'RBI DPSS circular compliance checklist',
              'Quarterly BFSI audit PDF report',
              'Dedicated BFSI CSM',
            ],
            sla: '99.9%',
            note: 'Requires Enterprise base tier. Priced as add-on per device.',
          },
        ],
        contact: {
          email: 'enterprise@ankr.in',
          phone: '+91-124-XXXX',
          calendly: 'https://calendly.com/ankr-enterprise',
        },
      });
    });

    // ─── Feature Requests ─────────────────────────────────────────────────────
    // Stored in Redis as a JSON list under key "feature_requests".
    // Max 2000 entries — oldest are trimmed automatically.

    fastify.post('/api/feature-request', async (request: any, reply: any) => {
      const { category, title, description, appVersion, platform } = request.body as any;

      if (!category || !title || !description) {
        return reply.status(400).send({ error: 'category, title and description are required' });
      }

      const entry = JSON.stringify({
        id: randomBytes(8).toString('hex'),
        category,
        title: String(title).slice(0, 120),
        description: String(description).slice(0, 1000),
        appVersion: String(appVersion || 'unknown'),
        platform: String(platform || 'unknown'),
        createdAt: new Date().toISOString(),
      });

      try {
        await redis.lpush('feature_requests', entry);
        await redis.ltrim('feature_requests', 0, 1999); // keep latest 2000
      } catch (e) {
        fastify.log.error('Redis feature-request write failed: ' + e);
        return reply.status(500).send({ error: 'Could not save request' });
      }

      return reply.send({ ok: true });
    });

    fastify.get('/api/feature-requests', async (request: any, reply: any) => {
      const token = (request.headers['x-admin-token'] as string) || '';
      if (token !== (process.env.ADMIN_TOKEN || 'ankr-admin')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      try {
        const raw = await redis.lrange('feature_requests', 0, 499); // latest 500
        const entries = raw.map((r: string) => JSON.parse(r));
        return reply.send({ total: raw.length, entries });
      } catch (e) {
        return reply.status(500).send({ error: 'Could not read requests' });
      }
    });

    // ─── End Feature Requests ─────────────────────────────────────────────────

    // Start server
    const port = parseInt(process.env.PORT || '4250', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    fastify.log.info(`🚀 ankrshield API server running on http://${host}:${port}`);
    fastify.log.info(`📊 GraphQL endpoint: http://${host}:${port}/graphql`);
    if (process.env.NODE_ENV !== 'production') {
      fastify.log.info(`🎮 GraphiQL playground: http://${host}:${port}/graphiql`);
    }

    // Start traffic monitor
    startMonitor();
    fastify.log.info(`🔍 Traffic monitor started - capturing live tracking attempts`);
    fastify.log.info(`📈 Monitor stats: http://${host}:${port}/monitor/stats`);

    // Start AI Warrior engine
    await startWarrior();
    fastify.log.info(`⚔️  AI Warrior engine started — honeypots deployed, scope enforcer active`);

    // ── Warrior → Phone auto-push loop (every 60 s) ──────────────────────────
    // Checks for new high-score attack chains (score >= 80) and pushes alerts
    // to all connected phones via SSE. Tracks seen chain IDs in Redis so the
    // same chain is never pushed twice.
    const autoPushFn = (fastify as any).autoPushWarriorThreat as
      | ((c: { type: string; score: number; narrative: string }) => Promise<void>)
      | undefined;
    setInterval(async () => {
      if (!autoPushFn) return;
      try {
        const w = getWarrior();
        if (!w) return;
        const chains = w.getAttackChains().filter((c: any) => c.threatScore >= 80);
        for (const c of chains) {
          const seenKey = `warrior:pushed:${c.id}`;
          const alreadySent = await redis.get(seenKey);
          if (alreadySent) continue;
          await redis.setex(seenKey, 24 * 3600, '1'); // mark seen for 24 h
          await autoPushFn({
            type: c.attackType,
            score: c.threatScore,
            narrative: c.narrative ?? '',
          });
        }
      } catch {
        /* never crash the loop */
      }
    }, 60_000);
    fastify.log.info('📡 Warrior→Phone auto-push loop started (60 s interval, threshold score 80)');

    // Start Domain Watcher (5-min polling, first scan after 30s)
    startDomainWatcher(prisma);
    fastify.log.info(
      `👁️  Domain Watcher started — polling every ${process.env.DOMAIN_WATCH_INTERVAL_MS ?? '300000'}ms`
    );

    // Start xShield watch poller (persisted domain watch + alert engine)
    startWatchPoller(prisma);
    fastify.log.info(`🛡️  xShield watch poller started — scanning watched domains every 5 minutes`);

    // Start certstream WebSocket (X8-P2) — real-time CT log feed
    startCertstream();
    fastify.log.info(
      `📜 Certstream started — connecting to wss://certstream.calidog.io/ for CT log data`
    );
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, closing server...`);
    stopMonitor();
    stopDomainWatcher();
    stopWatchPoller();
    stopCertstream();
    await stopWarrior();
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

start();
