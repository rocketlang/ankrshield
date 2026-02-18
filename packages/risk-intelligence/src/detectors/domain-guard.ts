/**
 * Domain Guard — Phishing and typosquat detection via urlscan.io
 *
 * Uses the FREE urlscan.io Search API (no auth required) to find recently
 * scanned pages that are visually or structurally similar to the target domain
 * and have received a malicious/suspicious verdict.
 *
 * Strategy:
 *   1. Search for scans of the exact domain to get a baseline verdict
 *   2. Generate common typosquatting variants of the domain
 *   3. Search urlscan.io for each variant — flag those with malicious/suspicious verdicts
 *
 * Endpoint: GET https://urlscan.io/api/v1/search/?q=domain:{domain}&size=20
 * Docs:     https://urlscan.io/docs/api/
 *
 * Free limit: 1000 searches/hour (unauthenticated). Well within our needs.
 */

import type { DomainThreat, RiskFactor } from '../types.js';

const URLSCAN_BASE = 'https://urlscan.io/api/v1/search';
const TIMEOUT_MS = 12_000;

interface UrlscanResult {
  page?: {
    domain?: string;
    url?: string;
    ptr?: string;
  };
  task?: {
    url?: string;
    time?: string;
  };
  verdicts?: {
    overall?: {
      malicious?: boolean;
      score?: number;
      categories?: string[];
    };
    urlscan?: {
      verdict?: string;
      score?: number;
    };
  };
  screenshot?: string;
}

interface UrlscanSearchResponse {
  results?: UrlscanResult[];
  total?: number;
}

// ---------------------------------------------------------------------------
// Typosquat variant generation
// ---------------------------------------------------------------------------

/**
 * Generate common typosquatting variants for a given domain name (without TLD).
 * Limited to practical variants to stay within rate limits.
 */
function generateTypoVariants(name: string, tld: string): string[] {
  const variants = new Set<string>();

  // Missing character
  for (let i = 0; i < name.length; i++) {
    variants.add(name.slice(0, i) + name.slice(i + 1) + '.' + tld);
  }

  // Doubled character
  for (let i = 0; i < name.length; i++) {
    variants.add(name.slice(0, i) + name[i] + name[i] + name.slice(i + 1) + '.' + tld);
  }

  // Common homoglyph substitutions
  const homoGlyphs: Record<string, string> = { o: '0', i: '1', l: '1', a: '@', s: '5' };
  for (const [char, sub] of Object.entries(homoGlyphs)) {
    if (name.includes(char)) {
      variants.add(name.replaceAll(char, sub) + '.' + tld);
    }
  }

  // TLD variations (popular alternatives)
  const altTlds = ['net', 'org', 'io', 'co', 'info', 'biz'];
  for (const alt of altTlds) {
    if (alt !== tld) variants.add(name + '.' + alt);
  }

  // Common prefix/suffix tricks
  variants.add(name + '-login.' + tld);
  variants.add(name + '-secure.' + tld);
  variants.add('login-' + name + '.' + tld);
  variants.add('secure-' + name + '.' + tld);
  variants.add(name + 'app.' + tld);

  // Remove the original domain itself
  variants.delete(name + '.' + tld);

  return [...variants].slice(0, 30); // cap at 30 to stay within rate limits
}

// ---------------------------------------------------------------------------
// urlscan.io API helpers
// ---------------------------------------------------------------------------

async function searchUrlscan(query: string): Promise<UrlscanResult[]> {
  const url = `${URLSCAN_BASE}/?q=${encodeURIComponent(query)}&size=10`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'xShieldAI/1.0 (https://xshieldai.com)',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as UrlscanSearchResponse;
    return data.results ?? [];
  } catch {
    return [];
  }
}

function resultToThreat(r: UrlscanResult): DomainThreat | null {
  const domain = r.page?.domain ?? '';
  const url = r.task?.url ?? r.page?.url ?? '';
  const scannedAt = r.task?.time ?? '';
  const malicious = r.verdicts?.overall?.malicious ?? false;
  const score = r.verdicts?.overall?.score ?? r.verdicts?.urlscan?.score ?? 0;
  const rawVerdict = r.verdicts?.urlscan?.verdict;

  let verdict: DomainThreat['verdict'] = 'unrated';
  if (malicious || rawVerdict === 'malicious') verdict = 'malicious';
  else if (score > 50 || rawVerdict === 'suspicious') verdict = 'suspicious';

  if (verdict === 'unrated') return null;

  return {
    domain,
    url,
    verdict,
    screenshotUrl: r.screenshot ?? null,
    scannedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search urlscan.io for phishing pages and typosquat domains targeting the
 * given domain. Returns an array of DomainThreat objects.
 */
export async function scanDomainThreats(domain: string): Promise<DomainThreat[]> {
  const threats: DomainThreat[] = [];
  const seen = new Set<string>();

  // Parse domain into name + tld
  const parts = domain
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.');
  const tld = parts.slice(-1)[0] ?? 'com';
  const name = parts.slice(0, -1).join('.');

  if (!name) return [];

  // 1. Check if the domain itself has been flagged in urlscan
  const ownResults = await searchUrlscan(`domain:${domain} AND verdicts.overall.malicious:true`);
  for (const r of ownResults) {
    const threat = resultToThreat(r);
    if (threat && !seen.has(threat.domain)) {
      seen.add(threat.domain);
      threats.push(threat);
    }
  }

  // 2. Check typosquat variants (sample a subset to stay within rate limits)
  const variants = generateTypoVariants(name, tld);
  // Check a batch of 5 variants via a combined urlscan search
  const batchSize = 5;
  for (let i = 0; i < Math.min(variants.length, 15); i += batchSize) {
    const batch = variants.slice(i, i + batchSize);
    const query = batch.map((v) => `domain:${v}`).join(' OR ');
    const results = await searchUrlscan(query);
    for (const r of results) {
      const threat = resultToThreat(r);
      if (threat && !seen.has(threat.domain)) {
        seen.add(threat.domain);
        threats.push(threat);
      }
    }
  }

  return threats;
}

/**
 * Convert DomainThreat list into RiskFactor entries.
 */
export function domainThreatsToFactors(threats: DomainThreat[], domain: string): RiskFactor[] {
  if (threats.length === 0) return [];

  const maliciousCount = threats.filter((t) => t.verdict === 'malicious').length;
  const suspiciousCount = threats.filter((t) => t.verdict === 'suspicious').length;

  const factors: RiskFactor[] = [];

  if (maliciousCount > 0) {
    factors.push({
      category: 'phishing_domain',
      summary: `${maliciousCount} confirmed phishing/malicious page(s) targeting ${domain} found via urlscan.io`,
      score: Math.min(30 + maliciousCount * 10, 70),
      source: 'urlscan',
      detail: threats
        .filter((t) => t.verdict === 'malicious')
        .slice(0, 3)
        .map((t) => t.domain)
        .join(', '),
    });
  }

  if (suspiciousCount > 0) {
    factors.push({
      category: 'typosquat',
      summary: `${suspiciousCount} suspicious domain(s) resembling ${domain} detected`,
      score: Math.min(15 + suspiciousCount * 5, 40),
      source: 'urlscan',
      detail: threats
        .filter((t) => t.verdict === 'suspicious')
        .slice(0, 3)
        .map((t) => t.domain)
        .join(', '),
    });
  }

  return factors;
}
