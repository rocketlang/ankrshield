/**
 * Option A — Direct Action Routes
 * Clients can trigger public actions directly without going through /action/execute.
 * Each route enforces: addendum signed, audit write, proportionality.
 *
 * @rule:XSACT-004 Public actions use Option A
 * @rule:XSACT-009 Audit write before execution
 * @rule:XSACT-011 Addendum gate on all action routes
 * @rule:CA-004 _meta in every response
 */

import type { FastifyInstance } from 'fastify';
import {
  fileDmca,
  submitAbuseReport,
  reportGoogleSafeBrowsing,
  reportCloudflare,
  notifyExecutive,
} from './actor.js';
import { isAddendumSigned, getConsentConfig } from '../consent/types.js';
import { writeAuditRecord } from '../audit/logger.js';

export async function registerOptionARoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/action/dmca
  app.post<{
    Body: { client_id: string; domain: string; client_name: string; evidence?: string };
  }>('/api/v1/action/dmca', async (request, reply) => {
    const { client_id, domain, client_name, evidence = 'xShieldAI scan' } = request.body;
    const start = Date.now();

    // @rule:XSACT-011
    if (!isAddendumSigned(client_id)) {
      return reply.status(403).send({ error: 'addendum_required' });
    }

    // @rule:XSACT-009
    const audit = writeAuditRecord({
      client_id,
      before_snapshot: { domain },
      action_taken: 'dmca',
      after_snapshot: null,
      delta: null,
      consent_mode: 'mode_2',
      execution_path: 'option_a',
      rule_id_applied: ['XSACT-004', 'XSACT-009'],
      jurisdiction_detected: getConsentConfig(client_id).jurisdiction,
      legal_basis_applied: 'GDPR-Art6-1f + Recital49',
      result: 'pending',
      duration_ms: 0,
      trust_mask_applied: 1,
    });

    const result = await fileDmca(domain, client_name, evidence);
    audit.result = result.success ? 'success' : 'failed';
    audit.after_snapshot = result;

    return {
      ...result,
      audit_record_id: audit.id,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        trust_mask_applied: 1,
      },
    };
  });

  // POST /api/v1/action/abuse-report
  app.post<{
    Body: { client_id: string; domain: string; registrar_abuse_email: string; evidence?: string };
  }>('/api/v1/action/abuse-report', async (request, reply) => {
    const { client_id, domain, registrar_abuse_email, evidence } = request.body;
    const start = Date.now();

    if (!isAddendumSigned(client_id)) {
      return reply.status(403).send({ error: 'addendum_required' });
    }

    const audit = writeAuditRecord({
      client_id,
      before_snapshot: { domain, registrar_abuse_email },
      action_taken: 'abuse_report',
      after_snapshot: null,
      delta: null,
      consent_mode: 'mode_2',
      execution_path: 'option_a',
      rule_id_applied: ['XSACT-004'],
      jurisdiction_detected: getConsentConfig(client_id).jurisdiction,
      legal_basis_applied: 'GDPR-Art6-1f + Recital49',
      result: 'pending',
      duration_ms: 0,
      trust_mask_applied: 1,
    });

    const result = await submitAbuseReport(
      domain,
      registrar_abuse_email,
      evidence ?? 'xShieldAI threat detection'
    );
    audit.result = result.success ? 'success' : 'failed';

    return {
      ...result,
      audit_record_id: audit.id,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        trust_mask_applied: 1,
      },
    };
  });

  // POST /api/v1/action/report-phishing
  app.post<{
    Body: { client_id: string; url: string; target: 'google' | 'cloudflare' | 'both' };
  }>('/api/v1/action/report-phishing', async (request, reply) => {
    const { client_id, url, target = 'both' } = request.body;
    const start = Date.now();

    if (!isAddendumSigned(client_id)) {
      return reply.status(403).send({ error: 'addendum_required' });
    }

    const results: Record<string, unknown> = {};

    if (target === 'google' || target === 'both') {
      results['google_safe_browsing'] = await reportGoogleSafeBrowsing(url);
    }
    if (target === 'cloudflare' || target === 'both') {
      results['cloudflare'] = await reportCloudflare(url);
    }

    return {
      url,
      target,
      results,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        trust_mask_applied: 1,
      },
    };
  });

  // POST /api/v1/action/notify-executives
  app.post<{
    Body: { client_id: string; threat_summary: string; severity: string; case_id?: string };
  }>('/api/v1/action/notify-executives', async (request, reply) => {
    const { client_id, threat_summary, severity, case_id } = request.body;
    const start = Date.now();

    if (!isAddendumSigned(client_id)) {
      return reply.status(403).send({ error: 'addendum_required' });
    }

    const config = getConsentConfig(client_id);
    if (config.executive_contacts.length === 0) {
      return reply.status(400).send({
        error: 'no_contacts_configured',
        action: `PUT /api/v1/consent/${client_id}/contacts`,
      });
    }

    const result = await notifyExecutive(
      config.executive_contacts,
      threat_summary,
      case_id ?? `XS-${Date.now()}`,
      severity
    );

    return {
      ...result,
      contacts_notified: config.executive_contacts.length,
      _meta: {
        computed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        trust_mask_applied: 1,
      },
    };
  });

  app.log.info(
    'Option A direct routes: /dmca + /abuse-report + /report-phishing + /notify-executives'
  );
}
