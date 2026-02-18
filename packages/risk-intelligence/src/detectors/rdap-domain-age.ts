/**
 * RDAP Domain Age Checker
 *
 * Uses the IANA RDAP (Registration Data Access Protocol) to determine:
 *   - When a domain was registered (creation date)
 *   - Registrar name
 *   - Registrant country
 *   - Expiry date
 *
 * A recently registered domain (< 30 days) closely resembling a brand
 * is a near-certain phishing setup. Even 1-year-old lookalike domains
 * carry elevated risk.
 *
 * RDAP is the modern structured replacement for WHOIS.
 * Free, no auth, no rate limit stated.
 *
 * Bootstrap: https://data.iana.org/rdap/dns.json
 * Standard:  https://rdap.org/domain/{domain}  (universal proxy)
 */

import type { RiskFactor } from '../types.js';

const RDAP_PROXY = 'https://rdap.org/domain';
const TIMEOUT_MS = 10_000;

export interface DomainRegistration {
  domain: string;
  registeredAt: string | null; // ISO-8601
  expiresAt: string | null; // ISO-8601
  updatedAt: string | null; // ISO-8601
  registrar: string | null;
  registrantCountry: string | null;
  /** Age of the domain in days (null if registration date unknown) */
  ageDays: number | null;
  /** True when domain was registered < 30 days ago */
  isNew: boolean;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: unknown[];
  entities?: RdapEntity[];
  handle?: string;
}

interface RdapResponse {
  ldhName?: string;
  events?: RdapEvent[];
  entities?: RdapEntity[];
  handle?: string;
  status?: string[];
}

function extractCountry(entities: RdapEntity[]): string | null {
  for (const entity of entities) {
    const vcard = entity.vcardArray;
    if (Array.isArray(vcard) && vcard.length > 1) {
      const props = vcard[1] as unknown[][];
      for (const prop of props) {
        if (Array.isArray(prop) && prop[0] === 'adr') {
          const addrVal = prop[3];
          if (Array.isArray(addrVal) && addrVal.length >= 7) {
            const country = addrVal[6];
            if (typeof country === 'string' && country.length === 2) return country;
          }
        }
      }
    }
    if (entity.entities) {
      const nested = extractCountry(entity.entities);
      if (nested) return nested;
    }
  }
  return null;
}

function extractRegistrar(entities: RdapEntity[]): string | null {
  for (const entity of entities) {
    if (entity.roles?.includes('registrar')) {
      const vcard = entity.vcardArray;
      if (Array.isArray(vcard) && vcard.length > 1) {
        const props = vcard[1] as unknown[][];
        const fn = props.find((p) => Array.isArray(p) && p[0] === 'fn');
        if (fn && typeof fn[3] === 'string') return fn[3];
      }
      if (entity.handle) return entity.handle;
    }
  }
  return null;
}

export async function checkDomainAge(domain: string): Promise<DomainRegistration | null> {
  const base = domain.toLowerCase().replace(/^www\./, '');
  const url = `${RDAP_PROXY}/${encodeURIComponent(base)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'xShieldAI/1.0 (https://xshieldai.com)',
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as RdapResponse;
    const events = data.events ?? [];

    const reg = events.find((e) => e.eventAction === 'registration');
    const exp = events.find((e) => e.eventAction === 'expiration');
    const upd = events.find((e) => e.eventAction === 'last changed');

    const registeredAt = reg?.eventDate ?? null;
    const ageDays = registeredAt
      ? Math.floor((Date.now() - new Date(registeredAt).getTime()) / 86400_000)
      : null;

    return {
      domain: base,
      registeredAt,
      expiresAt: exp?.eventDate ?? null,
      updatedAt: upd?.eventDate ?? null,
      registrar: extractRegistrar(data.entities ?? []),
      registrantCountry: extractCountry(data.entities ?? []),
      ageDays,
      isNew: ageDays !== null && ageDays < 30,
    };
  } catch {
    return null;
  }
}

/**
 * Convert domain registration data into RiskFactor entries.
 */
export function domainAgeToFactors(reg: DomainRegistration, targetDomain: string): RiskFactor[] {
  // Only relevant for typosquat variants, not the target itself
  if (reg.domain === targetDomain.toLowerCase().replace(/^www\./, '')) return [];
  if (reg.ageDays === null) return [];

  const factors: RiskFactor[] = [];

  if (reg.ageDays < 7) {
    factors.push({
      category: 'phishing_domain',
      summary: `Lookalike domain ${reg.domain} registered ONLY ${reg.ageDays} day(s) ago — almost certainly a phishing setup`,
      score: 85,
      source: 'internal',
      detail: `Registered: ${reg.registeredAt?.slice(0, 10) ?? 'unknown'} · Registrar: ${reg.registrar ?? 'unknown'} · Country: ${reg.registrantCountry ?? 'unknown'}`,
    });
  } else if (reg.ageDays < 30) {
    factors.push({
      category: 'phishing_domain',
      summary: `Lookalike domain ${reg.domain} registered ${reg.ageDays} days ago — high phishing risk`,
      score: 65,
      source: 'internal',
      detail: `Registered: ${reg.registeredAt?.slice(0, 10) ?? 'unknown'} · Registrar: ${reg.registrar ?? 'unknown'}`,
    });
  } else if (reg.ageDays < 180) {
    factors.push({
      category: 'typosquat',
      summary: `Lookalike domain ${reg.domain} is ${reg.ageDays} days old — recently registered, monitor closely`,
      score: 25,
      source: 'internal',
      detail: `Registered: ${reg.registeredAt?.slice(0, 10) ?? 'unknown'}`,
    });
  }

  return factors;
}
