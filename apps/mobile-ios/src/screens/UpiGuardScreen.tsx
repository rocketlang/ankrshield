/**
 * UpiGuardScreen — validate UPI payment URIs before completing a transaction.
 * Detects fake VPAs, suspicious amounts, scam note patterns, unknown PSP handles.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  ActivityIndicator,
} from 'react-native';

import { t } from '../i18n';
const { UpiGuard } = NativeModules;

interface UpiAnalysis {
  isUpiUri: boolean;
  vpa: string;
  payeeName: string;
  amount: string;
  currency: string;
  note: string;
  riskLevel: 'safe' | 'caution' | 'high' | 'critical';
  flags: string[];
  knownHandle: boolean;
}

const RISK_META = {
  safe: { color: '#22c55e', icon: '✅', label: 'Safe' },
  caution: { color: '#f59e0b', icon: '⚠️', label: 'Use Caution' },
  high: { color: '#f97316', icon: '🚨', label: 'High Risk' },
  critical: { color: '#ef4444', icon: '🛑', label: 'Do Not Pay' },
};

const KNOWN_UPI_APPS = [
  'Google Pay',
  'PhonePe',
  'Paytm',
  'BHIM',
  'Amazon Pay',
  'Cred',
  'Mobikwik',
  'Freecharge',
];

export function UpiGuardScreen({ route }: any) {
  // Accept pre-filled URI from navigation params (e.g. from upi:// deep link)
  const s = t();
  const prefillUri: string = route?.params?.uri ?? '';
  const [input, setInput] = useState(prefillUri);
  const [result, setResult] = useState<UpiAnalysis | null>(null);
  const [checking, setChecking] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    loadHistory();
    // Auto-analyze if launched via a upi:// deep link
    if (prefillUri) {
      setTimeout(() => handleCheck(), 400);
    }
  }, []);

  async function loadHistory() {
    if (!UpiGuard) return;
    try {
      const h = await UpiGuard.getCheckHistory();
      setHistory(h ?? []);
    } catch (_e) {
      /* ignore */
    }
  }

  async function handleCheck() {
    if (!input.trim() || !UpiGuard) return;
    setChecking(true);
    try {
      const analysis: UpiAnalysis = await UpiGuard.analyzeUri(input.trim());
      setResult(analysis);
      await loadHistory();
    } catch (_e) {
      // Module error
    } finally {
      setChecking(false);
    }
  }

  const meta = result ? RISK_META[result.riskLevel] : null;

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.heroIcon}>💳</Text>
        <Text style={s.heroTitle}>{s.upiGuard.title}</Text>
        <Text style={s.heroSub}>{s.upiGuard.subtitle}</Text>
      </View>

      {/* Input */}
      <View style={s.inputSection}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder={s.upiGuard.placeholder}
          placeholderTextColor="#333"
          multiline
          numberOfLines={3}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[s.checkBtn, (!input.trim() || checking) && s.checkBtnDisabled]}
          onPress={handleCheck}
          disabled={!input.trim() || checking}
        >
          {checking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.checkBtnText}>{s.upiGuard.verify}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Result card */}
      {result && meta && (
        <View style={[s.resultCard, { borderColor: meta.color }]}>
          <View style={s.resultHeader}>
            <Text style={s.resultIcon}>{meta.icon}</Text>
            <View style={s.resultHeaderInfo}>
              <Text style={[s.resultLevel, { color: meta.color }]}>{meta.label}</Text>
              {result.vpa !== '' && <Text style={s.resultVpa}>{result.vpa}</Text>}
            </View>
            {result.knownHandle && (
              <View style={s.verifiedBadge}>
                <Text style={s.verifiedBadgeText}>{s.upiGuard.knownPsp}</Text>
              </View>
            )}
          </View>

          {/* Payment details */}
          {result.payeeName || result.amount || result.note ? (
            <View style={s.detailsBox}>
              {result.payeeName !== '' && (
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{s.upiGuard.payee}</Text>
                  <Text style={s.detailValue}>{result.payeeName}</Text>
                </View>
              )}
              {result.amount !== '' && (
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{s.upiGuard.amount}</Text>
                  <Text style={[s.detailValue, s.detailAmount]}>
                    ₹{parseFloat(result.amount).toLocaleString('en-IN')} {result.currency}
                  </Text>
                </View>
              )}
              {result.note !== '' && (
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{s.upiGuard.note}</Text>
                  <Text style={s.detailValue} numberOfLines={2}>
                    {result.note}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Risk flags */}
          {result.flags.length > 0 && (
            <View style={s.flagsSection}>
              <Text style={s.flagsTitle}>{s.upiGuard.riskSignals}</Text>
              {result.flags.map((flag, i) => (
                <View key={i} style={s.flagRow}>
                  <Text style={s.flagDot}>▸</Text>
                  <Text style={s.flagText}>{flag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Advice */}
          <View
            style={[
              s.adviceBox,
              { borderColor: meta.color + '44', backgroundColor: meta.color + '0d' },
            ]}
          >
            <Text style={[s.adviceTitle, { color: meta.color }]}>
              {result.riskLevel === 'safe' ? '✅ Looks legitimate' : '⚠️ Verify before paying'}
            </Text>
            <Text style={s.adviceText}>
              {result.riskLevel === 'safe'
                ? 'VPA uses a registered PSP handle and details look normal. Still confirm the payee name before completing.'
                : result.riskLevel === 'critical'
                  ? 'Do NOT complete this payment. Scammers use fake VPAs that look like real bank/wallet addresses. Contact the sender through a verified channel.'
                  : 'Confirm the payee through an independent channel before sending. Never pay in response to an unsolicited request.'}
            </Text>
          </View>
        </View>
      )}

      {/* How to use */}
      <View style={s.howSection}>
        <Text style={s.howTitle}>How to use</Text>
        <Text style={s.howText}>
          1. When you receive a UPI payment link via SMS, WhatsApp, or email, copy it.{'\n'}
          2. Paste it above and tap <Text style={s.howCode}>Verify</Text>.{'\n'}
          3. AnkrShield checks the payee VPA, amount, and note for fraud signals.{'\n\n'}
          You can also open your camera app, scan a UPI QR code, and copy the resulting URL here.
        </Text>
      </View>

      {/* Supported apps */}
      <View style={s.appsSection}>
        <Text style={s.appsSectionTitle}>Works with all UPI apps</Text>
        <View style={s.appsRow}>
          {KNOWN_UPI_APPS.map((app) => (
            <View key={app} style={s.appChip}>
              <Text style={s.appChipText}>{app}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Recent checks */}
      {history.length > 0 && (
        <View style={s.historySection}>
          <Text style={s.historySectionTitle}>Recent checks</Text>
          {history.slice(0, 5).map((h, i) => {
            const hMeta = RISK_META[h.riskLevel as keyof typeof RISK_META] ?? RISK_META.caution;
            return (
              <View key={i} style={s.historyRow}>
                <Text style={s.historyIcon}>{hMeta.icon}</Text>
                <View style={s.historyBody}>
                  <Text style={s.historyVpa} numberOfLines={1}>
                    {h.vpa || 'Unknown VPA'}
                  </Text>
                  {h.amount ? <Text style={s.historyAmt}>₹{h.amount}</Text> : null}
                </View>
                <Text style={[s.historyLevel, { color: hMeta.color }]}>{hMeta.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Safety tip */}
      <View style={s.tipBox}>
        <Text style={s.tipText}>
          💡 Real banks and businesses NEVER send payment requests out of the blue. If you're asked
          to pay to "unfreeze your account" or "claim a refund" — it's always fraud.
        </Text>
      </View>
    </ScrollView>
  );
}

const _s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },

  hero: { padding: 24, alignItems: 'center' },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  heroSub: { color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 19 },

  inputSection: { paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    color: '#f1f5f9',
    fontSize: 13,
    padding: 12,
    fontFamily: 'monospace',
    minHeight: 72,
    textAlignVertical: 'top',
  },
  checkBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkBtnDisabled: { backgroundColor: '#1e293b' },
  checkBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  resultCard: {
    margin: 16,
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#0d0d0d',
    gap: 12,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultIcon: { fontSize: 36 },
  resultHeaderInfo: { flex: 1 },
  resultLevel: { fontSize: 18, fontWeight: '800' },
  resultVpa: { color: '#9ca3af', fontSize: 12, marginTop: 2, fontFamily: 'monospace' },
  verifiedBadge: {
    backgroundColor: '#052e16',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#166534',
  },
  verifiedBadgeText: { color: '#4ade80', fontSize: 10, fontWeight: '700' },

  detailsBox: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  detailRow: { flexDirection: 'row', gap: 8 },
  detailLabel: { color: '#4b5563', fontSize: 12, width: 52 },
  detailValue: { color: '#e2e8f0', fontSize: 12, flex: 1 },
  detailAmount: { color: '#fbbf24', fontWeight: '700', fontSize: 14 },

  flagsSection: { gap: 6 },
  flagsTitle: {
    color: '#ef4444',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  flagRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  flagDot: { color: '#ef4444', fontSize: 11, marginTop: 1 },
  flagText: { color: '#fca5a5', fontSize: 12, lineHeight: 17, flex: 1 },

  adviceBox: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  adviceTitle: { fontSize: 13, fontWeight: '700' },
  adviceText: { color: '#9ca3af', fontSize: 12, lineHeight: 18 },

  howSection: { margin: 16, backgroundColor: '#0d1117', borderRadius: 10, padding: 14 },
  howTitle: {
    color: '#4b5563',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  howText: { color: '#555', fontSize: 12, lineHeight: 19 },
  howCode: { color: '#60a5fa', fontFamily: 'monospace' },

  appsSection: { paddingHorizontal: 16, marginBottom: 16 },
  appsSectionTitle: {
    color: '#4b5563',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  appsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  appChip: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  appChipText: { color: '#6b7280', fontSize: 11 },

  historySection: { paddingHorizontal: 16, marginBottom: 16 },
  historySectionTitle: {
    color: '#4b5563',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  historyIcon: { fontSize: 18 },
  historyBody: { flex: 1 },
  historyVpa: { color: '#9ca3af', fontSize: 12, fontFamily: 'monospace' },
  historyAmt: { color: '#fbbf24', fontSize: 11 },
  historyLevel: { fontSize: 11, fontWeight: '700' },

  tipBox: {
    margin: 16,
    marginBottom: 40,
    backgroundColor: '#0c1120',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  tipText: { color: '#60a5fa', fontSize: 12, lineHeight: 18 },
});
