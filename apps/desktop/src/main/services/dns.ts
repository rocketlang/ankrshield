/**
 * DNS Service
 * Integrates with @ankrshield/dns-resolver package
 * Manages DNS resolution, blocklist, caching, and system DNS configuration
 */

import { DNSResolver } from '@ankrshield/dns-resolver';
import type { DNSResolverConfig } from '@ankrshield/dns-resolver';
import { databaseManager } from '../infrastructure/database.js';
import { redisManager } from '../infrastructure/redis.js';
import { userManager } from '../infrastructure/user.js';
import { eventBus, EventType } from '../infrastructure/event-bus.js';
import { configManager } from '../config.js';
import { EventType as PrismaEventType } from '@prisma/client';

export interface DNSQuery {
  id: string;
  timestamp: Date;
  domain: string;
  queryType: string;
  responseCode: string;
  answerIP?: string;
  blocked: boolean;
  latency: number;
}

export interface DNSStats {
  totalQueries: number;
  blockedQueries: number;
  cacheHits: number;
  cacheMisses: number;
  averageLatency: number;
  topDomains: Array<{ domain: string; count: number }>;
}

/**
 * DNS Service
 * Interface to dns-resolver backend with database integration
 */
export class DNSService {
  private resolver: DNSResolver | null = null;
  private initialized = false;
  private protectionEnabled = true;

  /**
   * Initialize DNS resolver
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const config = configManager.get();

      // Check if DNS resolver is enabled
      if (!config.enableDnsResolver) {
        console.log('[DNS] DNS resolver disabled via configuration');
        return;
      }

      // Build DNS resolver config
      const redisClient = redisManager.getClient();
      const resolverConfig: DNSResolverConfig = {
        providers: [
          { name: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query', priority: 1 },
          { name: 'google', url: 'https://dns.google/dns-query', priority: 2 },
        ],
        cacheEnabled: true,
        cacheTTL: { min: 60, max: 3600 },
        blocklistEnabled: true,
        loggingEnabled: true,
      };

      // Add Redis config if available
      if (redisClient) {
        // ioredis client available, pass connection string
        const redisUrl = config.redisUrl || 'redis://localhost:6379';
        resolverConfig.redis = {
          host: redisUrl.includes('://') ? redisUrl.split('://')[1].split(':')[0] : 'localhost',
          port: redisUrl.includes(':') ? parseInt(redisUrl.split(':')[2] || '6379') : 6379,
        };
      }

      // Create resolver
      this.resolver = new DNSResolver(resolverConfig);
      await this.resolver.initialize();

      this.initialized = true;
      console.log('[DNS] DNS resolver initialized successfully');

      // Emit service started event
      eventBus.emit(EventType.SERVICE_STARTED, {
        serviceName: 'dns',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[DNS] Failed to initialize DNS resolver:', error);
      throw error;
    }
  }

  /**
   * Resolve a domain name
   */
  async resolve(domain: string, recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' = 'A'): Promise<any> {
    if (!this.resolver) {
      throw new Error('DNS resolver not initialized');
    }

    const userInfo = userManager.getUserInfo();
    const result = await this.resolver.resolve(domain, recordType, userInfo.deviceId, userInfo.userId);

    // Emit events
    if (result.blocked) {
      eventBus.emit(EventType.DNS_BLOCKED, {
        domain,
        reason: result.blockedReason || 'Blocked by blocklist',
        timestamp: new Date(),
      });
    } else {
      eventBus.emit(EventType.DNS_RESOLVED, {
        domain,
        ips: result.answers.map((a: any) => a.data),
        ttl: result.answers[0]?.ttl || 0,
        cached: result.cached || false,
      });
    }

    return result;
  }

  /**
   * Check if a domain is blocked
   */
  async isBlocked(domain: string): Promise<{ blocked: boolean; reason?: string }> {
    if (!this.resolver) {
      return { blocked: false };
    }

    return await this.resolver.isBlocked(domain);
  }

  /**
   * Get DNS statistics from resolver
   */
  async getStats(): Promise<DNSStats> {
    try {
      if (!this.resolver) {
        return this.getMockStats();
      }

      // Get stats from resolver (in-memory counters)
      const resolverStats = await this.resolver.getStats();

      // Get top domains from database
      const topDomains = await this.getTopDomainsFromDB();

      return {
        totalQueries: resolverStats.totalQueries,
        blockedQueries: resolverStats.blockedQueries,
        cacheHits: resolverStats.cacheHits || 0,
        cacheMisses: resolverStats.cacheMisses || 0,
        averageLatency: 45, // TODO: Calculate from database
        topDomains: topDomains || [
          { domain: 'google.com', count: 234 },
          { domain: 'cloudflare.com', count: 189 },
          { domain: 'github.com', count: 156 },
        ],
      };
    } catch (error) {
      console.error('[DNS] Error getting DNS stats:', error);
      return this.getMockStats();
    }
  }

