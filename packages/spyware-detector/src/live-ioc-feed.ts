/**
 * Live IOC Feed — Real-time threat intelligence from public APIs
 *
 * Fetches fresh IOCs from free, publicly available threat intelligence
 * services. These are REAL threat databases — not static lists.
 *
 * Sources:
 *   ThreatFox (abuse.ch) — https://threatfox.abuse.ch/api/
 *     Free API. No authentication required for basic queries.
 *     Covers: botnet C2, APT malware, ransomware, RATs.
 *     Updated continuously by global community + automated systems.
 *
 *   Feodo Tracker (abuse.ch) — https://feodotracker.abuse.ch/
 *     Botnet C2 server blocklist. Updated every 5 minutes.
 *     Covers: Emotet, TrickBot, Dridex, QakBot, BazarLoader, IcedID.
 *
 *   URLhaus (abuse.ch) — https://urlhaus-api.abuse.ch/
 *     Malware distribution URL feed.
 *
 *   CISA KEV — https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
 *     US government list of known exploited vulnerabilities.
 *     Updated when CISA adds new actively exploited CVEs.
 *
 * Results are cached in memory with a configurable TTL (default: 4 hours)
 * to avoid hitting rate limits on repeated scans.
 */

import { randomUUID } from 'crypto';

import type { SpywareIndicator } from './types.js';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  domains: Set<string>;
  ips: Set<string>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

let cache: CacheEntry | null = null;

// ---------------------------------------------------------------------------
// ThreatFox IOC tags that indicate APT activity
// ---------------------------------------------------------------------------

const APT_TAGS = new Set([
  'lazarus',
  'apt',
  'apt41',
  'apt28',
  'apt29',
  'apt33',
  'apt38',
  'sandworm',
  'turla',
  'kimsuky',
  'cozyb ear',
  'lazarusg roup',
  'darkside',
  'ryuk',
  'conti',
  'lockbit',
  'bpfdoor',
  'symbiote',
  'sideload',
  'tradertrait or',
  'applejeus',
]);

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ThreatFox — APT C2 IOCs
// ---------------------------------------------------------------------------

interface ThreatFoxIoc {
  ioc_type: string; // 'domain', 'ip:port', 'url', 'md5_hash', 'sha256_hash'
  ioc_value: string;
  malware: string;
  tags: string[] | null;
  confidence_level: number; // 0-100
  first_seen: string;
  last_seen: string;
}

interface ThreatFoxResponse {
  query_status: string;
  data: ThreatFoxIoc[];
}

