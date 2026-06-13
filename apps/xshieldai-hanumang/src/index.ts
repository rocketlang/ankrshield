// HanumanG — Agent Delegation Posture Monitor
// @rule:HNG-S-017 — Forja-native from birth; STATE/TRUST/SENSE/PROOF before any feature
// @rule:CA-001 — PORT must be injected by ankr-ctl; never hardcoded

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';

import { revoked } from './core/containment.js';
import { getDb } from './core/db.js';
import { agentRoutes } from './routes/agents.js';
import { attestationRoutes } from './routes/attestation.js';
import { forjaRoutes } from './routes/forja.js';
import { observeRoutes } from './routes/observe.js';

// @rule:HNG-S-017 — PORT must be injected by ankr-ctl, never hardcoded
const PORT = parseInt(process.env['PORT'] ?? '');
if (!PORT || isNaN(PORT)) {
  console.error('FATAL: PORT env var not injected. Use ankr-ctl to start.');
  process.exit(1);
}

// Initialise DB on startup
getDb();

const app = Fastify({ logger: { level: 'info' } });

await app.register(cors, { origin: true });
await app.register(helmet, { contentSecurityPolicy: false });

// Forja protocol
await app.register(forjaRoutes, { prefix: '/api/v2/forja' });

// Domain routes
await app.register(agentRoutes);
await app.register(observeRoutes);
await app.register(attestationRoutes);

// @rule:HNG — Shatru-commanded containment: revoke an agent's delegation identity (the WHO
// half of a capability-kill). HanumanG owns the agent register; Shatru commands, we record +
// ENFORCE — a revoked agent fails attestation (see routes/attestation).
app.post<{ Body: { agentId?: string; reason?: string } }>('/api/v2/agent/revoke', async (req) => {
  const { agentId, reason } = req.body ?? {};
  if (agentId) revoked.add(agentId);
  return {
    revoked: true,
    agentId: agentId ?? null,
    reason: reason ?? null,
    register_revoked: revoked.size,
    at: new Date().toISOString(),
  };
});
app.get('/api/v2/agent/revoked', async () => ({ revoked: [...revoked] }));

app.get('/health', async () => ({
  service: 'xshieldai-hanumang',
  brand: 'HanumanG',
  version: '0.1.0',
  status: 'ok',
  port: PORT,
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`[HanumanG] Agent Delegation Posture Monitor running on port ${PORT}`);
