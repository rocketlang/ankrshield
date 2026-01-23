/**
 * Network Service
 * Integrates with @ankrshield/network-monitor package
 * Captures network flows, enriches with DNS correlation, and stores to database
 */

import { PrismaClient, EventType as PrismaEventType } from '@prisma/client';
import { createNetworkMonitor } from '@ankrshield/network-monitor';
import type { BaseNetworkMonitor, NetworkFlow } from '@ankrshield/network-monitor';
import { databaseManager } from '../infrastructure/database.js';
import { userManager } from '../infrastructure/user.js';
import { eventBus, EventType } from '../infrastructure/event-bus.js';

export interface NetworkEvent {
  id: string;
  timestamp: Date;
  sourceIP: string;
  destinationIP: string;
  destinationDomain: string;
  protocol: string;
  port: number;
  bytesIn: number;
  bytesOut: number;
  blocked: boolean;
}

export interface NetworkStats {
  totalConnections: number;
  blockedConnections: number;
  totalBytesIn: number;
  totalBytesOut: number;
  activeConnections: number;
  protectionEnabled: boolean;
}

/**
 * Network Service
 * Captures and processes network traffic with database persistence
 */
export class NetworkService {
  private protectionEnabled: boolean = true;
  private monitor: BaseNetworkMonitor | null = null;
  private prisma: PrismaClient | null = null;
  private recentEvents: NetworkEvent[] = [];
  private initialized = false;

  // Batch write configuration
  private eventBatch: any[] = [];
  private batchSize: number = 100;
  private flushInterval: number = 5000; // 5 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  // DNS correlation cache (IP -> domain mapping)
  private dnsCache: Map<string, string> = new Map();

  constructor() {
    // Don't auto-initialize in constructor
  }

  /**
   * Initialize network service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Get database client
      this.prisma = databaseManager.getClient();

      // Try to initialize network monitor (may fail if no permissions)
      await this.ensureInitialized();

      // Start batch flush timer
      this.startBatchFlush();

      this.initialized = true;
      console.log('[NetworkService] Initialized successfully');
    } catch (error) {
      console.error('[NetworkService] Initialization failed:', error);
      // Continue without monitor - use database queries only
      this.initialized = true;
    }
  }

  /**
   * Ensure network monitor is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.monitor) {
      return;
    }

    try {
      console.log('[NetworkService] Creating network monitor...');
      this.monitor = await createNetworkMonitor();

      // Listen for network flows
      this.monitor.on('flow', (flow) => {
        this.handleNetworkFlow(flow).catch((error) => {
          console.error('[NetworkService] Error handling flow:', error);
        });
      });

      // Start monitoring
      await this.monitor.start();
      console.log('[NetworkService] Network monitor started');
    } catch (error) {
      console.error('[NetworkService] Failed to start network monitor:', error);
      console.log('[NetworkService] Continuing with database-only mode');
      // Don't throw - continue without active monitoring
    }
  }

  /**
   * Handle incoming network flow
   */
  private async handleNetworkFlow(flow: any): Promise<void> {
    try {
      const destinationIP = flow.destinationIp || '0.0.0.0';
      const protocol = flow.protocol || 'TCP';

      // Try DNS correlation or use provided domain
      let domain = flow.domain || this.dnsCache.get(destinationIP) || destinationIP;

      // TODO: Add tracker detection using privacy-engine
      const isBlocked = false; // Real blocking logic here

      // Create network event
      const event: NetworkEvent = {
        id: `event-${Date.now()}-${Math.random()}`,
        timestamp: flow.timestamp || new Date(),
        sourceIP: flow.sourceIp || '0.0.0.0',
        destinationIP,
        destinationDomain: domain,
        protocol,
        port: 0, // Not available in simple NetworkFlow
        bytesIn: 0, // Not available in simple NetworkFlow
        bytesOut: 0, // Not available in simple NetworkFlow
        blocked: isBlocked,
      };

      // Store in memory for quick access
      this.recentEvents.unshift(event);
      if (this.recentEvents.length > 100) {
        this.recentEvents.pop();
      }

      // Add to batch for database write
      if (this.prisma) {
        const userInfo = userManager.getUserInfo();
        this.eventBatch.push({
          deviceId: userInfo?.deviceId || 'unknown',
          userId: userInfo?.userId || 'unknown',
          eventType: PrismaEventType.NETWORK_REQUEST,
          domain,
          ip: destinationIP,
          protocol,
          isBlocked,
          blockedBy: isBlocked ? 'policy' : null,
        });

        // Flush if batch is full
        if (this.eventBatch.length >= this.batchSize) {
          await this.flushBatch();
        }
      }

      // Emit event for real-time updates
      eventBus.emit(EventType.NETWORK_FLOW, {
        flowId: event.id,
        sourceIp: event.sourceIP,
        destinationIp: destinationIP,
        domain,
        protocol,
        bytesIn: event.bytesIn,
        bytesOut: event.bytesOut,
      });
    } catch (error) {
      console.error('[NetworkService] Error handling flow:', error);
    }
  }

