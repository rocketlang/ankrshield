// HanumanG — Agent registry routes
// @rule:HNG-S-002 — every monitored agent has a declared identity (agent_type, officer_role, principal)
// @rule:HNG-YK-001 — Customer Zero = ANKR AI360 staff (7 officers); scope first, scale second
// @rule:CA-004 — _meta on all responses

import type { FastifyInstance } from 'fastify';

import { registerAgent, getAgent, listAgents } from '../core/db.js';

export async function agentRoutes(app: FastifyInstance) {
  // Register or update a monitored agent
  app.post<{
    Body: {
      agent_id: string;
      agent_type: 'officer' | 'worker' | 'auditor' | 'supervisor';
      officer_role?: string;
      principal_id: string;
      customer_id: string;
      trust_mask_granted: number;
      scope_key: string;
      // @rule:HNG-P2-003 — issuing principal's Ed25519 pubkey (SPKI PEM) for mudrika verification
      mudrika_pubkey_pem?: string;
    };
  }>('/api/v1/hanumang/agents', async (req, reply) => {
    const t0 = Date.now();
    const b = req.body;
    if (!b.agent_id || !b.agent_type || !b.principal_id || !b.customer_id || !b.scope_key) {
      return reply
        .status(400)
        .send({ error: 'agent_id, agent_type, principal_id, customer_id, scope_key required' });
    }
    const agent = registerAgent(b);
    return reply.status(201).send({
      agent,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        trust_mask_applied: 1,
      },
    });
  });

  // List all agents for a customer
  app.get<{ Querystring: { customer_id: string } }>(
    '/api/v1/hanumang/agents',
    async (req, reply) => {
      const t0 = Date.now();
      const { customer_id } = req.query;
      if (!customer_id) return reply.status(400).send({ error: 'customer_id required' });
      const agents = listAgents(customer_id);
      return {
        agents,
        count: agents.length,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
        },
      };
    }
  );

  // Get a single agent
  app.get<{ Params: { agent_id: string } }>(
    '/api/v1/hanumang/agents/:agent_id',
    async (req, reply) => {
      const t0 = Date.now();
      const agent = getAgent(req.params.agent_id);
      if (!agent) return reply.status(404).send({ error: 'agent not found' });
      return {
        agent,
        _meta: {
          computed_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          trust_mask_applied: 1,
        },
      };
    }
  );
}
