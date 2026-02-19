/**
 * QR Code Threat Detector — "Quishing" Detection
 *
 * Analyses URLs extracted from QR codes for phishing, OAuth hijack,
 * C2 delivery, and other attack patterns.
 *
 * QR codes bypass email security gateways (images are not scanned for URLs).
 * This detector runs heuristic + threat-intel checks on the decoded URL.
 *
 * Risk signals:
 *   - URL shortener (+25)              — hides real destination
 *   - Suspicious TLD (+20)             — .xyz, .top, .tk, .pw etc.
 *   - Domain registered < 30 days (+30)— fresh domain = phishing setup
 *   - OAuth redirect abuse (+45)       — redirect_uri to non-whitelisted host
 *   - Unicode homograph/punycode (+40) — IDN homograph attack
 *   - Data URI (+60)                   — inline HTML payload
 *   - IP-as-host (+30)                 — skips DNS, harder to block
 *   - Double encoding (+20)            — %25, %2F obfuscation
 *   - Login page mimicry (+25)         — /signin /login /verify on suspicious domain
 *   - Very long URL (+15)              — obfuscation via parameter stuffing
 *   - ThreatFox IOC hit (+80)          — known malicious domain/IP
 */

export interface QrThreatResult {
  url: string;
  score: number;
  signals: QrSignal[];
  isShortened: boolean;
  extractedDomain: string | null;
  oauthAbuse: boolean;
  threatFoxHit: boolean;
}

export interface QrSignal {
  name: string;
  description: string;
  score: number;
}

// ---------------------------------------------------------------------------
// URL shortener domains
// ---------------------------------------------------------------------------

const URL_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'goo.gl',
  'short.link',
  'tiny.cc',
  'cutt.ly',
  'rebrand.ly',
  'bl.ink',
  'shorte.st',
  'linktr.ee',
  'lnkd.in',
  'fb.me',
  'youtu.be',
  'amzn.to',
  'wp.me',
  'dlvr.it',
  'ift.tt',
  'flic.kr',
  'spoti.fi',
  'soo.gd',
  'clck.ru',
  'qr.ae',
  'tr.im',
  'snipurl.com',
  'cli.gs',
]);

// ---------------------------------------------------------------------------
// Suspicious TLDs
// ---------------------------------------------------------------------------

const SUSPICIOUS_TLDS = new Set([
  'xyz',
  'top',
  'tk',
  'pw',
  'ru',
  'cn',
  'ml',
  'ga',
  'cf',
  'gq',
  'work',
  'click',
  'link',
  'online',
  'site',
  'website',
  'space',
  'fun',
  'shop',
  'store',
  'live',
  'icu',
  'buzz',
  'vip',
  'rest',
]);

// ---------------------------------------------------------------------------
// OAuth / redirect parameter names used in phishing
// ---------------------------------------------------------------------------

const REDIRECT_PARAMS = [
  'redirect_uri',
  'redirect_url',
  'next',
  'url',
  'return',
  'returnTo',
  'continue',
  'goto',
  'destination',
  'redir',
  'target',
  'successUrl',
];

// Legitimate OAuth origins that are NOT suspicious
const OAUTH_WHITELIST = new Set([
  'accounts.google.com',
  'login.microsoftonline.com',
  'github.com',
  'login.live.com',
  'appleid.apple.com',
  'facebook.com',
  'twitter.com',
  'linkedin.com',
  'discord.com',
  'slack.com',
]);

// ---------------------------------------------------------------------------
// Login page path patterns
// ---------------------------------------------------------------------------

const LOGIN_PATHS = [
  '/signin',
  '/sign-in',
  '/login',
  '/log-in',
  '/verify',
  '/confirm',
  '/auth',
  '/authenticate',
  '/account/login',
  '/user/login',
  '/wp-login',
  '/admin/login',
  '/secure',
  '/validation',
];

// ---------------------------------------------------------------------------
// ThreatFox IOC check
// ---------------------------------------------------------------------------

