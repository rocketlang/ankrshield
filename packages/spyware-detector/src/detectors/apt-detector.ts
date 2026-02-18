/**
 * AptC2Detector
 *
 * Matches caller-supplied lists of recently resolved DNS names and active
 * network connection IPs against the built-in APT group C2 infrastructure
 * IOC database.
 *
 * Covers: Lazarus Group, APT41, Sandworm, Turla, APT28, APT33, Kimsuky.
 *
 * All IOCs sourced from public government advisories (CISA, FBI, NSA, DOJ)
 * and major security vendor public research reports.
 *
 * Confidence scoring:
 *   Domain exact-match  → 88  (high signal; APT infra rotates faster than
 *                               commercial spyware so slightly lower than 90)
 *   IP prefix match     → 72  (moderate; shared hosting is common)
 */

import { randomUUID } from 'crypto';

import {
  LAZARUS_DOMAINS,
  LAZARUS_IP_PREFIXES,
  APT41_DOMAINS,
  APT41_IP_PREFIXES,
  SANDWORM_DOMAINS,
  SANDWORM_IP_PREFIXES,
  TURLA_DOMAINS,
  TURLA_IP_PREFIXES,
  APT28_DOMAINS,
  APT28_IP_PREFIXES,
  APT33_DOMAINS,
  APT33_IP_PREFIXES,
  KIMSUKY_DOMAINS,
  KIMSUKY_IP_PREFIXES,
} from '../iocs/apt-iocs.js';
import type { SpywareIndicator, SpywareFamily } from '../types.js';

// ---------------------------------------------------------------------------
// Internal lookup types
// ---------------------------------------------------------------------------

interface AptDomainEntry {
  domain: string;
  family: SpywareFamily;
  description: string;
}

interface AptIpPrefixEntry {
  prefix: string;
  family: SpywareFamily;
  description: string;
}

// ---------------------------------------------------------------------------
// Build lookup tables at module load time
// ---------------------------------------------------------------------------

const DOMAIN_ENTRIES: AptDomainEntry[] = [
  ...LAZARUS_DOMAINS.map((d) => ({
    domain: d,
    family: 'lazarus' as const,
    description: `Lazarus Group (DPRK/RGB) C2 or delivery domain — CISA AA21-048A / AA22-108A / ESET / Kaspersky GReAT`,
  })),
  ...APT41_DOMAINS.map((d) => ({
    domain: d,
    family: 'apt41' as const,
    description: `APT41 (Double Dragon / Winnti, China/MSS) C2 domain — DOJ 2020 indictment / Mandiant research`,
  })),
  ...SANDWORM_DOMAINS.map((d) => ({
    domain: d,
    family: 'sandworm' as const,
    description: `Sandworm (APT44, Russia/GRU) staging domain — CISA AA22-110A / UK NCSC advisory`,
  })),
  ...TURLA_DOMAINS.map((d) => ({
    domain: d,
    family: 'turla' as const,
    description: `Turla (Snake/Uroburos, Russia/FSB) C2 or watering-hole domain — ESET / Kaspersky / CISA research`,
  })),
  ...APT28_DOMAINS.map((d) => ({
    domain: d,
    family: 'apt28' as const,
    description: `APT28 (Fancy Bear / Sofacy, Russia/GRU) infrastructure domain — Microsoft DCU seizure / CISA advisory`,
  })),
  ...APT33_DOMAINS.map((d) => ({
    domain: d,
    family: 'apt33' as const,
    description: `APT33 (Elfin / Refined Kitten, Iran/IRGC) C2 domain — Mandiant APT33 public report (Sept 2017)`,
  })),
  ...KIMSUKY_DOMAINS.map((d) => ({
    domain: d,
    family: 'kimsuky' as const,
    description: `Kimsuky (Thallium / Black Banshee, DPRK) phishing or C2 domain — US-CERT AA20-301A / KISA advisory`,
  })),
];

const IP_PREFIX_ENTRIES: AptIpPrefixEntry[] = [
  ...LAZARUS_IP_PREFIXES.map((p) => ({
    prefix: p,
    family: 'lazarus' as const,
    description: `IP in hosting range associated with Lazarus Group (DPRK) infrastructure — public threat intelligence`,
  })),
  ...APT41_IP_PREFIXES.map((p) => ({
    prefix: p,
    family: 'apt41' as const,
    description: `IP in hosting range associated with APT41 (China/MSS) C2 infrastructure`,
  })),
  ...SANDWORM_IP_PREFIXES.map((p) => ({
    prefix: p,
    family: 'sandworm' as const,
    description: `IP in Cyclops Blink / Sandworm C2 range — CISA AA22-110A / UK NCSC advisory`,
  })),
  ...TURLA_IP_PREFIXES.map((p) => ({
    prefix: p,
    family: 'turla' as const,
    description: `IP in hosting range associated with Turla (Russia/FSB) egress infrastructure`,
  })),
  ...APT28_IP_PREFIXES.map((p) => ({
    prefix: p,
    family: 'apt28' as const,
    description: `IP in range associated with APT28 (Russia/GRU) attack infrastructure`,
  })),
  ...APT33_IP_PREFIXES.map((p) => ({
    prefix: p,
    family: 'apt33' as const,
    description: `IP in hosting range associated with APT33 (Iran/IRGC) C2 infrastructure`,
  })),
  ...KIMSUKY_IP_PREFIXES.map((p) => ({
    prefix: p,
    family: 'kimsuky' as const,
    description: `IP in range associated with Kimsuky (DPRK) attack infrastructure`,
  })),
];

// ---------------------------------------------------------------------------
// Detector class
// ---------------------------------------------------------------------------

export class AptC2Detector {
  /**
   * Scan caller-supplied domains and IPs against the APT C2 IOC database.
   *
   * @param domains  Hostnames recently queried or connected to (case-insensitive).
   * @param ips      IPv4 addresses recently used for outbound connections.
   * @returns        Array of matched SpywareIndicator objects (may be empty).
   */
  scan(domains: string[], ips: string[]): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];
    const normDomains = domains.map((d) => d.toLowerCase().trim());
    const normIPs = ips.map((ip) => ip.trim());

    // --- Domain matching (exact + subdomain) ---
    for (const entry of DOMAIN_ENTRIES) {
      for (const queried of normDomains) {
        if (queried === entry.domain || queried.endsWith(`.${entry.domain}`)) {
          indicators.push({
            id: randomUUID(),
            family: entry.family,
            type: 'network_ioc',
            value: queried,
            description: entry.description,
            confidence: 88,
          });
          break; // one indicator per IOC entry
        }
      }
    }

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
            confidence: 72,
          });
          break;
        }
      }
    }

    return indicators;
  }
}
