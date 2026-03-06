/**
 * App Scope Monitor — A2
 * Shows installed apps validated against their stated category purpose.
 * Philosophy: only excess scope is flagged, not consciously-granted permissions.
 */

import {
  validateConsent,
  type ConsentValidation,
  type AppPermissions,
} from '@ankrshield/android-monitor';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
  NativeModules,
  Platform,
} from 'react-native';

const { AppScanner } = NativeModules;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SEVERITY_COLORS = { critical: '#f44336', warning: '#FF9800', info: '#607D8B' };

function ScoreBar({ score }: { score: number }) {
  const color = score > 80 ? '#4CAF50' : score >= 50 ? '#FF9800' : '#f44336';
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>Trust score</Text>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${score}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreNum, { color }]}>{score}</Text>
    </View>
  );
}

function AppCard({ validation }: { validation: ConsentValidation }) {
  const [inhibited, setInhibited] = useState(false);
  const {
    appName,
    detectedCategory,
    legitimatePermissions,
    excessPermissions,
    consentScore,
    summary,
  } = validation;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.appName} numberOfLines={1}>
          {appName}
        </Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {detectedCategory.toUpperCase().replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Legitimate scope */}
      <Text style={styles.legitimateRow}>
        {legitimatePermissions.length} permission{legitimatePermissions.length !== 1 ? 's' : ''}{' '}
        match its purpose
      </Text>

      {/* Excess permissions */}
      {excessPermissions.length > 0 && (
        <View style={styles.excessSection}>
          <Text style={styles.excessTitle}>Excess scope ({excessPermissions.length})</Text>
          {excessPermissions.map((ep) => (
            <View key={ep.permission} style={styles.excessRow}>
              <View
                style={[
                  styles.severityBadge,
                  {
                    backgroundColor: SEVERITY_COLORS[ep.severity] + '22',
                    borderColor: SEVERITY_COLORS[ep.severity],
                  },
                ]}
              >
                <Text style={[styles.severityText, { color: SEVERITY_COLORS[ep.severity] }]}>
                  {ep.severity.toUpperCase()}
                </Text>
              </View>
              <View style={styles.excessBody}>
                <Text style={styles.excessPerm}>{ep.permission}</Text>
                <Text style={styles.excessReason}>{ep.reason}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Score bar */}
      <ScoreBar score={consentScore} />

      {/* Summary */}
      <Text style={styles.summary}>{summary}</Text>

      {/* Inhibit toggle */}
      <View style={styles.inhibitRow}>
        <View style={styles.inhibitLeft}>
          <Text style={styles.inhibitLabel}>Inhibit Excess Scope</Text>
          {inhibited && (
            <Text style={styles.inhibitNote}>
              Excess network calls from this app will be blocked
            </Text>
          )}
        </View>
        <Switch
          value={inhibited}
          onValueChange={setInhibited}
          trackColor={{ false: '#333', true: '#1565C044' }}
          thumbColor={inhibited ? '#1565C0' : '#555'}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function AppConsentScreen() {
  const [allApps, setAllApps] = useState<ConsentValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [showClean, setShowClean] = useState(false);

  const loadApps = useCallback(async () => {
    if (Platform.OS !== 'android' || !AppScanner) {
      setOffline(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setOffline(false);
    try {
      const raw: AppPermissions[] = await AppScanner.getInstalledApps();
      const validated = raw
        .filter((a) => a.permissions.length > 0) // skip apps with no granted permissions
        .map((a) => validateConsent(a));
      setAllApps(validated);
    } catch (_e) {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // Apply filters
  const visible = allApps.filter((v) => {
    if (!showSystem && v.isSystemApp) return false;
    if (!showClean && v.excessPermissions.length === 0) return false;
    return true;
  });

  const excessCount = allApps.filter((v) => v.excessPermissions.length > 0).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>
          Scanning {allApps.length > 0 ? allApps.length : ''} apps…
        </Text>
      </View>
    );
  }

  if (offline) {
    return (
      <View style={styles.center}>
        <Text style={styles.offlineIcon}>🔌</Text>
        <Text style={styles.offlineTitle}>App Scanner Unavailable</Text>
        <Text style={styles.offlineSub}>
          {Platform.OS !== 'android'
            ? 'App Scope Monitor requires Android.'
            : 'Could not read installed apps. Check permissions and try again.'}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadApps}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>App Scope Monitor</Text>
        <Text style={styles.headerSub}>
          {allApps.length} apps scanned · {excessCount} with excess scope
        </Text>
      </View>

      {/* Summary bar */}
      <View style={[styles.summaryBar, { borderColor: excessCount > 0 ? '#FF9800' : '#4CAF50' }]}>
        <Text style={[styles.summaryText, { color: excessCount > 0 ? '#FF9800' : '#4CAF50' }]}>
          {excessCount} of {allApps.filter((v) => !v.isSystemApp).length} user apps have excess
          scope
        </Text>
      </View>

      {/* Filter toggles */}
      <View style={styles.filterRow}>
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>Show system apps</Text>
          <Switch
            value={showSystem}
            onValueChange={setShowSystem}
            trackColor={{ false: '#333', true: '#1565C044' }}
            thumbColor={showSystem ? '#1565C0' : '#555'}
          />
        </View>
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>Show clean apps</Text>
          <Switch
            value={showClean}
            onValueChange={setShowClean}
            trackColor={{ false: '#333', true: '#4CAF5044' }}
            thumbColor={showClean ? '#4CAF50' : '#555'}
          />
        </View>
      </View>

      {/* App cards */}
      {visible.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>
            {excessCount === 0 ? 'All apps look clean' : 'No apps to show with current filters'}
          </Text>
          <Text style={styles.emptySub}>
            {excessCount === 0
              ? 'No installed apps are using permissions beyond their stated purpose.'
              : 'Enable "Show clean apps" to see all scanned apps.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visible.map((v) => (
            <AppCard key={v.packageName} validation={v} />
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.refreshBtn} onPress={loadApps}>
        <Text style={styles.refreshBtnText}>↻ Rescan Apps</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#080c14',
    padding: 32,
  },
  header: { padding: 20, paddingTop: 28 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#666', fontSize: 13, marginTop: 4 },
  summaryBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#0d1117',
  },
  summaryText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  filterItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d1117',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterLabel: { color: '#888', fontSize: 12 },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#0d1117', borderRadius: 12, padding: 14, marginBottom: 4 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  appName: { color: '#e8eaed', fontSize: 16, fontWeight: '700', flex: 1 },
  categoryBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  categoryText: { color: '#64b5f6', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  legitimateRow: { color: '#4CAF50', fontSize: 12, marginBottom: 10 },
  excessSection: { backgroundColor: '#140a00', borderRadius: 8, padding: 10, marginBottom: 10 },
  excessTitle: {
    color: '#FF9800',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  excessRow: { flexDirection: 'row', marginBottom: 8, gap: 8, alignItems: 'flex-start' },
  severityBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 1,
  },
  severityText: { fontSize: 9, fontWeight: '700' },
  excessBody: { flex: 1 },
  excessPerm: { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 1 },
  excessReason: { color: '#888', fontSize: 11, lineHeight: 15 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  scoreLabel: { color: '#666', fontSize: 11, width: 68 },
  scoreTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreFill: { height: 4, borderRadius: 2 },
  scoreNum: { fontSize: 12, fontWeight: '700', width: 28, textAlign: 'right' },
  summary: { color: '#888', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  inhibitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  inhibitLeft: { flex: 1, marginRight: 8 },
  inhibitLabel: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  inhibitNote: { color: '#1565C0', fontSize: 11, marginTop: 3 },
  loadingText: { color: '#555', fontSize: 13, marginTop: 16 },
  offlineIcon: { fontSize: 48, marginBottom: 16 },
  offlineTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  offlineSub: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  retryBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyBox: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, paddingBottom: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: {
    color: '#4ade80',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  refreshBtn: {
    margin: 16,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  refreshBtnText: { color: '#4b5563', fontSize: 13, fontWeight: '600' },
});
