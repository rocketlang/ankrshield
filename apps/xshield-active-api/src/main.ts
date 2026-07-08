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
import { randomBytes, timingSafeEqual } from 'node:crypto';

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

// ─── Service-auth gate — @rule:XSACT-001 (KGT-T2.3, 2026-07-08) ──────────────
// xshield-active fires REAL active defense (takedowns, DMCA, beacons). Every
// state-changing route was anonymous: anyone could POST /action/execute, approve
// a queued takedown, or self-sign the legal addendum. Fix = deny-by-default
// bearer-token gate. Fail-closed: in production the token MUST come from env; in
// dev an unguessable ephemeral is minted so no known key exists in source.
function loadServiceToken(): string {
  const v = process.env['XSHIELD_ACTIVE_TOKEN'];
  if (v && v.length >= 16) return v;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      '[xshield-active] XSHIELD_ACTIVE_TOKEN must be set (>=16 chars) in production — ' +
        'refusing to serve live-fire routes unauthenticated (fail-closed, KGT-T2.3).'
    );
  }
  const eph = randomBytes(32).toString('hex');
  console.warn(
    '[xshield-active] XSHIELD_ACTIVE_TOKEN unset — mutations require a token nobody ' +
      'holds this boot (dev ephemeral). Set the env to enable authenticated calls.'
  );
  return eph;
}
const SERVICE_TOKEN = loadServiceToken();

/** Routes that MUST stay anonymous by design. */
function isPublicRoute(method: string, url: string): boolean {
  const path = url.split('?')[0] ?? url;
  // Reads + CORS preflight never fire actions.
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  // The beacon trap: planted credentials phone home from attacker infra — must be anonymous.
  if (path === '/api/v1/auth/beacon') return true;
  // SIEM push authenticates itself via the per-client token hash (option-b/routes.ts).
  if (path === '/api/v1/siem/push') return true;
  return false;
}

function tokenMatches(presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(SERVICE_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

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

app.addHook('preHandler', async (request, reply) => {
  // @rule:XSACT-001 — authenticate the caller before any state change / live fire.
  if (!isPublicRoute(request.method, request.url)) {
    const auth = request.headers['authorization'];
    const bearer = auth?.startsWith('Bearer ')
      ? auth.slice(7)
      : (request.headers['x-service-token'] as string | undefined);
    if (!tokenMatches(bearer)) {
      reply.status(401).send({
        error: 'unauthorized',
        message: 'xshield-active live-fire routes require a valid service token (KGT-T2.3).',
      });
      return;
    }
  }

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
