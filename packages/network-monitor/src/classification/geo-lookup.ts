/**
 * Geolocation Lookup
 * IP address to geographic location mapping
 */

import { GeoLocation } from '../types';

/**
 * Geolocation cache entry
 */
interface GeoCacheEntry {
  location: GeoLocation;
  timestamp: Date;
}

/**
 * Geolocation Lookup Service
 * Provides IP to geographic location mapping with caching
 */
export class GeoLookup {
  private cache: Map<string, GeoCacheEntry> = new Map();
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours
  private maxCacheSize: number = 50000;
  private apiEndpoint: string = 'http://ip-api.com/json';

  constructor(apiEndpoint?: string) {
    if (apiEndpoint) {
      this.apiEndpoint = apiEndpoint;
    }
  }

  /**
   * Lookup geolocation for IP address
   */
  async lookup(ip: string): Promise<GeoLocation | null> {
    // Skip private/local IPs
    if (this.isPrivateIP(ip) || this.isLocalIP(ip)) {
      return null;
    }

    // Check cache
    const cached = this.getCached(ip);
    if (cached) {
      return cached;
    }

    // Perform lookup
    const location = await this.fetchGeolocation(ip);

    // Cache result
    if (location) {
      this.cacheLocation(ip, location);
    }

    return location;
  }

  /**
   * Batch lookup multiple IPs
   */
  async batchLookup(ips: string[]): Promise<Map<string, GeoLocation>> {
    const results = new Map<string, GeoLocation>();

    // Filter out private/local IPs and already cached
    const uniqueIps = new Set<string>();
    for (const ip of ips) {
      if (!this.isPrivateIP(ip) && !this.isLocalIP(ip)) {
        const cached = this.getCached(ip);
        if (cached) {
          results.set(ip, cached);
        } else {
          uniqueIps.add(ip);
        }
      }
    }

    // Lookup remaining IPs (with rate limiting)
    const uncachedIps = Array.from(uniqueIps);
    for (const ip of uncachedIps) {
      try {
        const location = await this.fetchGeolocation(ip);
        if (location) {
          results.set(ip, location);
          this.cacheLocation(ip, location);
        }

        // Rate limiting: wait 100ms between requests (free tier limit)
        await this.sleep(100);
      } catch {
        // Skip failed lookups
      }
    }

    return results;
  }

  /**
   * Fetch geolocation from API
   */
  private async fetchGeolocation(ip: string): Promise<GeoLocation | null> {
    try {
      const response = await fetch(`${this.apiEndpoint}/${ip}?fields=status,country,countryCode,region,city,lat,lon,timezone,isp`);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        status: string;
        country?: string;
        countryCode?: string;
        region?: string;
        regionName?: string;
        city?: string;
        lat?: number;
        lon?: number;
        timezone?: string;
        isp?: string;
      };

      // Check if lookup was successful
      if (data.status !== 'success') {
        return null;
      }

      return {
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        region: data.region || data.regionName,
        latitude: data.lat,
        longitude: data.lon,
        timezone: data.timezone,
        isp: data.isp,
      };
    } catch (error) {
      console.error(`Geolocation lookup failed for ${ip}:`, error);
      return null;
    }
  }

  /**
   * Get cached location
   */
  private getCached(ip: string): GeoLocation | null {
    const cached = this.cache.get(ip);
    if (!cached) return null;

    // Check if cache is still valid
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.cacheTTL) {
      this.cache.delete(ip);
      return null;
    }

    return cached.location;
  }

  /**
   * Cache location
   */
  private cacheLocation(ip: string, location: GeoLocation): void {
    // Limit cache size
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(ip, {
      location,
      timestamp: new Date(),
    });
  }

  /**
   * Check if IP is private (RFC 1918)
   */
  private isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1]);
      if (second >= 16 && second <= 31) return true;
    }
    if (ip.startsWith('192.168.')) return true;

    // IPv6 private ranges
    if (ip.startsWith('fd') || ip.startsWith('fc')) return true;

    return false;
  }

  /**
   * Check if IP is local/loopback
   */
  private isLocalIP(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === 'localhost' ||
      ip.startsWith('127.') ||
      ip.startsWith('::ffff:127.')
    );
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cacheSize: number;
    maxCacheSize: number;
    cacheTTL: number;
  } {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      cacheTTL: this.cacheTTL,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();

    for (const [ip, entry] of this.cache.entries()) {
      const age = now - entry.timestamp.getTime();
      if (age > this.cacheTTL) {
        this.cache.delete(ip);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMs: number = 3600000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }
}

/**
 * Offline geolocation using IP ranges (fallback)
 * This is a simplified implementation - in production, use MaxMind GeoIP2
 */
export class OfflineGeoLookup {
  /**
   * Simple country detection based on IP prefixes
   * This is extremely simplified - use MaxMind for production
   */
  static getCountryByIP(ip: string): string | undefined {
    // This is a demonstration only - real implementation would use MaxMind database
    const ipPrefixes: Record<string, string> = {
      '8.': 'US',      // Level 3 Communications
      '142.250.': 'US', // Google
      '172.217.': 'US', // Google
      '104.': 'US',    // Cloudflare
      '2.': 'EU',      // RIPE NCC
      '31.': 'EU',     // RIPE NCC
      '46.': 'EU',     // RIPE NCC
    };

    for (const [prefix, country] of Object.entries(ipPrefixes)) {
      if (ip.startsWith(prefix)) {
        return country;
      }
    }

    return undefined;
  }
}
