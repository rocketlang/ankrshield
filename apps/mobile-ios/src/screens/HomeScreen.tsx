/**
 * Home Screen
 * Main landing screen with privacy score overview
 */

import {
  createAppTrustEngine,
  createAppBehaviorTracker,
  TIER_COLOR,
} from '@ankrshield/privacy-engine';
import React, { useEffect, useState } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Share,
} from 'react-native';

import { PrivacyScoreCircle } from '../components/PrivacyScoreCircle';
import { SafeZoneMeter } from '../components/SafeZoneMeter';
import { StatsCard } from '../components/StatsCard';
import { MdmStorage } from '../mdm/storage';
import { startBlocklistSync, getBlocklistStats } from '../services/ioc-sync';
import { PrivacyService } from '../services/PrivacyService';
import { getLastScan } from '../services/ScanStore';
import { startReporting } from '../services/StatsReporter';
import { vpnService, VpnStats } from '../services/VpnService';

// ─── Smart Trust engines ──────────────────────────────────────────────────────
const _trustEngine = createAppTrustEngine(MdmStorage);
const _behaviorTracker = createAppBehaviorTracker(MdmStorage);

const PROTECTION_TOOLS = [
  // India-specific threats first
  { icon: '💳', name: 'UPI Guard', desc: 'Payment fraud check', route: 'UpiGuard' },
  { icon: '💬', name: 'SMS Shield', desc: 'Fraud SMS scanner', route: 'SmsShield' },
  { icon: '📞', name: 'Call Shield', desc: 'India fraud patterns', route: 'CallProtection' },
  { icon: '💬', name: 'WA Guard', desc: 'File threat scan', route: 'WhatsAppGuard' },
  { icon: '🛡️', name: 'Account Guard', desc: 'WhatsApp + UPI safety', route: 'AccountGuard' },
  { icon: '📱', name: 'Contact Risk', desc: 'Check if a contact was hacked', route: 'ContactRisk' },
  { icon: '🌐', name: 'Safe Browse', desc: 'Phishing blocker', route: 'SafeBrowsing' },
  { icon: '📋', name: 'DPDP Scan', desc: 'Privacy compliance', route: 'DpdpScan' },
  { icon: '🔗', name: 'Link Scan', desc: 'Phishing URL check', route: 'LinkScanner' },
  // Malware / device security
  { icon: '🔬', name: 'AV Scan', desc: 'Malware detector', route: 'AvScanner' },
  { icon: '🔒', name: 'Anti-Theft', desc: 'Lock & remote wipe', route: 'AntiTheft' },
  { icon: '🦠', name: 'Ransomware', desc: 'File encryption watch', route: 'Ransomware' },
  { icon: '🕵️', name: 'Stalkerware', desc: 'Hidden spy apps', route: 'Stalkerware' },
  // App & permission auditing
  { icon: '🔍', name: 'App Scope', desc: 'Excess permissions', route: 'AppConsent' },
  { icon: '🔔', name: 'Perm Watch', desc: 'Gained since update', route: 'PermissionChange' },
  { icon: '🏥', name: 'Dev Health', desc: 'Security hygiene', route: 'DeviceHealth' },
  // Network & corporate
  { icon: '📊', name: 'Privacy Report', desc: 'Who tracked you, cited', route: 'ScopeReport' },
  {
    icon: '⌚',
    name: 'Health Privacy',
    desc: 'Is your watch leaking you?',
    route: 'HealthWitness',
  },
  { icon: '🔗', name: 'Network', desc: 'DNS tracker feed', route: 'NetworkBehavior' },
  { icon: '🏢', name: 'Corporate', desc: 'MDM enrollment', route: 'Mdm' },
  // iOS-only tiles (filtered at runtime)
  ...(Platform.OS === 'ios'
    ? [
        {
          icon: '🔐',
          name: 'Permissions',
          desc: 'iOS permission audit',
          route: 'iOSPermissionAudit',
        },
      ]
    : []),
];

