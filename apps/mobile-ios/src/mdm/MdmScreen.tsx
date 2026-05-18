/**
 * MdmScreen — A7: Corporate Shield / MDM Lite
 *
 * Shows enrollment status. If not enrolled, prompts with a text-input
 * fallback for QR JSON (no camera dependency required).
 * If enrolled, shows org, policy rules, compliance badge, and management actions.
 *
 * Dark theme: bg #0a0a0a | card #111 | border #1e293b | primary #7c3aed | accent #06b6d4
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';

import { t } from '../i18n';

import { mdmPolicyEngine } from './policy-engine';
import type { ComplianceResult } from './policy-engine';
import { MdmStorage } from './storage';
import type { DeviceEnrollment, MdmRule, MdmPolicy } from './types';

const STATUS_COLOR: Record<string, string> = {
  compliant: '#22c55e',
  partial: '#eab308',
  non_compliant: '#ef4444',
};
const STATUS_BG: Record<string, string> = {
  compliant: '#052e16',
  partial: '#422006',
  non_compliant: '#450a0a',
};
const STATUS_LABEL: Record<string, string> = {
  compliant: 'Compliant',
  partial: 'Partially Compliant',
  non_compliant: 'Non-Compliant',
};
const RULE_TYPE_LABEL: Record<string, string> = {
  require_screen_lock: 'Screen Lock Required',
  min_pin_length: 'Minimum PIN Length',
  block_domain: 'Blocked Domain',
  allow_domain_only: 'Allowlist Mode',
  require_vpn: 'Always-On VPN Required',
  block_sideloading: 'Block Sideloading',
  max_risk_score_allowed: 'Max Risk Score',
};
const SEVERITY_COLOR: Record<string, string> = {
  block: '#ef4444',
  warn: '#eab308',
  monitor: '#06b6d4',
};

function ComplianceBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#94a3b8';
  const bg = STATUS_BG[status] ?? '#1e293b';
  const label = STATUS_LABEL[status] ?? status;
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const color = SEVERITY_COLOR[severity] ?? '#94a3b8';
  return (
    <View style={[styles.severityPill, { borderColor: color }]}>
      <Text style={[styles.severityText, { color }]}>{severity.toUpperCase()}</Text>
    </View>
  );
}

function RuleRow({ rule }: { rule: MdmRule }) {
  const label = RULE_TYPE_LABEL[rule.type] ?? rule.type;
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleLeft}>
        <Text style={styles.ruleLabel}>{label}</Text>
        {rule.value ? <Text style={styles.ruleValue}>{rule.value}</Text> : null}
      </View>
      <SeverityPill severity={rule.severity} />
    </View>
  );
}

export function MdmScreen({ navigation: _navigation }: { navigation?: unknown }) {
  const m = t().mdm;
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<DeviceEnrollment | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [policy, setPolicy] = useState<MdmPolicy | null>(null);
  const [qrText, setQrText] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const e = await mdmPolicyEngine.getEnrollment();
      setEnrollment(e);
      if (e) {
        const c = await mdmPolicyEngine.checkCompliance();
        setCompliance(c);
        const raw = await MdmStorage.getItem('mdm_policy');
        if (raw) setPolicy(JSON.parse(raw) as MdmPolicy);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEnroll = useCallback(async () => {
    const input = qrText.trim();
    if (!input) {
      Alert.alert('Input Required', 'Paste the enrollment JSON from your IT administrator.');
      return;
    }
    setEnrolling(true);
    try {
      const e = await mdmPolicyEngine.enrollFromQr(input);
      setQrText('');
      setEnrollment(e);
      const c = await mdmPolicyEngine.checkCompliance();
      setCompliance(c);
      const raw = await MdmStorage.getItem('mdm_policy');
      if (raw) setPolicy(JSON.parse(raw) as MdmPolicy);
      Alert.alert('Enrolled', `Successfully enrolled with ${e.orgName}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Enrollment Failed', msg);
    } finally {
      setEnrolling(false);
    }
  }, [qrText]);

  const handleSync = useCallback(async () => {
    const apiKey = policy?.apiKey;
    if (!apiKey) {
      Alert.alert('No API Key', 'This policy does not include an xShield API key for sync.');
      return;
    }
    setSyncing(true);
    setSyncMsg('');
    try {
      const domains = await mdmPolicyEngine.syncBlocklist(apiKey);
      setSyncMsg(`Synced ${domains.length} blocked domains.`);
      const c = await mdmPolicyEngine.checkCompliance();
      setCompliance(c);
      if (enrollment) setEnrollment({ ...enrollment, lastChecked: new Date().toISOString() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Sync Failed', msg);
    } finally {
      setSyncing(false);
    }
  }, [policy, enrollment]);

  const handleUnenroll = useCallback(() => {
    Alert.alert(m.unenroll, m.unenrollConfirm, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unenroll',
        style: 'destructive',
        onPress: async () => {
          try {
            await mdmPolicyEngine.unenroll();
            setEnrollment(null);
            setCompliance(null);
            setPolicy(null);
            setSyncMsg('');
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>{t().loading}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{m.title}</Text>
        <Text style={styles.headerSub}>{m.subtitle}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {enrollment != null ? (
          <>
            <View style={styles.card}>
              <View style={styles.enrolledRow}>
                <View style={styles.enrolledDot} />
                <Text style={styles.enrolledLabel}>{m.enrolled.toUpperCase()}</Text>
              </View>
              <Text style={styles.orgName}>{enrollment.orgName}</Text>
              <Text style={styles.metaLine}>
                {'Policy: '}
                <Text style={styles.metaValue}>{enrollment.policyId}</Text>
              </Text>
              <Text style={styles.metaLine}>
                {'Device ID: '}
                <Text style={styles.metaValue}>{`${enrollment.deviceId.slice(0, 18)}...`}</Text>
              </Text>
              <Text style={styles.metaLine}>
                {'Enrolled: '}
                <Text style={styles.metaValue}>
                  {new Date(enrollment.enrolledAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </Text>
              <Text style={styles.metaLine}>
                {'Last Checked: '}
                <Text style={styles.metaValue}>
                  {new Date(enrollment.lastChecked).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </Text>
            </View>
            {compliance != null && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{m.compliance.toUpperCase()}</Text>
                <ComplianceBadge status={compliance.status} />
                {compliance.violations.length > 0 && (
                  <View style={styles.violationsBox}>
                    <Text style={styles.violationsTitle}>Violations</Text>
                    {compliance.violations.map((v, i) => (
                      <View key={i} style={styles.itemRow}>
                        <Text style={styles.bulletRed}>{'\u2717'}</Text>
                        <Text style={styles.itemText}>{v}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {compliance.recommendations.length > 0 && (
                  <View style={styles.recsBox}>
                    <Text style={styles.recsTitle}>Recommendations</Text>
                    {compliance.recommendations.map((r, i) => (
                      <View key={i} style={styles.itemRow}>
                        <Text style={styles.bulletYellow}>{'\u2192'}</Text>
                        <Text style={styles.itemText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {policy != null && policy.rules.length > 0 && (
              <View style={styles.card}>
                <Text
                  style={styles.sectionTitle}
                >{`POLICY RULES \u2014 v${policy.version ?? 1}`}</Text>
                {policy.rules.map((rule: MdmRule) => (
                  <RuleRow key={rule.ruleId} rule={rule} />
                ))}
              </View>
            )}
            <View style={styles.actionsCard}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.syncBtn, syncing && styles.btnDisabled]}
                onPress={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color="#06b6d4" />
                ) : (
                  <Text style={styles.syncBtnText}>{m.syncBlocklist}</Text>
                )}
              </TouchableOpacity>
              {syncMsg.length > 0 ? <Text style={styles.syncMsg}>{syncMsg}</Text> : null}
              <TouchableOpacity
                style={[styles.actionBtn, styles.unenrollBtn]}
                onPress={handleUnenroll}
              >
                <Text style={styles.unenrollBtnText}>{m.unenroll}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.notEnrolledCard}>
              <Text style={styles.notEnrolledTitle}>Not Enrolled</Text>
              <Text style={styles.notEnrolledSub}>{m.notEnrolled}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>ENROLL DEVICE</Text>
              <Text style={styles.enrollInstructions}>
                Ask your IT administrator for the xShield enrollment QR code. Paste the JSON below.
              </Text>
              <TextInput
                style={styles.qrInput}
                value={qrText}
                onChangeText={setQrText}
                placeholder="Paste enrollment JSON here..."
                placeholderTextColor="#475569"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.actionBtn, styles.enrollBtn, enrolling && styles.btnDisabled]}
                onPress={handleEnroll}
                disabled={enrolling}
              >
                {enrolling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.enrollBtnText}>Enroll Device</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>WHAT IS CORPORATE SHIELD?</Text>
              <Text style={styles.infoText}>
                Corporate Shield lets your IT team deploy security policies: blocking malicious
                domains, enforcing screen locks, and syncing threat intelligence from the xShield
                IOC feed. No personal data is shared with your organisation.
              </Text>
            </View>
          </>
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { color: '#64748b', fontSize: 14 },
  header: {
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  headerTitle: { color: '#f1f5f9', fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { color: '#475569', fontSize: 13, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 4,
  },
  actionsCard: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 10,
  },
  enrolledRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  enrolledDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  enrolledLabel: { color: '#22c55e', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  orgName: { color: '#f1f5f9', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  metaLine: { color: '#475569', fontSize: 12, marginBottom: 4 },
  metaValue: { color: '#94a3b8', fontFamily: 'monospace' },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  sectionTitle: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  violationsBox: {
    backgroundColor: '#1a0505',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#450a0a',
    marginBottom: 10,
  },
  violationsTitle: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  recsBox: {
    backgroundColor: '#111500',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#3f3000',
  },
  recsTitle: {
    color: '#fcd34d',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  itemRow: { flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'flex-start' },
  bulletRed: { color: '#ef4444', fontSize: 13, width: 14, marginTop: 1 },
  bulletYellow: { color: '#eab308', fontSize: 13, width: 14, marginTop: 1 },
  itemText: { color: '#cbd5e1', fontSize: 12, flex: 1, lineHeight: 18 },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  ruleLeft: { flex: 1, marginRight: 10 },
  ruleLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: '500' },
  ruleValue: { color: '#64748b', fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
  severityPill: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  severityText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtn: { backgroundColor: '#0c2a2e', borderWidth: 1, borderColor: '#06b6d4' },
  syncBtnText: { color: '#06b6d4', fontSize: 14, fontWeight: '700' },
  syncMsg: { color: '#4ade80', fontSize: 12, textAlign: 'center', marginTop: -4 },
  unenrollBtn: { backgroundColor: '#1a0505', borderWidth: 1, borderColor: '#7f1d1d' },
  unenrollBtnText: { color: '#f87171', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  notEnrolledCard: {
    backgroundColor: '#0d0d1a',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1b4b',
    marginBottom: 4,
  },
  notEnrolledTitle: { color: '#a5b4fc', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  notEnrolledSub: { color: '#475569', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  enrollInstructions: { color: '#64748b', fontSize: 13, lineHeight: 20, marginBottom: 14 },
  qrInput: {
    backgroundColor: '#0a0f1e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: 'monospace',
    padding: 12,
    minHeight: 100,
    marginBottom: 12,
  },
  enrollBtn: { backgroundColor: '#4c1d95', borderWidth: 1, borderColor: '#7c3aed' },
  enrollBtnText: { color: '#c4b5fd', fontSize: 14, fontWeight: '700' },
  infoCard: {
    backgroundColor: '#0a0f0a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a2e1a',
    marginBottom: 4,
  },
  infoTitle: {
    color: '#4b5563',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  infoText: { color: '#374151', fontSize: 12, lineHeight: 18 },
  bottomSpacer: { height: 40 },
});
