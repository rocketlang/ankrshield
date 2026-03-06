/**
 * DeviceHealthScreen — audits device security settings and shows a hardening score.
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
  Linking,
  ActivityIndicator,
} from 'react-native';

import { t } from '../i18n';
const { DeviceHealth } = NativeModules;

interface CheckResult {
  id: string;
  label: string;
  passed: boolean;
  severity: 'critical' | 'high' | 'medium' | 'info';
  value: string;
  recommendation: string;
  settingsAction: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  info: '#60a5fa',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  info: 'INFO',
};

function scoreColor(pct: number) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#f59e0b';
  return '#ef4444';
}

function scoreGrade(pct: number) {
  const s = t();
  if (pct >= 90) return s.deviceHealth.excellent;
  if (pct >= 75) return s.deviceHealth.good;
  if (pct >= 50) return s.deviceHealth.needsWork;
  return s.deviceHealth.atRisk;
}

function CheckCard({ check, onFix }: { check: CheckResult; onFix: () => void }) {
  const [expanded, setExpanded] = useState(!check.passed);
  const color = check.passed ? '#22c55e' : SEVERITY_COLOR[check.severity];

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: color }]}
      onPress={() => setExpanded((e) => !e)}
      activeOpacity={0.8}
    >
      <View style={styles.cardRow}>
        <Text style={styles.cardIcon}>
          {check.passed
            ? '✅'
            : check.severity === 'critical'
              ? '🚨'
              : check.severity === 'high'
                ? '⚠️'
                : '⚡'}
        </Text>
        <View style={styles.cardBody}>
          <Text style={styles.cardLabel}>{check.label}</Text>
          <Text
            style={[styles.cardValue, { color: check.passed ? '#4b5563' : color }]}
            numberOfLines={expanded ? undefined : 1}
          >
            {check.value}
          </Text>
        </View>
        {!check.passed && (
          <View
            style={[styles.severityBadge, { backgroundColor: color + '22', borderColor: color }]}
          >
            <Text style={[styles.severityText, { color }]}>{SEVERITY_LABEL[check.severity]}</Text>
          </View>
        )}
      </View>

      {expanded && !check.passed && (
        <View style={styles.expandedBody}>
          <Text style={styles.recommendation}>{check.recommendation}</Text>
          {check.settingsAction !== '' && (
            <TouchableOpacity
              style={styles.fixBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                onFix();
              }}
            >
              <Text style={styles.fixBtnText}>Open Settings →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export function DeviceHealthScreen() {
  const s = t();
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const loadChecks = useCallback(async () => {
    if (Platform.OS !== 'android' || !DeviceHealth) {
      setOffline(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setOffline(false);
    try {
      const result: CheckResult[] = await DeviceHealth.getSecurityChecks();
      setChecks(result);
    } catch (_e) {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  function handleFix(check: CheckResult) {
    if (!check.settingsAction) return;
    Linking.sendIntent(check.settingsAction).catch(() => Linking.openSettings());
  }

  const passed = checks.filter((c) => c.passed).length;
  const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 0;
  const critical = checks.filter((c) => !c.passed && c.severity === 'critical').length;
  const high = checks.filter((c) => !c.passed && c.severity === 'high').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loadingText}>{s.deviceHealth.scanning}</Text>
      </View>
    );
  }

  if (offline) {
    return (
      <View style={styles.center}>
        <Text style={styles.offlineIcon}>🔌</Text>
        <Text style={styles.offlineTitle}>{s.deviceHealth.notAvailable}</Text>
        <Text style={styles.offlineSub}>
          {Platform.OS !== 'android' ? s.deviceHealth.androidOnly : s.deviceHealth.couldNotRead}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadChecks}>
          <Text style={styles.retryBtnText}>{s.deviceHealth.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Score hero */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreCircle}>
          <Text style={[styles.scoreNum, { color: scoreColor(score) }]}>{score}</Text>
          <Text style={styles.scoreSlash}>/100</Text>
        </View>
        <View style={styles.scoreInfo}>
          <Text style={[styles.scoreGrade, { color: scoreColor(score) }]}>{scoreGrade(score)}</Text>
          <Text style={styles.scoreSub}>
            {passed} {s.deviceHealth.checksOf} {checks.length} {s.deviceHealth.checksPassed}
          </Text>
          {critical > 0 && (
            <Text style={styles.criticalAlert}>
              🚨 {critical}{' '}
              {critical > 1 ? s.deviceHealth.criticalIssues : s.deviceHealth.criticalIssue}
            </Text>
          )}
          {critical === 0 && high > 0 && (
            <Text style={styles.highAlert}>
              ⚠️ {high} {high > 1 ? s.deviceHealth.highIssues : s.deviceHealth.highIssue}
            </Text>
          )}
        </View>
      </View>

      {/* Check cards */}
      <View style={styles.list}>
        {/* Critical first */}
        {checks
          .filter((c) => !c.passed && c.severity === 'critical')
          .map((c) => (
            <CheckCard key={c.id} check={c} onFix={() => handleFix(c)} />
          ))}
        {/* Then high */}
        {checks
          .filter((c) => !c.passed && c.severity === 'high')
          .map((c) => (
            <CheckCard key={c.id} check={c} onFix={() => handleFix(c)} />
          ))}
        {/* Then medium + info */}
        {checks
          .filter((c) => !c.passed && (c.severity === 'medium' || c.severity === 'info'))
          .map((c) => (
            <CheckCard key={c.id} check={c} onFix={() => handleFix(c)} />
          ))}
        {/* Passed checks at bottom */}
        {checks
          .filter((c) => c.passed)
          .map((c) => (
            <CheckCard key={c.id} check={c} onFix={() => handleFix(c)} />
          ))}
      </View>

      <TouchableOpacity style={styles.refreshBtn} onPress={loadChecks}>
        <Text style={styles.refreshBtnText}>{s.deviceHealth.rescan}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d0d',
    padding: 32,
  },
  loadingText: { color: '#555', fontSize: 13, marginTop: 16 },
  offlineIcon: { fontSize: 40, marginBottom: 12 },
  offlineTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  offlineSub: { color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  retryBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  scoreCard: {
    margin: 16,
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scoreCircle: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreNum: { fontSize: 52, fontWeight: '900', lineHeight: 56 },
  scoreSlash: { color: '#374151', fontSize: 16, marginBottom: 6 },
  scoreInfo: { flex: 1, gap: 4 },
  scoreGrade: { fontSize: 20, fontWeight: '800' },
  scoreSub: { color: '#6b7280', fontSize: 13 },
  criticalAlert: { color: '#ef4444', fontSize: 12, fontWeight: '600', marginTop: 4 },
  highAlert: { color: '#f97316', fontSize: 12, fontWeight: '600', marginTop: 4 },

  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  card: {
    backgroundColor: '#111',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderLeftWidth: 4,
    padding: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 20, width: 26 },
  cardBody: { flex: 1 },
  cardLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  cardValue: { fontSize: 12, marginTop: 2 },
  severityBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  severityText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  expandedBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 8,
  },
  recommendation: { color: '#9ca3af', fontSize: 12, lineHeight: 18 },
  fixBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e3a5f',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fixBtnText: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },

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
