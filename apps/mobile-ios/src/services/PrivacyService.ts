/**
 * Privacy Service
 *
 * Derives privacy metrics from the AnkrShield backend:
 *   GET /warrior/threats/live  — threat score, attack chains, quarantined agents
 *   GET /monitor/stats         — DNS/traffic block counts
 *
 * Privacy score = 100 − overallThreatScore (server-side).
 * When the server is unreachable, falls back to safe static values so
 * the UI never shows an error screen on first open.
 */
import { API_BASE } from '../config';
import { MdmStorage } from '../mdm/storage';

import { getLastScan, scanAppScore } from './ScanStore';
import { vpnService } from './VpnService';

// ─── Response types from the server ──────────────────────────────────────────

interface LiveThreatsResponse {
  ok: boolean;
  timestamp: string;
  server: {
    uptimeSeconds: number;
    loadAvg1m: number;
    memUsedMb: number;
    memTotalMb: number;
    heapUsedMb: number;
    platform: string;
    hostname: string;
  };
  warrior: {
    running: boolean;
    overallThreatScore: number;
    attackChainsTotal: number;
    activeQuarantines: number;
    recentChains: Array<{
      id: string;
      type: string;
      score: number;
      narrative: string;
      startTime: string;
      eventCount: number;
    }>;
    quarantinedAgents: Array<{
      agentId: string;
      agentName: string;
      reason: string;
      since: string;
    }>;
  };
}

interface MonitorStatsResponse {
  monitor: string;
  period: string;
  stats: {
    totalRequests: number;
    blockedRequests: number;
    allowedRequests: number;
    blockRate: string; // "42.3%"
  } | null;
  timestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Higher = safer. Thresholds match PrivacyScoreCircle so label + colour agree.
function scoreToLevel(score: number): string {
  if (score >= 85) {
    return 'excellent';
  }
  if (score >= 70) {
    return 'good';
  }
  if (score >= 50) {
    return 'fair';
  }
  return 'poor';
}

async function fetchLive(): Promise<LiveThreatsResponse> {
  const res = await fetch(`${API_BASE}/warrior/threats/live`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<LiveThreatsResponse>;
}

async function fetchMonitorStats(): Promise<MonitorStatsResponse> {
  const res = await fetch(`${API_BASE}/monitor/stats`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<MonitorStatsResponse>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PrivacyService {
  async getPrivacyScore() {
    const [live, vpnStats] = await Promise.all([
      fetchLive(),
      vpnService.getStats().catch(() => null),
    ]);

    const serverPenalty = Math.min(20, Math.round(live.warrior.overallThreatScore * 0.2));

    // DNS score: dynamic — based on on-device block rate when VPN is running
    const blockRate =
      vpnStats && vpnStats.totalQueries > 0
        ? Math.round((vpnStats.blockedCount / vpnStats.totalQueries) * 100)
        : 0;
    const dnsScore = vpnStats?.running ? Math.min(95, 55 + blockRate * 0.4) : 35;

    // Network score: from server load
    const loadPenalty = Math.min(15, Math.round(live.server.loadAvg1m * 5));
    const networkScore = Math.max(0, 100 - loadPenalty - serverPenalty);

    // App score: on-device scan result if available, else fall back to server attack chains.
    // scanAppScore() returns null when no scan has been run this session.
    const deviceScanScore = scanAppScore();
    const serverChainScore = Math.max(0, 90 - live.warrior.attackChainsTotal * 3);
    const appScore =
      deviceScanScore !== null
        ? Math.round(deviceScanScore * 0.7 + serverChainScore * 0.3)
        : serverChainScore;

    // Overall: weighted average
    const privacyScore = Math.round(networkScore * 0.35 + dnsScore * 0.35 + appScore * 0.3);

    return {
      userId: 'mobile-user',
      timestamp: new Date(live.timestamp),
      totalScore: Math.min(100, privacyScore),
      networkScore: Math.min(100, networkScore),
      dnsScore: Math.min(100, Math.round(dnsScore)),
      appScore: Math.min(100, appScore),
      level: scoreToLevel(privacyScore),
    };
  }

  async getStats() {
    const [live, monitorData] = await Promise.all([
      fetchLive().catch(() => null),
      fetchMonitorStats().catch(() => null),
    ]);

    const stats = monitorData?.stats;

    return {
      trackersBlocked: stats?.blockedRequests ?? live?.warrior.attackChainsTotal ?? 0,
      totalConnections: stats?.totalRequests ?? 0,
      dnsQueries: stats?.totalRequests ?? 0,
      activeConnections: live?.warrior.activeQuarantines ?? 0,
    };
  }

  /**
   * REAL score history — one point per day, persisted on-device. No fabrication:
   * we record today's actual privacy score once per day and return the real
   * accumulated points. A new user sees a single point; the trend builds as they
   * use AnkrShield. (Previously this synthesised a fake trend with random jitter.)
   */
  async getScoreHistory(days: number): Promise<{ timestamp: Date; score: number }[]> {
    const HISTORY_KEY = '@ankrshield/score-history';
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let history: { date: string; score: number }[] = [];
    try {
      const raw = await MdmStorage.getItem(HISTORY_KEY);
      if (raw) {
        history = JSON.parse(raw);
      }
    } catch {
      /* corrupt or absent — start fresh */
    }

    // Record today's REAL score once per day.
    if (!history.some((h) => h.date === today)) {
      const score = await this.getPrivacyScore().catch(() => null);
      if (score) {
        history.push({ date: today, score: score.totalScore });
        history = history.slice(-60); // keep two months max
        await MdmStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
      }
    }

    // Return only real points, newest `days` window.
    return history.slice(-days).map((h) => ({ timestamp: new Date(h.date), score: h.score }));
  }

  async getScoreBreakdown() {
    const [score, monitorData] = await Promise.all([
      this.getPrivacyScore(),
      fetchMonitorStats().catch(() => null),
    ]);

    const blockRatePct = monitorData?.stats ? parseFloat(monitorData.stats.blockRate) : 0;

    const recommendations: string[] = [];
    if (score.totalScore >= 80) {
      recommendations.push('Excellent privacy protection — keep it up!');
    } else {
      if (score.dnsScore < 60) {
        recommendations.push('Enable DNS filtering to block more trackers.');
      }
      if (score.networkScore < 60) {
        recommendations.push('High server load detected — consider reducing active connections.');
      }
      if (score.appScore < 60) {
        recommendations.push('Attack chains detected — check Threat Alerts screen.');
      }
    }
    if (!getLastScan()) {
      recommendations.push('Run the App Scanner to include installed-app risk in your score.');
    }
    if (recommendations.length === 0 || (recommendations.length === 1 && !getLastScan())) {
      recommendations.push('Good protection. Review Threat Alerts for details.');
    }

    return {
      totalScore: score.totalScore,
      components: [
        {
          name: 'Network Activity',
          score: score.networkScore,
          weight: 0.35,
          contributionToTotal: Math.round(score.networkScore * 0.35),
        },
        {
          name: 'DNS Filtering',
          score: score.dnsScore,
          weight: 0.35,
          contributionToTotal: Math.round(score.dnsScore * 0.35),
        },
        {
          name: 'App Behaviour',
          score: score.appScore,
          weight: 0.3,
          contributionToTotal: Math.round(score.appScore * 0.3),
        },
      ],
      blockRate: blockRatePct,
      topIssues: [],
      recommendations,
    };
  }
}
