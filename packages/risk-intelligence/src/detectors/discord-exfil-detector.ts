/**
 * Discord / Slack / Telegram Webhook Exfiltration Detector
 *
 * Detects data exfiltration via legitimate messaging platform webhooks.
 *
 * This is one of the highest-confidence detections available:
 * NO legitimate software (except the apps themselves) sends POST requests to
 * discord.com/api/webhooks or api.telegram.org/bot from a non-browser process.
 * When this fires from svchost.exe, powershell.exe, python.exe, or any random
 * PE — it is almost certainly malware exfiltrating data.
 *
 * Used by: Raccoon Stealer, Vidar, RedLine, MetaStealer, WhiteSnake,
 *          Umbral Stealer, StormKitty, ToxicEye, AsyncRAT (data relay),
 *          and 50+ other active malware families.
 *
 * Webhook exfil workflow:
 *   1. Malware harvests: browser passwords, cookies, crypto wallets, screenshots
 *   2. POSTs data to attacker's Discord channel via webhook URL
 *   3. Attacker collects data passively — no active C2 needed
 *   4. discord.com is on every corporate allowlist → never blocked
 */

export interface ExfilConnection {
  domain: string;
  url?: string;
  processName: string; // e.g. 'powershell.exe', 'python3', 'chrome'
  processPath?: string; // e.g. '/usr/bin/python3'
  pid?: number;
}

export interface ExfilResult {
  connection: ExfilConnection;
  score: number;
  platform: 'discord' | 'slack' | 'telegram' | 'teams' | 'other' | null;
  webhookPattern: string | null;
  isAllowlistedProcess: boolean;
  verdict: 'clean' | 'suspicious' | 'malware_exfil';
  explanation: string;
}

// ---------------------------------------------------------------------------
// Process allowlist — these processes legitimately connect to these endpoints
// ---------------------------------------------------------------------------

const ALLOWLISTED_PROCESSES = new Set([
  // Browsers
  'chrome',
  'chrome.exe',
  'chromium',
  'chromium-browser',
  'firefox',
  'firefox.exe',
  'firefox-bin',
  'safari',
  'safari.exe',
  'msedge',
  'msedge.exe',
  'microsoftedge',
  'microsoftedge.exe',
  'brave',
  'brave.exe',
  'brave-browser',
  'opera',
  'opera.exe',
  // Native apps
  'discord',
  'discord.exe',
  'discordptb',
  'discordcanary',
  'slack',
  'slack.exe',
  'telegram',
  'telegram.exe',
  'telegram-desktop',
  'signal',
  'signal.exe',
  'signal-desktop',
  'teams',
  'teams.exe',
  'msteams',
  'msteams.exe',
  // Electron containers (legitimate desktop apps)
  'electron',
  'electron.exe',
  // Node.js (borderline — flag as suspicious not critical)
  'node',
  'node.exe',
]);

// Processes that are HIGH SUSPICION if connecting to messaging webhooks
const HIGH_SUSPICION_PROCESSES = new Set([
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'cmd',
  'cmd.exe',
  'wscript',
  'wscript.exe',
  'cscript',
  'cscript.exe',
  'mshta',
  'mshta.exe',
  'regsvr32',
  'regsvr32.exe',
  'rundll32',
  'rundll32.exe',
  'svchost',
  'svchost.exe',
  'explorer',
  'explorer.exe',
  'python',
  'python.exe',
  'python3',
  'python3.exe',
  'ruby',
  'ruby.exe',
  'perl',
  'perl.exe',
  'bash',
  'bash.exe',
  'sh',
  'sh.exe',
]);

// ---------------------------------------------------------------------------
// Platform webhook pattern matching
// ---------------------------------------------------------------------------

interface WebhookPattern {
  platform: ExfilResult['platform'];
  pattern: RegExp;
  baseScore: number;
  description: string;
}

