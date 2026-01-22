/**
 * Authentication plugin for Fastify
 */

import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { FastifyInstance } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  const jwtSecret = process.env.JWT_SECRET || 'change-this-secret-in-production';

  fastify.register(jwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
  });

  // Add JWT verification decorator
  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
});
