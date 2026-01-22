/**
 * JWT token utilities
 */

import { FastifyRequest } from 'fastify';

export interface JWTPayload {
  userId: string;
  email: string;
  tier: string;
}

export function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}

export async function verifyToken(
  token: string,
  jwtVerify: (token: string) => Promise<JWTPayload>
): Promise<JWTPayload | null> {
  try {
    return await jwtVerify(token);
  } catch (error) {
    return null;
  }
}
