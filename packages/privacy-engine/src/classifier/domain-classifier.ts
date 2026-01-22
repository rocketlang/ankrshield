/**
 * Domain Classifier
 * Classifies domains as trackers using database lookup and caching
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { parse as parseDomain } from 'tldts';
import type { TrackerInfo, ClassificationResult, BatchClassificationResult } from '../types';

/**
 * Cache entry for tracker classification
 */
interface CacheEntry {
  tracker: TrackerInfo | null;
  timestamp: Date;
}

/**
 * Domain Classifier
 * Provides fast tracker classification with caching
 */
export class DomainClassifier {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes
  private maxCacheSize: number = 10000;
  private redisCache?: Redis;

  constructor(
    private prisma: PrismaClient,
    redisCache?: Redis
  ) {
    this.redisCache = redisCache;
  }

  /**
   * Classify a single domain
   */
  async classify(domain: string): Promise<ClassificationResult> {
    const startTime = Date.now();
    const normalizedDomain = this.normalizeDomain(domain);

    // Check memory cache first
    const cached = this.getCached(normalizedDomain);
    if (cached !== null) {
      return {
        domain: normalizedDomain,
        tracker: cached,
        cached: true,
        lookupTime: Date.now() - startTime,
      };
    }

    // Check Redis cache
    if (this.redisCache) {
      const redisResult = await this.getFromRedis(normalizedDomain);
      if (redisResult !== null) {
        this.cacheTracker(normalizedDomain, redisResult);
        return {
          domain: normalizedDomain,
          tracker: redisResult,
          cached: true,
          lookupTime: Date.now() - startTime,
        };
      }
    }

    // Database lookup
    const tracker = await this.lookupTracker(normalizedDomain);

    // Cache result
    this.cacheTracker(normalizedDomain, tracker);
    if (this.redisCache && tracker) {
      await this.saveToRedis(normalizedDomain, tracker);
    }

    return {
      domain: normalizedDomain,
      tracker,
      cached: false,
      lookupTime: Date.now() - startTime,
    };
  }

  /**
   * Classify multiple domains in batch
   */
  async batchClassify(domains: string[]): Promise<BatchClassificationResult> {
    const startTime = Date.now();
    const results = new Map<string, TrackerInfo>();
    let cacheHits = 0;
    let cacheMisses = 0;

    // Normalize and deduplicate
    const normalizedDomains = Array.from(
      new Set(domains.map((d) => this.normalizeDomain(d)))
    );

    // Separate cached and uncached
    const uncached: string[] = [];
    for (const domain of normalizedDomains) {
      const cached = this.getCached(domain);
      if (cached !== null) {
        if (cached.isTracker) {
          results.set(domain, cached);
        }
        cacheHits++;
      } else {
        uncached.push(domain);
      }
    }

    // Batch lookup uncached domains
    if (uncached.length > 0) {
      const trackers = await this.batchLookupTrackers(uncached);
      for (const [domain, tracker] of trackers) {
        if (tracker) {
          results.set(domain, tracker);
          this.cacheTracker(domain, tracker);
        } else {
          this.cacheTracker(domain, { isTracker: false });
        }
        cacheMisses++;
      }
    }

    return {
      results,
      totalTime: Date.now() - startTime,
      cacheHits,
      cacheMisses,
    };
  }

  /**
   * Lookup tracker in database
   */
  private async lookupTracker(domain: string): Promise<TrackerInfo | null> {
    // Try exact match first
    let tracker = await this.prisma.tracker.findFirst({
      where: { domain },
      select: {
        domain: true,
        category: true,
        vendor: true,
        threatLevel: true,
        sources: true,
      },
    });

    // If not found, try parent domain
    if (!tracker) {
      const baseDomain = this.extractBaseDomain(domain);
      if (baseDomain !== domain) {
        tracker = await this.prisma.tracker.findFirst({
          where: { domain: baseDomain },
          select: {
            domain: true,
            category: true,
            vendor: true,
            threatLevel: true,
            sources: true,
          },
        });
      }
    }

    if (!tracker) {
      return { isTracker: false };
    }

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

    return {
      isTracker: true,
      domain: tracker.domain,
      category: tracker.category || undefined,
      vendor: tracker.vendor || undefined,
      threatLevel: threatLevelNum,
      source: tracker.sources?.[0] || undefined,
      blocked: false,
    };
  }

  /**
   * Batch lookup trackers from database
   */
  private async batchLookupTrackers(
    domains: string[]
  ): Promise<Map<string, TrackerInfo | null>> {
    const results = new Map<string, TrackerInfo | null>();

    // Get all matching trackers in one query
    const trackers = await this.prisma.tracker.findMany({
      where: {
        domain: { in: domains },
      },
      select: {
        domain: true,
        category: true,
        vendor: true,
        threatLevel: true,
        sources: true,
      },
    });

    // Map to results
    const trackerMap = new Map(trackers.map((t) => [t.domain, t]));

    for (const domain of domains) {
      const tracker = trackerMap.get(domain);

      if (tracker) {
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

        results.set(domain, {
          isTracker: true,
          domain: tracker.domain,
          category: tracker.category || undefined,
          vendor: tracker.vendor || undefined,
          threatLevel: threatLevelNum,
          source: tracker.sources?.[0] || undefined,
          blocked: false,
        });
      } else {
        results.set(domain, { isTracker: false });
      }
    }

    return results;
  }

  /**
   * Get cached tracker info
   */
  private getCached(domain: string): TrackerInfo | null {
    const cached = this.cache.get(domain);
    if (!cached) return null;

    // Check if cache is still valid
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.cacheTTL) {
      this.cache.delete(domain);
      return null;
    }

    return cached.tracker;
  }

  /**
   * Cache tracker info
   */
  private cacheTracker(domain: string, tracker: TrackerInfo | null): void {
    // Limit cache size
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(domain, {
      tracker,
      timestamp: new Date(),
    });
  }

  /**
   * Get from Redis cache
   */
  private async getFromRedis(domain: string): Promise<TrackerInfo | null> {
    if (!this.redisCache) return null;

    try {
      const cached = await this.redisCache.get(`tracker:${domain}`);
      if (!cached) return null;

      return JSON.parse(cached) as TrackerInfo;
    } catch {
      return null;
    }
  }

  /**
   * Save to Redis cache
   */
  private async saveToRedis(domain: string, tracker: TrackerInfo): Promise<void> {
    if (!this.redisCache) return;

    try {
      await this.redisCache.setex(
        `tracker:${domain}`,
        Math.floor(this.cacheTTL / 1000),
        JSON.stringify(tracker)
      );
    } catch (error) {
      // Silently fail - caching is not critical
      console.error('Redis cache error:', error);
    }
  }

  /**
   * Normalize domain (lowercase, trim)
   */
  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().trim();
  }

  /**
   * Extract base domain (eTLD+1)
   */
  private extractBaseDomain(domain: string): string {
    const parsed = parseDomain(domain);
    if (!parsed.domain || !parsed.publicSuffix) {
      return domain;
    }
    return `${parsed.domain}.${parsed.publicSuffix}`;
  }

  /**
   * Check if domain matches pattern
   */
  checkPattern(domain: string, pattern: string): boolean {
    // Simple wildcard matching (* at start)
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.substring(2);
      return domain.endsWith(baseDomain);
    }
    return domain === pattern;
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

    for (const [domain, entry] of this.cache.entries()) {
      const age = now - entry.timestamp.getTime();
      if (age > this.cacheTTL) {
        this.cache.delete(domain);
      }
    }
  }
}
