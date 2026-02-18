/**
 * Shodan Attack Surface Scanner
 *
 * Uses the Shodan Host API to enumerate publicly exposed ports, services,
 * and known CVEs on a given IP address.
 *
 * Requires: SHODAN_API_KEY environment variable (free account at shodan.io).
 * Endpoint:  GET https://api.shodan.io/shodan/host/{ip}?key={apiKey}
 * Docs:      https://developer.shodan.io/api
 *
 * Free Shodan account: 1 credit per lookup, 100 credits/month.
 * If SHODAN_API_KEY is not set, this module returns empty results silently.
 */

import type { ExposedService, RiskFactor } from '../types.js';

const SHODAN_BASE = 'https://api.shodan.io/shodan/host';
const TIMEOUT_MS = 15_000;

// Ports commonly left exposed by mistake — higher risk weight
const HIGH_RISK_PORTS = new Set([22, 23, 3389, 5900, 5901, 6379, 27017, 11211, 9200, 8086]);
// Ports that are expected on a web server — lower weight
const LOW_RISK_PORTS = new Set([80, 443, 8080, 8443]);

interface ShodanVuln {
  cvss?: number;
  summary?: string;
}

interface ShodanServiceData {
  port: number;
  transport?: string;
  product?: string;
  version?: string;
  vulns?: Record<string, ShodanVuln>;
}

interface ShodanHostResponse {
  ip_str?: string;
  data?: ShodanServiceData[];
  ports?: number[];
  os?: string;
  org?: string;
  hostnames?: string[];
}

/**
 * Look up a server IP via Shodan.
 * Returns { services, rawPorts } or null when the key is missing / request fails.
 */
export async function scanIpWithShodan(
  ip: string,
  apiKey?: string
): Promise<{ services: ExposedService[]; rawPorts: number[] } | null> {
  const key = apiKey ?? process.env['SHODAN_API_KEY'];
  if (!key) return null;

  const url = `${SHODAN_BASE}/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': 'xShieldAI/1.0' },
    });

    if (res.status === 404) return { services: [], rawPorts: [] }; // IP not in Shodan
    if (!res.ok) return null;

    const data = (await res.json()) as ShodanHostResponse;

    const services: ExposedService[] = (data.data ?? []).map((svc) => ({
      port: svc.port,
      protocol: (svc.transport === 'udp' ? 'udp' : 'tcp') as 'tcp' | 'udp',
      product: svc.product ?? '',
      version: svc.version ?? '',
      cves: svc.vulns ? Object.keys(svc.vulns) : [],
    }));

    const rawPorts = data.ports ?? services.map((s) => s.port);

    return { services, rawPorts };
  } catch {
    return null;
  }
}

/**
 * Convert Shodan findings into RiskFactor entries.
 */
export function shodanToFactors(services: ExposedService[], rawPorts: number[]): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const allCves: string[] = [];

  if (rawPorts.length > 0) {
    factors.push({
      category: 'shodan_indexed',
      summary: `Server indexed by Shodan with ${rawPorts.length} open port(s): ${rawPorts.slice(0, 8).join(', ')}${rawPorts.length > 8 ? '…' : ''}`,
      score: Math.min(20 + rawPorts.length * 2, 40),
      source: 'shodan',
      detail: rawPorts.join(', '),
    });
  }

  for (const svc of services) {
    const isHighRisk = HIGH_RISK_PORTS.has(svc.port);
    const isLowRisk = LOW_RISK_PORTS.has(svc.port);

    if (isHighRisk) {
      factors.push({
        category: 'exposed_service',
        summary: `High-risk port ${svc.port}/${svc.protocol} exposed publicly${svc.product ? ` (${svc.product} ${svc.version})`.trim() : ''}`,
        score: 35,
        source: 'shodan',
        detail: `Port ${svc.port}`,
      });
    } else if (!isLowRisk) {
      factors.push({
        category: 'open_port',
        summary: `Unusual port ${svc.port}/${svc.protocol} exposed${svc.product ? ` (${svc.product})` : ''}`,
        score: 15,
        source: 'shodan',
        detail: `Port ${svc.port}`,
      });
    }

    allCves.push(...svc.cves);
  }

  if (allCves.length > 0) {
    const unique = [...new Set(allCves)];
    factors.push({
      category: 'outdated_software',
      summary: `Shodan found ${unique.length} known CVE(s) on exposed services: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '…' : ''}`,
      score: Math.min(30 + unique.length * 5, 70),
      source: 'shodan',
      detail: unique.join(', '),
    });
  }

  return factors;
}
