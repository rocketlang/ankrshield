/**
 * Tracker Enricher
 * Enriches network flows with tracker information from database
 */

import { NetworkFlow, TrackerInfo } from '../types';
import { PrismaClient } from '@prisma/client';

/**
 * Tracker cache entry
 */
interface TrackerCacheEntry {
  info: TrackerInfo;
  timestamp: Date;
}

/**
 * Tracker Enricher
 * Queries tracker database and enriches flows with privacy information
 */
export class TrackerEnricher {
  private prisma: PrismaClient;
  private trackerCache: Map<string, TrackerCacheEntry> = new Map();
  private cacheTTL: number = 300000; // 5 minutes
  private maxCacheSize: number = 10000;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Enrich flow with tracker information
   */
  async enrichFlow(flow: NetworkFlow): Promise<NetworkFlow> {
    if (!flow.domain) {
      return flow;
    }

    // Check cache first
    const cached = this.getCachedTracker(flow.domain);
    if (cached) {
      flow.tracker = cached;
      return flow;
    }

    // Query database
    const trackerInfo = await this.lookupTracker(flow.domain);
    if (trackerInfo) {
      flow.tracker = trackerInfo;

      // Cache result
      this.cacheTracker(flow.domain, trackerInfo);
    }

    return flow;
  }

  /**
   * Lookup tracker in database
   */
  private async lookupTracker(domain: string): Promise<TrackerInfo | null> {
    try {
      // Normalize domain
      const normalizedDomain = domain.toLowerCase().trim();

      // Query Tracker table
      const tracker = await this.prisma.tracker.findFirst({
        where: {
          domain: normalizedDomain,
        },
        select: {
          domain: true,
          category: true,
          vendor: true,
          threatLevel: true,
          sources: true,
        },
      });

      if (!tracker) {
        // Not a tracker - cache negative result
        return {
          isTracker: false,
        };
      }

      // Is a tracker
      // Convert ThreatLevel enum to number (LOW=1, MEDIUM=5, HIGH=8, CRITICAL=10)
      let threatLevelNum: number | undefined;
      if (tracker.threatLevel) {
        const levelMap: Record<string, number> = {
          LOW: 1,
          MEDIUM: 5,
          HIGH: 8,
          CRITICAL: 10,
        };
        threatLevelNum = levelMap[tracker.threatLevel] || 5;
      }

      return {
        isTracker: true,
        category: tracker.category || undefined,
        vendor: tracker.vendor || undefined,
        threatLevel: threatLevelNum,
        source: tracker.sources?.[0] || undefined, // Use first source
        blocked: false, // Will be set by DNS correlator
      };
    } catch (error) {
      console.error('Tracker lookup error:', error);
      return null;
    }
  }

  /**
   * Batch enrich multiple flows
   */
  async enrichFlows(flows: NetworkFlow[]): Promise<NetworkFlow[]> {
    // Collect unique domains
    const domains = new Set<string>();
    for (const flow of flows) {
      if (flow.domain) {
        domains.add(flow.domain);
      }
    }

    // Batch query for uncached domains
    const uncachedDomains = Array.from(domains).filter(
      (domain) => !this.getCachedTracker(domain)
    );

    if (uncachedDomains.length > 0) {
      await this.batchLookupTrackers(uncachedDomains);
    }

    // Enrich all flows (using cache)
    for (const flow of flows) {
      if (flow.domain) {
        const cached = this.getCachedTracker(flow.domain);
        if (cached) {
          flow.tracker = cached;
        }
      }
    }

    return flows;
  }

  /**
   * Batch lookup trackers
   */
  private async batchLookupTrackers(domains: string[]): Promise<void> {
    try {
      const normalizedDomains = domains.map((d) => d.toLowerCase().trim());

      // Query all domains at once
      const trackers = await this.prisma.tracker.findMany({
        where: {
          domain: {
            in: normalizedDomains,
          },
        },
        select: {
          domain: true,
          category: true,
          vendor: true,
          threatLevel: true,
          sources: true,
        },
      });

      // Create tracker map
      const trackerMap = new Map<string, TrackerInfo>();
      for (const tracker of trackers) {
        // Convert ThreatLevel enum to number
        let threatLevelNum: number | undefined;
        if (tracker.threatLevel) {
          const levelMap: Record<string, number> = {
            LOW: 1,
            MEDIUM: 5,
            HIGH: 8,
            CRITICAL: 10,
          };
          threatLevelNum = levelMap[tracker.threatLevel] || 5;
        }

        trackerMap.set(tracker.domain, {
          isTracker: true,
          category: tracker.category || undefined,
          vendor: tracker.vendor || undefined,
          threatLevel: threatLevelNum,
          source: tracker.sources?.[0] || undefined,
          blocked: false,
        });
      }

      // Cache results (including negative results)
      for (const domain of normalizedDomains) {
        if (domain) {
          const trackerInfo = trackerMap.get(domain) || {
            isTracker: false,
          };
          this.cacheTracker(domain, trackerInfo);
        }
      }
    } catch (error) {
      console.error('Batch tracker lookup error:', error);
    }
  }

  /**
   * Get cached tracker info
   */
  private getCachedTracker(domain: string): TrackerInfo | null {
    const cached = this.trackerCache.get(domain.toLowerCase());
    if (!cached) return null;

    // Check if cache is still valid
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.cacheTTL) {
      this.trackerCache.delete(domain.toLowerCase());
      return null;
    }

    return cached.info;
  }

  /**
   * Cache tracker info
   */
  private cacheTracker(domain: string, info: TrackerInfo): void {
    // Limit cache size
    if (this.trackerCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.trackerCache.keys().next().value;
      if (oldestKey) {
        this.trackerCache.delete(oldestKey);
      }
    }

    this.trackerCache.set(domain.toLowerCase(), {
      info,
      timestamp: new Date(),
    });
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
      cacheSize: this.trackerCache.size,
      maxCacheSize: this.maxCacheSize,
      cacheTTL: this.cacheTTL,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.trackerCache.clear();
  }

  /**
   * Cleanup expired cache entries
   */
  cleanup(): void {
    const now = Date.now();

    for (const [domain, entry] of this.trackerCache.entries()) {
      const age = now - entry.timestamp.getTime();
      if (age > this.cacheTTL) {
        this.trackerCache.delete(domain);
      }
    }
  }

  /**
   * Close Prisma connection
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
