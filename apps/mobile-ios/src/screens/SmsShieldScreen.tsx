/**
 * SMS Shield Screen
 * Paste an SMS and run the India-specific fraud-detection engine.
 */

import { analyzeSms } from '@ankrshield/sms-shield';
import type { SmsAnalysisResult } from '@ankrshield/sms-shield';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Badge helpers ────────────────────────────────────────────────────────────

function badgeColor(result: SmsAnalysisResult): string {
  if (!result.isSuspicious) return '#166534'; // green
  if (result.confidence > 60) return '#7f1d1d'; // red
  return '#78350f'; // yellow / amber
}

function badgeLabel(result: SmsAnalysisResult): string {
  if (!result.isSuspicious) return 'SAFE';
  if (result.confidence > 60) return 'THREAT DETECTED';
  return 'SUSPICIOUS';
}

function badgeTextColor(result: SmsAnalysisResult): string {
  if (!result.isSuspicious) return '#4ade80';
  if (result.confidence > 60) return '#fca5a5';
  return '#fde68a';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function SmsShieldScreen() {
  const [smsText, setSmsText] = useState('');
  const [senderId, setSenderId] = useState('');
  const [result, setResult] = useState<SmsAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  function handleAnalyze() {
    if (!smsText.trim()) return;
    setLoading(true);
    // analyzeSms is synchronous — wrap in timeout to allow UI update
    setTimeout(() => {
      try {
        const res = analyzeSms(smsText, senderId.trim() || undefined);
        setResult(res);
      } catch (e) {
        console.error('SMS analysis error:', e);
      } finally {
        setLoading(false);
      }
    }, 0);
  }

  function handleClear() {
    setSmsText('');
    setSenderId('');
    setResult(null);
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>SMS Shield</Text>
      <Text style={styles.subheading}>
        Paste an SMS below to detect UPI fraud, bank phishing, KYC scams and more.
      </Text>

      {/* Sender ID input */}
      <Text style={styles.label}>Sender ID (optional)</Text>
      <TextInput
        style={styles.senderInput}
        placeholder="e.g. VM-SBIBNK or +919876543210"
        placeholderTextColor="#4b5563"
        value={senderId}
        onChangeText={setSenderId}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {/* SMS body input */}
      <Text style={styles.label}>SMS Content</Text>
      <TextInput
        style={styles.textInput}
        placeholder="Paste SMS message here..."
        placeholderTextColor="#4b5563"
        value={smsText}
        onChangeText={setSmsText}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        autoCorrect={false}
      />

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.analyzeBtn, !smsText.trim() && styles.analyzeBtnDisabled]}
          onPress={handleAnalyze}
          disabled={!smsText.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.analyzeBtnText}>Analyze</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {result && !loading && (
        <View style={styles.resultCard}>
          {/* Status badge */}
          <View style={[styles.badge, { backgroundColor: badgeColor(result) }]}>
            <Text style={[styles.badgeText, { color: badgeTextColor(result) }]}>
              {badgeLabel(result)}
            </Text>
          </View>

          {/* Confidence */}
          <Text style={styles.confidenceLabel}>
            Confidence: <Text style={styles.confidenceValue}>{result.confidence}%</Text>
          </Text>

          {/* Primary threat type */}
          {result.threatType && (
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Threat type</Text>
              <Text style={styles.infoVal}>{result.threatType.replace(/_/g, ' ')}</Text>
            </View>
          )}

          {/* Suspicious sender ID */}
          {result.suspiciousSenderId && (
            <View style={styles.warningPill}>
              <Text style={styles.warningPillText}>Suspicious sender ID format detected</Text>
            </View>
          )}

          {/* Extracted URLs */}
          {result.extractedUrls.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>URLs found ({result.extractedUrls.length})</Text>
              {result.extractedUrls.map((url, i) => (
                <Text key={i} style={styles.urlText} numberOfLines={1}>
                  {url}
                </Text>
              ))}
            </View>
          )}

          {/* Matched patterns */}
          {result.matchedPatterns.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Matched signals ({result.matchedPatterns.length})
              </Text>
              {result.matchedPatterns.slice(0, 8).map((p, i) => (
                <Text key={i} style={styles.patternText}>
                  {p}
                </Text>
              ))}
              {result.matchedPatterns.length > 8 && (
                <Text style={styles.moreText}>+{result.matchedPatterns.length - 8} more…</Text>
              )}
            </View>
          )}

          {/* Recommended action */}
          <View style={styles.actionBox}>
            <Text style={styles.actionTitle}>Recommended action</Text>
            <Text style={styles.actionText}>
              {!result.isSuspicious
                ? 'No threats detected. This SMS appears to be legitimate.'
                : result.confidence > 60
                  ? 'Do NOT click any links or share personal information. Report this SMS to the TRAI DND portal (1909) and block the sender.'
                  : 'Exercise caution. Do not share OTPs, bank details, or click unknown links. Verify with the sender through official channels.'}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14', padding: 16 },
  heading: { color: '#f9fafb', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  subheading: { color: '#6b7280', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  label: { color: '#9ca3af', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  senderInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    color: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 14,
  },
  textInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    color: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 120,
    marginBottom: 14,
  },
  buttonRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  analyzeBtn: {
    flex: 1,
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  analyzeBtnDisabled: { backgroundColor: '#1e3a5f' },
  analyzeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  clearBtn: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  clearBtnText: { color: '#9ca3af', fontWeight: '600', fontSize: 15 },
  resultCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    gap: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  confidenceLabel: { color: '#9ca3af', fontSize: 13 },
  confidenceValue: { color: '#e2e8f0', fontWeight: '700' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoKey: { color: '#6b7280', fontSize: 12 },
  infoVal: { color: '#cbd5e1', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  warningPill: {
    backgroundColor: '#451a03',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  warningPillText: { color: '#fbbf24', fontSize: 12, fontWeight: '600' },
  section: { gap: 4 },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  urlText: { color: '#60a5fa', fontSize: 11, fontFamily: 'monospace' },
  patternText: { color: '#475569', fontSize: 11, fontFamily: 'monospace' },
  moreText: { color: '#374151', fontSize: 11, fontStyle: 'italic' },
  actionBox: {
    backgroundColor: '#0a0f1e',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  actionTitle: { color: '#94a3b8', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  actionText: { color: '#cbd5e1', fontSize: 13, lineHeight: 18 },
  bottomPad: { height: 40 },
});
