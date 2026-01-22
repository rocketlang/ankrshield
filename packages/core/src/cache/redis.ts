/**
 * Redis caching utilities for ankrshield
 */

import { Redis, RedisOptions } from 'ioredis';

export class RedisCache {
  private client: Redis;
  private readonly defaultTTL: number = 300; // 5 minutes

  constructor(options?: RedisOptions) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      ...options,
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const expiryTime = ttl || this.defaultTTL;
      await this.client.setex(key, expiryTime, serialized);
    } catch (error) {
      console.error(`Error setting key ${key}:`, error);
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`Error deleting key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys
   */
  async delMany(keys: string[]): Promise<void> {
    try {
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('Error deleting keys:', error);
    }
  }

  /**
   * Delete keys by pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error(`Error deleting pattern ${pattern}:`, error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Error checking key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error(`Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Decrement counter
   */
  async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      console.error(`Error decrementing key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get multiple values
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(...keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      console.error('Error getting multiple keys:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values
   */
  async mset(items: Record<string, unknown>, ttl?: number): Promise<void> {
    try {
      const pipeline = this.client.pipeline();
      const expiryTime = ttl || this.defaultTTL;

      Object.entries(items).forEach(([key, value]) => {
        pipeline.setex(key, expiryTime, JSON.stringify(value));
      });

      await pipeline.exec();
    } catch (error) {
      console.error('Error setting multiple keys:', error);
    }
  }

  /**
   * Flush all data (use with caution!)
   */
  async flush(): Promise<void> {
    try {
      await this.client.flushall();
    } catch (error) {
      console.error('Error flushing Redis:', error);
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Close connection
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCache();
