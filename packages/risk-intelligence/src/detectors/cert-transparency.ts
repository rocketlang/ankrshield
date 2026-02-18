/**
 * Certificate Transparency Monitor — crt.sh
 *
 * Uses the FREE crt.sh Certificate Transparency log search API to find
 * SSL/TLS certificates issued for domains that look like your brand.
 *
 * Why this matters: attackers register typosquat domains and immediately
 * get a Let's Encrypt cert — crt.sh indexes these within minutes of issuance.
 * This gives us near-real-time phishing domain detection independent of
 * urlscan.io (which only catches domains that have been scanned).
 *
 * Endpoint: GET https://crt.sh/?q=%.example.com&output=json
 * Docs:     https://crt.sh (no auth required, completely free)
 *
 * Strategy:
 *   1. Search for all certs issued containing the domain name (wildcard match)
 *   2. Filter to certs issued in the last 30 days
 *   3. Flag certs for domains that are NOT the legitimate domain
 *      (these are likely typosquats or phishing domains)
 */

import type { RiskFactor } from '../types.js';

const CRTSH_BASE = 'https://crt.sh';
const TIMEOUT_MS = 15_000;
const LOOKBACK_DAYS = 30;

export interface CertRecord {
  /** The domain name in the certificate */
  commonName: string;
  /** Certificate issuer (usually Let's Encrypt for phishing sites) */
  issuer: string;
  /** When the cert was logged to CT */
  loggedAt: string;
  /** Certificate serial number */
  serialNumber: string;
  /** Whether this cert is for the legitimate domain (false = suspicious) */
  isLegitimate: boolean;
}

interface CrtShEntry {
  id?: number;
  logged_at?: string;
  not_before?: string;
  not_after?: string;
  common_name?: string;
  issuer_name?: string;
  name_value?: string;
  serial_number?: string;
}

/**
 * Search crt.sh for certificates that contain the domain name.
 * Returns certs for lookalike domains issued in the last 30 days.
 */
export async function monitorCertTransparency(domain: string): Promise<CertRecord[]> {
  // Strip www and extract base domain
  const base = domain.toLowerCase().replace(/^www\./, '');
  const parts = base.split('.');
  const name = parts.slice(0, -1).join('.'); // e.g. 'xshieldai' from 'xshieldai.com'

  if (!name) return [];

  // Search for all certs containing the base name
  const url = `${CRTSH_BASE}/?q=%25${encodeURIComponent(name)}%25&output=json`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'xShieldAI/1.0 (https://xshieldai.com)',
      },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as CrtShEntry[];
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);
    const seen = new Set<string>();
    const records: CertRecord[] = [];

    for (const entry of data) {
      const loggedAt = entry.logged_at ?? entry.not_before ?? '';
      if (!loggedAt) continue;
      if (new Date(loggedAt) < cutoff) continue;

      // crt.sh returns each SAN separately in name_value
      const names = (entry.name_value ?? entry.common_name ?? '')
        .split(/\n/)
        .map((n) => n.trim().toLowerCase().replace(/^\*\./, ''));

      for (const cn of names) {
        if (!cn || seen.has(cn)) continue;
        seen.add(cn);

        // Skip wildcards and the legitimate domain itself
        if (cn === base || cn === `www.${base}`) continue;

        // Only flag domains that contain our brand name (not just any cert)
        if (!cn.includes(name)) continue;

        records.push({
          commonName: cn,
          issuer: extractIssuerCN(entry.issuer_name ?? ''),
          loggedAt,
          serialNumber: entry.serial_number ?? '',
          isLegitimate: false,
        });
      }
    }

    // Sort newest first, cap at 20
    return records
      .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())
      .slice(0, 20);
  } catch {
    return [];
  }
}

function extractIssuerCN(issuerName: string): string {
  const match = /CN=([^,]+)/.exec(issuerName);
  return match?.[1]?.trim() ?? issuerName.slice(0, 50);
}

/**
 * Convert cert records into RiskFactor entries.
 */
export function certRecordsToFactors(records: CertRecord[], domain: string): RiskFactor[] {
  if (records.length === 0) return [];

  // Separate Let's Encrypt (likely phishing — free and instant) from paid CAs
  const leCount = records.filter(
    (r) =>
      r.issuer.toLowerCase().includes("let's encrypt") ||
      r.issuer.toLowerCase().includes('r3') ||
      r.issuer.toLowerCase().includes('e1')
  ).length;

  const score = Math.min(20 + records.length * 8 + leCount * 5, 70);

  return [
    {
      category: 'phishing_domain',
      summary: `${records.length} lookalike SSL cert(s) for domains resembling ${domain} issued in the last ${LOOKBACK_DAYS} days (${leCount} via Let's Encrypt)`,
      score,
      source: 'urlscan',
      detail: records
        .slice(0, 5)
        .map((r) => `${r.commonName} (${r.issuer}, ${r.loggedAt.slice(0, 10)})`)
        .join(' · '),
    },
  ];
}
