/**
 * CallProtectionScreen — P2-2
 * India-focused spam/fraud call detection using TRAI DND & heuristic pattern matching.
 * Works entirely offline — no upload of phone numbers to any server.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  NativeModules,
  Platform,
} from 'react-native';

const { CallGuardML } = NativeModules;

// ─── India fraud call patterns ────────────────────────────────────────────────

interface FraudPattern {
  id: string;
  type: string;
  description: string;
  examples: string[];
  indicators: RegExp[];
}

const INDIA_FRAUD_PATTERNS: FraudPattern[] = [
  {
    id: 'trai_impersonation',
    type: 'Government Impersonation',
    description:
      'Caller claims to be from TRAI, DoT, or government agency threatening disconnection.',
    examples: ['+91-11-XXXXX (Delhi landline)', 'Spoofed +9111…'],
    indicators: [/^0?11\d{8}$/, /^0?22\d{8}$/],
  },
  {
    id: 'kyc_scam',
    type: 'KYC / Bank Fraud',
    description: 'Urgently asks for Aadhaar, PAN, OTP, or account details to "complete KYC".',
    examples: ['1800-XXX-XXXX (toll-free)', '+91 7XXXXXXXX'],
    indicators: [/^1800\d{7,10}$/, /^0?1800\d{6,8}$/],
  },
  {
    id: 'upi_fraud',
    type: 'UPI / Payment Fraud',
    description: 'Claims UPI payment failed or requests "verification" via screen share.',
    examples: ['Unknown mobile numbers calling about refunds'],
    indicators: [/^(?:\+91|91|0)?[6-9]\d{9}$/],
  },
  {
    id: 'loan_scam',
    type: 'Fake Loan / Job Offer',
    description: 'Offers instant personal loans or jobs, asks for processing fee upfront.',
    examples: ['+91 9XXXXXXXX', 'International +1 (US) numbers'],
    indicators: [/^\+1\d{10}$/, /^\+44\d{10}$/],
  },
  {
    id: 'irs_sting',
    type: 'International IRS/Tax Sting',
    description: 'Fake tax authority from US/UK threatening arrest — targets NRIs.',
    examples: ['+1-202-XXX-XXXX (fake IRS)', '+44-20-XXXX (fake HMRC)'],
    indicators: [/^\+1202\d{7}$/, /^\+4420\d{8}$/],
  },
  {
    id: 'parcel_fraud',
    type: 'Parcel / Customs Fraud',
    description: 'Package held at customs requiring immediate payment to release.',
    examples: ['Courier company spoofed numbers'],
    indicators: [/^1800/, /^0800/],
  },
];

// ─── Number analysis ──────────────────────────────────────────────────────────

interface NumberAnalysis {
  number: string;
  riskLevel: 'safe' | 'caution' | 'high' | 'critical';
  matchedPatterns: FraudPattern[];
  trai_dnd: boolean;
  reasoning: string[];
}

function normalise(num: string): string {
  return num.replace(/[\s\-().+]/g, '');
}

function analyseNumber(raw: string): NumberAnalysis {
  const num = normalise(raw);
  const matched: FraudPattern[] = [];
  const reasoning: string[] = [];

  // Strip country code for India
  const local = num.replace(/^(91|\+91|0091)/, '0').replace(/^(\+|00)/, '');

  // TRAI DND: Premium rate numbers
  if (/^140/.test(local)) {
    reasoning.push('140xxxx — telemarketer prefix (TRAI DND exemption)');
  }

  // International number calling Indian number — moderate risk
  if (num.startsWith('+') && !num.startsWith('+91')) {
    reasoning.push('International caller — verify before sharing personal information');
    matched.push(INDIA_FRAUD_PATTERNS.find((p) => p.id === 'loan_scam')!);
  }

  // Private number / no caller ID — always caution
  if (!num || num === 'unknown' || num === 'private') {
    reasoning.push('No caller ID — never share sensitive information');
  }

  // Check heuristic patterns
  for (const pattern of INDIA_FRAUD_PATTERNS) {
    for (const re of pattern.indicators) {
      if (re.test(local) || re.test(num)) {
        if (!matched.includes(pattern)) {
          matched.push(pattern);
          reasoning.push(`Matches ${pattern.type} pattern`);
        }
        break;
      }
    }
  }

  // Score
  const riskLevel: NumberAnalysis['riskLevel'] =
    matched.length >= 2
      ? 'critical'
      : matched.length === 1
        ? 'high'
        : reasoning.length > 0
          ? 'caution'
          : 'safe';

  return {
    number: raw,
    riskLevel,
    matchedPatterns: matched,
    trai_dnd: /^140/.test(local),
    reasoning,
  };
}

const RISK_META: Record<string, { color: string; label: string; icon: string }> = {
  safe: { color: '#22c55e', label: 'Safe', icon: '✅' },
  caution: { color: '#f59e0b', label: 'Use Caution', icon: '⚠️' },
  high: { color: '#f97316', label: 'High Risk', icon: '🚨' },
  critical: { color: '#ef4444', label: 'Critical Risk', icon: '🛑' },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface MLResult {
  label: 'safe' | 'fraud';
  confidence: number;
  source: 'ml' | 'heuristic';
}

export function CallProtectionScreen() {
  const [phone, setPhone] = useState('');
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<NumberAnalysis | null>(null);
  const [mlResult, setMlResult] = useState<MLResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [mlAvailable, setMlAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android' && CallGuardML) {
      CallGuardML.isModelAvailable()
        .then((avail: boolean) => setMlAvailable(avail))
        .catch(() => setMlAvailable(false));
    }
  }, []);

  const handleCheck = useCallback(async () => {
    if (!phone.trim()) return;
    setChecking(true);
    setMlResult(null);
    await new Promise((r) => setTimeout(r, 300));
    setResult(analyseNumber(phone.trim()));

    // ML classification of transcript (if provided)
    if (transcript.trim() && Platform.OS === 'android' && CallGuardML) {
      try {
        const ml = await CallGuardML.classify(transcript.trim());
        setMlResult(ml as MLResult);
      } catch {
        setMlResult(null);
      }
    }

    setChecking(false);
  }, [phone, transcript]);

  const meta = result ? RISK_META[result.riskLevel] : null;

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.heroIcon}>📞</Text>
        <Text style={s.heroTitle}>Call Protection</Text>
        <Text style={s.heroSub}>
          Check any number for India-specific fraud patterns — TRAI guidelines, UPI scams, KYC
          fraud, and government impersonation. No data leaves your phone.
        </Text>
      </View>

      {/* Number input */}
      <View style={s.inputSection}>
        <TextInput
          style={s.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 98765 43210"
          placeholderTextColor="#444"
          keyboardType="phone-pad"
          returnKeyType="done"
          onSubmitEditing={handleCheck}
        />
        <TouchableOpacity
          style={[s.checkBtn, (!phone.trim() || checking) && s.checkBtnDisabled]}
          onPress={handleCheck}
          disabled={!phone.trim() || checking}
        >
          {checking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.checkBtnText}>Check</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Optional transcript input for ML analysis */}
      <View style={s.transcriptSection}>
        <Text style={s.transcriptLabel}>
          📝 Call transcript <Text style={s.transcriptOptional}>(optional — for AI analysis)</Text>
        </Text>
        <TextInput
          style={s.transcriptInput}
          value={transcript}
          onChangeText={setTranscript}
          placeholder={
            'Paste what the caller said, e.g. "Your SBI account is blocked. Press 1 for KYC…"'
          }
          placeholderTextColor="#333"
          multiline
          numberOfLines={3}
        />
        {Platform.OS === 'android' && (
          <Text style={s.mlBadge}>
            {mlAvailable ? '🤖 On-device ML active' : '📋 Heuristic mode'}
          </Text>
        )}
      </View>

      {/* ML result banner */}
      {mlResult && (
        <View
          style={[s.mlCard, { borderColor: mlResult.label === 'fraud' ? '#ef4444' : '#22c55e' }]}
        >
          <Text style={s.mlCardTitle}>
            {mlResult.label === 'fraud' ? '🚨 AI: Fraud detected' : '✅ AI: Appears safe'}
          </Text>
          <Text style={s.mlCardSub}>
            Confidence: {mlResult.confidence.toFixed(1)}% · Source:{' '}
            {mlResult.source === 'ml' ? 'BERT-tiny model' : 'Heuristic fallback'}
          </Text>
        </View>
      )}

      {/* Result card */}
      {result && meta && (
        <View style={[s.resultCard, { borderColor: meta.color }]}>
          <View style={s.resultHeader}>
            <Text style={s.resultIcon}>{meta.icon}</Text>
            <View>
              <Text style={[s.resultLevel, { color: meta.color }]}>{meta.label}</Text>
              <Text style={s.resultNumber}>{result.number}</Text>
            </View>
          </View>

          {result.trai_dnd && (
            <View style={s.traiPill}>
              <Text style={s.traiText}>TRAI Telemarketer Prefix</Text>
            </View>
          )}

          {/* Matched patterns */}
          {result.matchedPatterns.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Fraud patterns matched</Text>
              {result.matchedPatterns.map((p) => (
                <View key={p.id} style={s.patternCard}>
                  <Text style={s.patternType}>{p.type}</Text>
                  <Text style={s.patternDesc}>{p.description}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Reasoning */}
          {result.reasoning.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Analysis notes</Text>
              {result.reasoning.map((r, i) => (
                <Text key={i} style={s.reasoningText}>
                  • {r}
                </Text>
              ))}
            </View>
          )}

          {/* Safe call advice */}
          <View style={s.adviceBox}>
            <Text style={s.adviceTitle}>Stay safe on calls</Text>
            <Text style={s.adviceText}>
              Never share OTP, Aadhaar, PAN, CVV, or bank passwords on any call. Real banks and
              government agencies NEVER ask for these over the phone.
            </Text>
          </View>
        </View>
      )}

      {/* Known fraud patterns list */}
      <View style={s.patternsSection}>
        <Text style={s.patternsSectionTitle}>India Fraud Call Patterns</Text>
        {INDIA_FRAUD_PATTERNS.map((p) => (
          <View key={p.id} style={s.knownCard}>
            <Text style={s.knownType}>{p.type}</Text>
            <Text style={s.knownDesc}>{p.description}</Text>
          </View>
        ))}
      </View>

      {/* TRAI disclaimer */}
      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          This tool uses local pattern matching only. For official DND registration and complaints,
          visit <Text style={s.disclaimerLink}>dnd.trai.gov.in</Text> or call 1909.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },

  hero: { padding: 24, alignItems: 'center' },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  heroSub: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 19 },

  inputSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    color: '#f1f5f9',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checkBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  checkBtnDisabled: { backgroundColor: '#333' },
  checkBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

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
  resultLevel: { fontSize: 18, fontWeight: '800' },
  resultNumber: { color: '#888', fontSize: 13, marginTop: 2 },

  traiPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#1c1400',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  traiText: { color: '#f59e0b', fontSize: 11, fontWeight: '600' },

  section: { gap: 6 },
  sectionLabel: {
    color: '#555',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  patternCard: { backgroundColor: '#1a0a0a', borderRadius: 8, padding: 10, gap: 3 },
  patternType: { color: '#fca5a5', fontSize: 13, fontWeight: '700' },
  patternDesc: { color: '#888', fontSize: 12, lineHeight: 17 },

  reasoningText: { color: '#9ca3af', fontSize: 12, lineHeight: 18 },

  adviceBox: {
    backgroundColor: '#0a1a0a',
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  adviceTitle: { color: '#4ade80', fontSize: 13, fontWeight: '700' },
  adviceText: { color: '#6b7280', fontSize: 12, lineHeight: 18 },

  patternsSection: { padding: 16, gap: 8 },
  patternsSectionTitle: {
    color: '#4b5563',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 4,
  },
  knownCard: { backgroundColor: '#111', borderRadius: 8, padding: 10, gap: 3 },
  knownType: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  knownDesc: { color: '#6b7280', fontSize: 12, lineHeight: 17 },

  disclaimer: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  disclaimerText: { color: '#374151', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  disclaimerLink: { color: '#3b82f6' },

  // ML transcript section
  transcriptSection: { paddingHorizontal: 16, paddingBottom: 8 },
  transcriptLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  transcriptOptional: { color: '#4b5563', fontWeight: '400' },
  transcriptInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    color: '#e2e8f0',
    fontSize: 13,
    padding: 10,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  mlBadge: { color: '#4b5563', fontSize: 10, marginTop: 4, textAlign: 'right' },
  mlCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    backgroundColor: '#0a0f18',
  },
  mlCardTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '800', marginBottom: 3 },
  mlCardSub: { color: '#9ca3af', fontSize: 12 },
});
