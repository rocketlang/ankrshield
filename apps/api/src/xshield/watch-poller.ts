/**
 * xShield Watch Poller
 * Runs every 5 minutes — scans all ACTIVE domain watches
 * Fires WatchAlert records when riskScore >= alertThreshold
 */

import { PrismaClient } from '@prisma/client';

import { scanDomain } from './risk-engine';

let pollerInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_SCAN_INTERVAL_MS = 60 * 60 * 1000; // min 1 hour between scans per domain

export function startWatchPoller(prisma: PrismaClient): void {
  if (pollerInterval) return;

  const run = async () => {
    try {
      const watches = await (prisma as any).xShieldDomainWatch.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { lastScannedAt: null },
            { lastScannedAt: { lt: new Date(Date.now() - MIN_SCAN_INTERVAL_MS) } },
          ],
        },
        take: 20, // max 20 per cycle to avoid hammering intel sources
      });

      if (watches.length === 0) return;

      console.log(`[watch-poller] Scanning ${watches.length} watched domain(s)`);

      for (const watch of watches) {
        try {
          const report = await scanDomain(watch.domain);

          await (prisma as any).xShieldDomainWatch.update({
            where: { id: watch.id },
            data: {
              lastRiskScore: report.riskScore,
              lastRiskLevel: report.riskLevel,
              lastScannedAt: new Date(),
            },
          });

          // Fire alert if threshold breached
          if (report.riskScore >= watch.alertThreshold) {
            // Avoid duplicate alerts for same score within 24h
            const recentAlert = await (prisma as any).watchAlert.findFirst({
              where: {
                watchId: watch.id,
                triggeredAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
                riskScore: report.riskScore,
              },
            });

            if (!recentAlert) {
              await (prisma as any).watchAlert.create({
                data: {
                  watchId: watch.id,
                  domain: watch.domain,
                  riskScore: report.riskScore,
                  riskLevel: report.riskLevel,
                  details: {
                    findings: report.findings,
                    summary: report.summary,
                    recommendations: report.recommendations,
                  } as any,
                },
              });

              // Fire webhook if configured
              if (watch.webhookUrl) {
                await sendWebhook(watch.webhookUrl, {
                  event: 'xshield.watch.alert',
                  domain: watch.domain,
                  riskScore: report.riskScore,
                  riskLevel: report.riskLevel,
                  summary: report.summary,
                  detectedAt: new Date().toISOString(),
                });
              }
            }
          }
        } catch (err) {
          console.error(`[watch-poller] Error scanning ${watch.domain}:`, err);
        }

        // Brief pause between domains (rate-limit friendly)
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error('[watch-poller] Cycle error:', err);
    }
  };

  // Run immediately, then on interval
  void run();
  pollerInterval = setInterval(run, POLL_INTERVAL_MS);
  console.log('[watch-poller] Started — polling every 5 minutes');
}

export function stopWatchPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[watch-poller] Stopped');
  }
}

async function sendWebhook(url: string, payload: object): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'xShield-Watch/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Webhook delivery failed — non-fatal
  }
}
