/**
 * ankrshield API Server with GraphQL
 */

import os from 'node:os';

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
          type: c.type,
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
        type: c.type ?? 'unknown',
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
          type: e.type,
          description: e.description,
          timestamp: e.timestamp,
          confidence: e.confidence,
        })),
      }));

      const quarantineDetails = quarantined.map((q) => ({
        agentId: q.agentId,
        agentName: q.agentName,
        reason: q.reason,
        threatScore: q.threatScore,
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
    await stopWarrior();
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

start();
