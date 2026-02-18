/**
 * AlienVault OTX Scanner — IP & Domain Reputation
 *
 * Uses the AlienVault Open Threat Exchange (OTX) API to check:
 *   - IP reputation: pulse count, threat score, malware families, country
 *   - Domain reputation: pulse count, malicious verdict, threat types
 *
 * Requires: OTX_API_KEY environment variable (free at otx.alienvault.com)
 * Endpoint:
 *   GET https://otx.alienvault.com/api/v1/indicators/IPv4/{ip}/general
 *   GET https://otx.alienvault.com/api/v1/indicators/domain/{domain}/general
 *
 * OTX has 19M+ threat indicators from 100K+ global contributors.
 * Free account gives full API access.
 */

import type { RiskFactor } from '../types.js';

const OTX_BASE = 'https://otx.alienvault.com/api/v1/indicators';
const TIMEOUT_MS = 12_000;

export interface OtxResult {
  /** IP or domain that was checked */
  indicator: string;
  /** Number of OTX pulses that reference this indicator */
  pulseCount: number;
  /** Threat score 0–10 (derived from pulse count + malicious flag) */
  threatScore: number;
  /** True when OTX considers this indicator actively malicious */
  malicious: boolean;
  /** Threat types mentioned in pulses (e.g. 'Malware', 'C2', 'Botnet') */
  threatTypes: string[];
  /** Malware families associated (e.g. 'Emotet', 'Lazarus') */
  malwareFamilies: string[];
  /** Country of the IP (if applicable) */
  country: string | null;
}

interface OtxGeneralResponse {
  pulse_info?: {
    count?: number;
    pulses?: Array<{
      tags?: string[];
      malware_families?: Array<{ display_name?: string }>;
      threat_type?: string;
      targeted_countries?: string[];
    }>;
  };
  validation?: Array<{ indicator?: string; message?: string }>;
  base_indicator?: {
    is_active?: number;
    country_code?: string;
  };
  sections?: string[];
}

async function fetchOtxGeneral(
  type: 'IPv4' | 'domain',
  indicator: string,
  apiKey: string
): Promise<OtxResult | null> {
  const url = `${OTX_BASE}/${type}/${encodeURIComponent(indicator)}/general`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'X-OTX-API-KEY': apiKey,
        Accept: 'application/json',
        'User-Agent': 'xShieldAI/1.0',
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as OtxGeneralResponse;
    const pulses = data.pulse_info?.pulses ?? [];
    const pulseCount = data.pulse_info?.count ?? 0;

    // Collect threat types and malware families from all pulses
    const threatTypeSet = new Set<string>();
    const malwareSet = new Set<string>();

    for (const pulse of pulses) {
      if (pulse.threat_type) threatTypeSet.add(pulse.threat_type);
      for (const mf of pulse.malware_families ?? []) {
        if (mf.display_name) malwareSet.add(mf.display_name);
      }
    }

    const malicious = pulseCount > 3 || (data.base_indicator?.is_active ?? 0) === 1;
    // Threat score: 0–10, capped
    const threatScore = Math.min(Math.round(Math.log2(pulseCount + 1) * 2), 10);

    return {
      indicator,
      pulseCount,
      threatScore,
      malicious,
      threatTypes: [...threatTypeSet].slice(0, 10),
      malwareFamilies: [...malwareSet].slice(0, 10),
      country: data.base_indicator?.country_code ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Check an IP address against OTX.
 * Returns null if OTX_API_KEY is not set or request fails.
 */
export async function scanIpWithOtx(ip: string, apiKey?: string): Promise<OtxResult | null> {
  const key = apiKey ?? process.env['OTX_API_KEY'];
  if (!key) return null;
  if (!ip || ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') return null;
  return fetchOtxGeneral('IPv4', ip, key);
}

/**
 * Check a domain against OTX.
 * Returns null if OTX_API_KEY is not set or request fails.
 */
export async function scanDomainWithOtx(
  domain: string,
  apiKey?: string
): Promise<OtxResult | null> {
  const key = apiKey ?? process.env['OTX_API_KEY'];
  if (!key) return null;
  return fetchOtxGeneral('domain', domain, key);
}

/**
 * Convert OTX results into RiskFactor entries.
 */
export function otxToFactors(result: OtxResult, label: 'IP' | 'domain'): RiskFactor[] {
  if (result.pulseCount === 0) return [];

  const factors: RiskFactor[] = [];

  if (result.malicious || result.pulseCount > 3) {
    factors.push({
      category: 'malicious_ip',
      summary: `${label} ${result.indicator} referenced in ${result.pulseCount} OTX threat intelligence pulse(s)${result.malwareFamilies.length ? ` — families: ${result.malwareFamilies.slice(0, 3).join(', ')}` : ''}`,
      score: Math.min(20 + result.pulseCount * 5, 80),
      source: 'greynoise', // maps to existing source type; OTX is threat intel
      detail: `Pulse count: ${result.pulseCount} · Threat score: ${result.threatScore}/10 · Types: ${result.threatTypes.slice(0, 3).join(', ') || 'N/A'}`,
    });
  } else if (result.pulseCount > 0) {
    factors.push({
      category: 'scanner_activity',
      summary: `${label} ${result.indicator} appears in ${result.pulseCount} OTX pulse(s) — low confidence`,
      score: result.pulseCount * 8,
      source: 'greynoise',
      detail: `OTX pulses: ${result.pulseCount}`,
    });
  }

  return factors;
}
