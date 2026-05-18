/**
 * AppTrustScreen — All-apps trust view
 *
 * Lists every tracked app with its trust tier and safe zone score.
 * Sorted by safe zone score (most concerning first).
 * Tap any app → AppDetailSheet.
 *
 * For apps never seen in network traffic, shows only the auto-classified tier.
 */

import {
  createAppTrustEngine,
  createAppBehaviorTracker,
  TIER_COLOR,
  TIER_LABEL,
  type AppTrustTier,
} from '@ankrshield/privacy-engine';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  NativeModules,
  Platform,
} from 'react-native';

import { AppDetailSheet, type AppDetailInfo } from '../components/AppDetailSheet';
import { SafeZoneMeter } from '../components/SafeZoneMeter';
import { MdmStorage } from '../mdm/storage';

const { AppScanner } = NativeModules;

// ─── Init engines with MdmStorage ────────────────────────────────────────────

const trustEngine = createAppTrustEngine(MdmStorage);
const behaviorTracker = createAppBehaviorTracker(MdmStorage);

// ─── Fallback seed — shown only when AppScanner native module is unavailable ──
// (e.g. iOS, emulator without module, or first-time load before scan completes)

const FALLBACK_PACKAGES = [
  'com.android.chrome',
  'com.google.android.youtube',
  'com.google.android.gm',
  'com.whatsapp',
  'com.instagram.android',
  'com.spotify.music',
  'net.one97.paytm',
  'com.phonepe.app',
  'in.swiggy.android',
  'com.flipkart.android',
];

// ─── App list row ─────────────────────────────────────────────────────────────

interface AppRow extends AppDetailInfo {}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppTrustScreen({ navigation: _navigation }: any) {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppRow | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [totalInstalled, setTotalInstalled] = useState(0);

  async function load() {
    await Promise.all([trustEngine.init(), behaviorTracker.init()]);

    // 1. Real installed apps from native module (Android only)
    let installedPkgs: string[] = [];
    if (Platform.OS === 'android' && AppScanner) {
      try {
        const raw = (await AppScanner.getInstalledApps()) as Array<{
          packageName: string;
          isSystemApp: boolean;
        }>;
        // Skip pure system apps with no user-visible name
        installedPkgs = raw.filter((a) => !a.isSystemApp).map((a) => a.packageName);
        setTotalInstalled(installedPkgs.length);
      } catch {
        installedPkgs = FALLBACK_PACKAGES;
      }
    } else {
      installedPkgs = FALLBACK_PACKAGES;
    }

    // 2. Merge with tracked packages (may include apps seen in VPN feed not in installed list)
    const trackedPkgs = behaviorTracker.getTrackedPackages();
    const allPkgs = [...new Set([...installedPkgs, ...trackedPkgs])];

    const rows: AppRow[] = allPkgs.map((pkg) => {
      const record = trustEngine.classifyApp(pkg);
      const stats = behaviorTracker.getAppStats(pkg);
      return {
        packageName: pkg,
        displayName: record.displayName,
        autoTier: record.autoTier,
        effectiveTier: record.effectiveTier,
        userTier: record.userTier,
        stats,
      };
    });

    // Sort: highest safe zone score first (most concerning at top)
    // Then alpha within same score
    rows.sort((a, b) => {
      const scoreDiff = b.stats.safeZoneScore - a.stats.safeZoneScore;
      if (scoreDiff !== 0) return scoreDiff;
      return a.displayName.localeCompare(b.displayName);
    });

    setApps(rows);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, []);

  async function handleTierChange(packageName: string, tier: AppTrustTier) {
    await trustEngine.setUserTier(packageName, tier);
    // Refresh rows
    setApps((prev) =>
      prev.map((app) => {
        if (app.packageName !== packageName) return app;
        return {
          ...app,
          userTier: tier,
          effectiveTier: tier,
        };
      })
    );
    // Also update selected app if sheet is open
    setSelectedApp((prev) => {
      if (!prev || prev.packageName !== packageName) return prev;
      return { ...prev, userTier: tier, effectiveTier: tier };
    });
  }

  // ── Summary counts ────────────────────────────────────────────────────────

  const safeCount = apps.filter(
    (a) => a.stats.zone === 'safe' || a.stats.safeZoneScore === 0
  ).length;
  const watchCount = apps.filter((a) => a.stats.zone === 'watch').length;
  const dangerCount = apps.filter((a) => a.stats.zone === 'danger').length;
  const blockedCount = apps.filter((a) => a.effectiveTier === 'BLOCKED').length;

  // ── Render row ────────────────────────────────────────────────────────────

  function renderRow({ item }: { item: AppRow }) {
    const tierColor = TIER_COLOR[item.effectiveTier];
    const hasActivity = item.stats.totalEventsToday > 0;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          setSelectedApp(item);
          setSheetVisible(true);
        }}
        activeOpacity={0.7}
      >
        {/* App icon placeholder */}
        <View style={[styles.rowIcon, { backgroundColor: tierColor + '18' }]}>
          <Text style={styles.rowIconText}>
            {item.effectiveTier === 'SYSTEM'
              ? '⚙️'
              : item.effectiveTier === 'TRUSTED'
                ? '✅'
                : item.effectiveTier === 'WATCHLIST'
                  ? '👁️'
                  : item.effectiveTier === 'BLOCKED'
                    ? '🚫'
                    : '📱'}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.rowInfo}>
          <View style={styles.rowNameRow}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.displayName}
            </Text>
            <View
              style={[
                styles.tierPill,
                { backgroundColor: tierColor + '22', borderColor: tierColor + '55' },
              ]}
            >
              <Text style={[styles.tierPillText, { color: tierColor }]}>
                {TIER_LABEL[item.effectiveTier]}
              </Text>
            </View>
          </View>

          {hasActivity ? (
            <SafeZoneMeter score={item.stats.safeZoneScore} variant="compact" showScore />
          ) : (
            <Text style={styles.noActivity}>No activity today</Text>
          )}
        </View>

        <Text style={styles.rowChevron}>›</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Analysing your apps...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>App Trust</Text>
        {totalInstalled > 0 && (
          <Text style={styles.screenSubtitle}>{totalInstalled} apps on your device</Text>
        )}
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <SummaryPill count={safeCount} label="Safe" color="#4CAF50" />
        <SummaryPill count={watchCount} label="Watched" color="#FF9800" />
        <SummaryPill count={dangerCount} label="Concerned" color="#F44336" />
        {blockedCount > 0 && <SummaryPill count={blockedCount} label="Blocked" color="#9C27B0" />}
      </View>

      <FlatList
        data={apps}
        keyExtractor={(item) => item.packageName}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <AppDetailSheet
        app={selectedApp}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onTierChange={handleTierChange}
      />
    </View>
  );
}

// ─── SummaryPill ──────────────────────────────────────────────────────────────

function SummaryPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <View style={[pillStyles.pill, { backgroundColor: color + '18' }]}>
      <Text style={[pillStyles.count, { color }]}>{count}</Text>
      <Text style={pillStyles.label}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  count: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  label: {
    fontSize: 10,
    color: '#666',
    marginTop: 1,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#555',
    fontSize: 14,
  },
  summaryBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#161616',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  list: {
    paddingVertical: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowIconText: {
    fontSize: 20,
  },
  rowInfo: {
    flex: 1,
    gap: 6,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  tierPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tierPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  noActivity: {
    fontSize: 12,
    color: '#3a3a3a',
  },
  rowChevron: {
    color: '#333',
    fontSize: 20,
  },
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
});
