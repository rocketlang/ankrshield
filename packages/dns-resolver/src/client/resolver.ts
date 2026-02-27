/**
 * Main DNS Resolver
 *
 * Orchestrates DNS resolution with:
 * - DoH client for queries
 * - Blocklist checking
 * - Redis caching
 * - Query logging
 */

import { isAllowedForApp } from '../blocklist/app-allowlist';
import { BlocklistManager } from '../blocklist/manager';
import { DNSCache } from '../cache/dns-cache';
import { DNSResponse, DNSResolverConfig } from '../index';
import { DNSLogger } from '../logger/dns-logger';

import { DoHClient } from './doh-client';

export class DNSResolver {
  private dohClient: DoHClient;
  private cache?: DNSCache;
  private blocklist?: BlocklistManager;
  private logger?: DNSLogger;
  private totalQueries: number = 0;
  private blockedQueries: number = 0;

  constructor(config: DNSResolverConfig) {
    this.dohClient = new DoHClient(config.providers);

    // Initialize cache if enabled
    if (config.cacheEnabled) {
      this.cache = new DNSCache(
        config.redis ? `redis://${config.redis.host}:${config.redis.port}` : undefined
      );
    }

    // Initialize blocklist if enabled
    if (config.blocklistEnabled) {
      this.blocklist = new BlocklistManager();
    }

    // Initialize logger if enabled
    if (config.loggingEnabled) {
      this.logger = new DNSLogger(
        config.redis ? `redis://${config.redis.host}:${config.redis.port}` : undefined
      );
    }
  }

  /**
   * Initialize blocklist (must be called before resolving)
   */
  async initialize(): Promise<void> {
    if (this.blocklist) {
      await this.blocklist.loadFromDatabase();
    }
  }

  /**
   * Resolve a domain with full pipeline:
   * 1. Check cache
   * 2. Check blocklist (skipped for app-consented domains)
   * 3. Query DNS
   * 4. Update cache
   * 5. Log query
   *
   * @param queryingApp - Optional package name of the querying app. If provided,
   *                      domains on that app's consent allowlist bypass the blocklist
   *                      (surgical inhibition — never block expected app connections).
   */
  async resolve(
    domain: string,
    recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' = 'A',
    deviceId?: string,
    userId?: string,
    queryingApp?: string
  ): Promise<DNSResponse & { blocked?: boolean; blockedReason?: string; cached?: boolean }> {
    this.totalQueries++;
    const startTime = performance.now();

    // Step 1: Check cache
    if (this.cache) {
      const cached = await this.cache.get(domain, recordType);
      if (cached) {
        const latency = performance.now() - startTime;

        // Log cached query
        if (this.logger) {
          await this.logger.logQuery({
            domain,
            recordType,
            deviceId,
            userId,
            blocked: false,
            response: cached,
            latency,
          });
        }

        return { ...cached, cached: true };
      }
    }

    // Step 2: Check blocklist — consent-aware: skip if domain is allowlisted for the querying app
    if (this.blocklist) {
      const allowedByConsent = queryingApp ? isAllowedForApp(queryingApp, domain) : false;
      const isBlocked = allowedByConsent ? false : await this.blocklist.isBlocked(domain);
      if (isBlocked) {
        this.blockedQueries++;
        const info = await this.blocklist.getDomainInfo(domain);
        const latency = performance.now() - startTime;

        const blockedResponse = {
          status: 3, // NXDOMAIN
          answers: [],
          query: { name: domain, type: recordType },
          blocked: true,
          blockedReason: `Blocked by ${info?.category || 'blocklist'}`,
        };

        // Log blocked query
        if (this.logger) {
          await this.logger.logQuery({
            domain,
            recordType,
            deviceId,
            userId,
            blocked: true,
            blockedReason: blockedResponse.blockedReason,
            response: blockedResponse,
            latency,
          });
        }

        return blockedResponse;
      }
    }

    // Step 3: Query DNS via DoH
    const response = await this.dohClient.resolve(domain, recordType);
    const latency = performance.now() - startTime;

    // Step 4: Update cache
    if (this.cache && response.answers.length > 0) {
      await this.cache.set(domain, recordType, response);
    }

    // Step 5: Log query
    if (this.logger) {
      await this.logger.logQuery({
        domain,
        recordType,
        deviceId,
        userId,
        blocked: false,
        response,
        latency,
      });
    }

    return { ...response, blocked: false, cached: false };
  }

  /**
   * Check if a domain is blocked.
   *
   * @param domain      - The domain to check
   * @param queryingApp - Optional package name of the querying app.
   *                      If provided and the domain is on the app's consent allowlist,
   *                      returns { blocked: false } regardless of blocklist state.
   */
  async isBlocked(
    domain: string,
    queryingApp?: string
  ): Promise<{ blocked: boolean; reason?: string }> {
    if (!this.blocklist) {
      return { blocked: false };
    }

    // Consent-aware: domains that belong to the app's stated purpose are never blocked
    if (queryingApp && isAllowedForApp(queryingApp, domain)) {
      return { blocked: false };
    }

    const blocked = await this.blocklist.isBlocked(domain);
    if (blocked) {
      const info = await this.blocklist.getDomainInfo(domain);
      return {
        blocked: true,
        reason: `Blocked by ${info?.category || 'blocklist'} (Threat: ${info?.threatLevel || 'MEDIUM'})`,
      };
    }

    return { blocked: false };
  }

  /**
   * Get resolver statistics
   */
  async getStats() {
    const cacheStats = this.cache ? await this.cache.getStats() : null;

    return {
      totalQueries: this.totalQueries,
      blockedQueries: this.blockedQueries,
      allowedQueries: this.totalQueries - this.blockedQueries,
      blockRate: this.totalQueries > 0 ? this.blockedQueries / this.totalQueries : 0,
      cacheHits: cacheStats?.hits || 0,
      cacheMisses: cacheStats?.misses || 0,
      cacheHitRate: cacheStats?.hitRate || 0,
      cacheSize: cacheStats?.size || 0,
      avgCacheTTL: cacheStats?.avgTTL || 0,
    };
  }

  /**
   * Clear DNS cache
   */
  async clearCache(): Promise<void> {
    if (this.cache) {
      await this.cache.clear();
    }
  }

  /**
   * Get logger statistics
   */
  async getLoggerStats() {
    if (this.logger) {
      return await this.logger.getStats();
    }
    return null;
  }

  /**
   * Force flush logger
   */
  async flushLogs(): Promise<void> {
    if (this.logger) {
      await this.logger.flush();
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.cache) {
      await this.cache.close();
    }
    if (this.blocklist) {
      await this.blocklist.close();
    }
    if (this.logger) {
      await this.logger.close();
    }
  }
}
