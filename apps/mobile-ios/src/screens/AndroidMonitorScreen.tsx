/**
 * AndroidMonitorScreen — Scan device apps for espionage/snooping
 *
 * Uses @ankrshield/android-monitor IOC database + permission heuristics
 * to detect stalkerware, spyware, and data-harvesting apps.
 *
 * Live mode: NativeModules.AppScanner.getInstalledApps() calls Android
 * PackageManager to enumerate all installed apps and their declared
 * permissions. Results are fed into the real AndroidMonitor scanner.
 */
import { AndroidMonitor } from '@ankrshield/android-monitor';
import type {
  AppPermissions,
  AndroidScanResult,
  SuspiciousApp,
  SpyRiskLevel,
} from '@ankrshield/android-monitor';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  NativeModules,
  Platform,
} from 'react-native';

const { AppScanner } = NativeModules;

// ---------------------------------------------------------------------------
// Risk display helpers
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<SpyRiskLevel, string> = {
  critical: '#ef4444',
  high: '#f97316',
  suspicious: '#eab308',
  clean: '#22c55e',
};

const RISK_BG: Record<SpyRiskLevel, string> = {
  critical: '#450a0a',
  high: '#431407',
  suspicious: '#422006',
  clean: '#052e16',
};

const RISK_ORDER: Record<SpyRiskLevel, number> = {
  critical: 0,
  high: 1,
  suspicious: 2,
  clean: 3,
};

