/**
 * Consent Engine Routes
 * @rule:XSACT-002 Three-mode consent config
 * @rule:XSACT-003 Mode 3 always-on
 * @rule:XSACT-010 TAXII opt-out default
 * @rule:XSACT-011 Addendum gate
 */

import type { FastifyInstance } from 'fastify';
import {
  getConsentConfig,
  isAddendumSigned,
  consentStore,
  type ClientConsentConfig,
  type StandingOrder,
  type ExecutiveContact,
  type SiemWebhook,
} from './types.js';

export async function registerConsentRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/consent/:clientId
  app.get<{ Params: { clientId: string } }>('/api/v1/consent/:clientId', async (request) => {
    const config = getConsentConfig(request.params.clientId);
    // Never return token — return masked version
    return {
      ...config,
      siem_webhook: config.siem_webhook
        ? { ...config.siem_webhook, token_hash: '[redacted]' }
        : null,
    };
  });

  // PUT /api/v1/consent/:clientId/mode — set consent mode
  // @rule:XSACT-002
  app.put<{
    Params: { clientId: string };
    Body: { mode: 'mode_1' | 'mode_2' };
  }>('/api/v1/consent/:clientId/mode', async (request, reply) => {
    const { clientId } = request.params;
    const { mode } = request.body;

    if (!['mode_1', 'mode_2'].includes(mode)) {
      return reply.status(400).send({
        error: 'invalid_mode',
        message: 'mode must be mode_1 or mode_2. Mode 3 is always-on and cannot be set.',
      });
    }

    const config = getConsentConfig(clientId);
    config.mode = mode;
    config.updated_at = new Date().toISOString();
    consentStore.set(clientId, config);

    return { client_id: clientId, mode, mode_3_always_on: true };
  });

  // POST /api/v1/consent/:clientId/addendum
  // @rule:XSACT-011 — unlocks beacon, Mode 3 auto-act, TAXII contribution
  app.post<{
    Params: { clientId: string };
    Body: { signed_by: string; signed_at?: string };
  }>('/api/v1/consent/:clientId/addendum', async (request) => {
    const { clientId } = request.params;
    const { signed_by, signed_at } = request.body;

    const config = getConsentConfig(clientId);
    config.addendum_signed = true;
    config.addendum_signed_at = signed_at ?? new Date().toISOString();
    config.addendum_signed_by = signed_by;
    config.updated_at = new Date().toISOString();
    consentStore.set(clientId, config);

    return {
      client_id: clientId,
      addendum_signed: true,
      unlocked: ['beacon_system', 'mode_3_autoact', 'taxii_contribution'],
      signed_by,
      signed_at: config.addendum_signed_at,
    };
  });

  // PUT /api/v1/consent/:clientId/standing-orders
  // @rule:XSACT-YK-004 Beacon seeding requires Mode 2 pre-auth
  app.put<{
    Params: { clientId: string };
    Body: { standing_orders: StandingOrder[] };
  }>('/api/v1/consent/:clientId/standing-orders', async (request, reply) => {
    const { clientId } = request.params;
    const { standing_orders } = request.body;

    if (!isAddendumSigned(clientId)) {
      return reply.status(403).send({
        error: 'addendum_required',
        message: 'Sign the Active Defense Addendum to configure standing orders.',
        // @rule:INF-XSACT-006
        action: 'POST /api/v1/consent/:clientId/addendum',
      });
    }

    const config = getConsentConfig(clientId);
    config.standing_orders = standing_orders;
    config.updated_at = new Date().toISOString();
    consentStore.set(clientId, config);

    return { client_id: clientId, standing_orders_count: standing_orders.length };
  });

  // PUT /api/v1/consent/:clientId/siem
  // @rule:XSACT-005 Option B config
  // @rule:XSACT-YK-007 Never store plain token
  app.put<{
    Params: { clientId: string };
    Body: { type: 'splunk' | 'sentinel' | 'generic'; endpoint: string; token: string };
  }>('/api/v1/consent/:clientId/siem', async (request) => {
    const { clientId } = request.params;
    const { type, endpoint, token } = request.body;

    const { createHash } = await import('node:crypto');
    const token_hash = createHash('sha256').update(token).digest('hex');

    const webhook: SiemWebhook = { type, endpoint, token_hash, enabled: true };
    const config = getConsentConfig(clientId);
    config.siem_webhook = webhook;
    config.updated_at = new Date().toISOString();
    consentStore.set(clientId, config);

    return {
      client_id: clientId,
      siem_type: type,
      endpoint,
      token_stored: 'hashed_only', // @rule:XSACT-YK-007
      enabled: true,
    };
  });

  // PUT /api/v1/consent/:clientId/contacts
  app.put<{
    Params: { clientId: string };
    Body: { contacts: ExecutiveContact[] };
  }>('/api/v1/consent/:clientId/contacts', async (request) => {
    const { clientId } = request.params;
    const config = getConsentConfig(clientId);
    config.executive_contacts = request.body.contacts;
    config.updated_at = new Date().toISOString();
    consentStore.set(clientId, config);
    return { client_id: clientId, contacts_configured: request.body.contacts.length };
  });

  // PUT /api/v1/consent/:clientId/taxii-opt-out
  // @rule:XSACT-010 opt-out toggle
  app.put<{
    Params: { clientId: string };
    Body: { opted_out: boolean };
  }>('/api/v1/consent/:clientId/taxii-opt-out', async (request) => {
    const { clientId } = request.params;
    const config = getConsentConfig(clientId);
    config.taxii_opted_out = request.body.opted_out;
    config.updated_at = new Date().toISOString();
    consentStore.set(clientId, config);
    return {
      client_id: clientId,
      taxii_opted_out: request.body.opted_out,
      collective_defense_active: !request.body.opted_out,
    };
  });

  app.log.info(
    'Consent routes registered: mode + addendum + standing-orders + SIEM + contacts + TAXII'
  );
}
