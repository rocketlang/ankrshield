/**
 * Breach Monitor — HIBP public breach list
 *
 * Uses the Have I Been Pwned (HIBP) public API to check whether a given
 * domain appears in known data breaches. The /breaches endpoint lists ALL
 * public breaches and is accessible without authentication.
 *
 * Endpoint: GET https://haveibeenpwned.com/api/v3/breaches
 * Docs:     https://haveibeenpwned.com/API/v3
 *
 * We fetch the full breach list once (cached for 24h) and filter client-side
 * by the `Domain` field to avoid needing a paid HIBP API key for per-domain
 * lookups.
 *
 * Note: Checking *email addresses* in breaches requires a HIBP subscription.
 * This module only checks the BREACH DOMAIN field — fully free.
 */

import type { BreachRecord, RiskFactor } from '../types.js';

const HIBP_BREACHES_URL = 'https://haveibeenpwned.com/api/v3/breaches';
const TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface HibpBreach {
  Name: string;
  Domain: string;
  BreachDate: string;
  PwnCount: number;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
  IsSpamList: boolean;
}

// Simple in-process cache so we don't hammer HIBP on every request
let breachCache: HibpBreach[] | null = null;
let cacheLoadedAt = 0;

async function getBreachList(): Promise<HibpBreach[]> {
  const now = Date.now();
  if (breachCache && now - cacheLoadedAt < CACHE_TTL_MS) return breachCache;

  try {
    const res = await fetch(HIBP_BREACHES_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'xShieldAI/1.0 (https://xshieldai.com)',
      },
    });

    if (!res.ok) return breachCache ?? [];

    const data = (await res.json()) as HibpBreach[];
    breachCache = data;
    cacheLoadedAt = now;
    return data;
  } catch {
    return breachCache ?? [];
  }
}

/**
 * Check whether the given domain (e.g. 'example.com') appears in any public
 * HIBP breach records.
 *
 * Returns an array of matching BreachRecord objects (empty = no breaches found).
 */
export async function checkDomainBreaches(domain: string): Promise<BreachRecord[]> {
  const allBreaches = await getBreachList();
  const normalized = domain.toLowerCase().replace(/^www\./, '');

  return allBreaches
    .filter((b) => {
      if (!b.IsVerified || b.IsFabricated || b.IsRetired || b.IsSpamList) return false;
      const bd = b.Domain.toLowerCase().replace(/^www\./, '');
      return bd === normalized || bd.endsWith(`.${normalized}`);
    })
    .map((b) => ({
      name: b.Name,
      breachDate: b.BreachDate,
      pwnCount: b.PwnCount,
      dataClasses: b.DataClasses,
    }));
}

/**
 * Convert breach records into RiskFactor entries.
 */
export function breachesToFactors(breaches: BreachRecord[], domain: string): RiskFactor[] {
  if (breaches.length === 0) return [];

  const totalPwned = breaches.reduce((sum, b) => sum + b.pwnCount, 0);
  const hasPasswordBreach = breaches.some((b) => b.dataClasses.includes('Passwords'));

  const score = Math.min(
    15 +
      breaches.length * 8 +
      (hasPasswordBreach ? 20 : 0) +
      Math.floor(Math.log10(totalPwned + 1) * 5),
    75
  );

  return [
    {
      category: 'known_breach',
      summary: `Domain ${domain} found in ${breaches.length} public data breach(es) — ${totalPwned.toLocaleString()} accounts compromised total`,
      score,
      source: 'hibp',
      detail: breaches
        .slice(0, 5)
        .map((b) => `${b.name} (${b.breachDate})`)
        .join(', '),
    },
  ];
}
