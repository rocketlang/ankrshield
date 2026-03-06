/**
 * PermissionChangeScreen — detects when apps silently gain new permissions after updates.
 * Uses a stored baseline snapshot and diffs against current PackageManager grants.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  Platform,
  ActivityIndicator,
} from 'react-native';

const { PermissionWatcher } = NativeModules;

interface PermDiff {
  packageName: string;
  appName: string;
  added: string[];
  removed: string[];
  snapshotAt: number;
}

interface SnapshotInfo {
  has: boolean;
  snapshotAt: number;
  count: number;
}

// Permissions that are especially sensitive
const HIGH_RISK_PERMS = new Set([
  'READ_SMS',
  'RECEIVE_SMS',
  'SEND_SMS',
  'READ_CALL_LOG',
  'PROCESS_OUTGOING_CALLS',
  'READ_CONTACTS',
  'WRITE_CONTACTS',
  'ACCESS_FINE_LOCATION',
  'ACCESS_BACKGROUND_LOCATION',
  'RECORD_AUDIO',
  'CAMERA',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'SYSTEM_ALERT_WINDOW',
  'BIND_ACCESSIBILITY_SERVICE',
  'PACKAGE_USAGE_STATS',
  'READ_PHONE_STATE',
]);

function ageLabel(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function PermChip({ perm, type }: { perm: string; type: 'added' | 'removed' }) {
  const isRisky = HIGH_RISK_PERMS.has(perm);
  const bgColor = type === 'added' ? (isRisky ? '#3b0a0a' : '#0a1a0a') : '#1a1a1a';
  const textColor = type === 'added' ? (isRisky ? '#f87171' : '#4ade80') : '#6b7280';
  const prefix = type === 'added' ? '+' : '−';

  return (
    <View style={[styles.chip, { backgroundColor: bgColor }]}>
      <Text style={[styles.chipText, { color: textColor }]}>
        {prefix} {perm}
        {isRisky && type === 'added' ? ' ⚠️' : ''}
      </Text>
    </View>
  );
}

function DiffCard({ diff }: { diff: PermDiff }) {
  const hasHighRisk = diff.added.some((p) => HIGH_RISK_PERMS.has(p));
  return (
    <View style={[styles.diffCard, hasHighRisk && styles.diffCardRisky]}>
      <View style={styles.diffHeader}>
        <Text style={styles.diffAppName} numberOfLines={1}>
          {diff.appName}
        </Text>
        {hasHighRisk && <Text style={styles.riskBadge}>HIGH RISK</Text>}
      </View>
      <Text style={styles.diffPkg} numberOfLines={1}>
        {diff.packageName}
      </Text>

      {diff.added.length > 0 && (
        <View style={styles.permGroup}>
          <Text style={styles.permGroupLabel}>Gained since snapshot</Text>
          <View style={styles.chipRow}>
            {diff.added.map((p) => (
              <PermChip key={p} perm={p} type="added" />
            ))}
          </View>
        </View>
      )}

      {diff.removed.length > 0 && (
        <View style={styles.permGroup}>
          <Text style={[styles.permGroupLabel, { color: '#4b5563' }]}>No longer holds</Text>
          <View style={styles.chipRow}>
            {diff.removed.map((p) => (
              <PermChip key={p} perm={p} type="removed" />
            ))}
          </View>
        </View>
      )}

      <Text style={styles.diffAge}>Snapshot: {ageLabel(diff.snapshotAt)}</Text>
    </View>
  );
}

export function PermissionChangeScreen() {
  const [diffs, setDiffs] = useState<PermDiff[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapping, setSnapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkState = useCallback(async () => {
    if (Platform.OS !== 'android' || !PermissionWatcher) {
      setError(Platform.OS !== 'android' ? 'Android only' : 'PermissionWatcher module not found');
      setLoading(false);
      return;
    }
    try {
      const info: SnapshotInfo = await PermissionWatcher.hasSnapshot();
      setSnapshot(info);
      if (info.has) {
        const d: PermDiff[] = await PermissionWatcher.getPermissionDiffs();
        // Sort: high-risk additions first
        d.sort((a, b) => {
          const aRisk = a.added.some((p) => HIGH_RISK_PERMS.has(p)) ? -1 : 0;
          const bRisk = b.added.some((p) => HIGH_RISK_PERMS.has(p)) ? -1 : 0;
          return aRisk - bRisk;
        });
        setDiffs(d);
      }
    } catch (_e) {
      setError('Could not read permission data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  async function handleSnapshot() {
    setSnapping(true);
    setError(null);
    try {
      await PermissionWatcher.snapshotPermissions();
      setDiffs([]);
      await checkState();
    } catch (_e) {
      setError('Failed to take snapshot');
    } finally {
      setSnapping(false);
    }
  }

  async function handleClear() {
    await PermissionWatcher.clearSnapshot().catch(() => {});
    setDiffs([]);
    setSnapshot(null);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>🔌</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Permission Changes</Text>
        <Text style={styles.headerSub}>
          Detects apps that silently gained new permissions after an update
        </Text>
      </View>

      {/* Snapshot status card */}
      <View style={styles.snapCard}>
        {snapshot?.has ? (
          <>
            <Text style={styles.snapStatus}>
              📸 Baseline from {ageLabel(snapshot.snapshotAt)} · {snapshot.count} apps tracked
            </Text>
            <View style={styles.snapBtnRow}>
              <TouchableOpacity
                style={[styles.snapBtn, styles.snapBtnPrimary]}
                onPress={handleSnapshot}
                disabled={snapping}
              >
                {snapping ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.snapBtnText}>↻ Refresh Baseline</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.snapBtn, styles.snapBtnDanger]}
                onPress={handleClear}
              >
                <Text style={styles.snapBtnText}>🗑 Clear</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.snapNoSnap}>No baseline snapshot yet</Text>
            <Text style={styles.snapNoSnapSub}>
              Take a snapshot now. After app updates, come back to see what changed.
            </Text>
            <TouchableOpacity
              style={[styles.snapBtn, styles.snapBtnPrimary, { alignSelf: 'stretch' }]}
              onPress={handleSnapshot}
              disabled={snapping}
            >
              {snapping ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.snapBtnText, { textAlign: 'center' }]}>
                  📸 Take Snapshot Now
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Diff results */}
      {snapshot?.has && (
        <View style={styles.diffSection}>
          {diffs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTitle}>No permission changes detected</Text>
              <Text style={styles.emptySub}>
                All installed apps have the same permissions as your baseline snapshot.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.diffCount}>
                {diffs.length} app{diffs.length !== 1 ? 's' : ''} with changed permissions
              </Text>
              {diffs.map((d) => (
                <DiffCard key={d.packageName} diff={d} />
              ))}
            </>
          )}
        </View>
      )}

      {/* How it works */}
      <View style={styles.howBox}>
        <Text style={styles.howTitle}>How it works</Text>
        <Text style={styles.howText}>
          AnkrShield reads which permissions Android has actually granted to each app (not just
          declared). When an app updates via Play Store, it can silently request new permissions.
          {'\n\n'}
          Take a snapshot today, then check back after a few days to see what changed. Red chips ⚠️
          indicate especially sensitive permissions (SMS, location, contacts, microphone).
          {'\n\n'}
          No data leaves your phone — all comparisons happen on-device.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d0d0d' },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorText: { color: '#6b7280', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

  header: { padding: 20, paddingTop: 24 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#6b7280', fontSize: 13, marginTop: 4, lineHeight: 18 },

  snapCard: {
    margin: 16,
    marginTop: 4,
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    gap: 10,
  },
  snapStatus: { color: '#a855f7', fontSize: 13, fontWeight: '600' },
  snapBtnRow: { flexDirection: 'row', gap: 8 },
  snapBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  snapBtnPrimary: { backgroundColor: '#581c87' },
  snapBtnDanger: { backgroundColor: '#3b0a0a', borderWidth: 1, borderColor: '#7f1d1d' },
  snapBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  snapNoSnap: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  snapNoSnapSub: { color: '#6b7280', fontSize: 12, lineHeight: 17 },

  diffSection: { paddingHorizontal: 16 },
  diffCount: { color: '#ef4444', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  diffCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  diffCardRisky: { borderColor: '#7f1d1d', backgroundColor: '#1a0000' },
  diffHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  diffAppName: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', flex: 1 },
  riskBadge: {
    backgroundColor: '#7f1d1d',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    color: '#fca5a5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  diffPkg: { color: '#4b5563', fontSize: 10, fontFamily: 'monospace' },
  permGroup: { gap: 4 },
  permGroupLabel: {
    color: '#6b7280',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '600', fontFamily: 'monospace' },
  diffAge: { color: '#374151', fontSize: 10, marginTop: 4 },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { color: '#4ade80', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySub: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },

  howBox: {
    margin: 16,
    marginBottom: 40,
    backgroundColor: '#0d1117',
    borderRadius: 10,
    padding: 14,
  },
  howTitle: {
    color: '#4b5563',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  howText: { color: '#555', fontSize: 12, lineHeight: 19 },
});
