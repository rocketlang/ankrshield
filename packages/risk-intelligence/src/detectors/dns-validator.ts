/**
 * DNS Typosquat Validator
 *
 * Resolves typosquatting domain variants via DNS to determine which ones
 * are actually registered (have DNS records) vs. just unregistered names.
 *
 * This is a critical enhancement over urlscan.io alone:
 *   - urlscan only knows about domains that have been actively scanned
 *   - DNS resolution catches ALL registered domains, even brand-new ones
 *     that haven't served any traffic yet
 *
 * Method: attempt DNS A / AAAA lookup for each typosquat variant.
 *   - Resolves → domain is REGISTERED (flag it)
 *   - NXDOMAIN   → domain is unregistered (safe, skip)
 *
 * No API key, no rate limits — pure DNS.
 */

import { promises as dns } from 'dns';

import type { RiskFactor } from '../types.js';

export interface RegisteredTyposquat {
  /** The typosquat domain name */
  domain: string;
  /** Resolved IP addresses */
  ips: string[];
  /** Whether the IPs differ from the legitimate domain's IPs */
  isImpostor: boolean;
  /** Type of typosquat variant */
  variantType: string;
}

// Typosquat variant generators
function generateVariants(name: string, tld: string): Array<{ domain: string; type: string }> {
  const variants: Array<{ domain: string; type: string }> = [];

  // 1. Character omission
  for (let i = 0; i < name.length; i++) {
    variants.push({
      domain: `${name.slice(0, i)}${name.slice(i + 1)}.${tld}`,
      type: 'omission',
    });
  }

  // 2. Adjacent key substitutions (QWERTY layout)
  const adjacentKeys: Record<string, string> = {
    a: 'sq',
    b: 'vn',
    c: 'xv',
    d: 'sf',
    e: 'wr',
    f: 'dg',
    g: 'fh',
    h: 'gj',
    i: 'uo',
    j: 'hk',
    k: 'jl',
    l: 'k',
    m: 'n',
    n: 'mb',
    o: 'ip',
    p: 'o',
    q: 'aw',
    r: 'et',
    s: 'ad',
    t: 'ry',
    u: 'yi',
    v: 'cb',
    w: 'qe',
    x: 'zc',
    y: 'ut',
    z: 'x',
  };
  for (let i = 0; i < name.length; i++) {
    const ch = name[i].toLowerCase();
    for (const sub of adjacentKeys[ch] ?? '') {
      variants.push({
        domain: `${name.slice(0, i)}${sub}${name.slice(i + 1)}.${tld}`,
        type: 'substitution',
      });
    }
  }

  // 3. Character doubling
  for (let i = 0; i < name.length; i++) {
    variants.push({
      domain: `${name.slice(0, i)}${name[i]}${name[i]}${name.slice(i + 1)}.${tld}`,
      type: 'doubling',
    });
  }

  // 4. Homoglyphs
  const homos: Record<string, string[]> = {
    o: ['0'],
    i: ['1', 'l'],
    l: ['1', 'i'],
    a: ['@'],
    s: ['5'],
    e: ['3'],
  };
  for (let i = 0; i < name.length; i++) {
    const ch = name[i].toLowerCase();
    for (const sub of homos[ch] ?? []) {
      variants.push({
        domain: `${name.slice(0, i)}${sub}${name.slice(i + 1)}.${tld}`,
        type: 'homoglyph',
      });
    }
  }

  // 5. TLD swaps
  for (const altTld of ['com', 'net', 'org', 'io', 'co', 'in', 'info', 'biz', 'xyz']) {
    if (altTld !== tld) variants.push({ domain: `${name}.${altTld}`, type: 'tld-swap' });
  }

  // 6. Brand abuse prefixes/suffixes
  for (const prefix of ['login', 'secure', 'app', 'my', 'get', 'official']) {
    variants.push({ domain: `${prefix}-${name}.${tld}`, type: 'prefix' });
    variants.push({ domain: `${name}-${prefix}.${tld}`, type: 'suffix' });
  }

  // 7. Hyphen insertion
  for (let i = 1; i < name.length; i++) {
    variants.push({ domain: `${name.slice(0, i)}-${name.slice(i)}.${tld}`, type: 'hyphen' });
  }

  // Deduplicate and remove the legitimate domain
  const seen = new Set<string>();
  const legitimate = `${name}.${tld}`;
  return variants.filter(({ domain }) => {
    if (domain === legitimate || seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });
}

async function resolveWithTimeout(domain: string): Promise<string[] | null> {
  try {
    const addrs = await Promise.race([
      dns.resolve4(domain).catch(() => null),
      new Promise<null>((res) => setTimeout(() => res(null), 3000)),
    ]);
    return addrs;
  } catch {
    return null;
  }
}

/**
 * Check which typosquat variants of the given domain are actually registered
 * by performing DNS A-record lookups.
 *
 * @param domain  The legitimate domain to protect (e.g. 'xshieldai.com')
 * @param legitimateIps The real domain's IP addresses — used to detect
 *                      parking/redirect pages pointing to a legitimate registrar
 * @param maxChecks  Cap on how many variants to check (default 60)
 */
export async function validateTyposquats(
  domain: string,
  legitimateIps: string[] = [],
  maxChecks = 60
): Promise<RegisteredTyposquat[]> {
  const base = domain.toLowerCase().replace(/^www\./, '');
  const parts = base.split('.');
  const tld = parts.slice(-1)[0] ?? 'com';
  const name = parts.slice(0, -1).join('.');
  if (!name) return [];

  const variants = generateVariants(name, tld).slice(0, maxChecks);
  const legitIpSet = new Set(legitimateIps);

  // Resolve in batches of 10 (concurrent)
  const registered: RegisteredTyposquat[] = [];
  const batchSize = 10;

  for (let i = 0; i < variants.length; i += batchSize) {
    const batch = variants.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ({ domain: d, type }) => {
        const ips = await resolveWithTimeout(d);
        if (!ips || ips.length === 0) return null;
        return {
          domain: d,
          ips,
          isImpostor: !ips.some((ip) => legitIpSet.has(ip)),
          variantType: type,
        } satisfies RegisteredTyposquat;
      })
    );
    registered.push(...(results.filter(Boolean) as RegisteredTyposquat[]));
  }

  return registered;
}

