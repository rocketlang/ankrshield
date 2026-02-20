/**
 * ankrshield Mobile App
 * React Native Application for iOS
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  NativeEventEmitter,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActivityScreen } from './src/screens/ActivityScreen';
import { AgentManagerScreen } from './src/screens/AgentManagerScreen';
import { AndroidMonitorScreen } from './src/screens/AndroidMonitorScreen';
import { ConferenceScreen } from './src/screens/ConferenceScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { FeatureRequestScreen } from './src/screens/FeatureRequestScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LiveThreatsScreen } from './src/screens/LiveThreatsScreen';
import { RiskLookupScreen } from './src/screens/RiskLookupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SpywareScanScreen } from './src/screens/SpywareScanScreen';
import { ThreatAlertsScreen } from './src/screens/ThreatAlertsScreen';
import { WarriorScreen } from './src/screens/WarriorScreen';
import { WhatsAppGuardScreen } from './src/screens/WhatsAppGuardScreen';

const Stack = createNativeStackNavigator();
const { WhatsAppGuard } = NativeModules;

interface PhishingAlertData {
  suspectUrl: string;
  suspectDomain: string;
  spoofingTarget: string;
  similarityPct: number;
  ts: number;
}

interface ThreatFileData {
  fileName: string;
  filePath: string;
  verdict: 'dangerous' | 'suspicious';
  reason: string;
  ts: number;
  fileSizeBytes: number;
}

/** In-app threat popup — shown when AnkrShield is in the foreground when a threat arrives. */
function ThreatFileModal({
  threat,
  onDelete,
  onDismiss,
}: {
  threat: ThreatFileData | null;
  onDelete: () => void;
  onDismiss: () => void;
}) {
  if (!threat) return null;
  const isDangerous = threat.verdict === 'dangerous';

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent>
      <View style={tf.backdrop}>
        <View style={[tf.card, isDangerous ? tf.cardDanger : tf.cardWarn]}>
          <Text style={tf.icon}>{isDangerous ? '🚨' : '⚠️'}</Text>
          <Text style={tf.title}>
            {isDangerous ? 'Malicious File Blocked' : 'Suspicious File Detected'}
          </Text>
          <Text style={tf.fileName} numberOfLines={2}>
            {threat.fileName}
          </Text>
          <Text style={tf.reason}>{threat.reason}</Text>
          <Text style={tf.source}>Received via WhatsApp</Text>

          <TouchableOpacity style={tf.deleteBtn} onPress={onDelete}>
            <Text style={tf.deleteBtnTxt}>🗑 Delete File Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={tf.dismissBtn} onPress={onDismiss}>
            <Text style={tf.dismissTxt}>Keep file (I know the risk)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const tf = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  cardDanger: { backgroundColor: '#0d0000', borderTopWidth: 3, borderColor: '#ef4444' },
  cardWarn: { backgroundColor: '#0d0800', borderTopWidth: 3, borderColor: '#f59e0b' },
  icon: { fontSize: 48, marginBottom: 8 },
  title: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  fileName: {
    color: '#fca5a5',
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: 10,
    textAlign: 'center',
  },
  reason: { color: '#9ca3af', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 6 },
  source: { color: '#4b5563', fontSize: 11, marginBottom: 20 },
  deleteBtn: {
    backgroundColor: '#7f1d1d',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  deleteBtnTxt: { color: '#fecaca', fontSize: 16, fontWeight: '800' },
  dismissBtn: { paddingVertical: 10 },
  dismissTxt: { color: '#6b7280', fontSize: 13 },
});

