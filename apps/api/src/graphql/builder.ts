/**
 * Pothos Schema Builder Configuration
 */

import SchemaBuilder from '@pothos/core';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface Context {
  prisma: PrismaClient;
  userId?: string;
  user?: {
    id: string;
    email: string;
    name: string | null;
    tier: string;
  } | null;
  request?: {
    headers: Record<string, string | string[] | undefined>;
  };
}

export const builder = new SchemaBuilder<{
  Context: Context;
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
  };
}>({
  notStrict: true,
});

// Export prisma instance
export { prisma };
