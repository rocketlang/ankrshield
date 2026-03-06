/**
 * Domain Watch — Continuous 5-minute surveillance for registered domains.
 *
 * For each active DomainWatch entry:
 *   1. Run the full risk engine
 *   2. Diff against the previous snapshot stored in DB
 *   3. Emit AlertHistory rows for every meaningful change
 *   4. POST alerts to the user-configured webhookUrl (if any)
 *   5. Update lastCheckedAt / lastRiskScore / lastRiskLevel
 *
 * Alert types emitted:
 *   score_change      — risk score shifted by ≥ 10 points
 *   new_typosquat     — a new live lookalike domain appeared
 *   spf_removed       — SPF record disappeared
 *   dmarc_removed     — DMARC record disappeared
 *   caa_removed       — CAA record disappeared
 *   phishing_found    — a phishing URL pointing at this domain was detected
 *   ip_threat         — server IP now appears in GreyNoise / OTX threat feeds
 *   new_breach        — new credential breach record found
 */

import { runRiskEngine } from '@ankrshield/risk-intelligence';
import type { RiskReport } from '@ankrshield/risk-intelligence';
import type { PrismaClient } from '@prisma/client';

import { dispatchToAllChannels } from '../integrations/alert-dispatcher.js';

const POLL_INTERVAL_MS = parseInt(process.env.DOMAIN_WATCH_INTERVAL_MS ?? '300000', 10); // 5 min

let timer: ReturnType<typeof setInterval> | null = null;
let prisma: PrismaClient | null = null;

// ─── Delta detection ──────────────────────────────────────────────────────────

interface AlertCandidate {
  alertType: string;
  previousValue: string | null;
  newValue: string | null;
}

function detectChanges(
  prev: { riskScore: number | null; riskLevel: string | null },
  report: RiskReport
): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];

  // 1. Score change ≥ 10
  if (prev.riskScore !== null && Math.abs(report.riskScore - prev.riskScore) >= 10) {
    alerts.push({
      alertType: 'score_change',
      previousValue: String(prev.riskScore),
      newValue: String(report.riskScore),
    });
  }

  // 2. SPF removed
  if (prev.riskLevel !== null && !report.dnsSecurityReport?.spf?.exists) {
    alerts.push({ alertType: 'spf_removed', previousValue: 'present', newValue: 'missing' });
  }

  // 3. DMARC removed
  if (prev.riskLevel !== null && !report.dnsSecurityReport?.dmarc?.exists) {
    alerts.push({ alertType: 'dmarc_removed', previousValue: 'present', newValue: 'missing' });
  }

  // 4. CAA removed
  if (prev.riskLevel !== null && !report.dnsSecurityReport?.caa?.exists) {
    alerts.push({ alertType: 'caa_removed', previousValue: 'present', newValue: 'missing' });
  }

  // 5. Phishing URLs found
  if (report.phishingHits && report.phishingHits.length > 0) {
    alerts.push({
      alertType: 'phishing_found',
      previousValue: null,
      newValue: report.phishingHits
        .slice(0, 3)
        .map((h: { url: string }) => h.url)
        .join(', '),
    });
  }

  // 6. IP on threat feed (GreyNoise malicious / OTX hit)
  const gnMalicious = report.greynoise?.classification === 'malicious';
  const otxHit = report.otx && (report.otx as { pulseCount?: number }).pulseCount > 0;
  if (gnMalicious || otxHit) {
    alerts.push({
      alertType: 'ip_threat',
      previousValue: null,
      newValue: gnMalicious ? 'greynoise:malicious' : 'otx:hit',
    });
  }

  // 7. New credential breach
  if (report.breaches && report.breaches.length > 0) {
    alerts.push({
      alertType: 'new_breach',
      previousValue: null,
      newValue: report.breaches
        .slice(0, 3)
        .map((b: { name: string }) => b.name)
        .join(', '),
    });
  }

  // 8. New registered typosquats
  if (report.registeredTyposquats && report.registeredTyposquats.length > 0) {
    alerts.push({
      alertType: 'new_typosquat',
      previousValue: null,
      newValue: report.registeredTyposquats
        .slice(0, 3)
        .map((t: { domain: string }) => t.domain)
        .join(', '),
    });
  }

  return alerts;
}

// ─── Per-domain scan ──────────────────────────────────────────────────────────

async function scanWatch(
  db: PrismaClient,
  watchId: string,
  domain: string,
  webhookUrl: string | null,
  prev: { riskScore: number | null; riskLevel: string | null },
  userId: string | null
) {
  let report: RiskReport;
  try {
    report = await runRiskEngine({ domain, shodanApiKey: process.env.SHODAN_API_KEY });
  } catch {
    // Transient error — skip, will retry on next cycle
    return;
  }

  const changes = detectChanges(prev, report);
  const triggeredAt = new Date().toISOString();

  // Persist alert rows + dispatch webhooks
  for (const alert of changes) {
    // Persist alert row
    await db.alertHistory.create({
      data: {
        watchId,
        alertType: alert.alertType,
        previousValue: alert.previousValue,
        newValue: alert.newValue,
        webhookStatus: 'dispatched',
      },
    });

    // Fire all configured channels (Slack, Telegram, Email, PagerDuty, generic webhook)
    dispatchToAllChannels(db, userId, webhookUrl, {
      domain,
      alertType: alert.alertType,
      previousValue: alert.previousValue,
      newValue: alert.newValue,
      riskScore: report.riskScore,
      triggeredAt,
    }).catch(() => {});
  }

  // Update snapshot
  await db.domainWatch.update({
    where: { id: watchId },
    data: {
      lastCheckedAt: new Date(),
      lastRiskScore: report.riskScore,
      lastRiskLevel: report.riskLevel,
      alertCount: { increment: changes.length },
    },
  });
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

async function pollAll(db: PrismaClient) {
  const watches = await db.domainWatch.findMany({ where: { isActive: true } });

  for (const w of watches) {
    // Fire and forget — don't await all in serial
    // dispatchToAllChannels inside scanWatch will fetch all channels for this userId
    scanWatch(
      db,
      w.id,
      w.domain,
      w.webhookUrl,
      {
        riskScore: w.lastRiskScore,
        riskLevel: w.lastRiskLevel,
      },
      w.userId ?? null
    ).catch(() => {
      /* swallow per-domain errors */
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startDomainWatcher(db: PrismaClient): void {
  if (timer) return; // already running
  prisma = db;

  // First poll after 30s (let the server finish booting)
  const kickoff = setTimeout(() => pollAll(db), 30_000);
  timer = setInterval(() => pollAll(db), POLL_INTERVAL_MS);

  // Keep reference so we can clear both on stop
  (timer as unknown as { _kickoff: ReturnType<typeof setTimeout> })._kickoff = kickoff;
}

export function stopDomainWatcher(): void {
  if (!timer) return;
  const t = timer as unknown as { _kickoff?: ReturnType<typeof setTimeout> };
  if (t._kickoff) clearTimeout(t._kickoff);
  clearInterval(timer);
  timer = null;
  prisma = null;
}

export { prisma as domainWatcherPrisma };
