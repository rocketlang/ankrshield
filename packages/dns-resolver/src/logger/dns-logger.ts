/**
 * DNS Query Logger
 *
 * Batch logging to database with:
 * - Queue-based processing with Bull
 * - Batch inserts (100 queries per batch)
 * - Automatic flush every 5 seconds
 * - Error retry with exponential backoff
 */

import Queue from 'bull';
import { PrismaClient, EventType } from '@prisma/client';

interface DNSQueryLog {
  domain: string;
  recordType: string;
  deviceId?: string;
  userId?: string;
  blocked: boolean;
  blockedReason?: string;
  response?: any;
  timestamp: Date;
  latency?: number;
}

interface LoggerStats {
  totalLogged: number;
  batchesProcessed: number;
  errors: number;
  queueSize: number;
  processingTime: number;
}

export class DNSLogger {
  private queue: Queue.Queue<DNSQueryLog>;
  private prisma: PrismaClient;
  private buffer: DNSQueryLog[] = [];
  private batchSize: number = 100;
  private flushInterval: number = 5000; // 5 seconds
  private flushTimer?: NodeJS.Timeout;
  private stats: LoggerStats = {
    totalLogged: 0,
    batchesProcessed: 0,
    errors: 0,
    queueSize: 0,
    processingTime: 0,
  };

  constructor(redisUrl?: string, batchSize: number = 100) {
    this.batchSize = batchSize;
    this.prisma = new PrismaClient();

    // Initialize Bull queue with Redis
    this.queue = new Queue<DNSQueryLog>('dns-queries', redisUrl || process.env.REDIS_URL || 'redis://localhost:6379', {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    // Process queue
    this.queue.process(async (job) => {
      const log = job.data;
      this.buffer.push(log);

      // Flush if buffer is full
      if (this.buffer.length >= this.batchSize) {
        await this.flushBuffer();
      }
    });

    // Handle queue events
    this.queue.on('error', (error) => {
      console.error('DNS Logger queue error:', error);
      this.stats.errors++;
    });

    this.queue.on('failed', (job, error) => {
      console.error(`DNS log job ${job.id} failed:`, error);
      this.stats.errors++;
    });

    // Start flush timer
    this.startFlushTimer();
  }

  /**
   * Log a DNS query (adds to queue)
   */
  async logQuery(data: {
    domain: string;
    recordType: string;
    deviceId?: string;
    userId?: string;
    blocked: boolean;
    blockedReason?: string;
    response?: any;
    latency?: number;
  }): Promise<void> {
    try {
      await this.queue.add({
        ...data,
        timestamp: new Date(),
      });

      this.stats.queueSize = await this.queue.count();
    } catch (error) {
      console.error('Failed to add DNS query to log queue:', error);
      this.stats.errors++;
    }
  }

  /**
   * Flush buffer to database (batch insert)
   */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];

    const startTime = Date.now();

    try {
      // Batch insert to NetworkEvent table
      // Filter out logs without required deviceId and userId
      const validLogs = batch.filter(log => log.deviceId && log.userId);

      if (validLogs.length === 0) {
        console.warn('No valid logs to insert (missing deviceId/userId)');
        return;
      }

      await this.prisma.networkEvent.createMany({
        data: validLogs.map(log => {
          const event: any = {
            eventType: log.blocked ? EventType.DNS_BLOCKED : EventType.DNS_QUERY,
            domain: log.domain,
            protocol: 'DNS',
            isBlocked: log.blocked,
            deviceId: log.deviceId!,
            userId: log.userId!,
            timestamp: log.timestamp,
            duration: log.latency ? Math.round(log.latency) : undefined,
          };

          // Add optional fields
          if (log.blockedReason) {
            event.blockedBy = 'blocklist';
          }

          return event;
        }),
      });

      this.stats.totalLogged += batch.length;
      this.stats.batchesProcessed++;
      this.stats.processingTime = Date.now() - startTime;

      console.log(`✓ Logged ${batch.length} DNS queries to database (${this.stats.processingTime}ms)`);
    } catch (error) {
      console.error('Failed to flush DNS log buffer:', error);
      this.stats.errors++;

      // Put back in buffer for retry (up to 1000 entries to prevent memory issues)
      if (this.buffer.length < 1000) {
        this.buffer.unshift(...batch);
      }
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushBuffer();
    }, this.flushInterval);
  }

  /**
   * Force flush buffer immediately
   */
  async flush(): Promise<void> {
    await this.flushBuffer();
  }

  /**
   * Get logger statistics
   */
  async getStats(): Promise<LoggerStats> {
    this.stats.queueSize = await this.queue.count();
    return { ...this.stats };
  }

  /**
   * Close logger and cleanup
   */
  async close(): Promise<void> {
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining buffer
    await this.flushBuffer();

    // Close queue
    await this.queue.close();

    // Close Prisma
    await this.prisma.$disconnect();
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalLogged: 0,
      batchesProcessed: 0,
      errors: 0,
      queueSize: 0,
      processingTime: 0,
    };
  }
}

export { DNSQueryLog, LoggerStats };
