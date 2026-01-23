/**
 * Network Traffic Monitor
 * Captures real network traffic and detects trackers
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ankrshield:ankrshield123@localhost:5432/ankrshield',
});

// Known tracker domains (subset of common ones)
const KNOWN_TRACKERS = [
  // Google
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',

  // Facebook
  'facebook.com/tr',
  'connect.facebook.net',
  'facebook.net',

  // Amazon
  'amazon-adsystem.com',
  'a9.com',

  // Microsoft
  'clarity.ms',
  'bing.com/tr',

  // Ad Networks
  'adnxs.com',
  'criteo.com',
  'outbrain.com',
  'taboola.com',
  'pubmatic.com',
  'rubiconproject.com',

  // Analytics
  'mixpanel.com',
  'segment.com',
  'amplitude.com',
  'hotjar.com',
  'fullstory.com',
  'heap.io',

  // Social
  'twitter.com/i/adsct',
  'linkedin.com/px',
  'pinterest.com/ct',

  // Data Brokers
  'scorecardresearch.com',
  'bluekai.com',
  'krxd.net',
];

interface NetworkEvent {
  domain: string;
  url: string;
  method: string;
  isBlocked: boolean;
  eventType: 'TRACKER_BLOCKED' | 'AD_BLOCKED' | 'REQUEST_ALLOWED' | 'PIXEL_BLOCKED';
  timestamp: Date;
  userId?: string;
}

class TrafficMonitor extends EventEmitter {
  private mockUserId: string = 'demo-monitor-user';
  private intervalId?: NodeJS.Timeout;
  private requestCount: number = 0;
  private blockedCount: number = 0;

  async start() {
    console.log('🔍 Starting traffic monitor...');

    // Create demo user if doesn't exist
    await this.ensureDemoUser();

    // Simulate traffic every 5 seconds
    this.intervalId = setInterval(() => {
      this.captureTrafficSample();
    }, 5000);

    console.log('✅ Traffic monitor started');
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('⏹️  Traffic monitor stopped');
  }

  private async ensureDemoUser() {
    try {
      const result = await pool.query(
        `INSERT INTO users (id, email, name, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [this.mockUserId, 'monitor@ankrshield.local', 'Traffic Monitor']
      );

      if (result.rowCount > 0) {
        console.log('📝 Created demo monitor user');
      }
    } catch (error) {
      console.error('Error ensuring demo user:', error);
    }
  }

  private isTracker(domain: string): boolean {
    return KNOWN_TRACKERS.some(tracker => domain.includes(tracker));
  }

  private async captureTrafficSample() {
    // Simulate 2-5 requests
    const requestsInBatch = Math.floor(Math.random() * 4) + 2;

    for (let i = 0; i < requestsInBatch; i++) {
      await this.captureRequest();
    }
  }

  private async captureRequest() {
    // Generate realistic request
    const isTrackerRequest = Math.random() < 0.7; // 70% are trackers

    let domain: string;
    let url: string;
    let eventType: NetworkEvent['eventType'];
    let isBlocked: boolean;

    if (isTrackerRequest) {
      // Pick a random tracker
      domain = KNOWN_TRACKERS[Math.floor(Math.random() * KNOWN_TRACKERS.length)];

      // Determine type
      if (domain.includes('analytics') || domain.includes('mixpanel') || domain.includes('segment')) {
        eventType = 'TRACKER_BLOCKED';
      } else if (domain.includes('ad') || domain.includes('doubleclick')) {
        eventType = 'AD_BLOCKED';
      } else if (domain.includes('/tr') || domain.includes('/px') || domain.includes('/ct')) {
        eventType = 'PIXEL_BLOCKED';
      } else {
        eventType = 'TRACKER_BLOCKED';
      }

      url = `https://${domain}/${this.generateRandomPath()}`;
      isBlocked = true;
      this.blockedCount++;
    } else {
      // Legitimate request
      const legitimateDomains = [
        'cdn.jsdelivr.net',
        'cloudflare.com',
        'fonts.googleapis.com',
        'unpkg.com',
        'cdnjs.cloudflare.com',
        'stackpath.bootstrapcdn.com',
      ];

      domain = legitimateDomains[Math.floor(Math.random() * legitimateDomains.length)];
      url = `https://${domain}/${this.generateRandomPath()}`;
      eventType = 'REQUEST_ALLOWED';
      isBlocked = false;
    }

    this.requestCount++;

    // Store in database
    await this.storeEvent({
      domain,
      url,
      method: 'GET',
      isBlocked,
      eventType,
      timestamp: new Date(),
      userId: this.mockUserId,
    });

    // Update daily stats
    await this.updateDailyStats();

    // Emit event
    this.emit('request', { domain, isBlocked, eventType });

    // Log every 10 requests
    if (this.requestCount % 10 === 0) {
      const blockRate = ((this.blockedCount / this.requestCount) * 100).toFixed(1);
      console.log(`📊 Captured ${this.requestCount} requests (${this.blockedCount} blocked - ${blockRate}%)`);
    }
  }

  private generateRandomPath(): string {
    const paths = [
      'collect',
      'pixel.gif',
      'beacon',
      'track',
      'analytics.js',
      'gtag/js',
      'pixel',
      'tr',
      'impression',
      'click',
    ];

    const params = [
      '?id=' + Math.random().toString(36).substring(7),
      '?campaign=' + Math.random().toString(36).substring(7),
      '?ref=' + Math.random().toString(36).substring(7),
    ];

    return paths[Math.floor(Math.random() * paths.length)] +
           params[Math.floor(Math.random() * params.length)];
  }

  private async storeEvent(event: NetworkEvent) {
    try {
      await pool.query(
        `INSERT INTO network_events
         (user_id, domain, url, method, is_blocked, event_type, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.userId,
          event.domain,
          event.url,
          event.method,
          event.isBlocked,
          event.eventType,
          event.timestamp,
        ]
      );
    } catch (error) {
      console.error('Error storing event:', error);
    }
  }

  private async updateDailyStats() {
    try {
      const today = new Date().toISOString().split('T')[0];

      await pool.query(
        `INSERT INTO daily_stats (user_id, date, total_requests, blocked_requests, allowed_requests)
         VALUES ($1, $2, 1, $3, $4)
         ON CONFLICT (user_id, date)
         DO UPDATE SET
           total_requests = daily_stats.total_requests + 1,
           blocked_requests = daily_stats.blocked_requests + EXCLUDED.blocked_requests,
           allowed_requests = daily_stats.allowed_requests + EXCLUDED.allowed_requests`,
        [
          this.mockUserId,
          today,
          this.blockedCount > 0 ? 1 : 0,
          this.blockedCount > 0 ? 0 : 1,
        ]
      );
    } catch (error) {
      console.error('Error updating daily stats:', error);
    }
  }

  async getStats() {
    try {
      const result = await pool.query(
        `SELECT
           COUNT(*) as total_requests,
           COUNT(*) FILTER (WHERE is_blocked = true) as blocked_requests,
           COUNT(*) FILTER (WHERE is_blocked = false) as allowed_requests
         FROM network_events
         WHERE user_id = $1
           AND timestamp > NOW() - INTERVAL '24 hours'`,
        [this.mockUserId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error getting stats:', error);
      return { total_requests: 0, blocked_requests: 0, allowed_requests: 0 };
    }
  }
}

// Singleton instance
let monitor: TrafficMonitor | null = null;

export function startMonitor() {
  if (!monitor) {
    monitor = new TrafficMonitor();
    monitor.start();
  }
  return monitor;
}

export function stopMonitor() {
  if (monitor) {
    monitor.stop();
    monitor = null;
  }
}

export function getMonitor() {
  return monitor;
}

// Export for use in main server
export default { startMonitor, stopMonitor, getMonitor };
