import Redis, { RedisOptions } from 'ioredis';
import { configManager } from '../config.js';

/**
 * Redis connection states
 */
export enum RedisStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  DISABLED = 'disabled',
}

/**
 * Redis connection manager
 * Manages Redis client lifecycle with optional graceful degradation
 */
class RedisManager {
  private client: Redis | null = null;
  private status: RedisStatus = RedisStatus.DISCONNECTED;
  private retryCount = 0;
  private maxRetries = 5;
  private retryDelays = [500, 1000, 2000, 4000, 8000]; // Exponential backoff

  /**
   * Get Redis client instance (singleton)
   * Returns null if Redis is disabled or not connected
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Get current connection status
   */
  getStatus(): RedisStatus {
    return this.status;
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.status === RedisStatus.CONNECTED;
  }

  /**
   * Check if Redis is available (connected or disabled)
   */
  isAvailable(): boolean {
    return this.status === RedisStatus.CONNECTED;
  }

  /**
   * Connect to Redis with retry logic
   */
  async connect(): Promise<void> {
    const config = configManager.get();

    // Check if Redis is enabled
    if (!config.redisEnabled) {
      this.status = RedisStatus.DISABLED;
      console.log('[Redis] Disabled via configuration');
      return;
    }

    // Check if Redis URL is provided
    if (!config.redisUrl) {
      this.status = RedisStatus.DISABLED;
      console.log('[Redis] No REDIS_URL provided, continuing without Redis');
      return;
    }

    if (this.status === RedisStatus.CONNECTED) {
      console.log('[Redis] Already connected');
      return;
    }

    if (this.status === RedisStatus.CONNECTING) {
      console.log('[Redis] Connection in progress');
      return;
    }

    this.status = RedisStatus.CONNECTING;
    console.log('[Redis] Connecting...');

    try {
      const redisOptions: RedisOptions = {
        retryStrategy: (times: number) => {
          if (times > this.maxRetries) {
            console.log('[Redis] Max retries reached, giving up');
            return null; // Stop retrying
          }
          const delay = Math.min(times * 1000, 10000);
          console.log(`[Redis] Retry ${times} in ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true, // Don't connect automatically
      };

      this.client = new Redis(config.redisUrl, redisOptions);

      // Setup event handlers
      this.setupEventHandlers();

      // Manually connect
      await this.client.connect();

      // Test connection with ping
      await this.client.ping();

      this.status = RedisStatus.CONNECTED;
      this.retryCount = 0;

      console.log('[Redis] Connected successfully');
    } catch (error) {
      this.status = RedisStatus.ERROR;
      console.error('[Redis] Connection failed:', error);

      // Cleanup failed client
      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }

      // Retry with exponential backoff
      if (this.retryCount < this.maxRetries) {
        const delay = this.retryDelays[this.retryCount];
        this.retryCount++;

        console.log(
          `[Redis] Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.connect();
      }

      // After max retries, mark as disabled and continue
      console.warn('[Redis] Max retries reached, continuing without Redis');
      this.status = RedisStatus.DISABLED;
    }
  }

  /**
   * Setup event handlers for Redis client
   */
  private setupEventHandlers(): void {
    if (!this.client) {
      return;
    }

    this.client.on('connect', () => {
      console.log('[Redis] Connected');
      this.status = RedisStatus.CONNECTED;
    });

    this.client.on('ready', () => {
      console.log('[Redis] Ready');
      this.status = RedisStatus.CONNECTED;
    });

    this.client.on('error', (error) => {
      console.error('[Redis] Error:', error.message);
      this.status = RedisStatus.ERROR;
    });

    this.client.on('close', () => {
      console.log('[Redis] Connection closed');
      this.status = RedisStatus.DISCONNECTED;
    });

    this.client.on('reconnecting', (delay: number) => {
      console.log(`[Redis] Reconnecting in ${delay}ms`);
      this.status = RedisStatus.CONNECTING;
    });

    this.client.on('end', () => {
      console.log('[Redis] Connection ended');
      this.status = RedisStatus.DISCONNECTED;
    });
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    console.log('[Redis] Disconnecting...');

    try {
      await this.client.quit();
      this.client = null;
      this.status = RedisStatus.DISCONNECTED;
      console.log('[Redis] Disconnected successfully');
    } catch (error) {
      console.error('[Redis] Disconnect failed:', error);
      // Force disconnect
      if (this.client) {
        this.client.disconnect();
      }
      this.client = null;
      this.status = RedisStatus.DISCONNECTED;
    }
  }

  /**
   * Health check - verify Redis connection is alive
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client || !this.isConnected()) {
      return false;
    }

    try {
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('[Redis] Health check failed:', error);
      this.status = RedisStatus.ERROR;
      return false;
    }
  }

  /**
   * Get cache value by key
   */
  async get(key: string): Promise<string | null> {
    if (!this.isConnected() || !this.client) {
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`[Redis] GET failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache value with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.isConnected() || !this.client) {
      return false;
    }

    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      console.error(`[Redis] SET failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cache key
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConnected() || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`[Redis] DEL failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<boolean> {
    if (!this.isConnected() || !this.client) {
      return false;
    }

    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      console.error('[Redis] FLUSHDB failed:', error);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
  }
}

// Singleton instance
const redisManager = new RedisManager();

export default redisManager;
export { redisManager };
