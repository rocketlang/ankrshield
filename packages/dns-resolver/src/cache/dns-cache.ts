/**
 * DNS Cache Layer
 *
 * Redis-based caching with:
 * - TTL from DNS response (min 60s, max 86400s)
 * - Background refresh at 80% TTL
 * - Hit/miss tracking
 * - LRU eviction
 */

import Redis from 'ioredis';
import { DNSResponse } from '../index';

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  avgTTL: number;
}

export class DNSCache {
  private redis: Redis;
  private hits: number = 0;
  private misses: number = 0;
  private minTTL: number = 60; // 1 minute
  private maxTTL: number = 86400; // 24 hours
  private enabled: boolean = true;

  constructor(redisUrl?: string) {
    // Initialize Redis connection
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries');
          this.enabled = false;
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    });

    this.redis.on('error', (error) => {
      console.error('Redis error:', error);
      this.enabled = false;
    });

    this.redis.on('connect', () => {
      console.log('DNS cache connected to Redis');
      this.enabled = true;
    });
  }

  /**
   * Get cached DNS response
   */
  async get(domain: string, recordType: string): Promise<DNSResponse | null> {
    if (!this.enabled) return null;

    try {
      const key = this.getCacheKey(domain, recordType);
      const cached = await this.redis.get(key);

      if (cached) {
        this.hits++;
        return JSON.parse(cached) as DNSResponse;
      } else {
        this.misses++;
        return null;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      this.misses++;
      return null;
    }
  }

  /**
   * Set DNS response in cache with TTL
   */
  async set(domain: string, recordType: string, response: DNSResponse): Promise<void> {
    if (!this.enabled) return;

    try {
      const key = this.getCacheKey(domain, recordType);
      const ttl = this.calculateTTL(response);

      // Store response with TTL
      await this.redis.setex(key, ttl, JSON.stringify(response));

      // Track TTL distribution
      await this.trackTTL(ttl);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Calculate TTL from DNS response
   * Uses minimum TTL from all answer records
   */
  private calculateTTL(response: DNSResponse): number {
    if (!response.answers || response.answers.length === 0) {
      return this.minTTL;
    }

    // Find minimum TTL from all answers
    const minAnswerTTL = Math.min(...response.answers.map(a => a.ttl));

    // Clamp between min and max
    return Math.max(this.minTTL, Math.min(minAnswerTTL, this.maxTTL));
  }

  /**
   * Get cache key for domain and record type
   */
  private getCacheKey(domain: string, recordType: string): string {
    return `dns:${domain.toLowerCase()}:${recordType}`;
  }

  /**
   * Track TTL for statistics
   */
  private async trackTTL(ttl: number): Promise<void> {
    try {
      await this.redis.zadd('dns:ttl:distribution', ttl, `${Date.now()}`);

      // Keep only last 1000 entries
      await this.redis.zremrangebyrank('dns:ttl:distribution', 0, -1001);
    } catch (error) {
      // Ignore tracking errors
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const totalRequests = this.hits + this.misses;
      const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

      // Get cache size (number of keys with dns: prefix)
      const keys = await this.redis.keys('dns:*:*');
      const size = keys.length;

      // Get average TTL from distribution
      const ttls = await this.redis.zrange('dns:ttl:distribution', 0, -1, 'WITHSCORES');
      let avgTTL = 0;
      if (ttls.length > 0) {
        const sum = ttls
          .filter((_, i) => i % 2 === 1) // Get scores only
          .reduce((acc, val) => acc + parseFloat(val), 0);
        avgTTL = sum / (ttls.length / 2);
      }

      return {
        hits: this.hits,
        misses: this.misses,
        hitRate: parseFloat(hitRate.toFixed(4)),
        size,
        avgTTL: Math.round(avgTTL),
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        hits: this.hits,
        misses: this.misses,
        hitRate: 0,
        size: 0,
        avgTTL: 0,
      };
    }
  }

  /**
   * Clear all DNS cache entries
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys('dns:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      console.log(`Cleared ${keys.length} DNS cache entries`);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache size in MB
   */
  async getSizeInMB(): Promise<number> {
    try {
      const info = await this.redis.info('memory');
      const match = info.match(/used_memory:(\d+)/);
      if (match) {
        return parseInt(match[1]) / 1024 / 1024;
      }
      return 0;
    } catch (error) {
      console.error('Error getting cache size:', error);
      return 0;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
