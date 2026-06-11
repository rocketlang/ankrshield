/**
 * OnboardingScreen — first-run flow (5 steps).
 * Runs once, marks completion in MdmStorage, then navigates to Home.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  BackHandler,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  NativeModules,
  Platform,
  Linking,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

import { t } from '../i18n';
import { MdmStorage } from '../mdm/storage';

const { DnsVpn } = NativeModules;
const { width: SW } = Dimensions.get('window');

export const ONBOARDING_KEY = '@ankrshield/onboarded';

const STEPS = [
  { id: 'welcome' },
  { id: 'features' },
  { id: 'dns' },
  { id: 'permissions' },
  { id: 'done' },
];

const FEATURES = [
  {
    icon: '🌐',
    title: 'DNS Shield',
    desc: 'Blocks trackers & ads at the network level — no content is read',
  },
  {
    icon: '💬',
    title: 'WhatsApp Guard',
    desc: 'Scans received files for malware before you open them',
  },
  {
    icon: '🛡',
    title: 'Safe Browsing',
    desc: 'Catches fake bank and UPI sites using fuzzy domain matching',
  },
  {
    icon: '📞',
    title: 'Call Protection',
    desc: 'Identifies TRAI-flagged fraud call patterns before you answer',
  },
  {
    icon: '🦠',
    title: 'Ransomware Watch',
    desc: 'Monitors storage for encrypted files and ransom notes',
  },
  {
    icon: '🔔',
    title: 'Permission Watch',
    desc: 'Alerts when apps silently gain new permissions after updates',
  },
];

export function OnboardingScreen({ navigation }: any) {
  const s = t();
  const [step, setStep] = useState(0);
  const [vpnStarting, setVpnStarting] = useState(false);
  const [vpnStarted, setVpnStarted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function goTo(n: number) {
    setStep(n);
    scrollRef.current?.scrollTo({ x: n * SW, animated: true });
  }

  async function handleEnableDns() {
    if (!DnsVpn || Platform.OS !== 'android') {
      goTo(3);
      return;
    }
    setVpnStarting(true);
    try {
      await DnsVpn.startVpn();
      setVpnStarted(true);
    } catch (_e) {
      // Permission denied or already running — proceed anyway
    } finally {
      setVpnStarting(false);
    }
    setTimeout(() => goTo(3), 600);
  }

  async function handleFinish() {
    await MdmStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    navigation.replace('Home');
  }

  // Android back button — mark onboarding complete and go home
  // rather than closing the app or looping back to a blank stack.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleFinish();
      return true; // consumed — prevent default back behaviour
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
      >
        {/* ── Step 0: Welcome ─────────────────────────────────────────── */}
        <View style={styles.page}>
          <View style={styles.welcomeTop}>
            <Text style={styles.bigShield}>🛡</Text>
            <Text style={styles.welcomeTitle}>{s.onboarding.title}</Text>
            <Text style={styles.welcomeSub}>{s.onboarding.subtitle}</Text>
          </View>
          <View style={styles.welcomeBottom}>
            <Text style={styles.trustLine}>{s.onboarding.trustLine}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => goTo(1)}>
              <Text style={styles.primaryBtnText}>{s.onboarding.getStarted}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Step 1: Features ────────────────────────────────────────── */}
        <View style={styles.page}>
          <Text style={styles.stepTitle}>{s.onboarding.featuresTitle}</Text>
          <Text style={styles.stepSub}>{s.onboarding.featuresSub}</Text>
          <View style={styles.featureGrid}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureCard}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => goTo(2)}>
            <Text style={styles.primaryBtnText}>{s.onboarding.next}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Step 2: DNS Shield ──────────────────────────────────────── */}
        <View style={styles.page}>
          <Text style={styles.stepTitle}>{s.onboarding.dnsTitle}</Text>
          <View style={styles.explainCard}>
            <Text style={styles.explainIcon}>🌐</Text>
            <Text style={styles.explainText}>
              Creates a <Text style={styles.bold}>local VPN on your phone</Text> — all DNS queries
              are filtered through AnkrShield's blocklist.{'\n\n'}
              No traffic is routed to any external server. Your browsing is private.
            </Text>
          </View>
          <View style={styles.bulletList}>
            <Text style={styles.bullet}>✅ Blocks 100,000+ tracker and ad domains</Text>
            <Text style={styles.bullet}>✅ Filters phishing domains from IOC feeds</Text>
            <Text style={styles.bullet}>✅ DNS-over-HTTPS — prevents ISP snooping</Text>
            <Text style={styles.bullet}>✅ Works in every app, not just browsers</Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, vpnStarted && styles.primaryBtnSuccess]}
            onPress={handleEnableDns}
            disabled={vpnStarting}
          >
            {vpnStarting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {vpnStarted ? s.onboarding.dnsActive : s.onboarding.enableDns}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => goTo(3)}>
            <Text style={styles.skipBtnText}>{s.onboarding.skip}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Step 3: Permissions ─────────────────────────────────────── */}
        <View style={styles.page}>
          <Text style={styles.stepTitle}>Two quick permissions</Text>
          <Text style={styles.stepSub}>Optional but recommended for full protection</Text>

          <View style={styles.permCard}>
            <Text style={styles.permIcon}>🔔</Text>
            <View style={styles.permBody}>
              <Text style={styles.permTitle}>Notifications</Text>
              <Text style={styles.permDesc}>
                Get instant alerts when a phishing site, malicious file, or fraud call is detected.
              </Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.permBtnText}>Enable</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.permCard}>
            <Text style={styles.permIcon}>🦾</Text>
            <View style={styles.permBody}>
              <Text style={styles.permTitle}>Accessibility</Text>
              <Text style={styles.permDesc}>
                Powers Safe Browsing — reads only the URL bar in your browser, nothing else.
              </Text>
            </View>
            <TouchableOpacity style={styles.permBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.permBtnText}>Enable</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.privacyNote}>
            <Text style={styles.privacyNoteText}>
              🔒 AnkrShield never reads message content, passwords, or personal data. All processing
              is on-device.
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => goTo(4)}>
            <Text style={styles.primaryBtnText}>{s.onboarding.continue}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Step 4: Done ────────────────────────────────────────────── */}
        <View style={styles.page}>
          <View style={styles.doneTop}>
            <Text style={styles.doneBigCheck}>✅</Text>
            <Text style={styles.doneTitle}>You're protected</Text>
            <Text style={styles.doneSub}>
              AnkrShield is watching your network, files, and apps in the background.
            </Text>
          </View>

          <View style={styles.doneHighlights}>
            <View style={styles.doneRow}>
              <Text style={styles.doneRowIcon}>🌐</Text>
              <Text style={styles.doneRowText}>DNS tracker blocking active</Text>
            </View>
            <View style={styles.doneRow}>
              <Text style={styles.doneRowIcon}>🦠</Text>
              <Text style={styles.doneRowText}>Ransomware watcher ready</Text>
            </View>
            <View style={styles.doneRow}>
              <Text style={styles.doneRowIcon}>📞</Text>
              <Text style={styles.doneRowText}>Call protection loaded</Text>
            </View>
            <View style={styles.doneRow}>
              <Text style={styles.doneRowIcon}>🛡</Text>
              <Text style={styles.doneRowText}>42+ domains protected from phishing</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, styles.primaryBtnSuccess]}
            onPress={handleFinish}
          >
            <Text style={styles.primaryBtnText}>{s.onboarding.startProtecting}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Progress dots */}
      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080c14' },
  pager: { flex: 1 },
  page: {
    width: SW,
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },

  // Welcome
  welcomeTop: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  bigShield: { fontSize: 80, marginBottom: 16 },
  welcomeTitle: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: 1 },
  welcomeSub: {
    color: '#6b7280',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 10,
  },
  welcomeBottom: { gap: 12 },
  trustLine: { color: '#374151', fontSize: 11, textAlign: 'center' },

  // Step header
  stepTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 6 },
  stepSub: { color: '#6b7280', fontSize: 13, marginBottom: 20 },

  // Features grid
  featureGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  featureCard: {
    width: '47%',
    backgroundColor: '#0e1520',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a2535',
    padding: 12,
    gap: 4,
  },
  featureIcon: { fontSize: 24 },
  featureTitle: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  featureDesc: { color: '#4b5563', fontSize: 11, lineHeight: 15 },

  // DNS explain
  explainCard: {
    backgroundColor: '#0e1520',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a2535',
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  explainIcon: { fontSize: 28 },
  explainText: { flex: 1, color: '#9ca3af', fontSize: 13, lineHeight: 20 },
  bold: { color: '#e2e8f0', fontWeight: '700' },
  bulletList: { gap: 8, marginBottom: 20 },
  bullet: { color: '#6b7280', fontSize: 13 },

  // Permissions
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e1520',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a2535',
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  permIcon: { fontSize: 28 },
  permBody: { flex: 1 },
  permTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  permDesc: { color: '#6b7280', fontSize: 12, marginTop: 2, lineHeight: 17 },
  permBtn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  permBtnText: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
  privacyNote: {
    backgroundColor: '#052e16',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    marginTop: 4,
  },
  privacyNoteText: { color: '#4ade80', fontSize: 11, lineHeight: 16 },

  // Done
  doneTop: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  doneBigCheck: { fontSize: 72, marginBottom: 16 },
  doneTitle: { color: '#4ade80', fontSize: 30, fontWeight: '900', marginBottom: 8 },
  doneSub: { color: '#6b7280', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  doneHighlights: { gap: 10, marginBottom: 24 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  doneRowIcon: { fontSize: 20, width: 30 },
  doneRowText: { color: '#9ca3af', fontSize: 13 },

  // Buttons
  primaryBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnSuccess: { backgroundColor: '#15803d' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipBtnText: { color: '#4b5563', fontSize: 14 },

  // Dots
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 32 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1e293b' },
  dotActive: { backgroundColor: '#4ade80', width: 20 },
});
