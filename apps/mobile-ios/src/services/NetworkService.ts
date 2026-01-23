/**
 * Network Service
 * API client for network monitoring data
 */

export class NetworkService {
  async getRecentEvents(limit: number) {
    // TODO: Implement actual API call
    // Mock data for now
    const events = [];
    const now = Date.now();

    const domains = [
      'google-analytics.com',
      'facebook.com',
      'doubleclick.net',
      'github.com',
      'cloudflare.com',
      'google.com',
    ];

    for (let i = 0; i < Math.min(limit, 20); i++) {
      const domain = domains[i % domains.length];
      const isTracker = domain.includes('analytics') || domain.includes('doubleclick') || domain === 'facebook.com';

      events.push({
        id: `event-${i}`,
        timestamp: new Date(now - i * 60000),
        sourceIP: '192.168.1.100',
        destinationIP: '142.250.80.46',
        destinationDomain: domain,
        protocol: 'TCP',
        port: 443,
        bytesIn: Math.floor(Math.random() * 10000),
        bytesOut: Math.floor(Math.random() * 5000),
        blocked: isTracker,
      });
    }

    return events;
  }

  async getNetworkStats() {
    // TODO: Implement actual API call
    return {
      totalConnections: 1543,
      blockedConnections: 487,
      totalBytesIn: 52428800, // 50 MB
      totalBytesOut: 10485760, // 10 MB
      activeConnections: 23,
      protectionEnabled: true,
    };
  }
}
