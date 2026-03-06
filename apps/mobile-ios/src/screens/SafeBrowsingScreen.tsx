/**
 * SafeBrowsingScreen — P2-3
 * Shows phishing alert history from AnkrShieldAccessibilityService
 * and explains which browsers and domains are protected.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  Platform,
  Linking,
} from 'react-native';

const { WhatsAppGuard } = NativeModules;

interface PhishingAlert {
  id: string;
  suspectDomain: string;
  spoofingTarget: string;
  similarityPct: number;
  ts: number;
}

const PROTECTED_BROWSERS = [
  { name: 'Chrome', pkg: 'com.android.chrome' },
  { name: 'Firefox', pkg: 'org.mozilla.firefox' },
  { name: 'Firefox Focus', pkg: 'org.mozilla.fenix' },
  { name: 'Edge', pkg: 'com.microsoft.emmx' },
  { name: 'Brave', pkg: 'com.brave.browser' },
  { name: 'Opera Mini', pkg: 'com.opera.mini.native' },
  { name: 'Samsung Browser', pkg: 'com.sec.android.app.sbrowser' },
  { name: 'UC Browser', pkg: 'com.UCMobile.intl' },
  { name: 'DuckDuckGo', pkg: 'com.duckduckgo.mobile.android' },
  { name: 'Kiwi', pkg: 'com.kiwibrowser.browser' },
  { name: 'Via', pkg: 'mark.via.gp' },
];

const PROTECTED_CATEGORIES = [
  { icon: '🏦', label: 'Indian Banks', count: 17, examples: 'SBI, HDFC, ICICI, Axis, Kotak' },
  { icon: '💳', label: 'UPI & Wallets', count: 5, examples: 'Paytm, PhonePe, Freecharge' },
  { icon: '🏛', label: 'Government', count: 8, examples: 'IRCTC, UIDAI, Income Tax, EPFO' },
  { icon: '🌐', label: 'Global Platforms', count: 12, examples: 'Google, Amazon, PayPal, Meta' },
];

let _alertId = 0;

export function SafeBrowsingScreen() {
  const [alerts, setAlerts] = useState<PhishingAlert[]>([]);
  const [_a11yEnabled, _setA11yEnabled] = useState<boolean | null>(null);

  const loadAlerts = useCallback(() => {
    if (Platform.OS !== 'android' || !WhatsAppGuard) return;
    WhatsAppGuard.getPhishingAlerts?.()
      .then((history: any[]) => {
        const loaded = (history ?? []).slice(0, 20).map((h: any) => ({
          id: String(++_alertId),
          suspectDomain: h.suspectDomain ?? '',
          spoofingTarget: h.spoofingTarget ?? '',
          similarityPct: h.similarityPct ?? 0,
          ts: h.ts ?? Date.now(),
        }));
        setAlerts(loaded);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAlerts();

    if (Platform.OS !== 'android' || !WhatsAppGuard) return;

    // Live phishing alerts while screen is open
    const emitter = new NativeEventEmitter(WhatsAppGuard);
    const sub = emitter.addListener('PhishingAlert', (ev: any) => {
      setAlerts((prev) => [
        {
          id: String(++_alertId),
          suspectDomain: ev.suspectDomain ?? '',
          spoofingTarget: ev.spoofingTarget ?? '',
          similarityPct: ev.similarityPct ?? 0,
          ts: ev.ts ?? Date.now(),
        },
        ...prev,
      ]);
    });

    return () => sub.remove();
  }, [loadAlerts]);

  function openA11ySettings() {
    Linking.openSettings().catch(() => {});
  }

  return (
    <ScrollView style={s.container}>
      {/* Status header */}
      <View style={s.statusCard}>
        <View style={s.statusRow}>
          <Text style={s.statusIcon}>🌐</Text>
          <View style={s.statusInfo}>
            <Text style={s.statusTitle}>Safe Browsing Active</Text>
            <Text style={s.statusSub}>
              Powered by AnkrShield Accessibility Service — monitors URL bar in real time
            </Text>
          </View>
        </View>
        <TouchableOpacity style={s.a11yBtn} onPress={openA11ySettings}>
          <Text style={s.a11yBtnText}>Accessibility Settings ›</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statNum}>{PROTECTED_BROWSERS.length}</Text>
          <Text style={s.statLabel}>browsers{'\n'}monitored</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNum}>42+</Text>
          <Text style={s.statLabel}>protected{'\n'}domains</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNum}>{alerts.length}</Text>
          <Text style={s.statLabel}>phishing{'\n'}blocked</Text>
        </View>
      </View>

      {/* Protected domain categories */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Protected Domains</Text>
        {PROTECTED_CATEGORIES.map((cat) => (
          <View key={cat.label} style={s.catRow}>
            <Text style={s.catIcon}>{cat.icon}</Text>
            <View style={s.catInfo}>
              <Text style={s.catLabel}>{cat.label}</Text>
              <Text style={s.catExamples}>{cat.examples}</Text>
            </View>
            <View style={s.catCount}>
              <Text style={s.catCountText}>{cat.count}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Monitored browsers */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Monitored Browsers</Text>
        <View style={s.browserGrid}>
          {PROTECTED_BROWSERS.map((b) => (
            <View key={b.pkg} style={s.browserChip}>
              <Text style={s.browserName}>{b.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Phishing alert history */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Phishing Alerts</Text>
        {alerts.length === 0 ? (
          <View style={s.emptyAlerts}>
            <Text style={s.emptyAlertsText}>
              ✅ No phishing sites detected in your browsing history
            </Text>
          </View>
        ) : (
          alerts.map((a) => (
            <View key={a.id} style={s.alertCard}>
              <View style={s.alertTop}>
                <Text style={s.alertFake} numberOfLines={1}>
                  {a.suspectDomain}
                </Text>
                <Text style={s.alertPct}>{a.similarityPct}% match</Text>
              </View>
              <Text style={s.alertTarget}>
                Impersonating: <Text style={s.alertTargetName}>{a.spoofingTarget}</Text>
              </Text>
              <Text style={s.alertTime}>{new Date(a.ts).toLocaleString()}</Text>
            </View>
          ))
        )}
      </View>

      {/* How it works */}
      <View style={s.howBox}>
        <Text style={s.howTitle}>How Safe Browsing Works</Text>
        <Text style={s.howText}>
          AnkrShield reads the URL in your browser's address bar using Android's Accessibility
          Service. It compares the domain you're visiting against 42+ protected domains using fuzzy
          matching (Levenshtein similarity ≥ 82%).
          {'\n\n'}
          If a fake site like <Text style={s.howCode}>hdfcbank-login.com</Text> is detected, a
          full-screen WMD warning blocks your view before you can enter any credentials.
          {'\n\n'}
          No page content, form data, or passwords are ever read or transmitted.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },

  statusCard: {
    margin: 16,
    backgroundColor: '#052e16',
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  statusRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  statusIcon: { fontSize: 32 },
  statusInfo: { flex: 1 },
  statusTitle: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  statusSub: { color: '#6b7280', fontSize: 12, marginTop: 3, lineHeight: 17 },
  a11yBtn: {
    backgroundColor: '#0a1f0a',
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  a11yBtnText: { color: '#4ade80', fontSize: 13, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  statNum: { color: '#f1f5f9', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#555', fontSize: 10, textAlign: 'center', marginTop: 4, lineHeight: 14 },

  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: {
    color: '#4b5563',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 10,
  },

  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    gap: 10,
  },
  catIcon: { fontSize: 22 },
  catInfo: { flex: 1 },
  catLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  catExamples: { color: '#555', fontSize: 11, marginTop: 2 },
  catCount: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catCountText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },

  browserGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  browserChip: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  browserName: { color: '#9ca3af', fontSize: 12 },

  emptyAlerts: {
    backgroundColor: '#052e16',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  emptyAlertsText: { color: '#4ade80', fontSize: 13 },

  alertCard: {
    backgroundColor: '#1a0000',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  alertTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertFake: { color: '#fca5a5', fontSize: 13, fontWeight: '700', flex: 1, marginRight: 8 },
  alertPct: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  alertTarget: { color: '#9ca3af', fontSize: 12 },
  alertTargetName: { color: '#4ade80', fontWeight: '600' },
  alertTime: { color: '#374151', fontSize: 11 },

  howBox: {
    margin: 16,
    marginBottom: 40,
    backgroundColor: '#0d1117',
    borderRadius: 10,
    padding: 14,
  },
  howTitle: {
    color: '#4b5563',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 8,
  },
  howText: { color: '#555', fontSize: 12, lineHeight: 19 },
  howCode: { color: '#f87171', fontFamily: 'monospace' },
});