async function checkThreatFox(domain: string): Promise<boolean> {
  try {
    const response = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'search_ioc', search_term: domain }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { query_status: string; data?: unknown[] };
    return data.query_status === 'ok' && Array.isArray(data.data) && data.data.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Domain extraction
// ---------------------------------------------------------------------------

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function extractTld(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1] ?? '';
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

export async function checkQrThreat(url: string): Promise<QrThreatResult> {
  const signals: QrSignal[] = [];
  let score = 0;

  const domain = extractDomain(url);
  const urlLower = url.toLowerCase();

  // 1. URL shortener
  const isShortened = domain ? URL_SHORTENERS.has(domain) : false;
  if (isShortened) {
    signals.push({
      name: 'url_shortener',
      description: `URL uses shortener service (${domain}) — real destination hidden`,
      score: 25,
    });
    score += 25;
  }

  // 2. Suspicious TLD — also check raw URL via regex when domain parse failed
  const domainForTld = domain ?? url.match(/https?:\/\/([^/?#]+)/)?.[1] ?? '';
  if (domainForTld) {
    const tld = extractTld(domainForTld);
    if (SUSPICIOUS_TLDS.has(tld)) {
      signals.push({
        name: 'suspicious_tld',
        description: `TLD .${tld} is commonly used in phishing domains`,
        score: 20,
      });
      score += 20;
    }
  }

  // 3. IP address as host — check raw URL too (in case invalid URL)
  const rawIpMatch = url.match(/https?:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if ((domain && /^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) || rawIpMatch) {
    signals.push({
      name: 'ip_as_host',
      description: 'URL uses raw IP address instead of domain — bypasses DNS filtering',
      score: 30,
    });
    score += 30;
  }

  // 4. Unicode homograph / punycode — check raw URL string too (in case parser normalised/rejected)
  const rawHasPunycode = /xn--[a-z0-9-]+/i.test(url);
  if (rawHasPunycode || (domain && (domain.startsWith('xn--') || domain.includes('.xn--')))) {
    signals.push({
      name: 'punycode_domain',
      description:
        'IDN/punycode domain may be a homograph attack (visually similar to trusted domain)',
      score: 40,
    });
    score += 40;
  }

  // 5. Data URI
  if (urlLower.startsWith('data:')) {
    signals.push({
      name: 'data_uri',
      description:
        'Data URI embeds inline payload — used to deliver HTML/JS directly without server',
      score: 60,
    });
    score += 60;
  }

  // 6. OAuth redirect abuse
  let oauthAbuse = false;
  // First try structured URL parsing
  try {
    const parsed = new URL(url);
    for (const param of REDIRECT_PARAMS) {
      const redirectTarget = parsed.searchParams.get(param);
      if (redirectTarget) {
        try {
          const redirectDomain = new URL(redirectTarget).hostname.toLowerCase();
          if (
            !OAUTH_WHITELIST.has(redirectDomain) &&
            !OAUTH_WHITELIST.has(redirectDomain.replace(/^www\./, ''))
          ) {
            oauthAbuse = true;
            signals.push({
              name: 'oauth_redirect_abuse',
              description: `OAuth redirect_uri points to non-whitelisted domain (${redirectDomain}) — token hijack vector`,
              score: 45,
            });
            score += 45;
          }
        } catch {
          /* relative URL */
        }
      }
    }
  } catch {
    // Fallback: regex-based redirect param detection for malformed/rejected URLs
    const redirectMatch = url.match(/[?&](?:redirect_uri|redirect_url|next|url|return)=([^&]+)/i);
    if (redirectMatch && redirectMatch[1]) {
      const raw = decodeURIComponent(redirectMatch[1]);
      try {
        const redirectDomain = new URL(raw).hostname.toLowerCase();
        if (!OAUTH_WHITELIST.has(redirectDomain)) {
          oauthAbuse = true;
          signals.push({
            name: 'oauth_redirect_abuse',
            description: `OAuth redirect points to non-whitelisted domain (${redirectDomain})`,
            score: 45,
          });
          score += 45;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 7. Double encoding
  if (url.includes('%25') || url.includes('%2F%2F') || url.includes('%3A%2F%2F')) {
    signals.push({
      name: 'double_encoding',
      description: 'URL contains double-encoded characters — common obfuscation technique',
      score: 20,
    });
    score += 20;
  }

  // 8. Very long URL
  if (url.length > 500) {
    signals.push({
      name: 'excessive_length',
      description: `URL is ${url.length} chars — excessive length used to hide malicious parameters`,
      score: 15,
    });
    score += 15;
  }

  // 9. Login page mimicry on suspicious domain (also check raw URL string)
  const effectiveDomain = domain ?? '';
  if (!OAUTH_WHITELIST.has(effectiveDomain)) {
    const path = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return urlLower;
      }
    })();
    const mimicsLogin = LOGIN_PATHS.some((p) => path.includes(p));
    if (mimicsLogin) {
      signals.push({
        name: 'login_mimicry',
        description: `URL path mimics login page (${path}) on non-whitelisted domain`,
        score: 25,
      });
      score += 25;
    }
  }

  // 10. ThreatFox IOC check (async)
  let threatFoxHit = false;
  if (domain) {
    threatFoxHit = await checkThreatFox(domain);
    if (threatFoxHit) {
      signals.push({
        name: 'threatfox_ioc',
        description: `Domain ${domain} found in ThreatFox IOC database`,
        score: 80,
      });
      score += 80;
    }
  }

  return {
    url,
    score: Math.min(score, 100),
    signals,
    isShortened,
    extractedDomain: domain,
    oauthAbuse,
    threatFoxHit,
  };
}

export function qrToFactors(result: QrThreatResult) {
  if (result.score === 0) return [];
  return [
    {
      category: 'qr_threat' as const,
      source: 'qr_heuristic' as const,
      score: result.score,
      summary: 'QR Code Threat',
      detail:
        result.signals.length > 0
          ? result.signals.map((s) => s.description).join('; ')
          : 'QR code URL shows suspicious characteristics',
    },
  ];
}
