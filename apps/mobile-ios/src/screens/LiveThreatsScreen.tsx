/**
 * LiveThreatsScreen — Real-time threat feed from the ANKR Shield server
 *
 * Polls GET /warrior/threats/live every 5s
 * Shows: overall threat level, attack chains, quarantined agents,
 *        last spyware scan, honeypot triggers
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  RefreshControl,
  StatusBar,
} from 'react-native';

const API_URL = process.env.ANKRSHIELD_API_URL ?? 'http://localhost:4250';
const POLL_INTERVAL = 5000; // 5 seconds

interface LiveThreatData {
  timestamp: string;
  overallThreatScore: number; // 0-100
  threatLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  serverPlatform: string; // e.g. "Linux 6.8.0"
  uptime: number; // seconds
  activeThreats: {
    attackChains: number;
    quarantinedAgents: number;
    honeypotTriggers: number;
    scopeViolations: number;
  };
  lastSpywareScan: {
    scannedAt: string;
    isClean: boolean;
    familiesDetected: string[];
    indicatorsFound: number;
  } | null;
  recentEvents: Array<{
    type: string;
    at: string;
  }>;
}

// Threat level colors
const LEVEL_COLOR: Record<string, string> = {
  safe: '#22c55e',
  low: '#84cc16',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

export function LiveThreatsScreen() {
  const [data, setData] = useState<LiveThreatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animation for live indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/warrior/threats/live`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = (await res.json()) as LiveThreatData;
      setData(json);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    intervalRef.current = setInterval(() => {
      void fetchData();
    }, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Connecting to server...</Text>
      </View>
    );
  }

  const level = data?.threatLevel ?? 'safe';
  const levelColor = LEVEL_COLOR[level] ?? '#22c55e';
  const score = data?.overallThreatScore ?? 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Live Threats</Text>
          <Text style={styles.headerSub}>{data?.serverPlatform ?? 'Server'}</Text>
        </View>
        {/* Live pulse dot */}
        <View style={styles.liveIndicator}>
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error} — retrying...</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
      >
        {/* Threat Score Card */}
        <View style={[styles.scoreCard, { borderColor: levelColor }]}>
          <Text style={styles.scoreLabel}>Server Threat Score</Text>
          <Text style={[styles.scoreValue, { color: levelColor }]}>{score}</Text>
          <Text style={[styles.scoreBadge, { color: levelColor }]}>{level.toUpperCase()}</Text>
          {lastUpdated && (
            <Text style={styles.updatedAt}>Updated {lastUpdated.toLocaleTimeString()}</Text>
          )}
        </View>

        {/* Active Threats Grid */}
        <View style={styles.gridRow}>
          <ThreatTile
            label="Attack Chains"
            value={data?.activeThreats.attackChains ?? 0}
            danger={(data?.activeThreats.attackChains ?? 0) > 0}
            icon="⛓"
          />
          <ThreatTile
            label="Quarantined"
            value={data?.activeThreats.quarantinedAgents ?? 0}
            danger={(data?.activeThreats.quarantinedAgents ?? 0) > 0}
            icon="🔒"
          />
        </View>
        <View style={styles.gridRow}>
          <ThreatTile
            label="Honeypot Hits"
            value={data?.activeThreats.honeypotTriggers ?? 0}
            danger={(data?.activeThreats.honeypotTriggers ?? 0) > 0}
            icon="🍯"
          />
          <ThreatTile
            label="Scope Violations"
            value={data?.activeThreats.scopeViolations ?? 0}
            danger={(data?.activeThreats.scopeViolations ?? 0) > 0}
            icon="🚨"
          />
        </View>

        {/* Spyware Scan Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Server Spyware Scan</Text>
          {data?.lastSpywareScan ? (
            <View
              style={[
                styles.scanCard,
                { borderColor: data.lastSpywareScan.isClean ? '#22c55e' : '#ef4444' },
              ]}
            >
              <Text
                style={[
                  styles.scanStatus,
                  { color: data.lastSpywareScan.isClean ? '#22c55e' : '#ef4444' },
                ]}
              >
                {data.lastSpywareScan.isClean
                  ? '✓ CLEAN'
                  : `⚠ ${data.lastSpywareScan.indicatorsFound} INDICATORS`}
              </Text>
              {!data.lastSpywareScan.isClean &&
                data.lastSpywareScan.familiesDetected.length > 0 && (
                  <Text style={styles.scanFamilies}>
                    Families: {data.lastSpywareScan.familiesDetected.join(', ')}
                  </Text>
                )}
              <Text style={styles.scanTime}>
                Scanned {new Date(data.lastSpywareScan.scannedAt).toLocaleString()}
              </Text>
            </View>
          ) : (
            <Text style={styles.noScan}>No scan run yet — scan runs every 6h</Text>
          )}
        </View>

        {/* Recent Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Events</Text>
          {(data?.recentEvents.length ?? 0) === 0 ? (
            <Text style={styles.noEvents}>No events — system quiet</Text>
          ) : (
            data?.recentEvents.slice(0, 10).map((evt, i) => (
              <View key={i} style={styles.eventRow}>
                <Text style={styles.eventType}>{evt.type.replace(/-/g, ' ').toUpperCase()}</Text>
                <Text style={styles.eventAt}>{new Date(evt.at).toLocaleTimeString()}</Text>
              </View>
            ))
          )}
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

function ThreatTile({
  label,
  value,
  danger,
  icon,
}: {
  label: string;
  value: number;
  danger: boolean;
  icon: string;
}) {
  return (
    <View style={[styles.tile, danger && styles.tileDanger]}>
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={[styles.tileValue, danger && styles.tileValueDanger]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  center: { flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 52,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeft: {},
  headerTitle: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  liveText: { color: '#ef4444', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  errorBanner: { backgroundColor: '#7f1d1d', padding: 10, alignItems: 'center' },
  errorText: { color: '#fca5a5', fontSize: 13 },
  scroll: { flex: 1 },
  scoreCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
  },
  scoreLabel: { color: '#64748b', fontSize: 13, marginBottom: 8 },
  scoreValue: { fontSize: 72, fontWeight: '800', lineHeight: 80 },
  scoreBadge: { fontSize: 16, fontWeight: '700', letterSpacing: 2, marginTop: 4 },
  updatedAt: { color: '#334155', fontSize: 11, marginTop: 12 },
  gridRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  tile: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  tileDanger: { borderColor: '#7f1d1d', backgroundColor: '#1a0a0a' },
  tileIcon: { fontSize: 24, marginBottom: 6 },
  tileValue: { color: '#f1f5f9', fontSize: 32, fontWeight: '800' },
  tileValueDanger: { color: '#ef4444' },
  tileLabel: { color: '#64748b', fontSize: 11, marginTop: 4, textAlign: 'center' },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  scanCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, borderWidth: 1 },
  scanStatus: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  scanFamilies: { color: '#fca5a5', fontSize: 13, marginTop: 4 },
  scanTime: { color: '#475569', fontSize: 12, marginTop: 8 },
  noScan: { color: '#475569', fontSize: 14 },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  eventType: { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
  eventAt: { color: '#475569', fontSize: 12 },
  noEvents: { color: '#475569', fontSize: 14 },
  bottomPad: { height: 40 },
});
