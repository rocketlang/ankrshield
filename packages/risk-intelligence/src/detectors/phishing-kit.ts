/**
 * Phishing Kit Fingerprinter (X12)
 *
 * Fetches the target domain's HTML/JS and fingerprints it against known
 * phishing kit signatures. Supports detection of:
 *
 *   - GoPhish         — open-source phishing simulation framework (often misused)
 *   - Evilginx2       — reverse proxy MitM phishing platform
 *   - Modlishka       — reverse proxy phishing toolkit
 *   - King Phisher    — campaign management phishing server
 *   - Zphisher        — automated phishing tool (GitHub-hosted)
 *   - BlackEye        — phishing kit with 30+ templates
 *   - Generic         — credential harvesting page (password + no HTTPS)
 *
 * All fetches use an 8-second timeout and a spoofed Chrome User-Agent.
 * Errors are caught silently — returns { detected: false } on any failure.
 */

import { promises as dns } from 'dns';

import type { RiskFactor } from '../types.js';

const FETCH_TIMEOUT_MS = 8_000;
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface PhishingKitResult {
  /** True if a known phishing kit was detected */
  detected: boolean;
  /** Name of the detected kit, or null */
  kitName: string | null;
  /** Confidence 0–100 */
  confidence: number;
  /** Which fingerprint signals matched */
  indicators: string[];
  /** Composite risk score 0–100 */
  riskScore: number;
}

// ---------------------------------------------------------------------------
// Kit signature definitions
// ---------------------------------------------------------------------------

interface KitSignature {
  name: string;
  /** Functions that return true when the signal is present */
  checks: Array<(body: string, headers: Record<string, string>) => boolean>;
  /** Weight per matched check (0–100) */
  checkWeight: number;
}

