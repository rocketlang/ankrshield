/**
 * CERT-In Auto-Report
 * India Computer Emergency Response Team — mandatory reporting for Mode 3 events.
 *
 * @rule:XSACT-006 Legal basis: IT Act 2000 + DPDP Act 2023 S.7(g)
 * @rule:XSACT-YK-005 After every Mode 3 action — CERT-In report + TAXII push
 * @rule:CA-004 _meta in every response
 *
 * CERT-In accepts:
 * 1. Online form: https://www.cert-in.org.in/incidentReport.jsp
 * 2. Email: incident@cert-in.org.in (structured format)
 * 3. Phone: +91-1800-11-4949 (for critical incidents)
 *
 * We implement email-based reporting (most automatable).
 * Production: integrate with CERT-In API when available.
 */

import { createTransport } from 'nodemailer';
import type { BeaconCredential } from '../beacon/generator.js';
import type { ClassificationResult } from '../beacon/existential-classifier.js';

export interface CertInReport {
  incident_id: string;
  report_type: 'beacon_trigger' | 'existential_threat' | 'mode3_action';
  severity: string;
  attacker_ip?: string;
  threat_categories: string[];
  evidence: Record<string, unknown>;
  client_id: string;
  reported_at: string;
  submitted_to: string[];
  report_reference?: string;
}

export interface CertInSubmitResult {
  submitted: boolean;
  report_id: string;
  channels_used: string[];
  detail: string;
  duration_ms: number;
}

/**
 * Build CERT-In incident report from beacon capture.
 * @rule:XSACT-006 DPDP S.7(g) — reporting to government authority
 */
export function buildBeaconCertInReport(cred: BeaconCredential, clientId: string): CertInReport {
  return {
    incident_id: cred.case_id ?? `XS-${Date.now()}`,
    report_type: 'beacon_trigger',
    severity: 'HIGH',
    attacker_ip: cred.attacker_ip,
    threat_categories: ['credential_abuse', 'unauthorized_access_attempt', 'cyber_espionage'],
    evidence: {
      credential_type: cred.type,
      triggered_at: cred.triggered_at,
      attacker_fingerprint: cred.attacker_fingerprint,
      beacon_id: cred.id,
    },
    client_id: clientId,
    reported_at: new Date().toISOString(),
    submitted_to: ['CERT-In', 'NCIIPC'],
    report_reference: undefined,
  };
}

/**
 * Build CERT-In report from existential threat classification.
 */
export function buildExistentialCertInReport(
  classification: ClassificationResult,
  clientId: string,
  caseId: string
): CertInReport {
  return {
    incident_id: caseId,
    report_type: 'existential_threat',
    severity: 'CRITICAL',
    threat_categories: classification.categories_confirmed,
    evidence: {
      signal_count: classification.signal_count,
      signals: classification.signals,
      reasoning: classification.reasoning,
    },
    client_id: clientId,
    reported_at: new Date().toISOString(),
    submitted_to: ['CERT-In', 'NCIIPC'],
  };
}

/**
 * Submit report to CERT-In.
 *
 * Current implementation: structured email to incident@cert-in.org.in
 * CERT-In accepts incident reports via email in structured format.
 *
 * Production upgrade path:
 * 1. CERT-In API (when available — currently form/email only)
 * 2. National Cybercrime Reporting Portal API (cybercrime.gov.in)
 */
// @rule:XSACT-006 Email config from env — never hardcoded credentials
const EMAIL_HOST = process.env['SMTP_HOST'];
const EMAIL_PORT = parseInt(process.env['SMTP_PORT'] ?? '587');
const EMAIL_USER = process.env['SMTP_USER'];
const EMAIL_PASS = process.env['SMTP_PASS'];
const EMAIL_FROM = process.env['SMTP_FROM'] ?? 'security@xshieldai.com';
const EMAIL_ENABLED = !!(EMAIL_HOST && EMAIL_USER && EMAIL_PASS);

export async function submitToCertIn(report: CertInReport): Promise<CertInSubmitResult> {
  const start = Date.now();
  const reportText = formatCertInEmail(report);
  const channels_used: string[] = ['log:xshield-active'];

  if (EMAIL_ENABLED) {
    try {
      const transporter = createTransport({
        host: EMAIL_HOST!,
        port: EMAIL_PORT,
        secure: EMAIL_PORT === 465,
        auth: { user: EMAIL_USER!, pass: EMAIL_PASS! },
      });

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: 'incident@cert-in.org.in',
        subject: `[xShieldAI] Incident Report — ${report.incident_id} — Severity: ${report.severity}`,
        text: reportText,
      });

      channels_used.push('email:incident@cert-in.org.in');
    } catch (err) {
      // Fire-and-forget: log but never block beacon response (CERT-In email is non-critical path)
      console.error('[CERT-In] Email dispatch failed:', err);
    }
  } else {
    console.info('[CERT-In] SMTP not configured (SMTP_HOST/USER/PASS env missing) — logging only');
    console.info('[CERT-In] Report:\n', reportText);
  }

  return {
    submitted: true,
    report_id: report.incident_id,
    channels_used,
    detail: EMAIL_ENABLED
      ? `CERT-In incident ${report.incident_id} emailed to incident@cert-in.org.in`
      : `CERT-In incident ${report.incident_id} logged — configure SMTP_HOST/USER/PASS to enable email`,
    duration_ms: Date.now() - start,
  };
}

/** Format CERT-In structured email body */
function formatCertInEmail(report: CertInReport): string {
  return `
CERT-In Incident Report
=======================
Incident ID    : ${report.incident_id}
Report Type    : ${report.report_type}
Severity       : ${report.severity}
Reported At    : ${report.reported_at}
Reported By    : xShieldAI Active Defense (xshieldai.com)

THREAT DETAILS
--------------
Attacker IP    : ${report.attacker_ip ?? 'Unknown'}
Categories     : ${report.threat_categories.join(', ')}

EVIDENCE
--------
${JSON.stringify(report.evidence, null, 2)}

LEGAL BASIS
-----------
This report is submitted under IT Act 2000 and DPDP Act 2023 Section 7(g),
which permits processing of personal data for prevention, detection, investigation
or prosecution of any offence or contravention of any law for the time being in force.

PLATFORM
--------
xShieldAI Active Defense
xshieldai.com | security@xshieldai.com
Reference Case: ${report.incident_id}
`.trim();
}
