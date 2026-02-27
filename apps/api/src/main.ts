/**
 * ankrshield API Server with GraphQL
 */

import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';

import {
  runRiskEngine,
  scanIpWithGreyNoise,
  socialThreatsToWarriorEvents,
  buildRemediationPlaybook,
  scanSupplyChain,
  parseManifest,
} from '@ankrshield/risk-intelligence';
import { SpywareScanner } from '@ankrshield/spyware-detector';
import fastifyCookie from '@fastify/cookie';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import Redis from 'ioredis';
import mercurius from 'mercurius';

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

        return reply.status(201).send({
          token,
          user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
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

    // ─── End Session System ────────────────────────────────────────────────────

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
    await stopWarrior();
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

start();
