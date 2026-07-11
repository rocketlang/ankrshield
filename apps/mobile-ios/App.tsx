/**
 * ankrshield Mobile App
 * React Native Application for iOS
 */

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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

import { ErrorBoundary } from './src/components/ErrorBoundary';
import { setLanguage, type Lang } from './src/i18n';
import { MdmScreen } from './src/mdm/MdmScreen';
import { MdmStorage } from './src/mdm/storage';
import AccountGuardScreen from './src/screens/AccountGuardScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { AgentManagerScreen } from './src/screens/AgentManagerScreen';
import { AndroidMonitorScreen } from './src/screens/AndroidMonitorScreen';
import { AntiTheftScreen } from './src/screens/AntiTheftScreen';
import { AppConsentScreen } from './src/screens/AppConsentScreen';
import { AppTrustScreen } from './src/screens/AppTrustScreen';
import { AvScannerScreen } from './src/screens/AvScannerScreen';
import { CallProtectionScreen } from './src/screens/CallProtectionScreen';
import { CaughtInActScreen } from './src/screens/CaughtInActScreen';
import { ConferenceScreen } from './src/screens/ConferenceScreen';
import ContactRiskScreen from './src/screens/ContactRiskScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DeviceHealthScreen } from './src/screens/DeviceHealthScreen';
import { DpdpScanScreen } from './src/screens/DpdpScanScreen';
import { FeatureRequestScreen } from './src/screens/FeatureRequestScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { HealthWitnessScreen } from './src/screens/HealthWitnessScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { iOSPermissionAuditScreen } from './src/screens/iOSPermissionAuditScreen';
import { LinkScannerScreen } from './src/screens/LinkScannerScreen';
import { LiveThreatsScreen } from './src/screens/LiveThreatsScreen';
import { LogScreen } from './src/screens/LogScreen';
import { NetworkBehaviorScreen } from './src/screens/NetworkBehaviorScreen';
import { OnboardingScreen, ONBOARDING_KEY } from './src/screens/OnboardingScreen';
import { PermissionChangeScreen } from './src/screens/PermissionChangeScreen';
import { RansomwareScreen } from './src/screens/RansomwareScreen';
import { RiskLookupScreen } from './src/screens/RiskLookupScreen';
import { SafeBrowsingScreen } from './src/screens/SafeBrowsingScreen';
import { ScopeReportScreen } from './src/screens/ScopeReportScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SimpleHomeScreen, MODE_KEY } from './src/screens/SimpleHomeScreen';
import { SmsShieldScreen } from './src/screens/SmsShieldScreen';
import SplitTunnelScreen from './src/screens/SplitTunnelScreen';
import { SpywareScanScreen } from './src/screens/SpywareScanScreen';
import { StalkerwareScreen } from './src/screens/StalkerwareScreen';
import { ThreatAlertsScreen } from './src/screens/ThreatAlertsScreen';
import { UpiGuardScreen } from './src/screens/UpiGuardScreen';
import { WarriorScreen } from './src/screens/WarriorScreen';
import { WhatsAppGuardScreen } from './src/screens/WhatsAppGuardScreen';
import { installDebugLog } from './src/services/DebugLog';

// Start capturing console.error/warn + uncaught JS errors into the in-app
// Diagnostic Log (Settings → Diagnostic Log) as early as possible.
installDebugLog();

function eb(Component: React.ComponentType<any>, name: string) {
  return (props: any) => (
    <ErrorBoundary name={name}>
      <Component {...props} />
    </ErrorBoundary>
  );
}

const Stack = createNativeStackNavigator();
const { WhatsAppGuard } = NativeModules;
const navigationRef = createNavigationContainerRef();

