/**
 * Slack Integration — Block Kit formatter + webhook dispatcher
 *
 * Two alert types:
 *   sendDomainWatchAlert  — triggered by domain-watcher.ts on each AlertCandidate
 *   sendTestAlert         — triggered by POST /integrations/slack/test
 */

export interface SlackAlertPayload {
  domain: string;
  alertType: string;
  previousValue: string | null;
  newValue: string | null;
  riskScore: number;
  triggeredAt?: string;
}

// ─── Risk colour ─────────────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score <= 14) return '#10b981'; // green
  if (score <= 34) return '#f59e0b'; // yellow
  if (score <= 54) return '#f97316'; // orange
  if (score <= 74) return '#ef4444'; // red
  return '#dc2626'; // crimson
}

function riskLabel(score: number): string {
  if (score <= 14) return 'MINIMAL';
  if (score <= 34) return 'LOW';
  if (score <= 54) return 'MEDIUM';
  if (score <= 74) return 'HIGH';
  return 'CRITICAL';
}

// ─── Alert type → human label + emoji ────────────────────────────────────────

const ALERT_META: Record<string, { emoji: string; label: string }> = {
  score_change: { emoji: '📈', label: 'Risk Score Changed' },
  new_typosquat: { emoji: '🎭', label: 'New Lookalike Domain Detected' },
  spf_removed: { emoji: '⚠️', label: 'SPF Record Removed' },
  dmarc_removed: { emoji: '⚠️', label: 'DMARC Record Removed' },
  caa_removed: { emoji: '⚠️', label: 'CAA Record Removed' },
  phishing_found: { emoji: '🎣', label: 'Phishing URL Detected' },
  ip_threat: { emoji: '🔴', label: 'IP on Threat Feed' },
  new_breach: { emoji: '🔓', label: 'New Credential Breach' },
};

// ─── Block Kit builder ────────────────────────────────────────────────────────

function buildAlertBlocks(payload: SlackAlertPayload): object[] {
  const meta = ALERT_META[payload.alertType] ?? { emoji: '🚨', label: payload.alertType };
  const level = riskLabel(payload.riskScore);
  const ts = payload.triggeredAt
    ? new Date(payload.triggeredAt).toLocaleString()
    : new Date().toLocaleString();

  const changeText =
    payload.previousValue && payload.newValue
      ? `*Before:* \`${payload.previousValue}\`\n*After:* \`${payload.newValue}\``
      : payload.newValue
        ? `*Details:* ${payload.newValue}`
        : null;

  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${meta.emoji}  xShield Alert — ${meta.label}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Domain*\n\`${payload.domain}\``,
        },
        {
          type: 'mrkdwn',
          text: `*Risk Score*\n${payload.riskScore}/100 — *${level}*`,
        },
      ],
    },
  ];

  if (changeText) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: changeText },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🕐 ${ts}  |  xShield Risk Intelligence  |  <https://xshieldai.com/api/docs|API Docs>`,
        },
      ],
    }
  );

  return blocks;
}

function buildTestBlocks(): object[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '✅  xShield — Slack Integration Active',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Your Slack integration is working correctly.\n\nYou will receive alerts here when:\n• A watched domain risk score changes by ≥10 points\n• A new lookalike domain is detected\n• SPF / DMARC / CAA records go missing\n• Phishing URLs pointing to your domain appear\n• A new credential breach is found\n• Your server IP appears in threat feeds',
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Sent from <https://xshieldai.com|xShieldAI.com>  |  <https://xshieldai.com/api/docs|API Docs>',
        },
      ],
    },
  ];
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function sendDomainWatchAlert(
  webhookUrl: string,
  payload: SlackAlertPayload
): Promise<'sent' | 'failed'> {
  try {
    const body = {
      // Fallback text for notifications that can't render blocks
      text: `xShield: ${ALERT_META[payload.alertType]?.label ?? payload.alertType} for ${payload.domain} (score: ${payload.riskScore}/100)`,
      attachments: [
        {
          color: riskColor(payload.riskScore),
          blocks: buildAlertBlocks(payload),
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function sendTestAlert(webhookUrl: string): Promise<'sent' | 'failed'> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '✅ xShield Slack integration is working!',
        blocks: buildTestBlocks(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