/** Full-screen WMD-style phishing warning — shown over everything when a fake site is detected. */
function PhishingWMDModal({
  alert,
  onDismiss,
}: {
  alert: PhishingAlertData | null;
  onDismiss: () => void;
}) {
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!alert) return;
    setCountdown(25);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [alert]);

  if (!alert) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={wmd.backdrop}>
        <View style={wmd.card}>
          {/* Alarm header */}
          <View style={wmd.topBar}>
            <Text style={wmd.sirenEmoji}>🚨</Text>
            <Text style={wmd.topLabel}>DANGER · PHISHING SITE DETECTED</Text>
            <Text style={wmd.sirenEmoji}>🚨</Text>
          </View>

          <Text style={wmd.headline}>STOP!</Text>
          <Text style={wmd.subline}>You are about to visit a FAKE website</Text>

          {/* Domain comparison */}
          <View style={wmd.domainBox}>
            <Text style={wmd.domainSectionLbl}>Fake site you're visiting</Text>
            <Text style={wmd.domainFake}>{alert.suspectDomain}</Text>
            <Text style={wmd.vsArrow}>↓ is impersonating ↓</Text>
            <Text style={wmd.domainSectionLbl}>Legitimate website</Text>
            <Text style={wmd.domainReal}>{alert.spoofingTarget}</Text>
            <View style={wmd.simPill}>
              <Text style={wmd.simTxt}>
                {alert.similarityPct}% identical — designed to fool you
              </Text>
            </View>
          </View>

          {/* Warning */}
          <Text style={wmd.warningTxt}>
            Do NOT enter your password, OTP, PIN, or bank details.{'\n'}
            Scammers create near-identical fake websites to steal your money.
          </Text>

          {/* Tips */}
          <Text style={wmd.tip}>🔒 Real banks always use their exact official domain</Text>
          <Text style={wmd.tip}>📞 If unsure, call your bank on their official number</Text>
          <Text style={wmd.tip}>🗑 Close this tab and type the correct URL yourself</Text>

          {/* Dismiss — requires countdown cooldown */}
          <TouchableOpacity
            style={[wmd.dismissBtn, countdown > 0 && wmd.dismissBtnWait]}
            onPress={countdown === 0 ? onDismiss : undefined}
            activeOpacity={countdown === 0 ? 0.7 : 1}
          >
            <Text style={wmd.dismissTxt}>
              {countdown > 0
                ? `I understand the risk — proceed anyway (${countdown}s)`
                : 'I understand the risk — proceed anyway'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function App(): React.JSX.Element {
  const [phishingAlert, setPhishingAlert] = useState<PhishingAlertData | null>(null);
  const [threatFile, setThreatFile] = useState<ThreatFileData | null>(null);
  const handlePhishingDismiss = useCallback(() => setPhishingAlert(null), []);

  // Global listeners — phishing + WhatsApp file threats
  useEffect(() => {
    if (Platform.OS !== 'android' || !WhatsAppGuard) return;
    const emitter = new NativeEventEmitter(WhatsAppGuard);

    const subPhish = emitter.addListener('PhishingAlert', (data: PhishingAlertData) => {
      setPhishingAlert(data);
    });

    // Surface threat file modal when AnkrShield is in foreground
    const subFile = emitter.addListener('WhatsAppFileEvent', (data: ThreatFileData) => {
      if (data.verdict !== 'clean') setThreatFile(data);
    });

    // Dismiss modal if file was deleted via notification action (user was in another app)
    const subCleaned = emitter.addListener('WhatsAppThreatCleaned', (ev: { filePath: string }) => {
      setThreatFile((prev) => (prev?.filePath === ev.filePath ? null : prev));
    });

    // Auto-start guard silently — no user action needed
    WhatsAppGuard.autoStart?.().catch((_e: unknown) => {
      /* permissions not granted yet */
    });

    return () => {
      subPhish.remove();
      subFile.remove();
      subCleaned.remove();
    };
  }, []);

  const handleThreatDelete = useCallback(async () => {
    if (!threatFile || !WhatsAppGuard) return;
    await WhatsAppGuard.deleteFile(threatFile.filePath).catch((_e: unknown) => {});
    setThreatFile(null);
  }, [threatFile]);

  const handleThreatDismiss = useCallback(() => setThreatFile(null), []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#1a1a1a',
            },
            headerTintColor: '#4CAF50',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: '#121212',
            },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'ankrshield' }} />
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ title: 'Dashboard' }}
          />
          <Stack.Screen
            name="Activity"
            component={ActivityScreen}
            options={{ title: 'Recent Activity' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
          <Stack.Screen
            name="Warrior"
            component={WarriorScreen}
            options={{ title: 'AI Warrior' }}
          />
          <Stack.Screen
            name="ThreatAlerts"
            component={ThreatAlertsScreen}
            options={{ title: 'Threat Alerts' }}
          />
          <Stack.Screen
            name="AgentManager"
            component={AgentManagerScreen}
            options={{ title: 'Agent Manager' }}
          />
          <Stack.Screen
            name="SpywareScan"
            component={SpywareScanScreen}
            options={{ title: 'Spyware Scan' }}
          />
          <Stack.Screen
            name="LiveThreats"
            component={LiveThreatsScreen}
            options={{
              title: 'Live Threats',
              headerStyle: { backgroundColor: '#0f172a' },
              headerTintColor: '#ef4444',
            }}
          />
          <Stack.Screen
            name="AndroidMonitor"
            component={AndroidMonitorScreen}
            options={{ title: 'App Scanner' }}
          />
          <Stack.Screen
            name="Conference"
            component={ConferenceScreen}
            options={{
              title: '🎤 Join Conference',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#3b82f6',
            }}
          />
          <Stack.Screen
            name="RiskLookup"
            component={RiskLookupScreen}
            options={{
              title: '🔍 Risk Lookup',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#60a5fa',
            }}
          />
          <Stack.Screen
            name="Help"
            component={HelpScreen}
            options={{
              title: '❓ Help & Guide',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#22d3ee',
            }}
          />
          <Stack.Screen
            name="FeatureRequest"
            component={FeatureRequestScreen}
            options={{
              title: '💡 Feature Request',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#3b82f6',
            }}
          />
          <Stack.Screen
            name="WhatsAppGuard"
            component={WhatsAppGuardScreen}
            options={{
              title: '💬 WhatsApp Guard',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#25d366',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>

      {/* Global WMD phishing overlay — renders over all navigation */}
      <PhishingWMDModal alert={phishingAlert} onDismiss={handlePhishingDismiss} />

      {/* Global WhatsApp file threat popup — shown when app is in foreground */}
      <ThreatFileModal
        threat={threatFile}
        onDelete={handleThreatDelete}
        onDismiss={handleThreatDismiss}
      />
    </SafeAreaProvider>
  );
}

const wmd = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#0d0000',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ef4444',
    padding: 20,
    width: '100%',
    maxWidth: 440,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#7f1d1d',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  sirenEmoji: { fontSize: 18 },
  topLabel: {
    color: '#fecaca',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    flex: 1,
  },
  headline: {
    color: '#ef4444',
    fontSize: 44,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 6,
    marginBottom: 4,
  },
  subline: {
    color: '#fca5a5',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  domainBox: {
    backgroundColor: '#160505',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    padding: 14,
    marginBottom: 14,
    gap: 4,
  },
  domainSectionLbl: {
    color: '#6b7280',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  domainFake: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  domainReal: {
    color: '#4ade80',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  vsArrow: {
    color: '#ef4444',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
    marginVertical: 4,
  },
  simPill: {
    backgroundColor: '#7f1d1d33',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  simTxt: {
    color: '#fca5a5',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
  warningTxt: {
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    textAlign: 'center',
  },
  tip: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 3,
  },
  dismissBtn: {
    marginTop: 16,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 14,
    alignItems: 'center',
  },
  dismissBtnWait: { opacity: 0.45 },
  dismissTxt: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default App;