const KIT_SIGNATURES: KitSignature[] = [
  {
    name: 'GoPhish',
    checkWeight: 25,
    checks: [
      (body) => /<title[^>]*>GoPhish<\/title>/i.test(body),
      (body) => /<meta[^>]+name=["']gophish["']/i.test(body),
      (body) => /action=["'][^"']*\/report["']/i.test(body),
      (_body, headers) => 'x-gophish-contact' in headers,
    ],
  },
  {
    name: 'Evilginx2',
    checkWeight: 30,
    checks: [
      (body) => /var\s+EVILGINX\s*=/i.test(body),
      (body) => /creds_migrated/i.test(body),
      // /o/oauth2 path on a domain that isn't accounts.google.com
      (body) => /["']o\/oauth2\//.test(body),
    ],
  },
  {
    name: 'Modlishka',
    checkWeight: 28,
    checks: [
      (body) => /modlishka/i.test(body),
      // Tracking pixel pattern common to Modlishka
      (body) => /<img[^>]+src=["'][^"']*\/px\.gif["']/i.test(body),
      (body) => /x-modlishka/i.test(body),
    ],
  },
  {
    name: 'King Phisher',
    checkWeight: 30,
    checks: [
      (body) => /King Phisher/i.test(body),
      (body) => /\/kp\/client\//.test(body),
      (body) => /<meta[^>]+name=["']king-phisher["']/i.test(body),
    ],
  },
  {
    name: 'Zphisher',
    checkWeight: 25,
    checks: [
      (body) => /zphisher/i.test(body),
      // Common credential harvesting pattern used by Zphisher templates
      (body) => /document\.getElementById\(['"]pass['"]\)\.value/i.test(body),
      (body) => /ip\.get\?/i.test(body),
    ],
  },
  {
    name: 'BlackEye',
    checkWeight: 28,
    checks: [
      (body) => /<title[^>]*>BlackEye<\/title>/i.test(body),
      (body) => /blackeye/i.test(body),
      // PHP form pattern from BlackEye
      (body) => /\$_POST\['password'\]/i.test(body),
    ],
  },
];

// ---------------------------------------------------------------------------
// DNS resolution check
// ---------------------------------------------------------------------------

async function hasARecord(domain: string): Promise<boolean> {
  try {
    const addrs = await dns.resolve4(domain);
    return addrs.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Generic credential harvesting detector
// ---------------------------------------------------------------------------

function detectGenericCredentialHarvesting(
  body: string,
  url: string
): { matched: boolean; indicators: string[] } {
  const indicators: string[] = [];

  // Password field present
  if (/<input[^>]+type=["']password["']/i.test(body)) {
    indicators.push('password-field-present');
  }

  // Username/email field present
  if (/<input[^>]+(?:name|id)=["'](?:username|user|email|login|userid)["']/i.test(body)) {
    indicators.push('username-field-present');
  }

  // No HTTPS (served over plain HTTP)
  if (url.startsWith('http://')) {
    indicators.push('no-https');
  }

  // Form posts to an external or suspicious domain
  const formActionMatch = /action=["']([^"']+)["']/i.exec(body);
  if (formActionMatch) {
    const action = formActionMatch[1];
    // POSTing to a PHP file with credential-sounding names
    if (/(?:login|credential|steal|harvest|grab)\.php/i.test(action)) {
      indicators.push('suspicious-form-action');
    }
    // POSTing to a Telegram bot or external webhook
    if (/api\.telegram\.org|discord\.com\/api\/webhooks/i.test(action)) {
      indicators.push('exfil-via-telegram-or-discord');
    }
  }

  return {
    matched: indicators.includes('password-field-present') && indicators.length >= 2,
    indicators,
  };
}

// ---------------------------------------------------------------------------
// Main fingerprinter
// ---------------------------------------------------------------------------

/**
 * Fetch domain root and fingerprint against known phishing kit signatures.
 */
export async function fingerprintPhishingKit(domain: string): Promise<PhishingKitResult> {
  const empty: PhishingKitResult = {
    detected: false,
    kitName: null,
    confidence: 0,
    indicators: [],
    riskScore: 0,
  };

  // Only proceed if the domain has an A record
  const resolvable = await hasARecord(domain).catch(() => false);
  if (!resolvable) return empty;

  // Attempt to fetch over HTTP (phishing kits frequently don't have valid HTTPS)
  const url = `http://${domain}/`;
  let body = '';
  const headers: Record<string, string> = {};

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    // Collect response headers as lowercase keys
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Only analyse if we got HTML-ish content
    const ct = headers['content-type'] ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain') && ct !== '') {
      return empty;
    }

    body = await res.text();
  } catch {
    return empty;
  }

  if (!body) return empty;

  // ---------------------------------------------------------------------------
  // Run kit signatures
  // ---------------------------------------------------------------------------
  for (const kit of KIT_SIGNATURES) {
    const matchedChecks: string[] = [];

    for (let i = 0; i < kit.checks.length; i++) {
      try {
        if (kit.checks[i](body, headers)) {
          matchedChecks.push(`${kit.name.toLowerCase()}-sig-${i + 1}`);
        }
      } catch {
        // ignore individual check errors
      }
    }

    if (matchedChecks.length === 0) continue;

    // Confidence scales linearly with matched checks
    const confidence = Math.min(Math.round((matchedChecks.length / kit.checks.length) * 100), 100);

    // Require at least one check match — even partial detection is noteworthy
    return {
      detected: true,
      kitName: kit.name,
      confidence,
      indicators: matchedChecks,
      riskScore: Math.min(30 + confidence * 0.7, 100),
    };
  }

  // ---------------------------------------------------------------------------
  // Generic credential harvesting fallback
  // ---------------------------------------------------------------------------
  const generic = detectGenericCredentialHarvesting(body, url);
  if (generic.matched) {
    const confidence = Math.min(generic.indicators.length * 20, 80);
    return {
      detected: true,
      kitName: null,
      confidence,
      indicators: generic.indicators,
      riskScore: Math.min(20 + confidence * 0.65, 100),
    };
  }

  return empty;
}

// ---------------------------------------------------------------------------
// RiskFactor conversion
// ---------------------------------------------------------------------------

/**
 * Convert a PhishingKitResult into RiskFactor entries for the risk engine.
 */
export function phishingKitToFactors(result: PhishingKitResult): RiskFactor[] {
  if (!result.detected || result.riskScore === 0) return [];

  const kitLabel = result.kitName
    ? `${result.kitName} phishing kit`
    : 'generic credential harvesting page';
  const indicatorSummary = result.indicators.slice(0, 5).join(', ');

  return [
    {
      category: 'phishing_domain',
      summary: `${kitLabel} detected (confidence: ${result.confidence}%) — indicators: ${indicatorSummary}`,
      score: result.riskScore,
      source: 'urlscan',
      detail: result.indicators.join(' · '),
    },
  ];
}
