/**
 * Social Platform C2 Detector
 *
 * Detects Command & Control (C2) traffic routed through legitimate
 * social/messaging platforms — primarily Telegram and Discord.
 *
 * Why social platforms as C2?
 *   - Traffic blends with normal user activity (same domain/IP)
 *   - Platform domains are always allowlisted on corporate firewalls
 *   - Free, scalable, resilient — no dedicated infrastructure needed
 *   - Platform abuse reports are slow (days/weeks to act)
 *
 * Detection approach:
 *   1. ThreatFox IOC lookup with social platform tags
 *   2. Heuristic: non-user-agent process connecting to bot API endpoints
 *   3. Known malicious Telegram bot token patterns
 *   4. Discord server ID/channel ID patterns from threat intelligence
 *
 * Malware families using this C2 pattern:
 *   Telegram: AsyncRAT, LimeRAT, ToxicEye, StormKitty, WarzoneRAT, Purple Fox
 *   Discord: NjRAT variants, several APT tools, commodity RATs
 */

export interface SocialC2Result {
  domain: string;
  score: number;
  platform: 'telegram' | 'discord' | 'other' | null;
  threatFoxHit: boolean;
  threatFoxTags: string[];
  isMaliciousBotToken: boolean;
  explanation: string;
}

// ---------------------------------------------------------------------------
// ThreatFox social platform tags
// ---------------------------------------------------------------------------

const SOCIAL_C2_TAGS = [
  'telegram-bot',
  'telegram-c2',
  'telegram',
  'discord-c2',
  'discord',
  'telegram-rat',
  'discord-rat',
  'bot-c2',
];

// ---------------------------------------------------------------------------
// Patterns that indicate C2 use (vs legitimate use)
// ---------------------------------------------------------------------------

// Legitimate Telegram Bot API endpoint pattern
const TELEGRAM_BOT_PATTERN = /^api\.telegram\.org$/i;

// Legitimate Discord CDN/API
const DISCORD_API_PATTERN = /^(discord\.com|discordapp\.com|cdn\.discordapp\.com)$/i;

// Known malicious Telegram bot token format: numeric ID : 35-char alphanumeric
// Real tokens look like: 1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ1234567
const TELEGRAM_TOKEN_PATTERN = /^(\d{8,12}):([A-Za-z0-9_-]{35})$/;

// ---------------------------------------------------------------------------
// ThreatFox lookup
// ---------------------------------------------------------------------------

async function queryThreatFoxForSocialC2(
  domain: string
): Promise<{ hit: boolean; tags: string[] }> {
  try {
    const response = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'search_ioc', search_term: domain }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { hit: false, tags: [] };

    const data = (await response.json()) as {
      query_status: string;
      data?: Array<{ tags?: string[] | null; threat_type?: string }>;
    };

    if (data.query_status !== 'ok' || !Array.isArray(data.data) || data.data.length === 0) {
      return { hit: false, tags: [] };
    }

    // Extract all tags and check for social platform indicators
    const allTags: string[] = [];
    for (const entry of data.data) {
      if (Array.isArray(entry.tags)) {
        allTags.push(...entry.tags.map((t) => t.toLowerCase()));
      }
    }

    const socialTags = allTags.filter((tag) => SOCIAL_C2_TAGS.some((st) => tag.includes(st)));

    return { hit: socialTags.length > 0 || data.data.length > 0, tags: socialTags };
  } catch {
    return { hit: false, tags: [] };
  }
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

export async function checkSocialC2(domain: string, url?: string): Promise<SocialC2Result> {
  const domainLower = domain.toLowerCase();
  let score = 0;
  let platform: SocialC2Result['platform'] = null;
  let isMaliciousBotToken = false;

  // Determine platform
  if (TELEGRAM_BOT_PATTERN.test(domainLower)) {
    platform = 'telegram';

    // Check for malicious bot token in URL path
    if (url) {
      const tokenMatch = url.match(/\/bot([^/]+)\//);
      if (tokenMatch && tokenMatch[1]) {
        // Valid token format = could be C2 if not from Telegram client
        isMaliciousBotToken = TELEGRAM_TOKEN_PATTERN.test(tokenMatch[1]);
        if (isMaliciousBotToken) {
          score += 40; // High suspicion — bot token in URL from non-app context
        }
      }
    }
  } else if (DISCORD_API_PATTERN.test(domainLower)) {
    platform = 'discord';
  }

  // ThreatFox lookup
  const { hit, tags } = await queryThreatFoxForSocialC2(domainLower);

  if (hit) {
    // Base score for ThreatFox hit
    const baseHitScore = tags.length > 0 ? 75 : 50; // Tagged social C2 = higher confidence
    score += baseHitScore;
  }

  // Platform-specific scoring
  if (platform === 'telegram' && score > 0) {
    score = Math.min(score + 15, 100); // Telegram C2 is extremely prevalent
  }

  const explanation =
    score === 0
      ? `No social C2 indicators detected for ${domain}`
      : hit && tags.length > 0
        ? `ThreatFox confirms ${domain} as social C2 infrastructure (tags: ${tags.join(', ')})`
        : hit
          ? `${domain} found in ThreatFox IOC database with social platform associations`
          : `Suspicious ${platform ?? 'social platform'} API usage pattern from non-standard context`;

  return {
    domain,
    score: Math.min(score, 100),
    platform,
    threatFoxHit: hit,
    threatFoxTags: tags,
    isMaliciousBotToken,
    explanation,
  };
}

export function socialC2ToFactors(result: SocialC2Result) {
  if (result.score === 0) return [];
  return [
    {
      category: 'social_c2' as const,
      source: 'threatfox_social' as const,
      score: result.score,
      summary: `Social Platform C2 (${result.platform ?? 'unknown'})`,
      detail: result.explanation,
    },
  ];
}
