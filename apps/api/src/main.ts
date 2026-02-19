/**
 * ankrshield API Server with GraphQL
 */

import { execSync } from 'node:child_process';
import os from 'node:os';

import {
  runRiskEngine,
  scanIpWithGreyNoise,
  socialThreatsToWarriorEvents,
} from '@ankrshield/risk-intelligence';
import { SpywareScanner } from '@ankrshield/spyware-detector';
import Fastify from 'fastify';
import mercurius from 'mercurius';

import { prisma } from './graphql/builder';
import type { Context } from './graphql/builder';
import { schema } from './graphql/schema';
import { startMonitor, stopMonitor, getMonitor } from './monitor/traffic-monitor';
import authPlugin from './plugins/auth';
import securityPlugin from './plugins/security';
import { getWarrior, startWarrior, stopWarrior } from './warrior/warrior-service';
import { startDomainWatcher, stopDomainWatcher } from './watch/domain-watcher.js';

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
        return {
          domain: report.domain,
          serverIp: report.serverIp,
          riskScore: report.riskScore,
          riskLevel: report.riskLevel,
          factorCount: report.factors.length,
          durationMs: report.durationMs,
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

    // Start Domain Watcher (5-min polling, first scan after 30s)
    startDomainWatcher(prisma);
    fastify.log.info(
      `👁️  Domain Watcher started — polling every ${process.env.DOMAIN_WATCH_INTERVAL_MS ?? '300000'}ms`
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
    await stopWarrior();
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

start();
