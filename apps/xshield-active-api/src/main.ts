/**
 * xShield Active Defense API
 *
 * Standalone SIEM connector + active defense service.
 * Fully integrated with xShieldAI (port 4250).
 *
 * Port: 4251 (from PORT env — never hardcoded per ankr-ctl policy)
 * Service key: xshield-active
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { registerForjaRoutes } from './forja/routes.js';
import { registerConsentRoutes } from './consent/routes.js';
import { registerBeaconRoutes } from './beacon/routes.js';
import { registerSiemRoutes } from './option-b/routes.js';
import { registerAuditRoutes } from './audit/routes.js';
import { registerDispatchRoutes } from './dispatch/routes.js';
import { registerOptionARoutes } from './option-a/routes.js';
import { getConsentConfig, isAddendumSigned } from './consent/types.js';

// ─── Port guard ───────────────────────────────────────────────────────────────
const PORT = process.env['PORT'];
if (!PORT) throw new Error('[xshield-active] PORT env not injected — use ankr-ctl to start');

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
// Beacon capture endpoint is the most abuse-prone — tight window.
// Other action routes: 60 req/min per IP (generous for SIEM integrations).
// @rule:XSACT-YK-004 Beacon seeding is gated — rate limit is additional defense-in-depth.
await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip ?? 'unknown',
  errorResponseBuilder: (_req, context) => ({
    error: 'rate_limit_exceeded',
    message: `Too many requests. Limit: ${context.max} per ${context.after}. Retry after ${context.after}.`,
    statusCode: 429,
  }),
});

// ─── Trust preHandler — @rule:CA-005 ─────────────────────────────────────────
// Attaches xsactTrust context to every request so routes don't re-fetch consent state.
// Resolves claw_mask bit 5: per-route addendum checks are now backed by a uniform context.
// @rule:XSACT-011 Addendum gate: every route reads from request.xsactTrust
declare module 'fastify' {
  interface FastifyRequest {
    xsactTrust: {
      clientId: string | null;
      addendumSigned: boolean;
      consentMode: string;
    };
  }
}

app.addHook('preHandler', async (request) => {
  const clientId =
    (request.params as Record<string, string>)?.['clientId'] ??
    (request.body as Record<string, string> | null)?.['client_id'] ??
    null;

  request.xsactTrust = {
    clientId,
    addendumSigned: clientId ? isAddendumSigned(clientId) : false,
    consentMode: clientId ? getConsentConfig(clientId).mode : 'mode_1',
  };
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  service: 'xshield-active',
  version: '0.1.0',
  port: PORT,
  timestamp: new Date().toISOString(),
}));

// ─── Routes ───────────────────────────────────────────────────────────────────
await registerForjaRoutes(app);
await registerConsentRoutes(app);
await registerBeaconRoutes(app);
await registerSiemRoutes(app);
await registerAuditRoutes(app);
await registerDispatchRoutes(app);
await registerOptionARoutes(app);

// ─── Start ────────────────────────────────────────────────────────────────────
try {
  await app.listen({ port: parseInt(PORT), host: HOST });
  app.log.info(`xShield Active Defense running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
