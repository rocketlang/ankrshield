/**
 * Beacon Routes
 * @rule:XSACT-YK-004 Beacon seeding requires Mode 2 pre-auth
 * @rule:XSACT-006 Legal basis: DPDP S.7(g) + GDPR Art.6(1)(f) + Recital 49
 * @rule:XSACT-YK-006 Warning response IS the GDPR Art.14 notice
 * @rule:INF-XSACT-005 EU/UK jurisdiction → Art.14 auto-injected
 * @rule:XSACT-YK-005 Beacon trigger → STIX → TAXII push (wired in Phase 4)
 */

import type { FastifyInstance } from 'fastify';
import {
  generateBeaconCredentials,
  recordBeaconTrigger,
  beaconStore,
  type CredentialType,
} from './generator.js';
import { pushBeaconToTaxii } from './stix-bridge.js';
import { buildBeaconCertInReport, submitToCertIn } from '../certin/reporter.js';
import { isAddendumSigned, getConsentConfig } from '../consent/types.js';

const EU_UK_JURISDICTIONS = new Set(['eu', 'uk']);

export async function registerBeaconRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/beacon/generate
  // @rule:XSACT-YK-004 — addendum gate + Mode 2 pre-auth verified
  app.post<{
    Body: {
      client_id: string;
      client_name: string;
      types?: CredentialType[];
    };
  }>('/api/v1/beacon/generate', async (request, reply) => {
    const { client_id, client_name, types } = request.body;

    // @rule:INF-XSACT-006 addendum gate
    if (!isAddendumSigned(client_id)) {
      return reply.status(403).send({
        error: 'addendum_required',
        message: 'Sign the Active Defense Addendum to generate beacon credentials.',
        action: `POST /api/v1/consent/${client_id}/addendum`,
      });
    }

    const credentials = generateBeaconCredentials(client_id, client_name, types);

    return {
      client_id,
      generated: credentials.length,
      credentials: credentials.map((c) => ({
        id: c.id,
        type: c.type,
        fake_value: c.fake_value,
        capture_endpoint: '/api/v1/auth/beacon',
        created_at: c.created_at,
        instructions:
          'Seed this credential on dark web forums, paste sites, or honeypot files. When attacker uses it, they hit /api/v1/auth/beacon and are fingerprinted.',
      })),
    };
  });

  // GET /api/v1/beacon/status/:clientId
  // @rule:CA-001 default limit 100, overflow → GRANTHX ref
  app.get<{ Params: { clientId: string }; Querystring: { limit?: string } }>(
    '/api/v1/beacon/status/:clientId',
    async (request) => {
      const limit = Math.min(parseInt(request.query.limit ?? '100', 10), 500);
      const all = [...beaconStore.values()].filter((c) => c.client_id === request.params.clientId);
      const overflow_granthx_ref =
        all.length > limit
          ? `granthx://xshield-active/beacon-status/${request.params.clientId}/full`
          : undefined;
      const paged = all.slice(0, limit);
      return {
        client_id: request.params.clientId,
        total: all.length,
        returned: paged.length,
        ...(overflow_granthx_ref && { overflow_granthx_ref }),
        triggered: paged.filter((c) => c.triggered).length,
        active: paged.filter((c) => !c.triggered).length,
        cases: paged
          .filter((c) => c.triggered)
          .map((c) => ({
            case_id: c.case_id,
            credential_type: c.type,
            attacker_ip: c.attacker_ip,
            triggered_at: c.triggered_at,
          })),
      };
    }
  );

  /**
   * POST /api/v1/auth/beacon
   * The trap endpoint. Looks like a real corporate auth endpoint.
   *
   * @rule:XSACT-006 Legal: DPDP S.7(g) + GDPR Art.6(1)(f) + Recital 49
   * @rule:XSACT-YK-006 Warning response = GDPR Art.14 notice
   * @rule:INF-XSACT-005 EU/UK → Art.14 auto-injected
   */
  app.post<{
    Body: {
      api_key?: string;
      username?: string;
      password?: string;
      credential_id?: string; // optional — for tracked beacon credentials
    };
  }>('/api/v1/auth/beacon', async (request, reply) => {
    const ip = request.ip;
    const userAgent = request.headers['user-agent'] ?? 'unknown';
    const acceptLang = request.headers['accept-language'] ?? 'unknown';
    const timestamp = new Date().toISOString();

    const fingerprint = {
      ip,
      user_agent: userAgent,
      accept_language: acceptLang,
      timestamp,
      method: request.method,
      headers_snapshot: {
        'content-type': request.headers['content-type'],
        'x-forwarded-for': request.headers['x-forwarded-for'],
        'x-real-ip': request.headers['x-real-ip'],
      },
    };

    const case_id = `XS-${Date.now()}`;

    // Record trigger + wire STIX → TAXII (@rule:XSACT-YK-005)
    if (request.body.credential_id) {
      const triggered = recordBeaconTrigger(request.body.credential_id, ip, fingerprint);
      if (triggered) {
        // Fire-and-forget — do not block the warning response
        // @rule:XSACT-YK-005 TAXII push mandatory
        pushBeaconToTaxii(triggered, triggered.client_id).catch((err) => {
          app.log.error({ err, case_id }, 'TAXII push failed');
        });

        // @rule:XSACT-006 CERT-In auto-report (DPDP S.7(g))
        // @rule:XSACT-T-028 Mode 3 events auto-report
        const certInReport = buildBeaconCertInReport(triggered, triggered.client_id);
        submitToCertIn(certInReport).catch((err) => {
          app.log.error({ err, case_id }, 'CERT-In submission failed');
        });
      }
    }

    app.log.warn({ fingerprint, case_id }, 'BEACON TRIGGERED');

    // Determine if EU/UK for Art.14 notice — @rule:INF-XSACT-005
    // Simple heuristic: accept-language header (production: use MaxMind GeoIP)
    const isEuUk =
      acceptLang.includes('en-GB') ||
      acceptLang.includes('de') ||
      acceptLang.includes('fr') ||
      acceptLang.includes('es') ||
      acceptLang.includes('it') ||
      acceptLang.includes('nl');

    const response: Record<string, unknown> = {
      error: 'authentication_failed',
      // @rule:XSACT-YK-006 — warning IS the notice
      security_notice: {
        message: 'These credentials are monitored by xShieldAI Active Defense.',
        your_ip: ip,
        your_fingerprint_logged: true,
        case_id,
        reported_to: ['CERT-In', 'NCIIPC', 'xShieldAI TAXII feed'],
        timestamp,
      },
    };

    // @rule:INF-XSACT-005 EU/UK → GDPR Art.14 notice
    if (isEuUk) {
      response['gdpr_article_14_notice'] = {
        data_collected: ['ip_address', 'user_agent', 'request_headers', 'timestamp'],
        legal_basis:
          'GDPR Art.6(1)(f) legitimate interests — network and information security (Recital 49)',
        data_controller: 'xShieldAI / xshieldai.com',
        retention: '90 days from collection',
        your_rights: 'Right to access, erasure (where applicable). Contact: privacy@xshieldai.com',
        case_id,
      };
    }

    return reply.status(401).send(response);
  });

  app.log.info('Beacon routes registered: generate + status + capture endpoint');
}