function riskLabel(level: SpyRiskLevel): string {
  return level.toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RiskBadge({ level }: { level: SpyRiskLevel }) {
  return (
    <View
      style={[styles.badge, { backgroundColor: RISK_BG[level], borderColor: RISK_COLORS[level] }]}
    >
      <Text style={[styles.badgeText, { color: RISK_COLORS[level] }]}>{riskLabel(level)}</Text>
    </View>
  );
}

function AppCard({ app, isTop3 }: { app: SuspiciousApp; isTop3: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const color = RISK_COLORS[app.riskLevel];

  return (
    <TouchableOpacity
      style={[
        styles.appCard,
        { borderColor: isTop3 ? color : '#1e293b' },
        isTop3 && styles.appCardTop3,
      ]}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      {/* Card header */}
      <View style={styles.appCardHeader}>
        <View style={styles.appCardLeft}>
          {isTop3 && <Text style={styles.top3Crown}>★</Text>}
          <View>
            <Text style={styles.appName} numberOfLines={1}>
              {app.appName}
            </Text>
            <Text style={styles.packageName} numberOfLines={1}>
              {app.packageName}
            </Text>
          </View>
        </View>
        <View style={styles.appCardRight}>
          <RiskBadge level={app.riskLevel} />
          <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </View>

      {/* Confidence bar */}
      <View style={styles.confBarTrack}>
        <View
          style={[
            styles.confBarFill,
            { width: `${app.confidence}%` as any, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[styles.confLabel, { color }]}>Confidence: {app.confidence}%</Text>

      {/* Categories */}
      <View style={styles.categoryRow}>
        {app.categories.map((cat) => (
          <View key={cat} style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{cat.replace(/_/g, ' ')}</Text>
          </View>
        ))}
        {app.knownMalicious && (
          <View style={[styles.categoryChip, styles.maliciousChip]}>
            <Text style={[styles.categoryChipText, styles.maliciousChipText]}>KNOWN IOC</Text>
          </View>
        )}
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expandedSection}>
          {/* Reasons */}
          {app.reasons.length > 0 && (
            <View style={styles.detailBlock}>
              <Text style={styles.detailTitle}>Detection Reasons</Text>
              {app.reasons.map((r, i) => (
                <View key={i} style={styles.reasonRow}>
                  <Text style={[styles.reasonBullet, { color }]}>•</Text>
                  <Text style={styles.reasonText}>{r}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Dangerous permissions */}
          {app.dangerousPermissions.length > 0 && (
            <View style={styles.detailBlock}>
              <Text style={styles.detailTitle}>
                Dangerous Permissions ({app.dangerousPermissions.length})
              </Text>
              <View style={styles.permGrid}>
                {app.dangerousPermissions.map((perm) => (
                  <View key={perm} style={styles.permChip}>
                    <Text style={styles.permChipText}>{perm}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function ScanSummaryBanner({ result }: { result: AndroidScanResult }) {
  const overallColor = RISK_COLORS[result.overallRiskLevel];
  const totalFlagged = result.suspiciousApps.length;
  const critical = result.suspiciousApps.filter((a) => a.riskLevel === 'critical').length;
  const high = result.suspiciousApps.filter((a) => a.riskLevel === 'high').length;
  const suspicious = result.suspiciousApps.filter((a) => a.riskLevel === 'suspicious').length;

  return (
    <View style={[styles.summaryBanner, { borderColor: overallColor }]}>
      <Text style={[styles.summaryOverall, { color: overallColor }]}>
        {totalFlagged === 0
          ? 'All Clear'
          : `${totalFlagged} Suspicious App${totalFlagged !== 1 ? 's' : ''} Found`}
      </Text>
      <Text style={styles.summaryDetail}>
        {result.totalAppsChecked} apps scanned · {result.overallRiskLevel.toUpperCase()} overall
      </Text>
      {totalFlagged > 0 && (
        <View style={styles.summaryBreakdown}>
          {critical > 0 && (
            <Text style={[styles.summaryCount, { color: RISK_COLORS.critical }]}>
              {critical} CRITICAL
            </Text>
          )}
          {high > 0 && (
            <Text style={[styles.summaryCount, { color: RISK_COLORS.high }]}>{high} HIGH</Text>
          )}
          {suspicious > 0 && (
            <Text style={[styles.summaryCount, { color: RISK_COLORS.suspicious }]}>
              {suspicious} SUSPICIOUS
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const monitor = new AndroidMonitor();

export function AndroidMonitorScreen() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AndroidScanResult | null>(null);
  const [filter, setFilter] = useState<SpyRiskLevel | 'all'>('all');

  const runScan = useCallback(async () => {
    setScanning(true);
    setProgress(0);
    setResult(null);

    try {
      // Fetch real installed apps from Android PackageManager
      setProgress(10);
      const rawApps: AppPermissions[] =
        Platform.OS === 'android' && AppScanner ? await AppScanner.getInstalledApps() : [];

      setProgress(40);
      // Small yield so progress bar paints
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      setProgress(75);

      const scanResult = monitor.scanApps(rawApps);
      setProgress(100);
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      setResult(scanResult);
    } catch (_e) {
      // Native module unavailable — show empty result
      setResult(monitor.scanApps([]));
    } finally {
      setScanning(false);
    }
  }, []);

  const shareReport = useCallback(async () => {
    if (!result) return;
    const lines: string[] = [
      'ANKR Shield — Android App Scan Report',
      `Scanned: ${result.scannedAt.toLocaleString()}`,
      `Apps checked: ${result.totalAppsChecked}`,
      `Suspicious apps: ${result.suspiciousApps.length}`,
      `Overall risk: ${result.overallRiskLevel.toUpperCase()}`,
      '',
      result.summary,
      '',
    ];
    if (result.suspiciousApps.length > 0) {
      lines.push('--- FLAGGED APPS ---');
      result.suspiciousApps.forEach((app) => {
        lines.push(`[${app.riskLevel.toUpperCase()}] ${app.appName} (${app.packageName})`);
        lines.push(`  Confidence: ${app.confidence}%`);
        lines.push(`  Categories: ${app.categories.join(', ')}`);
        app.reasons.forEach((r) => lines.push(`  • ${r}`));
        lines.push('');
      });
    }
    lines.push('--- RECOMMENDATIONS ---');
    result.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

    try {
      await Share.share({ message: lines.join('\n'), title: 'ANKR Shield Scan Report' });
    } catch {
      // User cancelled share — ignore
    }
  }, [result]);

  // Group results for display
  const filteredApps = result
    ? filter === 'all'
      ? result.suspiciousApps
      : result.suspiciousApps.filter((a) => a.riskLevel === filter)
    : [];

  const top3Packages = new Set(
    result?.suspiciousApps
      .slice()
      .sort(
        (a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || b.confidence - a.confidence
      )
      .slice(0, 3)
      .map((a) => a.packageName) ?? []
  );

  // Group clean apps count separately
  const cleanCount = result ? result.totalAppsChecked - result.suspiciousApps.length : 0;

  return (
    <ScrollView style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🤖</Text>
        <Text style={styles.heroTitle}>Android App Scanner</Text>
        <Text style={styles.heroSub}>
          Scans all installed apps against the ANKR Shield stalkerware/spyware IOC database and
          permission-combo heuristics (Exodus Privacy methodology).
        </Text>
      </View>

      {/* Scan button */}
      <View style={styles.scanSection}>
        <TouchableOpacity
          style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
          onPress={runScan}
          disabled={scanning}
        >
          {scanning ? (
            <View style={styles.scanBtnInner}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.scanBtnText}>Scanning... {progress}%</Text>
            </View>
          ) : (
            <Text style={styles.scanBtnText}>
              {result ? 'Re-Scan Device Apps' : 'Scan Device Apps'}
            </Text>
          )}
        </TouchableOpacity>

        {scanning && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
          </View>
        )}
        {scanning && (
          <Text style={styles.scanHint}>
            Checking IOC database, permission combos, install sources...
          </Text>
        )}
      </View>

      {/* Results */}
      {result && (
        <View style={styles.resultsSection}>
          {/* Summary banner */}
          <ScanSummaryBanner result={result} />

          {/* Summary text */}
          <Text style={styles.summaryText}>{result.summary}</Text>

          {/* Filter tabs */}
          {result.suspiciousApps.length > 0 && (
            <View style={styles.filterRow}>
              {(['all', 'critical', 'high', 'suspicious'] as const).map((f) => {
                const isActive = filter === f;
                const count =
                  f === 'all'
                    ? result.suspiciousApps.length
                    : result.suspiciousApps.filter((a) => a.riskLevel === f).length;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.filterTab,
                      isActive && styles.filterTabActive,
                      isActive && f !== 'all' && { borderColor: RISK_COLORS[f] },
                    ]}
                    onPress={() => setFilter(f)}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        isActive && f !== 'all' && { color: RISK_COLORS[f] },
                        isActive && f === 'all' && styles.filterTabTextActive,
                      ]}
                    >
                      {f === 'all'
                        ? `All (${count})`
                        : `${f.charAt(0).toUpperCase() + f.slice(1)} (${count})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* App cards */}
          {filteredApps.length === 0 && filter !== 'all' ? (
            <Text style={styles.noFilterResult}>No {filter} apps found</Text>
          ) : filteredApps.length === 0 ? (
            <View style={styles.allCleanBox}>
              <Text style={styles.allCleanIcon}>✓</Text>
              <Text style={styles.allCleanText}>No suspicious apps detected</Text>
              <Text style={styles.allCleanSub}>All {cleanCount} scanned apps appear clean</Text>
            </View>
          ) : (
            <View style={styles.appList}>
              {filteredApps.map((app) => (
                <AppCard
                  key={app.packageName}
                  app={app}
                  isTop3={top3Packages.has(app.packageName)}
                />
              ))}
            </View>
          )}

          {/* Clean apps indicator */}
          {cleanCount > 0 && (
            <View style={styles.cleanRow}>
              <Text style={styles.cleanRowText}>
                ✓ {cleanCount} clean app{cleanCount !== 1 ? 's' : ''} — no issues detected
              </Text>
            </View>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <View style={styles.recsSection}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              {result.recommendations.map((r, i) => (
                <View key={i} style={styles.recRow}>
                  <Text style={styles.recIndex}>{i + 1}</Text>
                  <Text style={styles.recText}>{r}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Share button */}
          <TouchableOpacity style={styles.shareBtn} onPress={shareReport}>
            <Text style={styles.shareBtnText}>Share / Export Report</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How This Works</Text>
        <Text style={styles.infoText}>
          The scanner checks every installed app against the ANKR Shield IOC database (Coalition
          Against Stalkerware, Exodus Privacy, Citizen Lab, Lookout) and 20+ permission-combination
          rules covering stalkerware, keyloggers, call recorders, financial trojans, and more. App
          data is read live from Android PackageManager — nothing leaves your device.
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },

  // Hero
  hero: { padding: 24, alignItems: 'center' },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  heroSub: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 12 },
  demoBadge: {
    backgroundColor: '#1e3a5f',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  demoBadgeText: { color: '#93c5fd', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Scan
  scanSection: { paddingHorizontal: 24, marginBottom: 8, alignItems: 'center' },
  scanBtn: {
    backgroundColor: '#1565C0',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  scanBtnDisabled: { backgroundColor: '#1e293b' },
  scanBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#3b82f6', borderRadius: 2 },
  scanHint: { color: '#666', fontSize: 12, marginTop: 10, textAlign: 'center' },

  // Results
  resultsSection: { padding: 16 },

  // Summary banner
  summaryBanner: {
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: '#111',
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
  },
  summaryOverall: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  summaryDetail: { color: '#666', fontSize: 13 },
  summaryBreakdown: { flexDirection: 'row', gap: 12, marginTop: 8 },
  summaryCount: { fontSize: 13, fontWeight: '700' },
  summaryText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
    textAlign: 'center',
  },

  // Filter tabs
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterTabActive: { backgroundColor: '#111' },
  filterTabText: { color: '#666', fontSize: 12, fontWeight: '600' },
  filterTabTextActive: { color: '#fff' },

  // App cards
  appList: { gap: 10, marginBottom: 16 },
  appCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  appCardTop3: { borderWidth: 2 },
  appCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  appCardLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 6 },
  appCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  top3Crown: { color: '#eab308', fontSize: 14, marginTop: 2 },
  appName: { color: '#f1f5f9', fontSize: 15, fontWeight: '600', maxWidth: 180 },
  packageName: { color: '#475569', fontSize: 11, marginTop: 2, maxWidth: 180 },

  // Risk badge
  badge: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Confidence bar
  confBarTrack: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  confBarFill: { height: 4, borderRadius: 2 },
  confLabel: { fontSize: 11, marginBottom: 8 },

  // Categories
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryChip: {
    backgroundColor: '#1e293b',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  categoryChipText: { color: '#94a3b8', fontSize: 11 },
  maliciousChip: { backgroundColor: '#450a0a', borderWidth: 1, borderColor: '#ef4444' },
  maliciousChipText: { color: '#ef4444', fontWeight: '700' },

  // Expanded
  expandChevron: { color: '#475569', fontSize: 12 },
  expandedSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1e293b' },
  detailBlock: { marginBottom: 12 },
  detailTitle: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  reasonRow: { flexDirection: 'row', marginBottom: 6, gap: 6 },
  reasonBullet: { fontSize: 14, width: 12, marginTop: 1 },
  reasonText: { color: '#cbd5e1', fontSize: 13, flex: 1, lineHeight: 18 },
  permGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  permChip: {
    backgroundColor: '#1e293b',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  permChipText: { color: '#f97316', fontSize: 11, fontFamily: 'monospace' },

  // All clean
  allCleanBox: {
    backgroundColor: '#052e16',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#166534',
    marginBottom: 16,
  },
  allCleanIcon: { fontSize: 48, color: '#22c55e', marginBottom: 8 },
  allCleanText: { color: '#22c55e', fontSize: 18, fontWeight: '700' },
  allCleanSub: { color: '#4ade80', fontSize: 13, marginTop: 4 },

  // No filter result
  noFilterResult: { color: '#475569', fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  // Clean row
  cleanRow: {
    backgroundColor: '#0a1f0a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#166534',
  },
  cleanRowText: { color: '#4ade80', fontSize: 13, textAlign: 'center' },

  // Recommendations
  recsSection: { marginBottom: 16 },
  sectionTitle: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  recRow: { flexDirection: 'row', marginBottom: 10, gap: 10 },
  recIndex: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
    marginTop: 1,
  },
  recText: { color: '#cbd5e1', fontSize: 13, flex: 1, lineHeight: 19 },

  // Share
  shareBtn: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  shareBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },

  // Info box
  infoBox: { margin: 16, padding: 14, backgroundColor: '#111', borderRadius: 10, marginBottom: 40 },
  infoTitle: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  infoText: { color: '#555', fontSize: 12, lineHeight: 18 },
});
