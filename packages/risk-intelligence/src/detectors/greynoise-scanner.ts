/**
 * GreyNoise Community Scanner
 *
 * Uses the FREE GreyNoise Community API (no API key required) to classify an
 * IP address as malicious / benign / unknown.
 *
 * Endpoint: GET https://api.greynoise.io/v3/community/{ip}
 * Docs:     https://docs.greynoise.io/reference/get_v3-community-ip
 *
 * Rate limit: ~100 requests/day on Community plan (unauthenticated).
 * Returns HTTP 404 for IPs GreyNoise has never observed.
 */

import type { GreyNoiseResult, RiskFactor } from '../types.js';

const GREYNOISE_BASE = 'https://api.greynoise.io/v3/community';
const TIMEOUT_MS = 10_000;

interface GreyNoiseCommunityResponse {
  ip: string;
  noise: boolean;
  riot: boolean;
  classification?: 'malicious' | 'benign';
  name?: string;
  last_seen?: string;
  message?: string; // present on 404 "This IP is not in our dataset"
}

/**
 * Query GreyNoise Community API for a single IP.
 * Returns null when the IP is not in GreyNoise's dataset or on network error.
 */
export async function scanIpWithGreyNoise(ip: string): Promise<GreyNoiseResult | null> {
  if (!ip || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return null; // skip private / loopback IPs
  }

  const url = `${GREYNOISE_BASE}/${encodeURIComponent(ip)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': 'xShieldAI/1.0' },
    });

    if (res.status === 404) {
      // IP not in GreyNoise dataset — return unknown
      return {
        ip,
        classification: 'unknown',
        noise: false,
        riot: false,
        name: 'Unknown',
        lastSeen: null,
      };
    }

    if (!res.ok) return null;

    const data = (await res.json()) as GreyNoiseCommunityResponse;

    return {
      ip: data.ip ?? ip,
      classification: data.classification ?? 'unknown',
      noise: data.noise ?? false,
      riot: data.riot ?? false,
      name: data.name ?? 'Unknown',
      lastSeen: data.last_seen ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Convert a GreyNoise result into zero or more RiskFactor entries.
 */
export function greyNoiseToFactors(result: GreyNoiseResult): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (result.classification === 'malicious') {
    factors.push({
      category: 'malicious_ip',
      summary: `Server IP ${result.ip} classified as MALICIOUS by GreyNoise (${result.name})`,
      score: 80,
      source: 'greynoise',
      detail: result.ip,
    });
  }

  if (result.noise && result.classification !== 'benign') {
    factors.push({
      category: 'scanner_activity',
      summary: `IP ${result.ip} is actively scanning the internet (GreyNoise noise flag)`,
      score: result.classification === 'malicious' ? 0 : 40, // don't double-count
      source: 'greynoise',
      detail: `Last seen: ${result.lastSeen ?? 'unknown'}`,
    });
  }

  return factors.filter((f) => f.score > 0);
}