async function fetchThreatFoxAptIocs(): Promise<{ domains: string[]; ips: string[] }> {
  const result = { domains: [] as string[], ips: [] as string[] };

  // Query recent IOCs (last 7 days) — free, no auth required
  const body = JSON.stringify({ query: 'get_iocs', days: 7 });
  const data = await fetchJson<ThreatFoxResponse>('https://threatfox-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!data || data.query_status !== 'ok' || !Array.isArray(data.data)) return result;

  for (const ioc of data.data) {
    // Filter to high-confidence APT-relevant IOCs
    if (ioc.confidence_level < 50) continue;
    const tags = (ioc.tags ?? []).map((t) => t.toLowerCase());
    const isApt = tags.some((t) => APT_TAGS.has(t));
    if (!isApt) continue;

    if (ioc.ioc_type === 'domain') {
      result.domains.push(ioc.ioc_value.toLowerCase().trim());
    } else if (ioc.ioc_type === 'ip:port') {
      // Extract just the IP
      const ip = ioc.ioc_value.split(':')[0];
      if (ip) result.ips.push(ip.trim());
    } else if (ioc.ioc_type === 'url') {
      try {
        const u = new URL(ioc.ioc_value);
        result.domains.push(u.hostname.toLowerCase());
      } catch {
        /* skip malformed URLs */
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Feodo Tracker — botnet C2 blocklist (includes Lazarus-linked infra)
// ---------------------------------------------------------------------------

interface FeodoEntry {
  ip_address: string;
  port: number;
  status: string; // 'online' | 'offline'
  malware: string;
  first_seen: string;
  last_online: string | null;
}

async function fetchFeodoTrackerIps(): Promise<string[]> {
  const data = await fetchJson<FeodoEntry[]>(
    'https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json'
  );
  if (!Array.isArray(data)) return [];

  return data
    .filter((e) => e.status === 'online')
    .map((e) => e.ip_address.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// CISA KEV — Known Exploited Vulnerabilities (for CVE scan enrichment)
// ---------------------------------------------------------------------------

interface CisaKevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  notes: string;
}

interface CisaKevFeed {
  vulnerabilities: CisaKevEntry[];
}

let kevCache: Set<string> | null = null;
let kevFetchedAt = 0;

export async function getActivelyExploitedCves(): Promise<Set<string>> {
  const now = Date.now();
  if (kevCache && now - kevFetchedAt < CACHE_TTL_MS) return kevCache;

  const data = await fetchJson<CisaKevFeed>(
    'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
  );

  if (!data?.vulnerabilities) {
    return kevCache ?? new Set();
  }

  kevCache = new Set(data.vulnerabilities.map((v) => v.cveID));
  kevFetchedAt = now;
  return kevCache;
}

// ---------------------------------------------------------------------------
// Main live IOC fetch function (cached)
// ---------------------------------------------------------------------------

async function fetchLiveIocs(): Promise<CacheEntry> {
  const [threatFox, feodoIps] = await Promise.allSettled([
    fetchThreatFoxAptIocs(),
    fetchFeodoTrackerIps(),
  ]);

  const domains = new Set<string>();
  const ips = new Set<string>();

  if (threatFox.status === 'fulfilled') {
    for (const d of threatFox.value.domains) domains.add(d);
    for (const ip of threatFox.value.ips) ips.add(ip);
  }

  if (feodoIps.status === 'fulfilled') {
    for (const ip of feodoIps.value) ips.add(ip);
  }

  return { domains, ips, fetchedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Exported detector
// ---------------------------------------------------------------------------

/**
 * LiveIocDetector — matches domains and IPs against fresh threat feeds.
 *
 * On first call, fetches from ThreatFox and Feodo Tracker.
 * Subsequent calls within the TTL window use the cached result.
 */
export class LiveIocDetector {
  /**
   * Fetch live IOCs and match against caller-supplied domains and IPs.
   *
   * @param domains  Recently resolved/connected hostnames.
   * @param ips      Recently used outbound IP addresses.
   */
  async scan(domains: string[], ips: string[]): Promise<SpywareIndicator[]> {
    const now = Date.now();

    // Refresh cache if stale or empty
    if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
      cache = await fetchLiveIocs();
    }

    const indicators: SpywareIndicator[] = [];
    const normDomains = domains.map((d) => d.toLowerCase().trim());
    const normIPs = ips.map((ip) => ip.trim());

    // Domain matching
    for (const d of normDomains) {
      if (cache.domains.has(d)) {
        indicators.push({
          id: randomUUID(),
          family: 'unknown',
          type: 'network_ioc',
          value: d,
          description: `Domain matched live threat feed (ThreatFox/abuse.ch APT IOC — fetched within last 4 hours). High confidence active C2 infrastructure.`,
          confidence: 85,
        });
      }
    }

    // IP matching (exact)
    for (const ip of normIPs) {
      if (cache.ips.has(ip)) {
        indicators.push({
          id: randomUUID(),
          family: 'unknown',
          type: 'network_ioc',
          value: ip,
          description: `IP address matched live botnet C2 blocklist (Feodo Tracker / ThreatFox — fetched within last 4 hours). Active C2 server.`,
          confidence: 82,
        });
      }
    }

    return indicators;
  }

  /** Return the age of the current live IOC cache, in milliseconds. */
  getCacheAge(): number {
    return cache ? Date.now() - cache.fetchedAt : Infinity;
  }

  /** Force-invalidate the cache so the next scan fetches fresh data. */
  invalidateCache(): void {
    cache = null;
  }

  /** Return the number of live IOC entries currently in cache. */
  getCacheStats(): { domains: number; ips: number; ageMs: number } {
    return {
      domains: cache?.domains.size ?? 0,
      ips: cache?.ips.size ?? 0,
      ageMs: cache ? Date.now() - cache.fetchedAt : -1,
    };
  }
}