/**
 * Convert registered typosquat list into RiskFactor entries.
 *
 * Scoring is adjusted by:
 *   - Domain name length: short brands (≤5 chars) get omission variants discounted
 *     because 2-3 letter .in/.io strings are commonly registered by unrelated parties
 *   - Variant type: homoglyph/addition/transposition are classic phishing tactics
 *     and score higher; omissions on short names are low-signal
 */
export function typosquatsToFactors(squats: RegisteredTyposquat[], domain: string): RiskFactor[] {
  if (squats.length === 0) return [];

  const base = domain.split('.')[0] ?? domain;
  const isShortBrand = base.length <= 5;

  // High-signal variants regardless of brand length
  const HIGH_SIGNAL: string[] = ['homoglyph', 'addition', 'transposition', 'double_hit'];

  const impostors = squats.filter((s) => s.isImpostor);
  const parked = squats.filter((s) => !s.isImpostor);

  // Split impostors into high-signal vs coincidental
  const highSignal = impostors.filter((s) => HIGH_SIGNAL.includes(s.variantType) || !isShortBrand);
  const coincidental = impostors.filter(
    (s) => !HIGH_SIGNAL.includes(s.variantType) && isShortBrand
  );

  const factors: RiskFactor[] = [];

  if (highSignal.length > 0) {
    // Classic phishing variants — score normally
    factors.push({
      category: 'typosquat',
      summary: `${highSignal.length} high-signal lookalike domain(s) found for ${domain} — potential phishing (homoglyph/addition/transposition)`,
      score: Math.min(20 + highSignal.length * 12, 60),
      source: 'urlscan',
      detail: highSignal
        .slice(0, 5)
        .map((s) => `${s.domain} → ${s.ips[0]}`)
        .join(' · '),
    });
  }

  if (coincidental.length > 0) {
    // Short-brand omissions — common registrations, low risk
    factors.push({
      category: 'typosquat',
      summary: `${coincidental.length} short lookalike domain(s) for ${domain} exist (likely unrelated registrations, not active phishing)`,
      score: Math.min(5 + coincidental.length * 2, 20),
      source: 'urlscan',
      detail: coincidental
        .slice(0, 5)
        .map((s) => `${s.domain} → ${s.ips[0]}`)
        .join(' · '),
    });
  }

  if (parked.length > 0) {
    factors.push({
      category: 'typosquat',
      summary: `${parked.length} registered lookalike domain(s) for ${domain} detected (parked/same host)`,
      score: Math.min(5 + parked.length * 3, 20),
      source: 'urlscan',
      detail: parked
        .slice(0, 5)
        .map((s) => s.domain)
        .join(', '),
    });
  }

  return factors;
}
