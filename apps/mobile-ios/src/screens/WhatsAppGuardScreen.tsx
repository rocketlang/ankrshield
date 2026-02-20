/**
 * WhatsAppGuardScreen
 *
 * Four-tab protection dashboard:
 *   Tab 1 — Attachments: scan history of received WhatsApp files
 *   Tab 2 — Impersonation: alerts when a contact name looks like a known contact
 *   Tab 3 — Voice: AI voice detection status during calls
 *   Tab 4 — Web: browser phishing alerts (fake bank sites)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  NativeModules,
  NativeEventEmitter,
  Platform,
  Linking,
  Alert,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';

const { WhatsAppGuard } = NativeModules;

type AttachmentVerdict = 'clean' | 'suspicious' | 'dangerous';
type Tab = 'attachments' | 'impersonation' | 'voice' | 'phishing';

interface PhishingAlert {
  suspectUrl: string;
  suspectDomain: string;
  spoofingTarget: string;
  similarityPct: number;
  ts: number;
}

interface ScanEntry {
  fileName: string;
  filePath: string;
  verdict: AttachmentVerdict;
  reason: string;
  ts: number;
  fileSizeBytes: number;
}

interface ImpersonationAlert {
  suspectName: string;
  similarTo: string;
  similarityPct: number;
  ts: number;
}

interface CallEvent {
  active: boolean;
  ts: number;
}

const VERDICT_COLOR: Record<AttachmentVerdict, string> = {
  dangerous: '#ef4444',
  suspicious: '#f59e0b',
  clean: '#22c55e',
};

const VERDICT_BG: Record<AttachmentVerdict, string> = {
  dangerous: '#1a0505',
  suspicious: '#1a1005',
  clean: '#051a0a',
};

const VERDICT_ICON: Record<AttachmentVerdict, string> = {
  dangerous: '🚨',
  suspicious: '⚠️',
  clean: '✅',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function WhatsAppGuardScreen() {
  const [tab, setTab] = useState<Tab>('attachments');
  const [guardRunning, setGuardRunning] = useState(false);
  const [guardEnabled, setGuardEnabled] = useState<boolean | null>(null); // null = loading
  const [enabling, setEnabling] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanEntry[]>([]);
  const [impersonationAlerts, setImpersonationAlerts] = useState<ImpersonationAlert[]>([]);
  const [callActive, setCallActive] = useState(false);
  const [phishingAlerts, setPhishingAlerts] = useState<PhishingAlert[]>([]);

  // Check if guard was previously enabled by user
  useEffect(() => {
    if (Platform.OS !== 'android' || !WhatsAppGuard) {
      setGuardEnabled(false);
      return;
    }
    WhatsAppGuard.isGuardEnabled()
      .then((enabled: boolean) => setGuardEnabled(enabled))
      .catch(() => setGuardEnabled(false));
  }, []);

  // Subscribe to live events only once enabled
  useEffect(() => {
    if (!guardEnabled || Platform.OS !== 'android' || !WhatsAppGuard) return;
    loadState();
    const emitter = new NativeEventEmitter(WhatsAppGuard);
    const subFile = emitter.addListener('WhatsAppFileEvent', (entry: ScanEntry) => {
      if (entry.verdict !== 'clean') setScanHistory((prev) => [entry, ...prev].slice(0, 200));
    });
    const subImp = emitter.addListener('ImpersonationAlert', (alert: ImpersonationAlert) => {
      setImpersonationAlerts((prev) => [alert, ...prev].slice(0, 100));
    });
    const subCall = emitter.addListener('WhatsAppCallEvent', (ev: CallEvent) => {
      setCallActive(ev.active);
    });
    const subPhish = emitter.addListener('PhishingAlert', (a: PhishingAlert) => {
      setPhishingAlerts((prev) => [a, ...prev].slice(0, 50));
    });
    return () => {
      subFile.remove();
      subImp.remove();
      subCall.remove();
      subPhish.remove();
    };
  }, [guardEnabled]);

  const loadState = useCallback(async () => {
    if (Platform.OS !== 'android' || !WhatsAppGuard) return;
    try {
      const [running, history] = await Promise.all([
        WhatsAppGuard.isRunning(),
        WhatsAppGuard.getScanHistory(),
      ]);
      setGuardRunning(running);
      setScanHistory((history as ScanEntry[]).filter((e) => e.verdict !== 'clean'));
    } catch (_e) {
      /* ignore — guard not yet started */
    }
  }, []);

  /** Walks through permissions with clear rationale, then starts guard. */
  const handleEnable = useCallback(async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      const storageGrants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
      ]);
      const storageOk = Object.values(storageGrants).some(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED
      );
      if (!storageOk) {
        Alert.alert(
          'Storage permission needed',
          'AnkrShield scans files in your WhatsApp media folder for malware. Scanning is 100% on-device — no files are ever uploaded.',
          [{ text: 'OK' }]
        );
        setEnabling(false);
        return;
      }
      const contactsGrant = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        {
          title: 'Contacts (optional)',
          message:
            'To detect impersonation, AnkrShield compares WhatsApp names to your address book. Contact names never leave your device.',
          buttonPositive: 'Allow',
          buttonNegative: 'Skip',
        }
      );
      await WhatsAppGuard.startGuard();
      await WhatsAppGuard.setGuardEnabled(true);
      setGuardRunning(true);
      setGuardEnabled(true);
      if (contactsGrant !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Guard active',
          'File scanning and AI voice detection are on. Grant Contacts in Settings to also enable impersonation detection.',
          [{ text: 'OK' }]
        );
      }
    } catch (_e) {
      Alert.alert('Error', 'Could not start WhatsApp Guard. Please try again.');
    } finally {
      setEnabling(false);
    }
  }, [enabling]);

  const handleDisable = useCallback(() => {
    Alert.alert('Turn off WhatsApp Guard?', 'File scanning and threat detection will stop.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn Off',
        style: 'destructive',
        onPress: async () => {
          await WhatsAppGuard.stopGuard().catch(() => {});
          await WhatsAppGuard.setGuardEnabled(false).catch(() => {});
          setGuardRunning(false);
          setGuardEnabled(false);
        },
      },
    ]);
  }, []);

  const openA11ySettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const dangerCount = scanHistory.filter((e) => e.verdict === 'dangerous').length;
  const suspiciousCount = scanHistory.filter((e) => e.verdict === 'suspicious').length;

  // Loading state
  if (guardEnabled === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#25d366" />
      </View>
    );
  }

  // ── Onboarding screen — shown once, before any permissions are requested ──
  if (!guardEnabled) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.onboardPad}>
        <Text style={styles.onboardIcon}>🛡️</Text>
        <Text style={styles.onboardTitle}>WhatsApp Guard</Text>
        <Text style={styles.onboardSub}>
          Runs silently in the background. Alerts you only when something dangerous arrives.
        </Text>

        <View style={styles.permCard}>
          <Text style={styles.permCardTitle}>What this feature accesses</Text>

          <View style={styles.permRow}>
            <Text style={styles.permIcon}>📁</Text>
            <View style={styles.permBody}>
              <Text style={styles.permName}>WhatsApp Media Folder</Text>
              <Text style={styles.permDesc}>
                Scans files you receive for malware (APKs disguised as photos, shell scripts, etc).
                Files are never uploaded — analysis is 100% on-device.
              </Text>
            </View>
          </View>

          <View style={styles.permRow}>
            <Text style={styles.permIcon}>👤</Text>
            <View style={styles.permBody}>
              <Text style={styles.permName}>Contacts (optional)</Text>
              <Text style={styles.permDesc}>
                Compares WhatsApp display names to your address book to catch impersonation. Your
                contacts are never stored or sent anywhere.
              </Text>
            </View>
          </View>

          <View style={styles.permRow}>
            <Text style={styles.permIcon}>🎙</Text>
            <View style={styles.permBody}>
              <Text style={styles.permName}>Accessibility Service</Text>
              <Text style={styles.permDesc}>
                Detects when a WhatsApp call is active to enable AI voice analysis. Message content
                is never read — only call screen state.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.privacyBox}>
          <Text style={styles.privacyTxt}>
            🔒 All processing is on your device. AnkrShield only reports anonymised threat metadata
            (file type + verdict) to help protect other users.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.enableBtn, enabling && styles.enableBtnDisabled]}
          onPress={handleEnable}
          disabled={enabling}
        >
          {enabling ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.enableBtnTxt}>Enable WhatsApp Guard</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with disable option */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>💬</Text>
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle}>WhatsApp Guard</Text>
          <Text style={styles.headerSub}>Attachments · Impersonation · AI Voice · Phishing</Text>
        </View>
        <TouchableOpacity
          style={[styles.toggleBtn, guardRunning && styles.toggleBtnOn]}
          onPress={guardRunning ? handleDisable : handleEnable}
        >
          <Text style={styles.toggleBtnTxt}>{guardRunning ? '🟢 ON' : '⚫ OFF'}</Text>
        </TouchableOpacity>
      </View>

      {/* Status bar */}
      {!guardRunning && (
        <View style={styles.warningBar}>
          <Text style={styles.warningTxt}>⚠️ Guard is paused — tap OFF to restart</Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(
          [
            { key: 'attachments', label: '📎 Files', count: dangerCount + suspiciousCount },
            { key: 'impersonation', label: '👤 Fake ID', count: impersonationAlerts.length },
            { key: 'voice', label: '🎙 Voice', count: 0 },
            { key: 'phishing', label: '🌐 Web', count: phishingAlerts.length },
          ] as const
        ).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabBtnTxt, tab === t.key && styles.tabBtnTxtActive]}>
              {t.label}
              {t.count > 0 ? ` (${t.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* ── Attachments tab ────────────────────────────────────────────── */}
        {tab === 'attachments' && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>
                Watches <Text style={styles.infoMono}>/WhatsApp/Media/</Text> for dangerous files.
                APKs, disguised executables and oversized images trigger instant alerts. Message
                content is never read.
              </Text>
            </View>

            {scanHistory.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📎</Text>
                <Text style={styles.emptyTitle}>No threats found yet</Text>
                <Text style={styles.emptySub}>
                  {guardRunning
                    ? 'Guard is active — every incoming WhatsApp file is being scanned.'
                    : 'Enable the guard above to start scanning.'}
                </Text>
              </View>
            ) : (
              scanHistory.map((entry, i) => (
                <View
                  key={i}
                  style={[
                    styles.card,
                    {
                      backgroundColor: VERDICT_BG[entry.verdict],
                      borderColor: VERDICT_COLOR[entry.verdict],
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardIcon}>{VERDICT_ICON[entry.verdict]}</Text>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {entry.fileName}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {formatSize(entry.fileSizeBytes)} · {timeAgo(entry.ts)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.verdictBadge,
                        {
                          backgroundColor: VERDICT_COLOR[entry.verdict] + '22',
                          borderColor: VERDICT_COLOR[entry.verdict],
                        },
                      ]}
                    >
                      <Text
                        style={[styles.verdictBadgeTxt, { color: VERDICT_COLOR[entry.verdict] }]}
                      >
                        {entry.verdict.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {entry.reason !== '' && <Text style={styles.cardReason}>{entry.reason}</Text>}
                </View>
              ))
            )}
          </>
        )}

        {/* ── Impersonation tab ─────────────────────────────────────────── */}
        {tab === 'impersonation' && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>
                When WhatsApp shows a contact name on screen, AnkrShield compares it to your address
                book. If a name is ≥80% similar to a saved contact but from a different number, you
                get an alert.
              </Text>
            </View>

            <View style={styles.a11yCard}>
              <Text style={styles.a11yTitle}>Requires Accessibility Permission</Text>
              <Text style={styles.a11yDesc}>
                To read contact names shown on screen (not message content), AnkrShield needs
                Android Accessibility access.
              </Text>
              <TouchableOpacity style={styles.a11yBtn} onPress={openA11ySettings}>
                <Text style={styles.a11yBtnTxt}>⚙️ Open Accessibility Settings</Text>
              </TouchableOpacity>
            </View>

            {impersonationAlerts.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>👤</Text>
                <Text style={styles.emptyTitle}>No impersonation detected</Text>
                <Text style={styles.emptySub}>
                  Alerts appear here when someone messages you using a name very similar to one of
                  your saved contacts.
                </Text>
              </View>
            ) : (
              impersonationAlerts.map((alert, i) => (
                <View key={i} style={styles.impCard}>
                  <View style={styles.impHeader}>
                    <Text style={styles.impIcon}>🚨</Text>
                    <View style={styles.impBody}>
                      <Text style={styles.impTitle}>Possible impersonation</Text>
                      <Text style={styles.impTime}>{timeAgo(alert.ts)}</Text>
                    </View>
                    <View style={styles.impScore}>
                      <Text style={styles.impScoreVal}>{alert.similarityPct}%</Text>
                      <Text style={styles.impScoreLbl}>match</Text>
                    </View>
                  </View>
                  <View style={styles.impNames}>
                    <View style={styles.impName}>
                      <Text style={styles.impNameLbl}>Sender name</Text>
                      <Text style={styles.impNameVal}>"{alert.suspectName}"</Text>
                    </View>
                    <Text style={styles.impArrow}>→</Text>
                    <View style={styles.impName}>
                      <Text style={styles.impNameLbl}>Looks like</Text>
                      <Text style={[styles.impNameVal, styles.impNameSaved]}>
                        "{alert.similarTo}"
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.impAdvice}>
                    Verify this is really your contact before sharing anything sensitive. Call them
                    directly on a known number to confirm.
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ── Voice tab ─────────────────────────────────────────────────── */}
        {tab === 'voice' && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>
                During WhatsApp calls, AnkrShield analyses audio output for signs of AI-generated
                voice. Deepfake voices used in scams ("it's your son, I need money") are flagged in
                real time.
              </Text>
            </View>

            {/* Call status */}
            <View
              style={[
                styles.callStatus,
                callActive ? styles.callStatusActive : styles.callStatusIdle,
              ]}
            >
              <Text style={styles.callStatusIcon}>{callActive ? '📞' : '📵'}</Text>
              <View>
                <Text style={[styles.callStatusTitle, callActive && styles.callStatusTitleActive]}>
                  {callActive ? 'WhatsApp Call Active' : 'No Active Call'}
                </Text>
                <Text style={styles.callStatusSub}>
                  {callActive
                    ? 'Monitoring audio for AI-generated voice patterns'
                    : 'Voice analysis starts automatically when a WhatsApp call begins'}
                </Text>
              </View>
            </View>

            <View style={styles.a11yCard}>
              <Text style={styles.a11yTitle}>Requires Accessibility Permission</Text>
              <Text style={styles.a11yDesc}>
                Call detection needs Accessibility access to know when a WhatsApp call screen is
                open. Audio is captured on-device — nothing is sent anywhere.
              </Text>
              <TouchableOpacity style={styles.a11yBtn} onPress={openA11ySettings}>
                <Text style={styles.a11yBtnTxt}>⚙️ Open Accessibility Settings</Text>
              </TouchableOpacity>
            </View>

            {/* How it works */}
            <View style={styles.howCard}>
              <Text style={styles.howTitle}>How AI Voice Detection Works</Text>
              {[
                { icon: '🎙', text: 'Audio output is captured on-device during the call' },
                {
                  icon: '🔬',
                  text: 'Analysed for unnatural pitch consistency, missing breath sounds, and spectral artifacts of synthesis',
                },
                { icon: '🟢', text: 'A live probability score shows "Natural" or "Possibly AI"' },
                {
                  icon: '🔴',
                  text: 'If AI probability stays above 70% for 10+ seconds, you get a vibration alert',
                },
                {
                  icon: '🔒',
                  text: 'Audio is never stored or transmitted — processed in memory only',
                },
              ].map((step, i) => (
                <View key={i} style={styles.howRow}>
                  <Text style={styles.howIcon}>{step.icon}</Text>
                  <Text style={styles.howTxt}>{step.text}</Text>
                </View>
              ))}
            </View>

            <View style={styles.scamBox}>
              <Text style={styles.scamTitle}>⚠️ Common AI Voice Scams</Text>
              {[
                '"Mum, I\'ve had an accident — please send money urgently"',
                '"This is your bank\'s fraud team — confirm your PIN"',
                '"Dad, I\'m in trouble, don\'t tell anyone, just transfer now"',
                '"Your boss here — make this payment immediately, I\'ll explain later"',
              ].map((scam, i) => (
                <Text key={i} style={styles.scamItem}>
                  • {scam}
                </Text>
              ))}
              <Text style={styles.scamNote}>
                If you feel pressured, hang up and call back on a number you know.
              </Text>
            </View>
          </>
        )}

        {/* ── Phishing tab ───────────────────────────────────────────────── */}
        {tab === 'phishing' && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoTxt}>
                While you browse, AnkrShield compares every site you visit against a list of
                protected banks, government portals, and payment services. If a domain looks like a
                legitimate site but isn't (e.g. <Text style={styles.infoMono}>axlsbank.com</Text> vs{' '}
                <Text style={styles.infoMono}>axisbank.com</Text>), a full-screen WMD warning fires
                instantly. No browsing history is stored.
              </Text>
            </View>

            <View style={styles.a11yCard}>
              <Text style={styles.a11yTitle}>Requires Accessibility Permission</Text>
              <Text style={styles.a11yDesc}>
                Browser URL monitoring needs Android Accessibility access. The address bar text is
                checked on-device — AnkrShield never sees the pages you visit.
              </Text>
              <TouchableOpacity style={styles.a11yBtn} onPress={openA11ySettings}>
                <Text style={styles.a11yBtnTxt}>⚙️ Open Accessibility Settings</Text>
              </TouchableOpacity>
            </View>

            {phishingAlerts.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🌐</Text>
                <Text style={styles.emptyTitle}>No phishing sites detected</Text>
                <Text style={styles.emptySub}>
                  AnkrShield monitors your browser in real time. If you visit a fake bank site, a
                  full-screen warning appears immediately.
                </Text>
              </View>
            ) : (
              phishingAlerts.map((a, i) => (
                <View key={i} style={styles.phishCard}>
                  <View style={styles.phishHeader}>
                    <Text style={styles.phishIcon}>🚨</Text>
                    <View style={styles.phishBody}>
                      <Text style={styles.phishTitle}>Fake site blocked</Text>
                      <Text style={styles.phishTime}>{timeAgo(a.ts)}</Text>
                    </View>
                    <View style={styles.phishScore}>
                      <Text style={styles.phishScoreVal}>{a.similarityPct}%</Text>
                      <Text style={styles.phishScoreLbl}>match</Text>
                    </View>
                  </View>
                  <View style={styles.phishDomains}>
                    <View style={styles.phishDomainCol}>
                      <Text style={styles.phishDomainLbl}>Fake site</Text>
                      <Text style={styles.phishDomainFake} numberOfLines={1}>
                        {a.suspectDomain}
                      </Text>
                    </View>
                    <Text style={styles.phishArrow}>→</Text>
                    <View style={styles.phishDomainCol}>
                      <Text style={styles.phishDomainLbl}>Impersonating</Text>
                      <Text style={styles.phishDomainReal} numberOfLines={1}>
                        {a.spoofingTarget}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.phishAdvice}>
                    Never enter passwords or OTPs on this domain. Scammers create near-identical
                    copies to steal credentials and money.
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  headerIcon: { fontSize: 28 },
  headerBody: { flex: 1 },
  headerTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '800' },
  headerSub: { color: '#475569', fontSize: 11, marginTop: 2 },
  toggleBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleBtnOn: { backgroundColor: '#0a1f0a', borderColor: '#22c55e' },
  toggleBtnTxt: { color: '#f1f5f9', fontSize: 13, fontWeight: '700' },

  warningBar: {
    backgroundColor: '#160a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#7f1d1d',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  warningTxt: { color: '#fca5a5', fontSize: 12 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#060a12',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#22d3ee' },
  tabBtnTxt: { color: '#6b7280', fontSize: 11, fontWeight: '600' },
  tabBtnTxtActive: { color: '#f1f5f9' },

  body: { padding: 14, paddingBottom: 48 },

  infoBox: {
    backgroundColor: '#0c1428',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    padding: 12,
    marginBottom: 14,
  },
  infoTxt: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  infoMono: { fontFamily: 'monospace', color: '#94a3b8' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#9ca3af', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  emptySub: { color: '#6b7280', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitle: { color: '#f1f5f9', fontSize: 13, fontWeight: '700' },
  cardMeta: { color: '#475569', fontSize: 11, marginTop: 2 },
  verdictBadge: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  verdictBadgeTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardReason: { color: '#94a3b8', fontSize: 12, marginTop: 8, lineHeight: 17 },

  a11yCard: {
    backgroundColor: '#0a0f1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    padding: 14,
    marginBottom: 14,
  },
  a11yTitle: { color: '#93c5fd', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  a11yDesc: { color: '#64748b', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  a11yBtn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  a11yBtnTxt: { color: '#93c5fd', fontSize: 13, fontWeight: '700' },

  impCard: {
    backgroundColor: '#160808',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    padding: 14,
    marginBottom: 10,
  },
  impHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  impIcon: { fontSize: 20 },
  impBody: { flex: 1 },
  impTitle: { color: '#fca5a5', fontSize: 13, fontWeight: '700' },
  impTime: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  impScore: { alignItems: 'center' },
  impScoreVal: { color: '#f87171', fontSize: 20, fontWeight: '800' },
  impScoreLbl: { color: '#6b7280', fontSize: 10 },
  impNames: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  impName: { flex: 1 },
  impNameLbl: { color: '#475569', fontSize: 10, marginBottom: 3 },
  impNameVal: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  impNameSaved: { color: '#4ade80' },
  impArrow: { color: '#475569', fontSize: 16 },
  impAdvice: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },

  callStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#0a0f1a',
    borderColor: '#1e293b',
  },
  callStatusActive: { backgroundColor: '#0a1f0a', borderColor: '#22c55e' },
  callStatusIdle: {},
  callStatusIcon: { fontSize: 28 },
  callStatusTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  callStatusTitleActive: { color: '#4ade80' },
  callStatusSub: { color: '#64748b', fontSize: 12, lineHeight: 17 },

  howCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 14,
  },
  howTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  howRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  howIcon: { fontSize: 16, width: 20 },
  howTxt: { color: '#94a3b8', fontSize: 12, lineHeight: 18, flex: 1 },

  scamBox: {
    backgroundColor: '#160a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    padding: 14,
  },
  scamTitle: { color: '#fca5a5', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  scamItem: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  scamNote: { color: '#ef4444', fontSize: 12, marginTop: 10, fontWeight: '600' },

  // Phishing tab
  phishCard: {
    backgroundColor: '#160505',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    padding: 14,
    marginBottom: 10,
  },
  phishHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  phishIcon: { fontSize: 20 },
  phishBody: { flex: 1 },
  phishTitle: { color: '#fca5a5', fontSize: 13, fontWeight: '700' },
  phishTime: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  phishScore: { alignItems: 'center' },
  phishScoreVal: { color: '#f87171', fontSize: 20, fontWeight: '800' },
  phishScoreLbl: { color: '#6b7280', fontSize: 10 },
  phishDomains: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  phishDomainCol: { flex: 1 },
  phishDomainLbl: { color: '#475569', fontSize: 10, marginBottom: 3 },
  phishDomainFake: { color: '#f87171', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  phishDomainReal: { color: '#4ade80', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  phishArrow: { color: '#475569', fontSize: 16 },
  phishAdvice: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },

  // Onboarding styles
  center: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  onboardPad: { padding: 24, alignItems: 'center' },
  onboardIcon: { fontSize: 64, marginBottom: 12, marginTop: 8 },
  onboardTitle: {
    color: '#f1f5f9',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  onboardSub: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  permCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    width: '100%',
    marginBottom: 16,
  },
  permCardTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  permRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  permIcon: { fontSize: 22, marginTop: 1 },
  permBody: { flex: 1 },
  permName: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  permDesc: { color: '#6b7280', fontSize: 12, lineHeight: 18 },
  privacyBox: {
    backgroundColor: '#0a1a0a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#166534',
    padding: 14,
    width: '100%',
    marginBottom: 24,
  },
  privacyTxt: { color: '#4ade80', fontSize: 12, lineHeight: 18 },
  enableBtn: {
    backgroundColor: '#25d366',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  enableBtnDisabled: { opacity: 0.5 },
  enableBtnTxt: { color: '#000', fontSize: 16, fontWeight: '800' },
});