/** Route incoming deep links and share intents to the correct screen. */
function handleDeepLink(url: string | null) {
  if (!url || !navigationRef.isReady()) {
    return;
  }
  try {
    // upi://pay?pa=... → UpiGuard with URI pre-filled
    if (url.startsWith('upi://')) {
      navigationRef.navigate('UpiGuard' as never, { uri: url } as never);
      return;
    }
    // ankrshield://share?text=... → LinkScanner (originating from ACTION_SEND)
    if (url.startsWith('ankrshield://share')) {
      const textParam = url.split('?text=')[1];
      if (textParam) {
        navigationRef.navigate(
          'LinkScanner' as never,
          { url: decodeURIComponent(textParam) } as never
        );
      }
      return;
    }
    // ankrshield://ransomware → Ransomware feed (tapped a ransomware alert)
    if (url.startsWith('ankrshield://ransomware')) {
      navigationRef.navigate('Ransomware' as never);
      return;
    }
  } catch (_) {
    /* ignore */
  }
}

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
  if (!threat) {
    return null;
  }
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
    if (!alert) {
      return;
    }
    setCountdown(25);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [alert]);

  if (!alert) {
    return null;
  }

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
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [phishingAlert, setPhishingAlert] = useState<PhishingAlertData | null>(null);
  const [threatFile, setThreatFile] = useState<ThreatFileData | null>(null);
  const handlePhishingDismiss = useCallback(() => setPhishingAlert(null), []);

  // First-run onboarding check + language preference — run in parallel before first render
  useEffect(() => {
    Promise.all([
      MdmStorage.getItem(ONBOARDING_KEY),
      MdmStorage.getItem('@ankrshield/language'),
      MdmStorage.getItem(MODE_KEY),
    ])
      .then(([onboarded, lang, mode]) => {
        if (lang === 'en' || lang === 'hi' || lang === 'ta' || lang === 'te') {
          setLanguage(lang as Lang);
        }
        // Default face is Simple; Tech is remembered once chosen (founder: simple
        // on top, complexity underneath, opt-in tech toggle).
        const landing = mode === 'tech' ? 'Home' : 'Simple';
        setInitialRoute(onboarded ? landing : 'Onboarding');
      })
      .catch(() => setInitialRoute('Simple'));
  }, []);

  // Warm-start deep link / share intent listener
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  // Global listeners — phishing + WhatsApp file threats
  useEffect(() => {
    if (Platform.OS !== 'android' || !WhatsAppGuard) {
      return;
    }
    const emitter = new NativeEventEmitter(WhatsAppGuard);

    const subPhish = emitter.addListener('PhishingAlert', (data: PhishingAlertData) => {
      setPhishingAlert(data);
    });

    // Surface threat file modal when AnkrShield is in foreground
    const subFile = emitter.addListener('WhatsAppFileEvent', (data: ThreatFileData) => {
      if (data.verdict !== 'clean') {
        setThreatFile(data);
      }
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
    if (!threatFile || !WhatsAppGuard) {
      return;
    }
    await WhatsAppGuard.deleteFile(threatFile.filePath).catch((_e: unknown) => {});
    setThreatFile(null);
  }, [threatFile]);

  const handleThreatDismiss = useCallback(() => setThreatFile(null), []);

  if (!initialRoute) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#080c14',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => Linking.getInitialURL().then(handleDeepLink)}
      >
        <Stack.Navigator
          initialRouteName={initialRoute}
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
          <Stack.Screen
            name="Simple"
            component={eb(SimpleHomeScreen, 'Simple')}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Home"
            component={eb(HomeScreen, 'Home')}
            options={{ title: 'ankrshield' }}
          />
          <Stack.Screen
            name="HealthWitness"
            component={eb(HealthWitnessScreen, 'HealthWitness')}
            options={{
              title: 'Health Privacy',
              headerStyle: { backgroundColor: '#0a0710' },
              headerTintColor: '#f472b6',
            }}
          />
          <Stack.Screen
            name="Dashboard"
            component={eb(DashboardScreen, 'Dashboard')}
            options={{ title: 'Dashboard' }}
          />
          <Stack.Screen
            name="Activity"
            component={eb(ActivityScreen, 'Activity')}
            options={{ title: 'Recent Activity' }}
          />
          <Stack.Screen
            name="Settings"
            component={eb(SettingsScreen, 'Settings')}
            options={{ title: 'Settings' }}
          />
          <Stack.Screen
            name="Logs"
            component={eb(LogScreen, 'Logs')}
            options={{ title: 'Diagnostic Log' }}
          />
          <Stack.Screen
            name="Warrior"
            component={eb(WarriorScreen, 'Warrior')}
            options={{ title: 'AI Warrior' }}
          />
          <Stack.Screen
            name="ThreatAlerts"
            component={eb(ThreatAlertsScreen, 'ThreatAlerts')}
            options={{ title: 'Threat Alerts' }}
          />
          <Stack.Screen
            name="AgentManager"
            component={eb(AgentManagerScreen, 'AgentManager')}
            options={{ title: 'Agent Manager' }}
          />
          <Stack.Screen
            name="SpywareScan"
            component={eb(SpywareScanScreen, 'SpywareScan')}
            options={{ title: 'Spyware Scan' }}
          />
          <Stack.Screen
            name="LiveThreats"
            component={eb(LiveThreatsScreen, 'LiveThreats')}
            options={{
              title: 'Live Threats',
              headerStyle: { backgroundColor: '#0f172a' },
              headerTintColor: '#ef4444',
            }}
          />
          <Stack.Screen
            name="AndroidMonitor"
            component={eb(AndroidMonitorScreen, 'AndroidMonitor')}
            options={{ title: 'App Scanner' }}
          />
          <Stack.Screen
            name="Conference"
            component={eb(ConferenceScreen, 'Conference')}
            options={{
              title: '🎤 Join Conference',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#3b82f6',
            }}
          />
          <Stack.Screen
            name="RiskLookup"
            component={eb(RiskLookupScreen, 'RiskLookup')}
            options={{
              title: '🔍 Risk Lookup',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#60a5fa',
            }}
          />
          <Stack.Screen
            name="Help"
            component={eb(HelpScreen, 'Help')}
            options={{
              title: '❓ Help & Guide',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#22d3ee',
            }}
          />
          <Stack.Screen
            name="FeatureRequest"
            component={eb(FeatureRequestScreen, 'FeatureRequest')}
            options={{
              title: '💡 Feature Request',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#3b82f6',
            }}
          />
          <Stack.Screen
            name="WhatsAppGuard"
            component={eb(WhatsAppGuardScreen, 'WhatsAppGuard')}
            options={{
              title: '💬 WhatsApp Guard',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#25d366',
            }}
          />
          <Stack.Screen
            name="AppTrust"
            component={eb(AppTrustScreen, 'AppTrust')}
            options={{ title: 'App Trust' }}
          />
          <Stack.Screen
            name="Stalkerware"
            component={eb(StalkerwareScreen, 'Stalkerware')}
            options={{
              title: 'Stalkerware Scan',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#f44336',
            }}
          />
          <Stack.Screen
            name="SmsShield"
            component={eb(SmsShieldScreen, 'SmsShield')}
            options={{
              title: 'SMS Shield',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#4CAF50',
            }}
          />
          <Stack.Screen
            name="DpdpScan"
            component={eb(DpdpScanScreen, 'DpdpScan')}
            options={{
              title: 'DPDP Scan',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#FF9800',
            }}
          />
          <Stack.Screen
            name="ScopeReport"
            component={eb(ScopeReportScreen, 'ScopeReport')}
            options={{
              title: 'Privacy Report',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#60a5fa',
            }}
          />
          <Stack.Screen
            name="CaughtInAct"
            component={eb(CaughtInActScreen, 'CaughtInAct')}
            options={{
              title: 'Caught in the Act',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#60a5fa',
            }}
          />
          <Stack.Screen
            name="NetworkBehavior"
            component={eb(NetworkBehaviorScreen, 'NetworkBehavior')}
            options={{
              title: 'Network Behavior',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#60a5fa',
            }}
          />
          <Stack.Screen
            name="Ransomware"
            component={eb(RansomwareScreen, 'Ransomware')}
            options={{
              title: 'Ransomware Watch',
              headerStyle: { backgroundColor: '#0d0000' },
              headerTintColor: '#ef4444',
            }}
          />
          <Stack.Screen
            name="CallProtection"
            component={eb(CallProtectionScreen, 'CallProtection')}
            options={{
              title: 'Call Protection',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#4CAF50',
            }}
          />
          <Stack.Screen
            name="SafeBrowsing"
            component={eb(SafeBrowsingScreen, 'SafeBrowsing')}
            options={{
              title: 'Safe Browsing',
              headerStyle: { backgroundColor: '#052e16' },
              headerTintColor: '#4ade80',
            }}
          />
          <Stack.Screen
            name="AppConsent"
            component={eb(AppConsentScreen, 'AppConsent')}
            options={{
              title: 'App Scope Monitor',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#64b5f6',
            }}
          />
          <Stack.Screen
            name="PermissionChange"
            component={eb(PermissionChangeScreen, 'PermissionChange')}
            options={{
              title: 'Permission Changes',
              headerStyle: { backgroundColor: '#0d0d0d' },
              headerTintColor: '#a855f7',
            }}
          />
          <Stack.Screen
            name="Onboarding"
            component={eb(OnboardingScreen, 'Onboarding')}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="DeviceHealth"
            component={eb(DeviceHealthScreen, 'DeviceHealth')}
            options={{
              title: 'Device Health',
              headerStyle: { backgroundColor: '#0d0d0d' },
              headerTintColor: '#22c55e',
            }}
          />
          <Stack.Screen
            name="UpiGuard"
            component={eb(UpiGuardScreen, 'UpiGuard')}
            options={{
              title: 'UPI Guard',
              headerStyle: { backgroundColor: '#0d0d0d' },
              headerTintColor: '#60a5fa',
            }}
          />
          <Stack.Screen
            name="LinkScanner"
            component={eb(LinkScannerScreen, 'LinkScanner')}
            options={{
              title: 'Link Scanner',
              headerStyle: { backgroundColor: '#0d0d0d' },
              headerTintColor: '#a78bfa',
            }}
          />
          <Stack.Screen
            name="Mdm"
            component={eb(MdmScreen, 'Mdm')}
            options={{
              title: 'Corporate Shield',
              headerStyle: { backgroundColor: '#0a0a0a' },
              headerTintColor: '#7c3aed',
            }}
          />
          <Stack.Screen
            name="AvScanner"
            component={eb(AvScannerScreen, 'AvScanner')}
            options={{
              title: '🔬 AV Scanner',
              headerStyle: { backgroundColor: '#0a0a0a' },
              headerTintColor: '#22c55e',
            }}
          />
          <Stack.Screen
            name="AntiTheft"
            component={eb(AntiTheftScreen, 'AntiTheft')}
            options={{
              title: '🔒 Anti-Theft',
              headerStyle: { backgroundColor: '#0a0a0a' },
              headerTintColor: '#60a5fa',
            }}
          />
          {/* A13 — Account Guard (aggregates OTP Guard + Linked Devices + SIM Swap) */}
          <Stack.Screen
            name="AccountGuard"
            component={eb(AccountGuardScreen, 'AccountGuard')}
            options={{
              title: '🛡️ Account Guard',
              headerStyle: { backgroundColor: '#0a0e0b' },
              headerTintColor: '#22c55e',
            }}
          />

          {/* A1-4 — Split Tunnel (per-app DNS bypass + passive mode) */}
          <Stack.Screen
            name="SplitTunnel"
            component={eb(SplitTunnelScreen, 'SplitTunnel')}
            options={{
              title: '🔀 App Bypass',
              headerStyle: { backgroundColor: '#0f172a' },
              headerTintColor: '#3b82f6',
            }}
          />

          {/* XS-SATOI — Contact Risk (phone hijack check + report) */}
          <Stack.Screen
            name="ContactRisk"
            component={eb(ContactRiskScreen, 'ContactRisk')}
            options={{
              title: '📱 Contact Risk Check',
              headerStyle: { backgroundColor: '#0f172a' },
              headerTintColor: '#3b82f6',
            }}
          />

          {/* iOS-only screens */}
          {Platform.OS === 'ios' && (
            <Stack.Screen
              name="iOSPermissionAudit"
              component={eb(iOSPermissionAuditScreen, 'iOSPermissionAudit')}
              options={{
                title: '🔐 Permission Audit',
                headerStyle: { backgroundColor: '#0a0a0a' },
                headerTintColor: '#818cf8',
              }}
            />
          )}
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
