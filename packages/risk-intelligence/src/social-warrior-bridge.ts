/**
 * Social Threat → AI Warrior Bridge
 *
 * Converts v0.7 social detector findings in a RiskReport into ThreatEvent[]
 * for ingestion into the AIWarrior engine. This enables the ThreatNarrator to
 * write cross-platform campaign narratives when multiple social signals arrive
 * for the same target within the 5-minute correlation window.
 *
 * Mapping:
 *   qrResult score ≥ 50     → source: 'network',  action: 'QR_PHISHING'
 *   exfilResults score ≥ 50 → source: 'process',  action: 'WEBHOOK_EXFIL'
 *   socialC2Result score ≥ 50 → source: 'network', action: 'TELEGRAM_C2' | 'DISCORD_C2'
 *   brandFindings score ≥ 60 → source: 'network', action: 'BRAND_IMPERSONATION'
 */

import type { RiskReport } from './types.js';

// ---------------------------------------------------------------------------
// Minimal ThreatEvent shape (mirrors @ankrshield/ai-warrior without a hard dep)
// ---------------------------------------------------------------------------

type ThreatSeverity = 'info' | 'low' | 'warning' | 'high' | 'critical';
type ThreatSource =
  | 'ai-agent'
  | 'network'
  | 'file-system'
  | 'clipboard'
  | 'dns'
  | 'process'
  | 'honeypot';

export interface SocialThreatEvent {
  id: string;
  timestamp: Date;
  source: ThreatSource;
  severity: ThreatSeverity;
  agentId?: string;
  agentName?: string;
  action: string;
  resource: string;
  byteCount?: number;
  metadata: Record<string, unknown>;
  isBlocked: boolean;
  blockReason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreToSeverity(score: number): ThreatSeverity {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'warning';
  if (score >= 30) return 'low';
  return 'info';
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

/**
 * Returns zero or more ThreatEvents derived from the social detector findings
 * inside a RiskReport. Pass the result array to `warrior.ingest()` for each.
 */
export function socialThreatsToWarriorEvents(report: RiskReport): SocialThreatEvent[] {
  const events: SocialThreatEvent[] = [];
  const domain = report.domain;

  // ── 1. QR Code Phishing ────────────────────────────────────────────────────
  if (report.qrResult && report.qrResult.score >= 50) {
    const r = report.qrResult;
    events.push({
      id: uid('qr-phish'),
      timestamp: new Date(),
      source: 'network',
      severity: scoreToSeverity(r.score),
      agentId: `qr-threat-${domain}`,
      agentName: 'QR Phishing Detector',
      action: 'QR_PHISHING',
      resource: r.url,
      metadata: {
        domain,
        qrScore: r.score,
        isShortened: r.isShortened,
        oauthAbuse: r.oauthAbuse,
        threatFoxHit: r.threatFoxHit,
        signals: r.signals.map((s) => s.name),
        extractedDomain: r.extractedDomain,
        reportId: report.id,
      },
      isBlocked: false,
    });
  }

  // ── 2. Webhook / Messaging Platform Exfiltration ───────────────────────────
  for (const exfil of report.exfilResults) {
    if (exfil.score < 50) continue;
    events.push({
      id: uid('exfil'),
      timestamp: new Date(),
      source: 'process',
      severity: scoreToSeverity(exfil.score),
      agentId: `exfil-${exfil.connection.processName ?? 'unknown'}`,
      agentName: `Exfil via ${exfil.platform ?? 'webhook'} (${exfil.connection.processName ?? 'unknown process'})`,
      action: 'WEBHOOK_EXFIL',
      resource: exfil.connection.url ?? exfil.connection.domain,
      metadata: {
        domain,
        exfilScore: exfil.score,
        platform: exfil.platform,
        processName: exfil.connection.processName,
        verdict: exfil.verdict,
        explanation: exfil.explanation,
        webhookPattern: exfil.webhookPattern,
        reportId: report.id,
      },
      isBlocked: false,
    });
  }

  // ── 3. Social Platform C2 (Telegram bot / Discord C2) ────────────────────
  if (report.socialC2Result && report.socialC2Result.score >= 50) {
    const c2 = report.socialC2Result;
    const action =
      c2.platform === 'telegram'
        ? 'TELEGRAM_C2'
        : c2.platform === 'discord'
          ? 'DISCORD_C2'
          : 'SOCIAL_C2';
    events.push({
      id: uid('social-c2'),
      timestamp: new Date(),
      source: 'network',
      severity: scoreToSeverity(c2.score),
      agentId: `c2-${domain}`,
      agentName: `${c2.platform ?? 'Social'} C2 Detector`,
      action,
      resource: domain,
      metadata: {
        domain,
        c2Score: c2.score,
        platform: c2.platform,
        threatFoxHit: c2.threatFoxHit,
        threatFoxTags: c2.threatFoxTags,
        isMaliciousBotToken: c2.isMaliciousBotToken,
        explanation: c2.explanation,
        reportId: report.id,
      },
      isBlocked: false,
    });
  }

  // ── 4. Brand Impersonation ─────────────────────────────────────────────────
  if (report.brandFindings && report.brandFindings.totalScore >= 60) {
    const brand = report.brandFindings;
    events.push({
      id: uid('brand-imp'),
      timestamp: new Date(),
      source: 'network',
      severity: scoreToSeverity(brand.totalScore),
      agentId: `brand-${domain}`,
      agentName: 'Brand Impersonation Monitor',
      action: 'BRAND_IMPERSONATION',
      resource: domain,
      metadata: {
        domain,
        brandScore: brand.totalScore,
        brandTerms: brand.brandTerms,
        highRiskCount: brand.highRiskCount,
        findings: brand.findings.map((f) => ({
          candidate: f.candidate,
          platform: f.platform,
          similarityScore: f.similarityScore,
          riskScore: f.riskScore,
          patterns: f.impersonationPatterns,
        })),
        reportId: report.id,
      },
      isBlocked: false,
    });
  }

  return events;
}
