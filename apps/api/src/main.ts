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
