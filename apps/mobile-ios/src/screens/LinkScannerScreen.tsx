/**
 * LinkScannerScreen — scan any URL for phishing, malware, and reputation issues.
 * Accepts pasted URLs and shared text from other apps (WhatsApp, Chrome, etc.).
 */
import { timeoutSignal } from '../util/timeoutSignal';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';

import { API_BASE } from '../config';
import { t } from '../i18n';

interface RiskScore {
  domain: string;
  score: number;
  level: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  categories: string[];
  lastSeen: string;
}

const LEVEL_META = {
  SAFE: { color: '#22c55e', icon: '✅', label: 'Safe' },
  LOW: { color: '#86efac', icon: '🟢', label: 'Low Risk' },
  MEDIUM: { color: '#f59e0b', icon: '⚠️', label: 'Suspicious' },
  HIGH: { color: '#f97316', icon: '🚨', label: 'High Risk' },
  CRITICAL: { color: '#ef4444', icon: '🛑', label: 'Dangerous' },
};

function extractDomain(rawUrl: string): string {
  try {
    let url = rawUrl.trim();
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch (_e) {
    // Not a full URL — might already be just a domain
    return rawUrl
      .trim()
      .replace(/^www\./, '')
      .split('/')[0];
  }
}

function extractFirstUrl(text: string): string {
  const urlRegex = /https?:\/\/[^\s,'"<>]+/i;
  const match = text.match(urlRegex);
  return match ? match[0] : text;
}

export function LinkScannerScreen({ route }: any) {
  // Accept pre-filled URL from navigation params (e.g. shared from WhatsApp)
  const str = t();
  const prefill: string = route?.params?.url ?? '';
  const [url, setUrl] = useState(prefill);
  const [result, setResult] = useState<RiskScore | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RiskScore[]>([]);

  // If a URL was pre-filled via share intent, auto-scan it
  useEffect(() => {
    if (prefill) {
      const domain = extractDomain(extractFirstUrl(prefill));
      setUrl(domain);
      setTimeout(() => scanDomain(domain), 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const scanDomain = useCallback(
    async (rawInput?: string) => {
      const target = (rawInput ?? url).trim();
      if (!target) {
        return;
      }

      const domain = extractDomain(extractFirstUrl(target));
      if (!domain) {
        return;
      }

      setScanning(true);
      setError(null);
      setResult(null);

      try {
        const response = await fetch(
          `${API_BASE}/risk/score?domain=${encodeURIComponent(domain)}`,
          {
            signal: timeoutSignal(12_000),
          }
        );
        if (!response.ok) {
          throw new Error(`Server error ${response.status}`);
        }
        const data: RiskScore = await response.json();
        setResult(data);
        setRecentScans((prev) =>
          [data, ...prev.filter((r) => r.domain !== data.domain)].slice(0, 10)
        );
      } catch (e: any) {
        setError(
          e?.message?.includes('network') || e?.message?.includes('fetch')
            ? 'No internet connection'
            : 'Could not reach risk server — try again'
        );
      } finally {
        setScanning(false);
      }
    },
    [url]
  );

  const meta = result ? (LEVEL_META[result.level] ?? LEVEL_META.MEDIUM) : null;

  return (
    <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.heroIcon}>🔗</Text>
        <Text style={s.heroTitle}>{str.linkScanner.title}</Text>
        <Text style={s.heroSub}>{str.linkScanner.subtitle}</Text>
      </View>

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={url}
          onChangeText={setUrl}
          placeholder={str.linkScanner.placeholder}
          placeholderTextColor="#333"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={() => scanDomain()}
        />
        <TouchableOpacity
          style={[s.scanBtn, (!url.trim() || scanning) && s.scanBtnDisabled]}
          onPress={() => scanDomain()}
          disabled={!url.trim() || scanning}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.scanBtnText}>{str.linkScanner.scan}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Result */}
      {result && meta && (
        <View style={[s.resultCard, { borderColor: meta.color }]}>
          <View style={s.resultHeader}>
            <Text style={s.resultIcon}>{meta.icon}</Text>
            <View style={s.resultHeaderInfo}>
              <Text style={[s.resultLevel, { color: meta.color }]}>{meta.label}</Text>
              <Text style={s.resultDomain} numberOfLines={1}>
                {result.domain}
              </Text>
            </View>
            <View
              style={[s.scorePill, { backgroundColor: meta.color + '22', borderColor: meta.color }]}
            >
              <Text style={[s.scorePillText, { color: meta.color }]}>{result.score}/100</Text>
            </View>
          </View>

          {/* Categories */}
          {result.categories.length > 0 && (
            <View style={s.catsRow}>
              {result.categories.map((cat) => (
                <View key={cat} style={s.catChip}>
                  <Text style={s.catChipText}>{cat}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action advice */}
          <View style={[s.adviceBox, { borderColor: meta.color + '44' }]}>
            <Text style={[s.adviceTitle, { color: meta.color }]}>
              {result.level === 'SAFE' || result.level === 'LOW'
                ? str.linkScanner.safeToOpen
                : result.level === 'MEDIUM'
                  ? str.linkScanner.openWithCaution
                  : str.linkScanner.doNotOpen}
            </Text>
            <Text style={s.adviceText}>
              {result.level === 'SAFE' || result.level === 'LOW'
                ? str.linkScanner.safeDesc
                : result.level === 'MEDIUM'
                  ? str.linkScanner.cautionDesc
                  : str.linkScanner.dangerDesc}
            </Text>
          </View>

          {/* Open anyway (only for safe/low) */}
          {(result.level === 'SAFE' || result.level === 'LOW') && (
            <TouchableOpacity
              style={s.openBtn}
              onPress={() => {
                let link = url.trim();
                if (!link.startsWith('http')) {
                  link = 'https://' + link;
                }
                Linking.openURL(link).catch(() => {});
              }}
            >
              <Text style={s.openBtnText}>{str.linkScanner.openBrowser}</Text>
            </TouchableOpacity>
          )}

          {result.lastSeen && (
            <Text style={s.lastSeen}>Last seen in threat intel: {result.lastSeen}</Text>
          )}
        </View>
      )}

      {/* How it works */}
      <View style={s.howBox}>
        <Text style={s.howTitle}>How to share a link from WhatsApp</Text>
        <Text style={s.howText}>
          1. Long-press the link in WhatsApp chat{'\n'}
          2. Tap <Text style={s.howCode}>Share</Text> or <Text style={s.howCode}>Copy link</Text>
          {'\n'}
          3. Share to AnkrShield → Link Scanner opens automatically{'\n'}
          4. Or paste the copied URL here and tap <Text style={s.howCode}>Scan</Text>
        </Text>
      </View>

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <View style={s.recentSection}>
          <Text style={s.recentTitle}>{str.linkScanner.recentScans}</Text>
          {recentScans.map((r) => {
            const rm = LEVEL_META[r.level] ?? LEVEL_META.MEDIUM;
            return (
              <TouchableOpacity
                key={r.domain}
                style={s.recentRow}
                onPress={() => {
                  setUrl(r.domain);
                  setResult(r);
                }}
              >
                <Text style={s.recentIcon}>{rm.icon}</Text>
                <Text style={s.recentDomain} numberOfLines={1}>
                  {r.domain}
                </Text>
                <Text style={[s.recentLevel, { color: rm.color }]}>{rm.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          Risk scores are computed by xShield's threat intelligence engine using DNS, certificate
          transparency, and community threat feeds. Scores may not reflect very new domains.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },

  hero: { padding: 24, alignItems: 'center' },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  heroSub: { color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 19 },

  inputRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    color: '#f1f5f9',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  scanBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
  },
  scanBtnDisabled: { backgroundColor: '#1e293b' },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  errorBox: {
    marginHorizontal: 16,
    backgroundColor: '#1a0a0a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },

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
  resultDomain: { color: '#9ca3af', fontSize: 12, marginTop: 2, fontFamily: 'monospace' },
  scorePill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scorePillText: { fontSize: 13, fontWeight: '800' },

  catsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catChipText: { color: '#94a3b8', fontSize: 11 },

  adviceBox: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  adviceTitle: { fontSize: 13, fontWeight: '700' },
  adviceText: { color: '#9ca3af', fontSize: 12, lineHeight: 18 },

  openBtn: {
    backgroundColor: '#0a1f0a',
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  openBtnText: { color: '#4ade80', fontSize: 13, fontWeight: '700' },

  lastSeen: { color: '#374151', fontSize: 10, textAlign: 'right' },

  howBox: { margin: 16, backgroundColor: '#0d1117', borderRadius: 10, padding: 14 },
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

  recentSection: { paddingHorizontal: 16, marginBottom: 16 },
  recentTitle: {
    color: '#4b5563',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  recentIcon: { fontSize: 16 },
  recentDomain: { flex: 1, color: '#9ca3af', fontSize: 12, fontFamily: 'monospace' },
  recentLevel: { fontSize: 11, fontWeight: '700' },

  disclaimer: { padding: 16, paddingBottom: 40 },
  disclaimerText: { color: '#374151', fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
