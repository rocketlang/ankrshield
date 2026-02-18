/**
 * Phishing Feed Scanner
 *
 * Checks a domain against real-time phishing feeds — all free, no auth:
 *
 *   OpenPhish  — openphish.com/feed.txt  (refreshed every 12h, no auth)
 *   SURBL      — DNS-based multi-blocklist (surbl.org) — free for low volume
 *   PhishStats — phishstats.info CSV download (no auth)
 *
 * These feeds detect ACTIVE phishing pages targeting real brands right now,
 * as opposed to urlscan.io which requires someone to submit a scan first.
 *
 * Cache: all feeds cached 4 hours in-process (flat file, fits in RAM).
 */

import { promises as dns } from 'dns';

import type { RiskFactor } from '../types.js';

const OPENPHISH_URL = 'https://openphish.com/feed.txt';
const PHISHSTATS_URL =
  'https://phishstats.info:2096/api/phishing?_where=(url,like,~{DOMAIN}~)&_size=5';
const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface PhishingHit {
  url: string;
  source: 'openphish' | 'surbl' | 'phishstats';
  detectedAt: string;
}

// In-process feed cache
let openPhishUrls: Set<string> | null = null;
let openPhishLoadedAt = 0;

async function loadOpenPhishFeed(): Promise<Set<string>> {
  const now = Date.now();
  if (openPhishUrls && now - openPhishLoadedAt < CACHE_TTL_MS) return openPhishUrls;

  try {
    const res = await fetch(OPENPHISH_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'xShieldAI/1.0 (https://xshieldai.com)' },
    });
    if (!res.ok) return openPhishUrls ?? new Set();
    const text = await res.text();
    openPhishUrls = new Set(
      text
        .split('\n')
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean)
    );
    openPhishLoadedAt = now;
    return openPhishUrls;
  } catch {
    return openPhishUrls ?? new Set();
  }
}

/** SURBL DNS lookup — returns true if domain is in the SURBL multi-blocklist */
async function checkSurbl(domain: string): Promise<boolean> {
  const base = domain.toLowerCase().replace(/^www\./, '');
  // Encode domain for SURBL lookup: {domain}.multi.surbl.org
  const lookup = `${base}.multi.surbl.org`;
  try {
    await dns.resolve4(lookup);
    return true; // A record returned = listed
  } catch {
    return false; // NXDOMAIN = not listed
  }
}

/** PhishStats API — returns recent phishing URLs containing the domain */
async function checkPhishStats(domain: string): Promise<string[]> {
  const base = domain.toLowerCase().replace(/^www\./, '');
  const url = PHISHSTATS_URL.replace('{DOMAIN}', encodeURIComponent(base));

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'xShieldAI/1.0 (https://xshieldai.com)',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ url?: string }>;
    return data
      .slice(0, 5)
      .map((d) => d.url ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check a domain against all phishing feeds.
 * Returns an array of PhishingHit objects found.
 */
export async function checkPhishingFeeds(domain: string): Promise<PhishingHit[]> {
  const base = domain.toLowerCase().replace(/^www\./, '');
  const hits: PhishingHit[] = [];
  const now = new Date().toISOString();

  const [feed, surblHit, phishStatsUrls] = await Promise.all([
    loadOpenPhishFeed(),
    checkSurbl(base),
    checkPhishStats(base),
  ]);

  // OpenPhish: check if any URL in the feed contains this domain
  for (const url of feed) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (host === base || host.endsWith(`.${base}`)) {
        hits.push({ url, source: 'openphish', detectedAt: now });
      }
    } catch {
      // ignore malformed URLs
    }
  }

  if (surblHit) {
    hits.push({
      url: `https://${base}`,
      source: 'surbl',
      detectedAt: now,
    });
  }

  for (const url of phishStatsUrls) {
    hits.push({ url, source: 'phishstats', detectedAt: now });
  }

  return hits;
}

/**
 * Convert phishing feed hits into RiskFactor entries.
 */
export function phishingHitsToFactors(hits: PhishingHit[], domain: string): RiskFactor[] {
  if (hits.length === 0) return [];

  const sources = [...new Set(hits.map((h) => h.source))].join(', ');

  return [
    {
      category: 'active_phishing_campaign',
      summary: `Domain ${domain} appears in ${hits.length} active phishing feed entry/entries (${sources})`,
      score: Math.min(60 + hits.length * 10, 95),
      source: 'urlscan',
      detail: hits
        .slice(0, 3)
        .map((h) => h.url)
        .join(' · '),
    },
  ];
}
