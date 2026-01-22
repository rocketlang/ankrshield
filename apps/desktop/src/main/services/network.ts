/**
 * Network Service
 * Integrates with network-monitor package
 */

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
 * Interface to network-monitor backend
 */
export class NetworkService {
  private protectionEnabled: boolean = true;

  /**
   * Get recent network events
   */
  async getRecentEvents(limit: number): Promise<NetworkEvent[]> {
    try {
      // TODO: Connect to network-monitor backend
      // For now, return mock data
      const events: NetworkEvent[] = [];
      const now = Date.now();

      for (let i = 0; i < Math.min(limit, 10); i++) {
        events.push({
          id: `event-${i}`,
          timestamp: new Date(now - i * 60000), // 1 minute apart
          sourceIP: '192.168.1.100',
          destinationIP: '142.250.80.46',
          destinationDomain: i % 3 === 0 ? 'google-analytics.com' : i % 3 === 1 ? 'facebook.com' : 'example.com',
          protocol: 'TCP',
          port: 443,
          bytesIn: Math.floor(Math.random() * 10000),
          bytesOut: Math.floor(Math.random() * 5000),
          blocked: i % 3 === 0,
        });
      }

      return events;
    } catch (error) {
      console.error('Error getting recent events:', error);
      throw error;
    }
  }

  /**
   * Get network statistics
   */
  async getStats(): Promise<NetworkStats> {
    try {
      // TODO: Connect to network-monitor backend
      return {
        totalConnections: 1543,
        blockedConnections: 487,
        totalBytesIn: 52_428_800, // 50 MB
        totalBytesOut: 10_485_760, // 10 MB
        activeConnections: 23,
        protectionEnabled: this.protectionEnabled,
      };
    } catch (error) {
      console.error('Error getting network stats:', error);
      throw error;
    }
  }

  /**
   * Set protection status
   */
  async setProtectionEnabled(enabled: boolean): Promise<void> {
    try {
      // TODO: Connect to network-monitor backend to enable/disable protection
      this.protectionEnabled = enabled;
      console.log(`Network protection ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error setting protection status:', error);
      throw error;
    }
  }

  /**
   * Get protection status
   */
  isProtectionEnabled(): boolean {
    return this.protectionEnabled;
  }
}