const WEBHOOK_PATTERNS: WebhookPattern[] = [
  {
    platform: 'discord',
    pattern: /discord\.com\/api\/webhooks\/\d+\/[\w-]+/i,
    baseScore: 95,
    description:
      'Discord incoming webhook — used by 50+ stealer malware families for data exfiltration',
  },
  {
    platform: 'telegram',
    pattern: /api\.telegram\.org\/bot[\w:]+\//i,
    baseScore: 85,
    description:
      'Telegram Bot API — used as C2 and data relay by AsyncRAT, ToxicEye, StormKitty, and others',
  },
  {
    platform: 'slack',
    pattern: /hooks\.slack\.com\/services\/[\w/]+/i,
    baseScore: 75,
    description: 'Slack incoming webhook — used for data exfiltration by targeted attack tooling',
  },
  {
    platform: 'teams',
    pattern: /outlook\.office\.com\/webhook\/[\w@-]+\/IncomingWebhook\//i,
    baseScore: 70,
    description: 'Microsoft Teams incoming webhook — used in targeted corporate exfiltration',
  },
];

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

export function checkExfilConnection(conn: ExfilConnection): ExfilResult {
  const processNameLower = conn.processName.toLowerCase();
  const urlToCheck = conn.url ?? conn.domain;

  const isAllowlistedProcess = ALLOWLISTED_PROCESSES.has(processNameLower);
  const isHighSuspicion = HIGH_SUSPICION_PROCESSES.has(processNameLower);

  // Check which webhook pattern matches
  let matchedPattern: WebhookPattern | null = null;
  for (const wp of WEBHOOK_PATTERNS) {
    if (wp.pattern.test(urlToCheck)) {
      matchedPattern = wp;
      break;
    }
  }

  // No webhook pattern found — not a social exfil issue
  if (!matchedPattern) {
    return {
      connection: conn,
      score: 0,
      platform: null,
      webhookPattern: null,
      isAllowlistedProcess,
      verdict: 'clean',
      explanation: 'No known webhook exfiltration pattern detected',
    };
  }

  // Allowlisted process making this call — normal
  if (isAllowlistedProcess) {
    return {
      connection: conn,
      score: 5,
      platform: matchedPattern.platform,
      webhookPattern: matchedPattern.description,
      isAllowlistedProcess: true,
      verdict: 'clean',
      explanation: `${conn.processName} is a known legitimate application for this endpoint`,
    };
  }

  // Unknown process — suspicious
  const score = isHighSuspicion
    ? matchedPattern.baseScore // Full score for known-bad process names
    : Math.round(matchedPattern.baseScore * 0.85); // Slightly lower for unknown process

  const verdict: ExfilResult['verdict'] = score >= 80 ? 'malware_exfil' : 'suspicious';

  const explanation = isHighSuspicion
    ? `CRITICAL: ${conn.processName} is connecting to ${matchedPattern.platform} webhook — ${matchedPattern.description}. This process has no legitimate reason to use this endpoint.`
    : `SUSPICIOUS: Unknown process ${conn.processName} connecting to ${matchedPattern.platform} webhook — ${matchedPattern.description}`;

  return {
    connection: conn,
    score,
    platform: matchedPattern.platform,
    webhookPattern: matchedPattern.description,
    isAllowlistedProcess: false,
    verdict,
    explanation,
  };
}

/**
 * Batch check multiple connections — use when scanning all active network connections
 */
export function checkExfilConnections(connections: ExfilConnection[]): ExfilResult[] {
  return connections.map(checkExfilConnection).filter((r) => r.score > 0);
}

export function exfilToFactors(results: ExfilResult[]) {
  return results
    .filter((r) => r.score >= 50)
    .map((r) => ({
      category: 'discord_exfil' as const,
      source: 'process_monitor' as const,
      score: r.score,
      summary: `${r.platform ? r.platform.charAt(0).toUpperCase() + r.platform.slice(1) : 'Webhook'} Exfiltration`,
      detail: r.explanation,
    }));
}
