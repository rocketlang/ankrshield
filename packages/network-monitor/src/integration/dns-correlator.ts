/**
 * DNS Correlator
 * Links network flows to DNS resolutions
 */

import { NetworkFlow } from '../types';

/**
 * DNS resolution cache entry
 */
interface DNSCacheEntry {
  domain: string;
  ips: string[];
  timestamp: Date;
  ttl: number;
  blocked: boolean;
}

/**
 * DNS Correlator
 * Maintains a cache of DNS resolutions and correlates them with network flows
 */
export class DNSCorrelator {
  private dnsCache: Map<string, DNSCacheEntry> = new Map();
  private ipToDomain: Map<string, string[]> = new Map();
  private correlationWindow: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Add DNS resolution to cache
   */
  addDNSResolution(
    domain: string,
    ips: string[],
    ttl: number = 300,
    blocked: boolean = false
  ): void {
    const entry: DNSCacheEntry = {
      domain,
      ips,
      timestamp: new Date(),
      ttl,
      blocked,
    };

    // Store domain -> IPs mapping
    this.dnsCache.set(domain.toLowerCase(), entry);

    // Store IP -> domain reverse mapping
    for (const ip of ips) {
      const domains = this.ipToDomain.get(ip) || [];
      if (!domains.includes(domain)) {
        domains.push(domain);
      }
      this.ipToDomain.set(ip, domains);
    }

    // Schedule cache cleanup
    setTimeout(() => {
      this.removeDNSResolution(domain);
    }, ttl * 1000);
  }

  /**
   * Remove DNS resolution from cache
   */
  removeDNSResolution(domain: string): void {
    const entry = this.dnsCache.get(domain.toLowerCase());
    if (!entry) return;

    // Remove IP -> domain mappings
    for (const ip of entry.ips) {
      const domains = this.ipToDomain.get(ip);
      if (domains) {
        const filtered = domains.filter((d) => d !== domain);
        if (filtered.length === 0) {
          this.ipToDomain.delete(ip);
        } else {
          this.ipToDomain.set(ip, filtered);
        }
      }
    }

    this.dnsCache.delete(domain.toLowerCase());
  }

  /**
   * Find domain for IP address
   */
  findDomainForIP(ip: string): string | undefined {
    const domains = this.ipToDomain.get(ip);
    if (!domains || domains.length === 0) return undefined;

    // Return the most recent domain (last in array)
    return domains[domains.length - 1];
  }

  /**
   * Find all domains for IP address
   */
  findAllDomainsForIP(ip: string): string[] {
    return this.ipToDomain.get(ip) || [];
  }

  /**
   * Check if domain was blocked
   */
  isDomainBlocked(domain: string): boolean {
    const entry = this.dnsCache.get(domain.toLowerCase());
    return entry?.blocked || false;
  }

  /**
   * Correlate network flow with DNS resolution
   */
  correlateFlow(flow: NetworkFlow): NetworkFlow {
    // Try to find domain from DNS cache
    const domain = this.findDomainForIP(flow.destinationIp);

    if (domain) {
      flow.domain = domain;

      // Check if it was blocked
      const blocked = this.isDomainBlocked(domain);
      if (blocked && flow.tracker) {
        flow.tracker.blocked = true;
      }
    }

    return flow;
  }

  /**
   * Check if IP is within correlation window
   */
  isWithinCorrelationWindow(timestamp: Date): boolean {
    const now = Date.now();
    const age = now - timestamp.getTime();
    return age <= this.correlationWindow;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cachedDomains: number;
    cachedIPs: number;
    correlationWindow: number;
  } {
    return {
      cachedDomains: this.dnsCache.size,
      cachedIPs: this.ipToDomain.size,
      correlationWindow: this.correlationWindow,
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.dnsCache.clear();
    this.ipToDomain.clear();
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();

    for (const [domain, entry] of this.dnsCache.entries()) {
      const age = now - entry.timestamp.getTime();
      const expired = age > entry.ttl * 1000;

      if (expired) {
        this.removeDNSResolution(domain);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }
}
