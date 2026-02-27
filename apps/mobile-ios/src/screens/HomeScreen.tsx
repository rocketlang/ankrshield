/**
 * Home Screen
 * Main landing screen with privacy score overview
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';

import { PrivacyScoreCircle } from '../components/PrivacyScoreCircle';
import { StatsCard } from '../components/StatsCard';
import { startBlocklistSync, getBlocklistStats } from '../services/ioc-sync';
import { PrivacyService } from '../services/PrivacyService';
import { startReporting } from '../services/StatsReporter';
import { vpnService, VpnStats } from '../services/VpnService';

const DEFAULT_VPN: VpnStats = {
  totalQueries: 0,
  blockedCount: 0,
  allowedCount: 0,
  lastBlocked: '',
  running: false,
};

export function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [vpnStats, setVpnStats] = useState<VpnStats>(DEFAULT_VPN);
  const [dnsPaused, setDnsPaused] = useState(false);
  const [pauseUntilMs, setPauseUntilMs] = useState(0);
  const [iocStats, setIocStats] = useState(getBlocklistStats());

  async function syncPauseState() {
    try {
      const s = await vpnService.getStats();
      setDnsPaused(s.paused ?? false);
      setPauseUntilMs(s.pauseUntilMs ?? 0);
    } catch (_e) {
      // VPN not running — leave paused state as-is
    }
  }

  async function handlePause(minutes: number) {
    await vpnService.pause(minutes).catch((_e) => {});
    await syncPauseState();
  }

  async function handleResume() {
    await vpnService.resume().catch((_e) => {});
    await syncPauseState();
  }

  function pauseLabel(): string {
    if (!dnsPaused || pauseUntilMs === 0) return '';
    const remaining = Math.max(0, pauseUntilMs - Date.now());
    const mins = Math.ceil(remaining / 60000);
    return `Resumes in ${mins}m`;
  }

  useEffect(() => {
    loadData();
    const serverInterval = setInterval(loadData, 30000);

    // Poll on-device VPN stats every 5 seconds
    const vpnInterval = setInterval(async () => {
      const s = await vpnService.getStats().catch(() => DEFAULT_VPN);
      setVpnStats(s);
      setDnsPaused(s.paused ?? false);
      setPauseUntilMs(s.pauseUntilMs ?? 0);
    }, 5000);

    // Report stats to server every 30 s (counters only, no domain names)
    const stopReporting = startReporting(() => vpnService.getStats().catch(() => DEFAULT_VPN));

    // Start IOC blocklist sync (6-hour poll, offline-first)
    const stopIocSync = startBlocklistSync();

    // Refresh IOC stats display every 30s
    const iocInterval = setInterval(() => setIocStats(getBlocklistStats()), 30000);

    return () => {
      clearInterval(serverInterval);
      clearInterval(vpnInterval);
      clearInterval(iocInterval);
      stopReporting();
      stopIocSync();
    };
  }, []);

  async function loadData() {
    try {
      const privacyService = new PrivacyService();
      const [scoreData, statsData, vpnData] = await Promise.all([
        privacyService.getPrivacyScore(),
        privacyService.getStats(),
        vpnService.getStats().catch(() => DEFAULT_VPN),
      ]);

      setScore(scoreData);
      setStats(statsData);
      setVpnStats(vpnData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* ── Fear-based purpose banner ───────────────────────────────────── */}
      {vpnStats.running && vpnStats.blockedCount > 0 ? (
        <View style={[styles.purposeBanner, styles.purposeBannerActive]}>
          <View style={styles.purposeBody}>
            <Text style={styles.purposeThreat}>
              🔴 {vpnStats.blockedCount} tracker{vpnStats.blockedCount !== 1 ? 's' : ''} tried to
              follow you
            </Text>
            <Text style={styles.purposeDefend}>AnkrShield intercepted every one.</Text>
          </View>
        </View>
      ) : vpnStats.running ? (
        <View style={[styles.purposeBanner, styles.purposeBannerActive]}>
          <View style={styles.purposeBody}>
            <Text style={styles.purposeThreat}>🛡 Shield active — watching for trackers</Text>
            <Text style={styles.purposeDefend}>
              Every DNS query is being inspected in real time.
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.purposeBanner, styles.purposeBannerWarn]}>
          <View style={styles.purposeBody}>
            <Text style={styles.purposeWarnTitle}>⚠️ Your phone is being watched.</Text>
            <Text style={styles.purposeWarnSub}>
              Ad networks, data brokers and trackers profile you with every tap.{'\n'}
              Enable DNS Shield in Settings to fight back.
            </Text>
          </View>
        </View>
      )}
      <View style={styles.purposePills}>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>🌐 Stops trackers</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>🔬 Finds spyware</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>⚔️ AI defence</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>📵 Blocks ads</Text>
        </View>
      </View>

      {/* IOC Blocklist sync status */}
      <View style={styles.iocBanner}>
        <Text style={styles.iocText}>
          {iocStats.count > 0
            ? `IOC Blocklist: ${iocStats.count.toLocaleString()} threats\u2002\u00b7\u2002Last sync: ${
                iocStats.lastSyncAt
                  ? iocStats.lastSyncAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'pending'
              }`
            : iocStats.syncInProgress
              ? 'Syncing IOC blocklist...'
              : 'IOC Blocklist: not yet synced'}
        </Text>
      </View>

      {score && (
        <View style={styles.scoreContainer}>
          <PrivacyScoreCircle score={score.totalScore} level={score.level} />

          <View style={styles.scoreBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Network</Text>
              <Text style={styles.breakdownValue}>{score.networkScore}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>DNS</Text>
              <Text style={styles.breakdownValue}>{score.dnsScore}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Apps</Text>
              <Text style={styles.breakdownValue}>{score.appScore}</Text>
            </View>
          </View>
        </View>
      )}

      {/* On-device VPN stats + quick pause controls */}
      {vpnStats.running && (
        <View style={[styles.vpnBanner, dnsPaused && styles.vpnBannerPaused]}>
          <View style={styles.vpnBannerRow}>
            <Text style={[styles.vpnBannerTitle, dnsPaused && styles.vpnBannerTitlePaused]}>
              {dnsPaused ? '⏸ DNS Shield Paused' : '🛡 DNS Shield Active'}
            </Text>
            {dnsPaused && pauseUntilMs > 0 && (
              <Text style={styles.pauseCountdown}>{pauseLabel()}</Text>
            )}
          </View>

          {!dnsPaused && (
            <View style={styles.vpnRow}>
              <View style={styles.vpnStat}>
                <Text style={styles.vpnStatValue}>{vpnStats.blockedCount}</Text>
                <Text style={styles.vpnStatLabel}>Blocked</Text>
              </View>
              <View style={styles.vpnDivider} />
              <View style={styles.vpnStat}>
                <Text style={styles.vpnStatValue}>{vpnStats.totalQueries}</Text>
                <Text style={styles.vpnStatLabel}>Queries</Text>
              </View>
              <View style={styles.vpnDivider} />
              <View style={styles.vpnStat}>
                <Text style={styles.vpnStatValue}>
                  {vpnStats.totalQueries > 0
                    ? Math.round((vpnStats.blockedCount / vpnStats.totalQueries) * 100)
                    : 0}
                  %
                </Text>
                <Text style={styles.vpnStatLabel}>Block Rate</Text>
              </View>
            </View>
          )}

          {vpnStats.lastBlocked !== '' && !dnsPaused && (
            <Text style={styles.lastBlocked} numberOfLines={1}>
              Last blocked: {vpnStats.lastBlocked}
            </Text>
          )}

          {/* Quick pause / resume row */}
          <View style={styles.pauseRow}>
            {dnsPaused ? (
              <TouchableOpacity style={styles.pauseBtnResume} onPress={handleResume}>
                <Text style={styles.pauseBtnTxt}>▶ Resume Now</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.pauseBtn} onPress={() => handlePause(5)}>
                  <Text style={styles.pauseBtnTxt}>⏸ 5 min</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pauseBtn} onPress={() => handlePause(30)}>
                  <Text style={styles.pauseBtnTxt}>⏸ 30 min</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {stats && (
        <View style={styles.statsGrid}>
          <StatsCard
            label="Trackers Blocked"
            value={vpnStats.running ? vpnStats.blockedCount : stats.trackersBlocked}
            color="#4CAF50"
          />
          <StatsCard label="Total Connections" value={stats.totalConnections} color="#2196F3" />
          <StatsCard
            label="DNS Queries"
            value={vpnStats.running ? vpnStats.totalQueries : stats.dnsQueries}
            color="#9C27B0"
          />
          <StatsCard label="Active Connections" value={stats.activeConnections} color="#FF9800" />
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.actionButtonText}>View Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('Activity')}
        >
          <Text style={styles.actionButtonText}>Recent Activity</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.actionButtonText}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.warriorButton]}
          onPress={() => navigation.navigate('Warrior')}
        >
          <Text style={styles.actionButtonText}>⚔️ AI Warrior</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.liveButton]}
          onPress={() => navigation.navigate('LiveThreats')}
        >
          <Text style={styles.actionButtonText}>🔴 Live Threats</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.scanButton]}
          onPress={() => navigation.navigate('AndroidMonitor')}
        >
          <Text style={styles.actionButtonText}>🔍 App Scanner</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.conferenceButton]}
          onPress={() => navigation.navigate('Conference')}
        >
          <Text style={styles.actionButtonText}>🎤 Join Conference</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.riskButton]}
          onPress={() => navigation.navigate('RiskLookup')}
        >
          <Text style={styles.actionButtonText}>🔍 Risk Lookup</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080c14',
  },

  purposeBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 14,
    padding: 18,
  },
  purposeBannerActive: {
    backgroundColor: '#0a1f0a',
    borderWidth: 1,
    borderColor: '#166534',
  },
  purposeBannerWarn: {
    backgroundColor: '#160a0a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  purposeBody: { flex: 1 },
  purposeThreat: {
    color: '#4ade80',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  purposeDefend: {
    color: '#86efac',
    fontSize: 12,
    lineHeight: 17,
  },
  purposeWarnTitle: {
    color: '#fca5a5',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  purposeWarnSub: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
  },
  purposePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 7,
    marginBottom: 6,
  },
  pill: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillTxt: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#080c14',
  },
  loadingText: {
    marginTop: 16,
    color: '#aaa',
    fontSize: 16,
  },
  scoreContainer: {
    padding: 24,
    alignItems: 'center',
  },
  scoreBreakdown: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 16,
  },
  breakdownItem: {
    alignItems: 'center',
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  vpnBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#0a1f0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e',
    padding: 16,
  },
  vpnBannerPaused: {
    backgroundColor: '#1a120a',
    borderColor: '#d97706',
  },
  vpnBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  vpnBannerTitle: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  vpnBannerTitlePaused: {
    color: '#fbbf24',
  },
  pauseCountdown: {
    color: '#d97706',
    fontSize: 11,
    fontWeight: '700',
  },
  pauseRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: 'rgba(100,116,139,0.15)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pauseBtnResume: {
    flex: 1,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pauseBtnTxt: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  vpnRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 10,
  },
  vpnStat: {
    alignItems: 'center',
    flex: 1,
  },
  vpnStatValue: {
    color: '#4ade80',
    fontSize: 22,
    fontWeight: '800',
  },
  vpnStatLabel: {
    color: '#86efac',
    fontSize: 11,
    marginTop: 2,
  },
  vpnDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#166534',
  },
  lastBlocked: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#2a2a2a',
  },
  warriorButton: {
    backgroundColor: '#1a1a3a',
    borderWidth: 1,
    borderColor: '#3949AB',
  },
  liveButton: {
    backgroundColor: '#1a0a0a',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  scanButton: {
    backgroundColor: '#0a1a1a',
    borderWidth: 1,
    borderColor: '#0891b2',
  },
  conferenceButton: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  riskButton: {
    backgroundColor: '#0a0f1e',
    borderWidth: 1,
    borderColor: '#60a5fa',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  iocBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: '#0c1120',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  iocText: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
