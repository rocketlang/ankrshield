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

    // Start server
    const port = parseInt(process.env.PORT || '4250', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    fastify.log.info(`🚀 ankrshield API server running on http://${host}:${port}`);
    fastify.log.info(`📊 GraphQL endpoint: http://${host}:${port}/graphql`);
    if (process.env.NODE_ENV !== 'production') {
      fastify.log.info(`🎮 GraphiQL playground: http://${host}:${port}/graphiql`);
    }
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
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

start();
