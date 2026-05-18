/**
 * iOSPermissionAuditScreen — iOS-specific permission auditor.
 *
 * Uses PermissionAuditModule (native Swift) to enumerate Camera/Mic/Contacts/
 * Location/Photos/Notifications grants and compute a Privacy Score.
 * Equivalent of Android's AppConsentScreen but using iOS permission APIs.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { PermissionAuditModule } = NativeModules;

interface PermissionRow {
  permission: string;
  status: string;
  granted: boolean;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  icon: string;
  alwaysOn?: boolean;
  limited?: boolean;
}

interface AuditResult {
  permissions: PermissionRow[];
  privacyScore: number;
  scannedAt: string;
}

const RISK_COLOR: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#22c55e',
};

const STATUS_LABEL: Record<string, string> = {
  granted: 'Granted',
  denied: 'Denied',
  restricted: 'Restricted',
  not_asked: 'Not asked',
  always: 'Always On',
  when_in_use: 'When In Use',
  limited: 'Limited',
  provisional: 'Provisional',
};

export function iOSPermissionAuditScreen() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    if (!PermissionAuditModule) {
      setError('PermissionAuditModule unavailable on this platform');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await PermissionAuditModule.audit();
      setResult(data as AuditResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const scoreColor =
    result && result.privacyScore >= 80
      ? '#22c55e'
      : result && result.privacyScore >= 50
        ? '#f59e0b'
        : '#ef4444';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.heading}>iOS Permission Audit</Text>
      <Text style={s.sub}>
        Check which permissions AnkrShield and the device apps have been granted.
      </Text>

      <TouchableOpacity style={s.btn} onPress={runAudit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Run Audit</Text>}
      </TouchableOpacity>

      {error && <Text style={s.err}>{error}</Text>}

      {result && (
        <>
          {/* Score circle */}
          <View style={s.scoreCard}>
            <Text style={[s.scoreNum, { color: scoreColor }]}>{result.privacyScore}</Text>
            <Text style={s.scoreLabel}>Privacy Score</Text>
            <Text style={s.scoreTs}>Scanned {new Date(result.scannedAt).toLocaleTimeString()}</Text>
          </View>

          {/* Permission rows */}
          {result.permissions.map((p) => (
            <View key={p.permission} style={s.row}>
              <Text style={s.rowIcon}>{p.icon}</Text>
              <View style={s.rowBody}>
                <View style={s.rowTop}>
                  <Text style={s.rowName}>{p.permission}</Text>
                  <View style={[s.badge, { backgroundColor: p.granted ? '#1a2e1a' : '#1a1a1a' }]}>
                    <Text style={[s.badgeTxt, { color: p.granted ? '#4ade80' : '#9ca3af' }]}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Text>
                  </View>
                </View>
                {p.granted && (
                  <View style={s.riskRow}>
                    <View style={[s.riskDot, { backgroundColor: RISK_COLOR[p.risk] }]} />
                    <Text style={[s.riskTxt, { color: RISK_COLOR[p.risk] }]}>
                      {p.risk} sensitivity
                    </Text>
                    {p.alwaysOn && <Text style={s.alwaysOn}> · Always On ⚠️</Text>}
                    {p.limited && <Text style={s.limited}> · Limited access</Text>}
                  </View>
                )}
              </View>
            </View>
          ))}

          <Text style={s.footer}>Tip: Revoke unused permissions in Settings → AnkrShield.</Text>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080c14' },
  content: { padding: 16, paddingBottom: 40 },
  heading: { color: '#f1f5f9', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sub: { color: '#9ca3af', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  btn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  err: { color: '#ef4444', fontSize: 13, marginBottom: 12 },
  scoreCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  scoreNum: { fontSize: 56, fontWeight: '900' },
  scoreLabel: { color: '#9ca3af', fontSize: 14, marginTop: 4 },
  scoreTs: { color: '#4b5563', fontSize: 11, marginTop: 2 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'flex-start',
  },
  rowIcon: { fontSize: 22, marginRight: 12, marginTop: 2 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  riskRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  riskDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  riskTxt: { fontSize: 11 },
  alwaysOn: { color: '#f59e0b', fontSize: 11 },
  limited: { color: '#60a5fa', fontSize: 11 },
  footer: { color: '#4b5563', fontSize: 12, textAlign: 'center', marginTop: 16 },
});