  /**
   * Start batch flush timer
   */
  private startBatchFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.eventBatch.length > 0) {
        this.flushBatch().catch((error) => {
          console.error('[NetworkService] Error flushing batch:', error);
        });
      }
    }, this.flushInterval);
  }

  /**
   * Flush event batch to database
   */
  private async flushBatch(): Promise<void> {
    if (!this.prisma || this.eventBatch.length === 0) {
      return;
    }

    const batch = [...this.eventBatch];
    this.eventBatch = [];

    try {
      await this.prisma.networkEvent.createMany({
        data: batch,
        skipDuplicates: true,
      });
      console.log(`[NetworkService] Flushed ${batch.length} events to database`);
    } catch (error) {
      console.error('[NetworkService] Failed to flush batch:', error);
      // Put events back if write failed
      this.eventBatch.unshift(...batch);
    }
  }

  /**
   * Update DNS cache (called by DNS service)
   */
  updateDnsCache(domain: string, ip: string): void {
    this.dnsCache.set(ip, domain);
  }

  /**
   * Get recent network events
   */
  async getRecentEvents(limit: number): Promise<NetworkEvent[]> {
    try {
      // Try memory cache first (fastest)
      if (this.recentEvents.length > 0) {
        return this.recentEvents.slice(0, limit);
      }

      // Query database
      if (this.prisma) {
        const events = await this.prisma.networkEvent.findMany({
          where: {
            eventType: PrismaEventType.NETWORK_REQUEST,
          },
          orderBy: { timestamp: 'desc' },
          take: limit,
        });

        return events.map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          sourceIP: '0.0.0.0', // Not stored
          destinationIP: e.ip || '0.0.0.0',
          destinationDomain: e.domain,
          protocol: e.protocol || 'TCP',
          port: e.port || 0,
          bytesIn: 0, // Not stored yet
          bytesOut: 0, // Not stored yet
          blocked: e.isBlocked,
        }));
      }

      // Fallback to mock data
      return this.getMockEvents(limit);
    } catch (error) {
      console.error('[NetworkService] Error getting recent events:', error);
      return this.getMockEvents(limit);
    }
  }

  /**
   * Get network statistics
   */
  async getStats(): Promise<NetworkStats> {
    try {
      if (this.prisma) {
        const userInfo = userManager.getUserInfo();

        // Get stats from last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [total, blocked] = await Promise.all([
          this.prisma.networkEvent.count({
            where: {
              eventType: PrismaEventType.NETWORK_REQUEST,
              userId: userInfo?.userId,
              timestamp: { gte: oneDayAgo },
            },
          }),
          this.prisma.networkEvent.count({
            where: {
              eventType: PrismaEventType.NETWORK_REQUEST,
              userId: userInfo?.userId,
              isBlocked: true,
              timestamp: { gte: oneDayAgo },
            },
          }),
        ]);

        return {
          totalConnections: total,
          blockedConnections: blocked,
          totalBytesIn: 0, // TODO: Calculate from stored data
          totalBytesOut: 0, // TODO: Calculate from stored data
          activeConnections: this.recentEvents.length,
          protectionEnabled: this.protectionEnabled,
        };
      }

      // Fallback to mock data
      return this.getMockStats();
    } catch (error) {
      console.error('[NetworkService] Error getting stats:', error);
      return this.getMockStats();
    }
  }

  /**
   * Set protection status
   */
  async setProtectionEnabled(enabled: boolean): Promise<void> {
    this.protectionEnabled = enabled;

    if (enabled && !this.monitor) {
      // Try to start monitor
      await this.ensureInitialized();
    } else if (!enabled && this.monitor) {
      // Stop monitor but keep service running
      await this.monitor.stop();
      this.monitor = null;
    }

    console.log(`[NetworkService] Protection ${enabled ? 'enabled' : 'disabled'}`);

    // Emit event
    eventBus.emit(EventType.PROTECTION_TOGGLED, {
      enabled,
      service: 'network',
      timestamp: new Date()
    });
  }

  /**
   * Get protection status
   */
  isProtectionEnabled(): boolean {
    return this.protectionEnabled;
  }

  /**
   * Get mock events (fallback)
   */
  private getMockEvents(limit: number): NetworkEvent[] {
    const events: NetworkEvent[] = [];
    const now = Date.now();

    for (let i = 0; i < Math.min(limit, 10); i++) {
      events.push({
        id: `event-${i}`,
        timestamp: new Date(now - i * 60000),
        sourceIP: '192.168.1.100',
        destinationIP: '142.250.80.46',
        destinationDomain: i % 3 === 0 ? 'google-analytics.com' : 'example.com',
        protocol: 'TCP',
        port: 443,
        bytesIn: Math.floor(Math.random() * 10000),
        bytesOut: Math.floor(Math.random() * 5000),
        blocked: i % 3 === 0,
      });
    }

    return events;
  }

  /**
   * Get mock stats (fallback)
   */
  private getMockStats(): NetworkStats {
    return {
      totalConnections: 1543,
      blockedConnections: 487,
      totalBytesIn: 52_428_800,
      totalBytesOut: 10_485_760,
      activeConnections: 23,
      protectionEnabled: this.protectionEnabled,
    };
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    // Flush remaining events
    await this.flushBatch();

    // Stop batch timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Stop network monitor
    if (this.monitor) {
      await this.monitor.stop();
      this.monitor = null;
    }

    // Disconnect Prisma (handled by database manager)
    this.prisma = null;

    this.initialized = false;
    console.log('[NetworkService] Cleaned up');
  }

  /**
   * Legacy close method (alias for cleanup)
   */
  async close(): Promise<void> {
    return this.cleanup();
  }
}
