/**
 * Paste Site Monitor
 *
 * Searches public paste aggregators for mentions of your domain or email,
 * which can indicate data leaks, credential dumps, or attacker reconnaissance.
 *
 * Sources (all free, no auth):
 *   - psbdmp.ws  — aggregates pastebin, ghostbin, hastebin, etc.
 *     GET https://psbdmp.ws/api/v3/search/{query}
 *   - IntelX search is a paid service — we skip it
 *
 * Signals:
 *   - Domain mention in a paste → possible data leak or recon
 *   - "@domain.com" pattern     → credential dump (emails)
 *   - API keys / passwords      → sensitive data exposure
 */

import type { RiskFactor } from '../types.js';

const PSBDMP_BASE = 'https://psbdmp.ws/api/v3/search';
const TIMEOUT_MS = 12_000;

export interface PasteHit {
  /** Unique paste ID */
  id: string;
  /** Paste title if available */
  title: string;
  /** Snippet of matching content */
  snippet: string;
  /** When the paste was created */
  date: string;
  /** Source site (e.g. 'pastebin.com') */
  site: string;
  /** Full URL to the paste */
  url: string;
  /** Detected data category */
  category: 'credentials' | 'api_keys' | 'domain_mention' | 'email_dump';
}

interface PsbdmpEntry {
  id?: string;
  title?: string;
  text?: string;
  time?: string;
  tags?: string[];
}

interface PsbdmpResponse {
  count?: number;
  data?: PsbdmpEntry[];
}

const CREDENTIAL_PATTERNS = [
  /password[:\s]+\S+/i,
  /passwd[:\s]+\S+/i,
  /pwd[:\s]+\S+/i,
  /secret[:\s]+\S+/i,
];

const API_KEY_PATTERNS = [
  /api[_-]?key[:\s]+[A-Za-z0-9_-]{16,}/i,
  /authorization[:\s]+bearer\s+\S+/i,
  /token[:\s]+[A-Za-z0-9_-]{20,}/i,
];

function categorizePaste(text: string, domain: string): PasteHit['category'] {
  const hasCredentials = CREDENTIAL_PATTERNS.some((p) => p.test(text));
  const hasApiKeys = API_KEY_PATTERNS.some((p) => p.test(text));
  const hasEmails = new RegExp(`@${domain.replace('.', '\\.')}`, 'i').test(text);

  if (hasCredentials || hasEmails) return 'credentials';
  if (hasApiKeys) return 'api_keys';
  if (hasEmails) return 'email_dump';
  return 'domain_mention';
}

/**
 * Search paste aggregators for mentions of the given domain.
 * Returns an array of PasteHit objects (empty = no hits found).
 */
export async function searchPastes(domain: string): Promise<PasteHit[]> {
  const hits: PasteHit[] = [];

  // Search for domain mentions
  for (const query of [domain, `@${domain}`]) {
    try {
      const url = `${PSBDMP_BASE}/${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'xShieldAI/1.0 (https://xshieldai.com)',
        },
      });

      if (!res.ok) continue;

      const data = (await res.json()) as PsbdmpResponse;
      const entries = data.data ?? [];

      for (const entry of entries.slice(0, 10)) {
        if (!entry.id) continue;

        const text = entry.text ?? '';
        const snippet = text.slice(0, 200).replace(/\s+/g, ' ');

        hits.push({
          id: entry.id,
          title: entry.title ?? 'Untitled paste',
          snippet,
          date: entry.time ?? '',
          site: 'pastebin.com',
          url: `https://psbdmp.ws/view/${entry.id}`,
          category: categorizePaste(text, domain),
        });
      }
    } catch {
      continue;
    }
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
}

/**
 * Convert paste hits into RiskFactor entries.
 */
export function pasteHitsToFactors(hits: PasteHit[], domain: string): RiskFactor[] {
  if (hits.length === 0) return [];

  const credHits = hits.filter((h) => h.category === 'credentials' || h.category === 'email_dump');
  const keyHits = hits.filter((h) => h.category === 'api_keys');
  const factors: RiskFactor[] = [];

  if (credHits.length > 0) {
    factors.push({
      category: 'known_breach',
      summary: `${credHits.length} paste(s) containing possible credentials for ${domain} found on public paste sites`,
      score: Math.min(30 + credHits.length * 15, 80),
      source: 'hibp',
      detail: `Paste IDs: ${credHits
        .slice(0, 3)
        .map((h) => h.id)
        .join(', ')}`,
    });
  }

  if (keyHits.length > 0) {
    factors.push({
      category: 'known_breach',
      summary: `${keyHits.length} paste(s) with possible API keys/tokens mentioning ${domain}`,
      score: Math.min(40 + keyHits.length * 10, 75),
      source: 'hibp',
      detail: `Paste IDs: ${keyHits
        .slice(0, 3)
        .map((h) => h.id)
        .join(', ')}`,
    });
  }

  if (hits.length > credHits.length + keyHits.length) {
    const remaining = hits.length - credHits.length - keyHits.length;
    factors.push({
      category: 'scanner_activity',
      summary: `${remaining} paste(s) mentioning ${domain} on public sites (domain recon possible)`,
      score: Math.min(10 + remaining * 5, 30),
      source: 'hibp',
      detail: `Paste IDs: ${hits
        .slice(0, 3)
        .map((h) => h.id)
        .join(', ')}`,
    });
  }

  return factors;
}
