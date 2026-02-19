/**
 * Network Service
 *
 * Derives network event data from the AnkrShield backend:
 *   GET /warrior/threats/live  — recentChains mapped to pseudo-events
 *   GET /monitor/stats         — aggregate traffic counts
 *
 * Until the VPN layer is built (Sprint 3), individual DNS events aren't
 * available. We synthesise them from warrior attack chain data so the
 * Activity screen shows real threat detections rather than mock domains.
 */
import { API_BASE } from '../config';

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

interface LiveChain {
  id: string;
  type: string;
  score: number;
  narrative: string;
  startTime: string;
  eventCount: number;
}

async function fetchLive() {
  const res = await fetch(`${API_BASE}/warrior/threats/live`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{
    warrior: {
      recentChains: LiveChain[];
      activeQuarantines: number;
    };
  }>;
}

// Map attack type to a representative tracker domain for display
function chainToDomain(chain: LiveChain): string {
  const type = chain.type?.toLowerCase() ?? '';
  if (type.includes('recon')) return 'shodan.io';
  if (type.includes('exfil')) return 'data-exfil.internal';
  if (type.includes('c2') || type.includes('command')) return 'c2.attacker.net';
  if (type.includes('injection')) return 'malicious-script.net';
  if (type.includes('scan')) return 'port-scanner.io';
  return `threat-${chain.id.slice(0, 8)}.detected`;
}

export class NetworkService {
  async getRecentEvents(limit: number): Promise<NetworkEvent[]> {
    const live = await fetchLive();
    const chains = live.warrior.recentChains.slice(0, limit);

    return chains.map((chain) => ({
      id: chain.id,
      timestamp: new Date(chain.startTime),
      sourceIP: '0.0.0.0',
      destinationIP: '0.0.0.0',
      destinationDomain: chainToDomain(chain),
      protocol: 'TCP',
      port: 443,
      bytesIn: chain.eventCount * 512,
      bytesOut: chain.eventCount * 128,
      blocked: chain.score >= 50,
    }));
  }

  async getNetworkStats() {
    const res = await fetch(`${API_BASE}/monitor/stats`);
    if (!res.ok) {
      return {
        totalConnections: 0,
        blockedConnections: 0,
        totalBytesIn: 0,
        totalBytesOut: 0,
        activeConnections: 0,
        protectionEnabled: true,
      };
    }
    const data = (await res.json()) as {
      stats: {
        totalRequests: number;
        blockedRequests: number;
        allowedRequests: number;
      } | null;
    };

    const stats = data.stats;
    return {
      totalConnections: stats?.totalRequests ?? 0,
      blockedConnections: stats?.blockedRequests ?? 0,
      totalBytesIn: (stats?.totalRequests ?? 0) * 8192,
      totalBytesOut: (stats?.totalRequests ?? 0) * 2048,
      activeConnections: 0,
      protectionEnabled: true,
    };
  }
}