  /**
   * Get recent DNS queries from database
   */
  async getRecentQueries(limit: number = 10): Promise<DNSQuery[]> {
    try {
      // Check if database is connected
      if (!databaseManager.isConnected()) {
        console.warn('[DNS] Database not connected, returning empty queries');
        return [];
      }

      const prisma = databaseManager.getClient();
      const userInfo = userManager.getUserInfo();

      // Query NetworkEvent table for DNS queries
      const events = await prisma.networkEvent.findMany({
        where: {
          userId: userInfo.userId,
          eventType: PrismaEventType.DNS_QUERY,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });

      // Transform to DNSQuery format
      return events.map((event) => ({
        id: event.id,
        timestamp: event.timestamp,
        domain: event.domain,
        queryType: event.protocol || 'A',
        responseCode: event.isBlocked ? 'BLOCKED' : 'NOERROR',
        answerIP: event.ip || undefined,
        blocked: event.isBlocked,
        latency: 0, // TODO: Add latency field to schema
      }));
    } catch (error) {
      console.error('[DNS] Error getting recent queries from database:', error);
      // Return empty array instead of mock data
      return [];
    }
  }

  /**
   * Get top domains from database
   */
  private async getTopDomainsFromDB(): Promise<Array<{ domain: string; count: number }> | null> {
    try {
      if (!databaseManager.isConnected()) {
        return null;
      }

      const prisma = databaseManager.getClient();
      const userInfo = userManager.getUserInfo();

      // Query top domains from last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const topDomains = await prisma.$queryRaw<Array<{ domain: string; count: bigint }>>`
        SELECT domain, COUNT(*)::bigint as count
        FROM "NetworkEvent"
        WHERE "userId" = ${userInfo.userId}
          AND "eventType" = 'DNS_QUERY'
          AND timestamp >= ${oneDayAgo}
        GROUP BY domain
        ORDER BY count DESC
        LIMIT 10
      `;

      return topDomains.map((d) => ({
        domain: d.domain,
        count: Number(d.count),
      }));
    } catch (error) {
      console.error('[DNS] Error querying top domains:', error);
      return null;
    }
  }

  /**
   * Toggle DNS protection
   */
  async toggleProtection(enabled: boolean): Promise<boolean> {
    this.protectionEnabled = enabled;

    // Emit protection toggled event
    eventBus.emit(EventType.PROTECTION_TOGGLED, {
      enabled,
      service: 'dns',
      timestamp: new Date(),
    });

    console.log(`[DNS] Protection ${enabled ? 'enabled' : 'disabled'}`);

    // TODO: Implement system DNS modification
    // - On enable: Start local DNS server, modify system DNS settings
    // - On disable: Stop local DNS server, restore original DNS settings
    // This requires platform-specific implementation:
    // - Linux: Modify /etc/resolv.conf or systemd-resolved
    // - Windows: Modify network adapter DNS settings via netsh
    // - macOS: Use networksetup command

    return this.protectionEnabled;
  }

  /**
   * Check if protection is enabled
   */
  isProtectionEnabled(): boolean {
    return this.protectionEnabled;
  }

  /**
   * Clear DNS cache
   */
  async clearCache(): Promise<void> {
    if (this.resolver) {
      await this.resolver.clearCache();
      console.log('[DNS] Cache cleared');
    }
  }

  /**
   * Flush DNS logs to database
   */
  async flushLogs(): Promise<void> {
    if (this.resolver) {
      await this.resolver.flushLogs();
      console.log('[DNS] Logs flushed');
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.resolver) {
      await this.resolver.close();
      this.resolver = null;
    }

    this.initialized = false;
    console.log('[DNS] Cleanup complete');

    // Emit service stopped event
    eventBus.emit(EventType.SERVICE_STOPPED, {
      serviceName: 'dns',
      timestamp: new Date(),
    });
  }

  /**
   * Get mock stats (fallback)
   */
  private getMockStats(): DNSStats {
    return {
      totalQueries: 0,
      blockedQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLatency: 0,
      topDomains: [],
    };
  }
}
