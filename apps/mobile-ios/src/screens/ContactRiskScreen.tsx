/**
 * ContactRiskScreen — XS-SATOI-5
 *
 * Two modes:
 *   CHECK — Enter a phone number, get instant risk assessment
 *   REPORT — Submit a crowd-sourced hijack report (used after receiving a
 *            "Dear friends, my WhatsApp was hacked" message)
 *
 * This screen is the consumer-facing entry point for XS-SATOI.
 * It connects to GET /risk/phone and POST /risk/phone/report.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { usePhoneRisk } from '../hooks/usePhoneRisk';
import type { PhoneRiskResult } from '../hooks/usePhoneRisk';

const PLATFORMS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'telegram', label: 'Telegram', icon: '✈️' },
  { key: 'instagram', label: 'Instagram', icon: '📸' },
  { key: 'facebook', label: 'Facebook', icon: '👥' },
  { key: 'gmail', label: 'Gmail', icon: '📧' },
  { key: 'other', label: 'Other', icon: '📱' },
] as const;

type Platform = (typeof PLATFORMS)[number]['key'];

const C = {
  bg: '#0f172a',
  card: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  sub: '#94a3b8',
  accent: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

function RiskBadge({ score }: { score: number }) {
  const color = score >= 70 ? C.red : score >= 30 ? C.amber : C.green;
  const label = score >= 70 ? 'HIGH RISK' : score >= 30 ? 'SUSPICIOUS' : 'CLEAN';
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
      <Text style={[styles.badgeScore, { color }]}>{score}/100</Text>
    </View>
  );
}

function ResultCard({ result }: { result: PhoneRiskResult }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultNumber}>{result.numberDisplay}</Text>
          {result.platforms.length > 0 && (
            <Text style={styles.resultSub}>Reported on: {result.platforms.join(', ')}</Text>
          )}
        </View>
        <RiskBadge score={result.riskScore} />
      </View>

      {result.advisories.length > 0 && (
        <View style={styles.advisoriesBox}>
          {result.advisories.map((a, i) => (
            <View key={i} style={styles.advisoryRow}>
              <Text style={styles.advisoryIcon}>⚠️</Text>
              <Text style={styles.advisoryText}>{a}</Text>
            </View>
          ))}
        </View>
      )}

      {result.reportCount > 0 && (
        <Text style={styles.reportCountText}>
          {result.reportCount} community report{result.reportCount !== 1 ? 's' : ''}
          {result.firstReportedAt
            ? ` · First reported ${new Date(result.firstReportedAt).toLocaleDateString()}`
            : ''}
        </Text>
      )}

      {!result.hijacked && (
        <Text style={styles.cleanText}>
          ✅ No hijacking reports found for this number in our database.
        </Text>
      )}

      {result.riskScore >= 70 && (
        <TouchableOpacity
          style={styles.reportCrimeBtn}
          onPress={() => Linking.openURL('https://cybercrime.gov.in/')}
        >
          <Text style={styles.reportCrimeBtnText}>🚨 Report to cybercrime.gov.in</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ContactRiskScreen() {
  const [tab, setTab] = useState<'check' | 'report'>('check');
  const [number, setNumber] = useState('');
  const [platform, setPlatform] = useState<Platform>('whatsapp');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<PhoneRiskResult | null>(null);
  const [reported, setReported] = useState(false);

  const { checkNumber, reportNumber, loading, error } = usePhoneRisk();

  const handleCheck = async () => {
    if (!number.trim()) return;
    setResult(null);
    const res = await checkNumber(number.trim());
    setResult(res);
  };

  const handleReport = async () => {
    if (!number.trim()) return;
    const ok = await reportNumber({
      number: number.trim(),
      platform,
      notes: notes.trim() || undefined,
    });
    if (ok) {
      setReported(true);
      Alert.alert(
        'Report Submitted',
        'Thank you! Your report helps protect the AnkrShield community.',
        [{ text: 'OK' }]
      );
      setNumber('');
      setNotes('');
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Tab switcher */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'check' && styles.tabActive]}
          onPress={() => {
            setTab('check');
            setResult(null);
            setReported(false);
          }}
        >
          <Text style={[styles.tabText, tab === 'check' && styles.tabTextActive]}>
            🔍 Check Number
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'report' && styles.tabActive]}
          onPress={() => {
            setTab('report');
            setResult(null);
            setReported(false);
          }}
        >
          <Text style={[styles.tabText, tab === 'report' && styles.tabTextActive]}>
            🚨 Report Hijack
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'check' ? (
        <View style={styles.section}>
          <Text style={styles.hint}>
            Enter a phone number to check if it has been reported as hijacked or spoofed.
          </Text>
          <TextInput
            style={styles.input}
            value={number}
            onChangeText={setNumber}
            placeholder="+91 98765 43210"
            placeholderTextColor={C.sub}
            keyboardType="phone-pad"
          />
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleCheck}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Check Now</Text>
            )}
          </TouchableOpacity>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {result && <ResultCard result={result} />}
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.hint}>
            Received a "my WhatsApp was hacked" message from a contact? Report it here to protect
            others.
          </Text>

          <Text style={styles.label}>Phone number of the hijacked account</Text>
          <TextInput
            style={styles.input}
            value={number}
            onChangeText={setNumber}
            placeholder="+91 98765 43210"
            placeholderTextColor={C.sub}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Platform</Text>
          <View style={styles.platformGrid}>
            {PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.platformChip, platform === p.key && styles.platformChipActive]}
                onPress={() => setPlatform(p.key)}
              >
                <Text style={styles.platformIcon}>{p.icon}</Text>
                <Text
                  style={[styles.platformLabel, platform === p.key && styles.platformLabelActive]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. 'They messaged asking for OTP' or 'Posted scam links to our group'"
            placeholderTextColor={C.sub}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.btn, styles.btnRed, loading && styles.btnDisabled]}
            onPress={handleReport}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Submit Report</Text>
            )}
          </TouchableOpacity>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {reported && (
            <Text style={styles.successText}>
              ✅ Report submitted — thank you for keeping the community safe!
            </Text>
          )}

          <View style={styles.privacyNote}>
            <Text style={styles.privacyNoteText}>
              🔒 Privacy: phone numbers are stored as cryptographic hashes only. The raw number
              never leaves your device.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  tabs: { flexDirection: 'row', margin: 16, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabActive: { borderColor: C.accent, backgroundColor: '#1e3a5f' },
  tabText: { color: C.sub, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: C.accent },
  section: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { color: C.sub, fontSize: 13, marginBottom: 16, lineHeight: 19 },
  label: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    color: C.text,
    fontSize: 16,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  btn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  btnRed: { backgroundColor: C.red },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  errorText: { color: C.red, marginTop: 8, fontSize: 13 },
  successText: { color: C.green, marginTop: 8, fontSize: 13, fontWeight: '600' },
  resultCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  resultNumber: { color: C.text, fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  resultSub: { color: C.sub, fontSize: 12, marginTop: 4 },
  badge: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  badgeLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  badgeScore: { fontSize: 16, fontWeight: '700' },
  advisoriesBox: { backgroundColor: '#1a1a2e', borderRadius: 8, padding: 12, marginBottom: 12 },
  advisoryRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  advisoryIcon: { fontSize: 14, marginRight: 8, marginTop: 1 },
  advisoryText: { color: C.amber, fontSize: 13, flex: 1, lineHeight: 18 },
  reportCountText: { color: C.sub, fontSize: 12, marginTop: 4 },
  cleanText: { color: C.green, fontSize: 13, marginTop: 8 },
  reportCrimeBtn: {
    backgroundColor: '#450a0a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.red,
  },
  reportCrimeBtnText: { color: C.red, fontWeight: '700', fontSize: 14 },
  platformGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  platformChipActive: { borderColor: C.accent, backgroundColor: '#1e3a5f' },
  platformIcon: { fontSize: 16 },
  platformLabel: { color: C.sub, fontSize: 13 },
  platformLabelActive: { color: C.accent },
  privacyNote: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#0d1b2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  privacyNoteText: { color: C.sub, fontSize: 12, lineHeight: 17 },
});
