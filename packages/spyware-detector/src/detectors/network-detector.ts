/**
 * NetworkIOCDetector
 *
 * Matches caller-supplied lists of recently resolved DNS names and active
 * network connection IPs against all built-in spyware IOC databases.
 *
 * Scoring rationale:
 *   Domain exact-match   → confidence 90 (very strong signal)
 *   IP prefix match      → confidence 75 (moderate; prefixes are broader)
 */

import { randomUUID } from 'crypto';
import type { SpywareIndicator } from '../types.js';
import { PEGASUS_DOMAINS, PEGASUS_IP_PREFIXES } from '../iocs/pegasus-iocs.js';
import {
  CANDIRU_DOMAINS,
  PREDATOR_DOMAINS,
  FINFISHER_DOMAINS,
} from '../iocs/other-spyware-iocs.js';

// ---------------------------------------------------------------------------
// Internal lookup structures built once at module load time
// ---------------------------------------------------------------------------

interface DomainEntry {
  domain: string;
  family: 'pegasus' | 'candiru' | 'predator' | 'finfisher';
  description: string;
}

interface IpPrefixEntry {
  prefix: string;
  family: 'pegasus';
  description: string;
}

const DOMAIN_ENTRIES: DomainEntry[] = [
  ...PEGASUS_DOMAINS.map((domain) => ({
    domain,
    family: 'pegasus' as const,
    description: `Pegasus C2/delivery domain documented by Amnesty International and Citizen Lab`,
  })),
  ...CANDIRU_DOMAINS.map((domain) => ({
    domain,
    family: 'candiru' as const,
    description: `Candiru (DevilsTongue) infrastructure domain documented by Citizen Lab`,
  })),
  ...PREDATOR_DOMAINS.map((domain) => ({
    domain,
    family: 'predator' as const,
    description: `Predator (Intellexa) C2 domain documented by Citizen Lab and Google TAG`,
  })),
  ...FINFISHER_DOMAINS.map((domain) => ({
    domain,
    family: 'finfisher' as const,
    description: `FinFisher/FinSpy infrastructure domain documented by Citizen Lab`,
  })),
];

const IP_PREFIX_ENTRIES: IpPrefixEntry[] = PEGASUS_IP_PREFIXES.map((prefix) => ({
  prefix,
  family: 'pegasus' as const,
  description: `IP address falls within a hosting range associated with NSO Group infrastructure (public research)`,
}));

// ---------------------------------------------------------------------------
// Detector class
// ---------------------------------------------------------------------------

export class NetworkIOCDetector {
  /**
   * Optional extra IOC strings provided by the caller (domains or IP prefixes).
   * These are matched as plain string prefix/equality checks.
   */
  private readonly customIocs: string[];

  constructor(customIocs: string[] = []) {
    this.customIocs = customIocs.map((s) => s.toLowerCase().trim());
  }

  /**
   * Scan caller-supplied domains and IPs against the built-in IOC database
   * plus any custom IOCs provided at construction time.
   *
   * @param domains  Hostnames recently queried or connected to (case-insensitive).
   * @param ips      IPv4/IPv6 addresses recently used for outbound connections.
   * @returns        Array of matched SpywareIndicator objects (may be empty).
   */
  scan(domains: string[], ips: string[]): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];

    const normDomains = domains.map((d) => d.toLowerCase().trim());
    const normIPs = ips.map((ip) => ip.trim());

    // --- Domain matching (exact) ---
    for (const entry of DOMAIN_ENTRIES) {
      for (const queried of normDomains) {
        if (queried === entry.domain || queried.endsWith(`.${entry.domain}`)) {
          indicators.push({
            id: randomUUID(),
            family: entry.family,
            type: 'network_ioc',
            value: queried,
            description: entry.description,
            confidence: 90,
          });
          // One indicator per matched IOC value — avoid duplicates for same domain
          break;
        }
      }
    }

    // --- DNS query matching (same domain set, tagged as dns_query) ---
    // Already covered above via network_ioc; DNS-specific tagging happens
    // in the scanner layer when enableDnsScan is true.

    // --- IP prefix matching ---
    for (const entry of IP_PREFIX_ENTRIES) {
      for (const ip of normIPs) {
        if (ip.startsWith(entry.prefix)) {
          indicators.push({
            id: randomUUID(),
            family: entry.family,
            type: 'network_ioc',
            value: ip,
            description: entry.description,
            confidence: 75,
          });
          break;
        }
      }
    }

    // --- Custom IOC matching (prefix or exact) ---
    for (const customIoc of this.customIocs) {
      for (const queried of normDomains) {
        if (queried === customIoc || queried.endsWith(`.${customIoc}`)) {
          indicators.push({
            id: randomUUID(),
            family: 'unknown',
            type: 'network_ioc',
            value: queried,
            description: `Matched custom IOC: ${customIoc}`,
            confidence: 80,
          });
        }
      }
      for (const ip of normIPs) {
        if (ip.startsWith(customIoc) || ip === customIoc) {
          indicators.push({
            id: randomUUID(),
            family: 'unknown',
            type: 'network_ioc',
            value: ip,
            description: `Matched custom IOC prefix/IP: ${customIoc}`,
            confidence: 70,
          });
        }
      }
    }

    return indicators;
  }
}
