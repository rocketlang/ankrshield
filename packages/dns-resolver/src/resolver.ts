/**
 * DNS-over-HTTPS Resolver with Blocklist Integration
 *
 * Flow for each DNS query:
 * 1. Check blocklist (DomainLookup) — if blocked, return null (NXDOMAIN)
 * 2. If not blocked, resolve via DoH upstream
 * 3. Cache result
 *
 * DoH format: GET https://cloudflare-dns.com/dns-query?name={domain}&type=A
 * Headers: Accept: application/dns-json
 * Response: { Answer: [{data: '1.2.3.4', ...}] }
 */

import { isAllowedForApp } from './blocklist/app-allowlist.js';
import type { DomainLookup } from './blocklist/lookup.js';

export interface DNSResolverOptions {
  upstream?: string;
  cacheEnabled?: boolean;
  blocklist?: DomainLookup;
}

interface CacheEntry {
  ip: string;
  expires: number;
}

interface DoHAnswer {
  name?: string;
  type?: number;
  TTL?: number;
  data?: string;
}

interface DoHResponse {
  Status?: number;
  Answer?: DoHAnswer[];
}

const DOH_UPSTREAMS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'];

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 5000; // 5 seconds

export class DNSResolver {
  private options: DNSResolverOptions;
  private cache: Map<string, CacheEntry>;
  private blocklist?: DomainLookup;

  stats = {
    resolved: 0,
    blocked: 0,
    cached: 0,
  };

  constructor(options: DNSResolverOptions = {}) {
    this.options = options;
    this.cache = new Map();
    this.blocklist = options.blocklist;
  }

  /**
   * Resolve a domain via DNS-over-HTTPS.
   * Returns IP string if resolved and not blocked, null if blocked or not found.
   *
   * @param domain      - The domain to resolve
   * @param queryingApp - Optional package name of the app making the query.
   *                      If provided and the domain is on that app's consent allowlist,
   *                      the blocklist check is bypassed (surgical inhibition — never
   *                      block connections that belong to the app's stated purpose).
   */
  async resolve(domain: string, queryingApp?: string): Promise<string | null> {
    const normalised = domain.toLowerCase().replace(/\.$/g, '');

    // Step 1: Check blocklist — but skip if domain is on app's consent allowlist
    if (this.blocklist) {
      const allowedByConsent = queryingApp ? isAllowedForApp(queryingApp, normalised) : false;
      if (!allowedByConsent) {
        const blocked = await this.blocklist.isBlocked(normalised);
        if (blocked) {
          this.stats.blocked++;
          return null;
        }
      }
    }

    // Step 2: Check in-memory cache
    if (this.options.cacheEnabled !== false) {
      const cached = this.cache.get(normalised);
      if (cached && cached.expires > Date.now()) {
        this.stats.cached++;
        return cached.ip;
      }
    }

    // Step 3: Resolve via DoH upstreams with fallback
    const upstreams = this.options.upstream
      ? [this.options.upstream, ...DOH_UPSTREAMS.filter((u) => u !== this.options.upstream)]
      : DOH_UPSTREAMS;

    for (const upstream of upstreams) {
      try {
        const ip = await this._queryDoH(upstream, normalised);
        if (ip) {
          // Step 4: Cache the result
          if (this.options.cacheEnabled !== false) {
            this.cache.set(normalised, { ip, expires: Date.now() + CACHE_TTL_MS });
          }
          this.stats.resolved++;
          return ip;
        }
      } catch {
        // Try next upstream
      }
    }

    return null;
  }

  /**
   * Check if a domain is blocked without resolving.
   *
   * @param domain      - The domain to check
   * @param queryingApp - Optional package name of the app making the query.
   *                      If provided and the domain is allowlisted for that app,
   *                      returns false (not blocked) regardless of blocklist state.
   */
  async isBlocked(domain: string, queryingApp?: string): Promise<boolean> {
    if (!this.blocklist) return false;
    const normalised = domain.toLowerCase().replace(/\.$/g, '');
    // Consent-aware: never report a domain as blocked if the querying app is
    // allowed to reach it (user installed the app and granted it permissions).
    if (queryingApp && isAllowedForApp(queryingApp, normalised)) {
      return false;
    }
    return this.blocklist.isBlocked(normalised);
  }

  /**
   * Query a single DoH upstream for the A record of the given domain.
   */
  private async _queryDoH(upstream: string, domain: string): Promise<string | null> {
    const url = `${upstream}?name=${encodeURIComponent(domain)}&type=A`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const json = (await response.json()) as DoHResponse;

      if (!json.Answer || json.Answer.length === 0) return null;

      // Find the first A record (type 1)
      const aRecord = json.Answer.find(
        (a) => a.type === 1 && a.data && /^\d{1,3}(\.\d{1,3}){3}$/.test(a.data)
      );

      return aRecord?.data ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size.
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
