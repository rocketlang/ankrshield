/**
 * ankrshield API Server with GraphQL
 */

import Fastify from 'fastify';
import mercurius from 'mercurius';
import { schema } from './graphql/schema';
import { prisma } from './graphql/builder';
import type { Context } from './graphql/builder';
import securityPlugin from './plugins/security';
import authPlugin from './plugins/auth';
import { startMonitor, stopMonitor, getMonitor } from './monitor/traffic-monitor';
import { startWarrior, stopWarrior } from './warrior/warrior-service';
import { SpywareScanner } from '@ankrshield/spyware-detector';

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
          customIocs: Array.isArray(opts.customIocs) ? opts.customIocs as string[] : undefined,
        });
        const result = await scanner.scan();
        return result;
      } catch (err: any) {
        return { error: err.message, scannedAt: new Date().toISOString(), isClean: null };
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
          blockRate: stats.total_requests > 0
            ? ((parseInt(stats.blocked_requests) / parseInt(stats.total_requests)) * 100).toFixed(1) + '%'
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
