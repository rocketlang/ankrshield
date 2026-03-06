/**
 * X5b — Multi-channel Alert Dispatcher
 *
 * Single function that takes a WatchAlert payload + userId,
 * fetches ALL configured UserIntegration rows for that user,
 * and dispatches to each active channel.
 *
 * Channels supported:
 *   slack       — Incoming Webhook (Block Kit)
 *   telegram    — Bot API sendMessage
 *   email       — HTTP POST to ALERT_EMAIL_WEBHOOK (Mailgun/SendGrid/custom)
 *   pagerduty   — Events v2 API
 *   webhook     — Generic HTTP POST (stored in DomainWatch.webhookUrl)
 *
 * Each channel dispatch is fire-and-forget with a 10s timeout.
 * Failures are caught silently — an alert channel error must never
 * crash the domain-watcher poll loop.
 */

import type { PrismaClient } from '@prisma/client';

import { sendDomainWatchAlert } from './slack.js';

// ─── Payload shared by all channels ──────────────────────────────────────────

export interface WatchAlertPayload {
  domain: string;
  alertType: string;
  previousValue: string | null;
  newValue: string | null;
  riskScore: number;
  triggeredAt: string;
}

// ─── Alert type → human label ─────────────────────────────────────────────────

const ALERT_LABELS: Record<string, string> = {
  score_change: 'Risk Score Changed',
  new_typosquat: 'New Lookalike Domain Detected',
  spf_removed: 'SPF Record Removed',
  dmarc_removed: 'DMARC Record Removed',
  caa_removed: 'CAA Record Removed',
  phishing_found: 'Phishing URL Detected',
  ip_threat: 'IP on Threat Feed',
  new_breach: 'New Credential Breach',
};

const ALERT_EMOJIS: Record<string, string> = {
  score_change: '📈',
  new_typosquat: '🎭',
  spf_removed: '⚠️',
  dmarc_removed: '⚠️',
  caa_removed: '⚠️',
  phishing_found: '🎣',
  ip_threat: '🔴',
  new_breach: '🔓',
};

function alertText(p: WatchAlertPayload): string {
  const emoji = ALERT_EMOJIS[p.alertType] ?? '🚨';
  const label = ALERT_LABELS[p.alertType] ?? p.alertType;
  const change =
    p.previousValue && p.newValue
      ? ` (${p.previousValue} → ${p.newValue})`
      : p.newValue
        ? `: ${p.newValue}`
        : '';
  return `${emoji} xShield — ${label}${change}\nDomain: ${p.domain} | Score: ${p.riskScore}/100`;
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function dispatchTelegram(
  config: { botToken?: string; chatId?: string },
  payload: WatchAlertPayload
): Promise<void> {
  const { botToken, chatId } = config;
  if (!botToken || !chatId) return;

  const text = [
    `*xShield Alert*`,
    ``,
    `*${ALERT_EMOJIS[payload.alertType] ?? '🚨'} ${ALERT_LABELS[payload.alertType] ?? payload.alertType}*`,
    `Domain: \`${payload.domain}\``,
    `Risk Score: *${payload.riskScore}/100*`,
    payload.previousValue && payload.newValue
      ? `Change: ${payload.previousValue} → ${payload.newValue}`
      : payload.newValue
        ? `Detail: ${payload.newValue}`
        : null,
    ``,
    `_${new Date(payload.triggeredAt).toLocaleString()}_`,
  ]
    .filter(Boolean)
    .join('\n');

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── Email (via ALERT_EMAIL_WEBHOOK env var — any HTTP mail relay) ─────────────

async function dispatchEmail(
  config: { email?: string },
  payload: WatchAlertPayload
): Promise<void> {
  const { email } = config;
  const webhookUrl = process.env.ALERT_EMAIL_WEBHOOK;
  if (!email || !webhookUrl) return;

  const label = ALERT_LABELS[payload.alertType] ?? payload.alertType;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: `xShield Alert: ${label} — ${payload.domain}`,
      text: alertText(payload),
      html: `
        <h2 style="color:#7c3aed">xShield Alert</h2>
        <p><strong>${ALERT_EMOJIS[payload.alertType] ?? ''} ${label}</strong></p>
        <table>
          <tr><td>Domain</td><td><code>${payload.domain}</code></td></tr>
          <tr><td>Risk Score</td><td>${payload.riskScore}/100</td></tr>
          ${payload.previousValue ? `<tr><td>Before</td><td>${payload.previousValue}</td></tr>` : ''}
          ${payload.newValue ? `<tr><td>After</td><td>${payload.newValue}</td></tr>` : ''}
        </table>
        <p style="color:#666;font-size:12px">${new Date(payload.triggeredAt).toLocaleString()}</p>
      `,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── PagerDuty Events v2 ─────────────────────────────────────────────────────

async function dispatchPagerDuty(
  config: { integrationKey?: string },
  payload: WatchAlertPayload
): Promise<void> {
  const { integrationKey } = config;
  if (!integrationKey) return;

  const severity =
    payload.riskScore >= 70 ? 'critical' : payload.riskScore >= 40 ? 'error' : 'warning';

  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routing_key: integrationKey,
      event_action: 'trigger',
      dedup_key: `xshield-${payload.domain}-${payload.alertType}`,
      payload: {
        summary: `xShield: ${ALERT_LABELS[payload.alertType] ?? payload.alertType} for ${payload.domain}`,
        source: payload.domain,
        severity,
        timestamp: payload.triggeredAt,
        custom_details: {
          domain: payload.domain,
          alertType: payload.alertType,
          riskScore: payload.riskScore,
          previousValue: payload.previousValue,
          newValue: payload.newValue,
        },
      },
      client: 'xShield',
      client_url: `https://xshieldai.com/dashboard`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── Generic webhook ─────────────────────────────────────────────────────────

async function dispatchWebhook(webhookUrl: string, payload: WatchAlertPayload): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'xshield-domain-watch',
      ...payload,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function dispatchToAllChannels(
  db: PrismaClient,
  userId: string | null | undefined,
  genericWebhookUrl: string | null | undefined,
  payload: WatchAlertPayload
): Promise<void> {
  const promises: Promise<void>[] = [];

  // Generic per-watch webhook (always fire if configured)
  if (genericWebhookUrl) {
    promises.push(dispatchWebhook(genericWebhookUrl, payload).catch(() => {}));
  }

  if (!userId) {
    await Promise.allSettled(promises);
    return;
  }

  // Fetch all active integrations for this user
  let integrations: Array<{ provider: string; config: unknown }> = [];
  try {
    integrations = await db.userIntegration.findMany({
      where: { userId, isActive: true },
      select: { provider: true, config: true },
    });
  } catch {
    // DB error — still try to fire generic webhook
    await Promise.allSettled(promises);
    return;
  }

  for (const integration of integrations) {
    const cfg = integration.config as Record<string, string>;
    switch (integration.provider) {
      case 'slack':
        if (cfg?.webhookUrl) {
          promises.push(
            sendDomainWatchAlert(cfg.webhookUrl, payload)
              .then(() => {})
              .catch(() => {})
          );
        }
        break;
      case 'telegram':
        promises.push(dispatchTelegram(cfg, payload).catch(() => {}));
        break;
      case 'email':
        promises.push(dispatchEmail(cfg, payload).catch(() => {}));
        break;
      case 'pagerduty':
        promises.push(dispatchPagerDuty(cfg, payload).catch(() => {}));
        break;
    }
  }

  await Promise.allSettled(promises);
}