interface AppSummaryRow {
  packageName: string;
  displayName: string;
  score: number;
  tierColor: string;
}

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
  const [streak, setStreak] = useState(0);
  const [_lastThreatDate, setLastThreatDate] = useState<Date | null>(null);
  const [trustSummary, setTrustSummary] = useState<{
    safe: number;
    watch: number;
    danger: number;
    top3: AppSummaryRow[];
  }>({ safe: 0, watch: 0, danger: 0, top3: [] });
  const [trustLoadedAt, setTrustLoadedAt] = useState<number | null>(null); // ms timestamp
  const [trustFromCache, setTrustFromCache] = useState(false);

  async function loadStreakState() {
    try {
      const storedStreak = await MdmStorage.getItem('@ankrshield/streak');
      const storedThreat = await MdmStorage.getItem('@ankrshield/lastThreat');
      const today = new Date().toDateString();
      const threatDate = storedThreat ? new Date(storedThreat) : null;
      setLastThreatDate(threatDate);
      if (threatDate && threatDate.toDateString() === today) {
        // New threat today — reset streak
        setStreak(0);
        await MdmStorage.setItem('@ankrshield/streak', '0');
      } else {
        const current = storedStreak ? parseInt(storedStreak, 10) : 0;
        setStreak(isNaN(current) ? 0 : current);
      }
    } catch (_e) {
      // Storage unavailable — leave streak at 0
    }
  }

  function streakMilestoneMessage(days: number): string | null {
    if (days >= 100) {
      return 'Elite defender 💎';
    }
    if (days >= 30) {
      return 'One month shield 🛡️';
    }
    if (days >= 7) {
      return 'One week clean 🎉';
    }
    return null;
  }

  async function handleShareScore() {
    const scoreValue = score?.totalScore ?? 0;
    try {
      await Share.share({
        message: `My phone has a ${scoreValue}/100 security score on AnkrShield — India's privacy-first security app. Try it: https://xshieldai.com`,
        title: 'My AnkrShield Security Score',
      });
    } catch (_e) {
      // User cancelled share — no-op
    }
  }

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
    if (!dnsPaused || pauseUntilMs === 0) {
      return '';
    }
    const remaining = Math.max(0, pauseUntilMs - Date.now());
    const mins = Math.ceil(remaining / 60000);
    return `Resumes in ${mins}m`;
  }

  useEffect(() => {
    loadTrustSummary();
  }, []);

  const TRUST_CACHE_KEY = '@ankrshield/trust-summary-v1';

  async function loadTrustSummary() {
    // 1. Load cache immediately for instant display
    try {
      const cached = await MdmStorage.getItem(TRUST_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          safe: number;
          watch: number;
          danger: number;
          top3: AppSummaryRow[];
          cachedAt: number;
        };
        setTrustSummary({
          safe: parsed.safe,
          watch: parsed.watch,
          danger: parsed.danger,
          top3: parsed.top3,
        });
        setTrustLoadedAt(parsed.cachedAt);
        setTrustFromCache(true);
      }
    } catch (_e) {
      // Cache miss or parse error — proceed to live load
    }

    // 2. Compute fresh data
    try {
      await Promise.all([_trustEngine.init(), _behaviorTracker.init()]);
      const pkgs = _behaviorTracker.getTrackedPackages();
      const rows = pkgs.map((pkg) => {
        const record = _trustEngine.classifyApp(pkg);
        const appStats = _behaviorTracker.getAppStats(pkg);
        return {
          packageName: pkg,
          displayName: record.displayName,
          score: appStats.safeZoneScore,
          tierColor: TIER_COLOR[record.effectiveTier],
        };
      });
      const safe = rows.filter((r) => r.score < 60).length;
      const watch = rows.filter((r) => r.score >= 60 && r.score < 80).length;
      const danger = rows.filter((r) => r.score >= 80).length;
      const top3 = [...rows].sort((a, b) => b.score - a.score).slice(0, 3);
      const now = Date.now();
      setTrustSummary({ safe, watch, danger, top3 });
      setTrustLoadedAt(now);
      setTrustFromCache(false);
      // 3. Save to cache
      await MdmStorage.setItem(
        TRUST_CACHE_KEY,
        JSON.stringify({ safe, watch, danger, top3, cachedAt: now })
      );
    } catch (_e) {
      // Live load failed — cached data still shown (with staleness indicator)
    }
  }

  function trustStalenessLabel(): string | null {
    if (!trustFromCache || !trustLoadedAt) {
      return null;
    }
    const ageMs = Date.now() - trustLoadedAt;
    if (ageMs < 60_000) {
      return null;
    } // under 1 min — don't show
    if (ageMs < 3_600_000) {
      return `Data from ${Math.round(ageMs / 60_000)}m ago`;
    }
    if (ageMs < 86_400_000) {
      return `Data from ${Math.round(ageMs / 3_600_000)}h ago`;
    }
    return `Data from ${Math.round(ageMs / 86_400_000)}d ago`;
  }

  useEffect(() => {
    loadData();
    loadStreakState();
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
      {/* ── Smart Trust Summary ──────────────────────────────────────────── */}
      <View style={styles.trustCard}>
        <View style={styles.trustCardHeader}>
          <Text style={styles.trustCardTitle}>
            {vpnStats.running ? '🛡 AnkrShield active' : '👁 Monitoring your apps'}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('AppTrust')}>
            <Text style={styles.manageAppsLink}>Manage apps ›</Text>
          </TouchableOpacity>
        </View>

        {/* Safe / Watch / Danger pill row */}
        <View style={styles.trustPillRow}>
          <View style={[styles.trustPill, { backgroundColor: '#4CAF5018' }]}>
            <Text style={[styles.trustPillCount, { color: '#4CAF50' }]}>{trustSummary.safe}</Text>
            <Text style={styles.trustPillLabel}>in safe zone</Text>
          </View>
          <View style={[styles.trustPill, { backgroundColor: '#FF980018' }]}>
            <Text style={[styles.trustPillCount, { color: '#FF9800' }]}>{trustSummary.watch}</Text>
            <Text style={styles.trustPillLabel}>being watched</Text>
          </View>
          <View style={[styles.trustPill, { backgroundColor: '#F4433618' }]}>
            <Text style={[styles.trustPillCount, { color: '#F44336' }]}>{trustSummary.danger}</Text>
            <Text style={styles.trustPillLabel}>high concern</Text>
          </View>
        </View>

        {/* Top 3 apps by safe zone score */}
        {trustSummary.top3.length > 0 && (
          <View style={styles.top3List}>
            {trustSummary.top3.map((app) => (
              <View key={app.packageName} style={styles.top3Row}>
                <Text style={styles.top3Name} numberOfLines={1}>
                  {app.displayName}
                </Text>
                <View style={styles.top3Meter}>
                  <SafeZoneMeter score={app.score} variant="compact" showScore />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Context line — calm, not scary */}
        <Text style={styles.trustContextLine}>
          {vpnStats.running
            ? `${vpnStats.blockedCount > 0 ? `${vpnStats.blockedCount} trackers filtered` : 'All traffic looks normal'} · DNS shield on`
            : 'Enable DNS shield in Settings for active filtering'}
        </Text>

        {/* Staleness indicator — shown only when serving cached data */}
        {trustStalenessLabel() && (
          <Text style={styles.trustStaleLabel}>{trustStalenessLabel()} · tap to refresh</Text>
        )}
      </View>
      <View style={styles.purposePills}>
        {/* Lit = this defence is live right now. Grey = capability idle (not yet turned
            on / not yet scanned). Never lit unless the underlying state is truly active. */}
        {[
          { txt: '🌐 Stops trackers', on: vpnStats.running },
          { txt: '🔬 Finds spyware', on: getLastScan() != null },
          { txt: '⚔️ AI defence', on: score != null },
          { txt: '📵 Blocks ads', on: vpnStats.running },
        ].map((p) => (
          <View key={p.txt} style={[styles.pill, p.on && styles.pillOn]}>
            <Text style={[styles.pillTxt, p.on && styles.pillTxtOn]}>
              {p.on ? '✓ ' : ''}
              {p.txt}
            </Text>
          </View>
        ))}
      </View>

      {/* Protection Tools grid */}
      <View style={styles.toolsSection}>
        <Text style={styles.toolsSectionTitle}>Protection Tools</Text>
        <View style={styles.toolsGrid}>
          {PROTECTION_TOOLS.map((tool) => (
            <TouchableOpacity
              key={tool.route}
              style={styles.toolCard}
              onPress={() => navigation.navigate(tool.route)}
            >
              <Text style={styles.toolIcon}>{tool.icon}</Text>
              <Text style={styles.toolName}>{tool.name}</Text>
              <Text style={styles.toolDesc}>{tool.desc}</Text>
            </TouchableOpacity>
          ))}
          {/* Escape back to the calm Simple face (persists the choice). */}
          <TouchableOpacity
            style={styles.toolCard}
            onPress={async () => {
              await MdmStorage.setItem('@ankrshield/mode', 'simple').catch(() => {});
              navigation.navigate('Simple');
            }}
          >
            <Text style={styles.toolIcon}>🏠</Text>
            <Text style={styles.toolName}>Simple View</Text>
            <Text style={styles.toolDesc}>Back to one-tap mode</Text>
          </TouchableOpacity>
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

      {/* Security streak card */}
      <View style={styles.streakCard}>
        {streak > 0 ? (
          <>
            <Text style={styles.streakTitle}>🔥 {streak} day streak — no new threats</Text>
            {streakMilestoneMessage(streak) ? (
              <Text style={styles.streakMilestone}>{streakMilestoneMessage(streak)}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.streakEmpty}>Start your streak by staying protected today</Text>
        )}
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

          {/* Share score button */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShareScore}>
            <Text style={styles.shareButtonText}>Share Score</Text>
          </TouchableOpacity>
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

        <TouchableOpacity
          style={[styles.actionButton, styles.trustButton]}
          onPress={() => navigation.navigate('AppTrust')}
        >
          <Text style={styles.actionButtonText}>🛡 App Trust Manager</Text>
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

  // ── Smart Trust Card ──────────────────────────────────────────────────────
  trustCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: '#0e1520',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a2535',
  },
  trustCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trustCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  manageAppsLink: {
    fontSize: 13,
    color: '#4CAF50',
  },
  trustPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  trustPill: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  trustPillCount: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  trustPillLabel: {
    fontSize: 10,
    color: '#555',
    marginTop: 2,
  },
  top3List: {
    gap: 8,
    marginBottom: 12,
  },
  top3Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  top3Name: {
    fontSize: 12,
    color: '#888',
    width: 90,
  },
  top3Meter: {
    flex: 1,
  },
  trustContextLine: {
    fontSize: 11,
    color: '#3a4a5a',
    textAlign: 'center',
  },
  trustStaleLabel: {
    fontSize: 10,
    color: '#555',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  trustButton: {
    backgroundColor: '#0e2020',
    borderColor: '#4CAF5044',
    borderWidth: 1,
  },

  toolsSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  toolsSectionTitle: {
    color: '#4b5563',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 10,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolCard: {
    width: '23%',
    backgroundColor: '#0e1520',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1a2535',
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 3,
  },
  toolIcon: { fontSize: 20 },
  toolName: { color: '#e2e8f0', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  toolDesc: { color: '#4b5563', fontSize: 9, textAlign: 'center', lineHeight: 12 },

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
  pillOn: {
    backgroundColor: '#0c2a1a',
    borderColor: '#16a34a',
  },
  pillTxt: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  pillTxtOn: { color: '#4ade80', fontWeight: '700' },
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
  streakCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    backgroundColor: '#0d1a0d',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#166534',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  streakTitle: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '700',
  },
  streakMilestone: {
    color: '#86efac',
    fontSize: 11,
    marginTop: 3,
  },
  streakEmpty: {
    color: '#6b7280',
    fontSize: 12,
    fontStyle: 'italic',
  },
  shareButton: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
