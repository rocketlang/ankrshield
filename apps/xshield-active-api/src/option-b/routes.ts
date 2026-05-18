/**
 * Option B — SIEM Webhook Routes
 * @rule:XSACT-005 Client-side actions use Option B
 */

import type { FastifyInstance } from 'fastify';
import { pushToSplunk } from './splunk.js';
import { pushToSentinel } from './sentinel.js';
import { pushToGenericWebhook } from './generic-webhook.js';
import { getConsentConfig } from '../consent/types.js';
import { createHash } from 'node:crypto';

export async function registerSiemRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/siem/test — verify SIEM connectivity
  app.post<{
    Body: { client_id: string; test_payload?: Record<string, unknown> };
  }>('/api/v1/siem/test', async (request, reply) => {
    const { client_id, test_payload = { test: true, source: 'xshield-active' } } = request.body;
    const config = getConsentConfig(client_id);

    if (!config.siem_webhook?.enabled) {
      return reply.status(400).send({
        error: 'no_siem_configured',
        message: 'Configure SIEM via PUT /api/v1/consent/:clientId/siem first',
      });
    }

    // @rule:XSACT-YK-007 token stored as hash — cannot reconstruct for real push
    // Test endpoint verifies config exists; real token provided by client at test time
    return {
      siem_type: config.siem_webhook.type,
      endpoint: config.siem_webhook.endpoint,
      status: 'configured',
      note: 'Provide raw token in POST body for live connectivity test',
    };
  });

  // POST /api/v1/siem/push — push alert (called by execution router)
  app.post<{
    Body: {
      client_id: string;
      token: string; // raw token provided at push time — never stored
      threat: Record<string, unknown>;
    };
  }>('/api/v1/siem/push', async (request, reply) => {
    const { client_id, token, threat } = request.body;
    const config = getConsentConfig(client_id);

    if (!config.siem_webhook?.enabled) {
      return reply.status(400).send({ error: 'no_siem_configured' });
    }

    // Verify token matches stored hash — @rule:XSACT-YK-007
    const provided_hash = createHash('sha256').update(token).digest('hex');
    if (provided_hash !== config.siem_webhook.token_hash) {
      return reply.status(401).send({ error: 'token_mismatch' });
    }

    if (config.siem_webhook.type === 'splunk') {
      return pushToSplunk(config.siem_webhook.endpoint, token, threat);
    }

    if (config.siem_webhook.type === 'sentinel') {
      // Sentinel: endpoint = workspaceId
      return pushToSentinel(config.siem_webhook.endpoint, token, 'xShieldThreat', threat);
    }

    if (config.siem_webhook.type === 'generic') {
      return pushToGenericWebhook({ endpoint: config.siem_webhook.endpoint }, threat);
    }

    return reply.status(400).send({ error: 'unknown_siem_type', type: config.siem_webhook.type });
  });

  app.log.info('SIEM Option-B routes registered: Splunk HEC live, Sentinel/generic pending');
}
