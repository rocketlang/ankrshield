/**
 * Ransomware C2 Detector
 *
 * Checks an IP or domain against live ransomware intelligence feeds:
 *
 *   1. abuse.ch Feodo Tracker — botnet C2 IP blocklist (updated every 5 min)
 *      https://feodotracker.abuse.ch/downloads/ipblocklist.json
 *
 *   2. ThreatFox IOC API — ransomware-tagged IPs/domains/URLs from abuse.ch
 *      https://threatfox.abuse.ch/api/v1/  (POST, no auth required)
 *
 * Both sources are FREE with no API key required.
 *
 * Families tracked: LockBit, BlackCat/ALPHV, Cl0p, Play, Akira, Royal,
 * RansomHub, Black Basta, Medusa, and 100+ more tagged by community.
 */

import type { RiskFactor } from '../types.js';

const TIMEOUT_MS = 12_000;
const FEODO_URL = 'https://feodotracker.abuse.ch/downloads/ipblocklist.json';
const THREATFOX_URL = 'https://threatfox-api.abuse.ch/api/v1/';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeodoEntry {
  /** C2 server IP address */
  ip_address: string;
  /** TCP port the C2 listens on */
  port: number;
  /** Malware family name (e.g. "Dridex", "LockBit", "BlackCat") */
  malware: string;
  /** First seen date (YYYY-MM-DD HH:MM:SS UTC) */
  first_seen_utc: string;
  /** Last seen date */
  last_seen_utc: string | null;
  /** Confidence level 0–100 */
  confidence_level: number;
  /** 'Online' | 'Offline' */
  status: string;
}

export interface ThreatFoxIoc {
  id: string;
  ioc: string;
  ioc_type: 'ip:port' | 'domain' | 'url' | 'md5_hash' | 'sha1_hash' | 'sha256_hash';
  threat_type: string;
  threat_type_desc: string;
  malware: string;
  malware_printable: string;
  confidence_level: number;
  first_seen: string;
  last_seen: string | null;
  tags: string[] | null;
  reference: string | null;
}

export interface RansomwareResult {
  /** The IP or domain that was checked */
  target: string;
  /** Feodo Tracker C2 hits (exact IP match) */
  feodoHits: FeodoEntry[];
  /** ThreatFox IOC hits (IP, domain, or URL match) */
  threatFoxHits: ThreatFoxIoc[];
  /** All unique ransomware family names found */
  families: string[];
  /** Highest confidence level found (0–100) */
  maxConfidence: number;
}

// ---------------------------------------------------------------------------
// In-memory cache for Feodo blocklist (refreshed every 10 min)
// ---------------------------------------------------------------------------

let feodoCache: { data: FeodoEntry[]; fetchedAt: number } | null = null;
const FEODO_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getFeodoBlocklist(): Promise<FeodoEntry[]> {
  const now = Date.now();
  if (feodoCache && now - feodoCache.fetchedAt < FEODO_TTL_MS) {
    return feodoCache.data;
  }

  try {
    const res = await fetch(FEODO_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'xShieldAI/1.0' },
    });
    if (!res.ok) return feodoCache?.data ?? [];
    const data = (await res.json()) as FeodoEntry[];
    feodoCache = { data, fetchedAt: now };
    return data;
  } catch {
    return feodoCache?.data ?? [];
  }
}

// ---------------------------------------------------------------------------
// ThreatFox API query
// ---------------------------------------------------------------------------

async function queryThreatFox(term: string): Promise<ThreatFoxIoc[]> {
  try {
    // Search by exact value (IP or domain)
    const body = JSON.stringify({ query: 'search_ioc', search_term: term });
    const res = await fetch(THREATFOX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'xShieldAI/1.0',
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return [];
    const json = (await res.json()) as { query_status: string; data: ThreatFoxIoc[] | null };

    if (json.query_status !== 'ok' || !json.data) return [];
    return json.data;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

/**
 * Check an IP and/or domain against ransomware C2 intelligence feeds.
 *
 * Pass `serverIp` for IP-based checks and `domain` for domain-based checks.
 * At least one must be provided.
 */
export async function checkRansomwareFeeds(
  serverIp: string | null,
  domain: string
): Promise<RansomwareResult> {
  const target = serverIp ?? domain;

  // Run Feodo IP lookup + ThreatFox queries in parallel
  const [feodoList, threatFoxIpHits, threatFoxDomainHits] = await Promise.all([
    serverIp ? getFeodoBlocklist() : Promise.resolve([]),
    serverIp ? queryThreatFox(serverIp) : Promise.resolve([]),
    domain ? queryThreatFox(domain) : Promise.resolve([]),
  ]);

  // Match Feodo entries by IP
  const feodoHits = feodoList.filter((e) => e.ip_address === serverIp);

  // Merge ThreatFox hits, deduplicate by id
  const tfMap = new Map<string, ThreatFoxIoc>();
  for (const hit of [...threatFoxIpHits, ...threatFoxDomainHits]) {
    tfMap.set(hit.id, hit);
  }
  const threatFoxHits = [...tfMap.values()];

  // Extract ransomware family names
  const families = new Set<string>();
  for (const e of feodoHits) if (e.malware) families.add(e.malware);
  for (const ioc of threatFoxHits) if (ioc.malware_printable) families.add(ioc.malware_printable);

  // Max confidence
  const allConfidences = [
    ...feodoHits.map((e) => e.confidence_level),
    ...threatFoxHits.map((ioc) => ioc.confidence_level),
  ];
  const maxConfidence = allConfidences.length > 0 ? Math.max(...allConfidences) : 0;

  return {
    target,
    feodoHits,
    threatFoxHits,
    families: [...families],
    maxConfidence,
  };
}

// ---------------------------------------------------------------------------
// Convert result to RiskFactor[]
// ---------------------------------------------------------------------------

export function ransomwareToFactors(result: RansomwareResult): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (result.feodoHits.length > 0) {
    const families = result.feodoHits.map((e) => e.malware).join(', ');
    const statuses = result.feodoHits.map((e) => e.status);
    const hasOnline = statuses.includes('Online');

    factors.push({
      category: 'ransomware_c2',
      summary: `IP is a known ransomware C2 server (Feodo Tracker): ${families}`,
      score: hasOnline ? 95 : 80,
      source: 'abuse_ch',
      detail: `Families: ${families} | Status: ${statuses.join(', ')} | Confidence: ${result.maxConfidence}%`,
    });
  }

  if (result.threatFoxHits.length > 0) {
    const families = [...new Set(result.threatFoxHits.map((ioc) => ioc.malware_printable))].join(
      ', '
    );
    // Only add a separate factor if Feodo didn't already flag this IP (avoid double-scoring)
    if (result.feodoHits.length === 0) {
      factors.push({
        category: 'ransomware_c2',
        summary: `Target appears in ThreatFox ransomware IOC database: ${families}`,
        score: Math.min(40 + result.maxConfidence * 0.5, 85),
        source: 'threatfox',
        detail: `${result.threatFoxHits.length} IOC(s) | Families: ${families} | Max confidence: ${result.maxConfidence}%`,
      });
    }
  }

  return factors;
}
