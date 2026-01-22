/**
 * Configuration management
 */

import { z } from 'zod';

export const ConfigSchema = z.object({
  apiUrl: z.string().url(),
  apiPort: z.number().default(4000),
  webPort: z.number().default(3000),
  databaseUrl: z.string(),
  redisUrl: z.string(),
  jwtSecret: z.string(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    apiUrl: process.env.API_URL || 'http://localhost:4000',
    apiPort: parseInt(process.env.API_PORT || '4000', 10),
    webPort: parseInt(process.env.WEB_PORT || '3000', 10),
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/ankrshield',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  });
}
