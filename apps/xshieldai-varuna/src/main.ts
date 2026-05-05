/**
 * Varuna — Maritime OT Posture
 *
 * Port: 4254 (from PORT env — never hardcoded per ankr-ctl policy)
 * Service key: xshieldai-varuna
 * Phase: 1 (Protocol surface — Modbus, NMEA, AIS/GPS, topology, posture)
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { registerAISRoutes } from './ais/routes.js';
import { registerForjaRoutes } from './forja/routes.js';
import { registerModbusRoutes } from './modbus/routes.js';
import { registerNMEARoutes } from './nmea/routes.js';
import { registerPostureRoutes } from './posture/routes.js';
import { registerTopologyRoutes } from './topology/routes.js';

// ─── Port guard ───────────────────────────────────────────────────────────────
const PORT = process.env['PORT'];
if (!PORT) throw new Error('[xshieldai-varuna] PORT env not injected — use ankr-ctl to start');

const HOST = process.env['HOST'] ?? '0.0.0.0';

// ─── Server ───────────────────────────────────────────────────────────────────
const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

await app.register(cors, {
  origin: process.env['CORS_ORIGIN'] ?? '*',
  methods: ['GET', 'POST', 'OPTIONS'],
});

// @rule:VRN-006 Least-privilege applies to API surface too — tight rate limit
await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip ?? 'unknown',
  errorResponseBuilder: (_req, context) => ({
    error: 'rate_limit_exceeded',
    message: `Limit: ${context.max} per ${context.after}. Retry after ${context.after}.`,
    statusCode: 429,
  }),
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  service: 'xshieldai-varuna',
  version: '0.1.0',
  port: PORT,
  phase: 'phase-1-protocol-surface',
  timestamp: new Date().toISOString(),
}));

// ─── Routes ───────────────────────────────────────────────────────────────────
await registerForjaRoutes(app);
await registerModbusRoutes(app);
await registerNMEARoutes(app);
await registerAISRoutes(app);
await registerTopologyRoutes(app);
await registerPostureRoutes(app);

// ─── Start ────────────────────────────────────────────────────────────────────
try {
  await app.listen({ port: parseInt(PORT), host: HOST });
  app.log.info(
    `Varuna Maritime OT Posture running on port ${PORT} (Phase 1 — Modbus/NMEA/AIS/GPS/Topology)`
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
