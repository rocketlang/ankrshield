/**
 * ASN Reputation & Geopolitical Risk
 *
 * Enriches an IP address with Autonomous System Number (ASN) data and
 * cross-references against known risky ASNs, bulletproof hosters, and
 * high-risk geopolitical regions.
 *
 * Free API: ip-api.com (no auth, 45 req/min, returns ASN + org + country)
 * Endpoint: GET http://ip-api.com/json/{ip}?fields=status,country,countryCode,org,as,isp,hosting
 *
 * Bulletproof hosting ASNs are used by cybercriminals because they ignore
 * abuse complaints. Nation-state actors often route through specific ASNs
 * in sanctioned countries.
 *
 * Zero cost — ip-api.com is completely free for non-commercial use.
 */

import type { RiskFactor } from '../types.js';

const IP_API_BASE = 'http://ip-api.com/json';
const TIMEOUT_MS = 8_000;

export interface AsnRecord {
  ip: string;
  asn: string; // e.g. "AS13335"
  asnNumber: number; // e.g. 13335
  org: string; // e.g. "Cloudflare, Inc."
  isp: string;
  country: string; // Full name
  countryCode: string; // ISO 3166-1 alpha-2
  isHosting: boolean; // Data center / hosting provider
  isBulletproof: boolean;
  riskCategory: 'clean' | 'low' | 'medium' | 'high' | 'critical';
  geopoliticalRisk: 'none' | 'elevated' | 'high' | 'critical';
}

// Known bulletproof or high-abuse ASNs
const BULLETPROOF_ASNS = new Set([
  49981, // WorldStream B.V. — known bulletproof hoster
  59653, // Frantech Solutions — anonymous bulletproof
  53667, // Frantech Solutions US
  206264, // Amarutu Technology Ltd
  9009, // M247 Europe — high abuse ratio
  51765, // Thundershot LLC
  40676, // Psychz Networks
  36352, // ColoCrossing — known abuse
  133229, // Contabo Asia
  14576, // Hosting Services Inc. — frequent bulletproof
  396356, // MAXIHOST LLC
]);

// Countries under OFAC sanctions or known nation-state threat actors
// Risk levels: 'critical' = OFAC sanctioned, 'high' = nation-state concern
const COUNTRY_RISK: Record<string, 'elevated' | 'high' | 'critical'> = {
  KP: 'critical', // North Korea
  IR: 'critical', // Iran
  SY: 'critical', // Syria
  CU: 'critical', // Cuba (OFAC)
  RU: 'high', // Russia (significant APT activity)
  CN: 'high', // China (APT41, APT1, etc.)
  BY: 'high', // Belarus
  VE: 'elevated', // Venezuela
  MM: 'elevated', // Myanmar (post-coup)
  NI: 'elevated', // Nicaragua
};

interface IpApiResponse {
  status?: string;
  country?: string;
  countryCode?: string;
  org?: string;
  as?: string;
  isp?: string;
  hosting?: boolean;
}

export async function lookupAsnReputation(ip: string): Promise<AsnRecord | null> {
  if (!ip || ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') return null;

  const url = `${IP_API_BASE}/${encodeURIComponent(ip)}?fields=status,country,countryCode,org,as,isp,hosting`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'xShieldAI/1.0' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as IpApiResponse;
    if (data.status !== 'success') return null;

    const asStr = data.as ?? ''; // e.g. "AS13335 Cloudflare, Inc."
    const asnMatch = /^AS(\d+)/.exec(asStr);
    const asnNumber = asnMatch ? parseInt(asnMatch[1], 10) : 0;

    const countryCode = data.countryCode ?? '';
    const geoRisk = COUNTRY_RISK[countryCode] ?? 'none';
    const isBulletproof = BULLETPROOF_ASNS.has(asnNumber);

    let riskCategory: AsnRecord['riskCategory'] = 'clean';
    if (geoRisk === 'critical' || isBulletproof) riskCategory = 'critical';
    else if (geoRisk === 'high') riskCategory = 'high';
    else if (geoRisk === 'elevated') riskCategory = 'medium';

    return {
      ip,
      asn: asStr.split(' ')[0] ?? asStr,
      asnNumber,
      org: data.org ?? '',
      isp: data.isp ?? '',
      country: data.country ?? '',
      countryCode,
      isHosting: data.hosting ?? false,
      isBulletproof,
      riskCategory,
      geopoliticalRisk: geoRisk,
    };
  } catch {
    return null;
  }
}

/**
 * Convert ASN record into RiskFactor entries.
 */
export function asnToFactors(record: AsnRecord): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (record.isBulletproof) {
    factors.push({
      category: 'malicious_ip',
      summary: `IP ${record.ip} is hosted on ${record.asn} (${record.org}) — known bulletproof hosting provider that ignores abuse complaints`,
      score: 70,
      source: 'internal',
      detail: `ASN: ${record.asn} · Country: ${record.country} (${record.countryCode})`,
    });
  }

  if (record.geopoliticalRisk === 'critical') {
    factors.push({
      category: 'geopolitical_risk',
      summary: `IP ${record.ip} is hosted in ${record.country} — under OFAC sanctions / designated state sponsor of cyberattacks`,
      score: 80,
      source: 'internal',
      detail: `ASN: ${record.asn} · Org: ${record.org}`,
    });
  } else if (record.geopoliticalRisk === 'high') {
    factors.push({
      category: 'geopolitical_risk',
      summary: `IP ${record.ip} is hosted in ${record.country} — nation-state threat actor origin country`,
      score: 50,
      source: 'internal',
      detail: `ASN: ${record.asn} · Org: ${record.org}`,
    });
  } else if (record.geopoliticalRisk === 'elevated') {
    factors.push({
      category: 'geopolitical_risk',
      summary: `IP ${record.ip} is in ${record.country} — elevated geopolitical risk region`,
      score: 25,
      source: 'internal',
      detail: `ASN: ${record.asn}`,
    });
  }

  return factors;
}
