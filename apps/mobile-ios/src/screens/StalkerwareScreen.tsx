/**
 * Stalkerware & Spyware Scan — A3
 *
 * Philosophy: ONLY flags apps the user likely did NOT knowingly install,
 * or apps disguised as something else. Play Store apps are never flagged
 * purely for permissions. Respects user consent.
 */

import type { AppPermissions } from '@ankrshield/android-monitor';
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

// ---------------------------------------------------------------------------
// Detection types
// ---------------------------------------------------------------------------

type DetectionStatus = 'clean' | 'suspicious' | 'stalkerware';

interface AppDetection {
  app: AppPermissions;
  status: DetectionStatus;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_APPS: AppPermissions[] = [
  // User knowingly installed — NEVER flag based on permissions alone
  {
    packageName: 'com.google.android.apps.maps',
    appName: 'Google Maps',
    installSource: 'play_store',
    isSystemApp: false,
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'CAMERA',
      'RECORD_AUDIO',
      'READ_CONTACTS',
    ],
  },
  // IOC match — definite stalkerware
  {
    packageName: 'com.thetruthspy.android',
    appName: 'System Service',
    installSource: 'unknown',
    isSystemApp: false,
    permissions: [
      'READ_SMS',
      'READ_CALL_LOG',
      'ACCESS_FINE_LOCATION',
      'RECORD_AUDIO',
      'READ_CONTACTS',
    ],
  },
  // Disguised — name doesn't match package
  {
    packageName: 'com.track.spouse.hidden',
    appName: 'Phone Optimizer',
    installSource: 'file_manager',
    isSystemApp: false,
    permissions: ['READ_SMS', 'ACCESS_FINE_LOCATION', 'RECORD_AUDIO', 'RECEIVE_BOOT_COMPLETED'],
  },
  // Clean sideload — games APK
  {
    packageName: 'com.mojang.minecraftpe',
    appName: 'Minecraft',
    installSource: 'file_manager',
    isSystemApp: false,
    permissions: ['WRITE_EXTERNAL_STORAGE', 'RECORD_AUDIO'],
  },
  // Legit banking app
  {
    packageName: 'com.sbi.SBIFreedomPlus',
    appName: 'SBI YONO',
    installSource: 'play_store',
    isSystemApp: false,
    permissions: ['CAMERA', 'READ_PHONE_STATE', 'RECEIVE_SMS', 'ACCESS_FINE_LOCATION'],
  },
];

// ---------------------------------------------------------------------------
// Detection logic (inline — simple, no external package dependency)
// ---------------------------------------------------------------------------

const STALKERWARE_IOC = new Set([
  'com.thetruthspy.android',
  'com.mspy.android',
  'com.flexispy.android',
  'com.spyzie.android',
]);

const DISGUISE_NAMES = [
  'phone optimizer',
  'system service',
  'battery manager',
  'system update',
  'device health',
];

function detectApp(app: AppPermissions): AppDetection {
  const pkg = app.packageName.toLowerCase();
  const name = app.appName.toLowerCase();

  // 1. IOC match — always stalkerware regardless of source
  if (STALKERWARE_IOC.has(app.packageName)) {
    return {
      app,
      status: 'stalkerware',
      reason: 'Package name matches known stalkerware database',
    };
  }

  // 2. Disguise check — system-sounding name + suspicious package keywords
  const looksDisguised = DISGUISE_NAMES.some((n) => name.includes(n));
  const pkgSuspicious = /track|spy|monitor|hidden|secret|location|stalk/.test(pkg);
  if (looksDisguised && pkgSuspicious) {
    return {
      app,
      status: 'suspicious',
      reason: `App presents as "${app.appName}" but package name suggests tracking capability`,
    };
  }

  // 3. Play Store apps — always clean (Google Play Protect covers these)
  if (app.installSource === 'play_store') {
    return { app, status: 'clean' };
  }

  // 4. Sideloaded + high-risk permission combo (but not a known legit app)
  const perms = new Set(app.permissions);
  const hasSuspiciousCombo =
    perms.has('READ_SMS') && perms.has('RECORD_AUDIO') && perms.has('ACCESS_FINE_LOCATION');
  if (hasSuspiciousCombo && (app.installSource === 'file_manager' || app.installSource === 'adb')) {
    return {
      app,
      status: 'suspicious',
      reason: 'Sideloaded app with SMS + microphone + location — possible covert monitoring',
    };
  }

  return { app, status: 'clean' };
}

// ---------------------------------------------------------------------------
// Card components
// ---------------------------------------------------------------------------

function CleanCard({ app }: { app: AppPermissions }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.shieldClean}>+</Text>
        <View style={styles.cardBody}>
          <Text style={styles.appName}>{app.appName}</Text>
          <Text style={styles.cleanLabel}>Trusted — matches expected behavior</Text>
        </View>
      </View>
    </View>
  );
}

function SuspiciousCard({ detection }: { detection: AppDetection }) {
  return (
    <View style={[styles.card, styles.cardSuspicious]}>
      <View style={styles.cardRow}>
        <Text style={styles.shieldWarn}>!</Text>
        <View style={styles.cardBody}>
          <Text style={styles.appName}>{detection.app.appName}</Text>
          <Text style={styles.packageName}>{detection.app.packageName}</Text>
          <Text style={styles.warnText}>{detection.reason}</Text>
          <Text style={styles.questionText}>Was this app installed by someone else?</Text>
          <View style={styles.inhibitNote}>
            <Text style={styles.inhibitText}>
              AnkrShield inhibits covert data uploads from this app
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function StalkerwareCard({ detection }: { detection: AppDetection }) {
  return (
    <View style={styles.stalkerCard}>
      <View style={styles.stalkerHeader}>
        <Text style={styles.stalkerIcon}>X</Text>
        <Text style={styles.stalkerTitle}>STALKERWARE DETECTED</Text>
      </View>
      <Text style={styles.stalkerAppName}>{detection.app.appName}</Text>
      <Text style={styles.stalkerPkg}>{detection.app.packageName}</Text>
      <Text style={styles.stalkerDesc}>
        This app is designed to secretly monitor you. Uninstall immediately.
      </Text>
      <View style={styles.inhibitNote}>
        <Text style={styles.inhibitText}>
          AnkrShield inhibits covert data uploads from this app
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function StalkerwareScreen() {
  const detections = MOCK_APPS.map(detectApp);
  const flaggedCount = detections.filter((d) => d.status !== 'clean').length;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stalkerware & Spyware Scan</Text>
        <Text style={styles.headerSub}>
          Detects apps secretly monitoring your device — respects apps you installed
        </Text>
      </View>

      {/* Summary */}
      <View style={[styles.summaryBar, { borderColor: flaggedCount > 0 ? '#f44336' : '#4CAF50' }]}>
        <Text style={[styles.summaryText, { color: flaggedCount > 0 ? '#f44336' : '#4CAF50' }]}>
          {flaggedCount > 0
            ? `${flaggedCount} app${flaggedCount > 1 ? 's' : ''} flagged for review`
            : 'No stalkerware detected'}
        </Text>
      </View>

      {/* App list */}
      <View style={styles.list}>
        {detections.map((d) => {
          if (d.status === 'stalkerware')
            return <StalkerwareCard key={d.app.packageName} detection={d} />;
          if (d.status === 'suspicious')
            return <SuspiciousCard key={d.app.packageName} detection={d} />;
          return <CleanCard key={d.app.packageName} app={d.app} />;
        })}
      </View>

      {/* Philosophy note */}
      <View style={styles.noteBox}>
        <Text style={styles.noteText}>
          Apps you consciously installed are not flagged regardless of permissions
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },
  header: { padding: 20, paddingTop: 28 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#666', fontSize: 13, marginTop: 4, lineHeight: 18 },
  summaryBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#0d1117',
  },
  summaryText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: '#0d1117', borderRadius: 12, padding: 12, marginBottom: 4 },
  cardSuspicious: { borderWidth: 1, borderColor: '#FF980044', backgroundColor: '#140800' },
  cardRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cardBody: { flex: 1 },
  shieldClean: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: '900',
    width: 24,
    textAlign: 'center',
    marginTop: 1,
  },
  shieldWarn: {
    color: '#FF9800',
    fontSize: 20,
    fontWeight: '900',
    width: 24,
    textAlign: 'center',
    marginTop: 1,
  },
  appName: { color: '#e8eaed', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  packageName: { color: '#555', fontSize: 11, marginBottom: 4 },
  cleanLabel: { color: '#4CAF50', fontSize: 12 },
  warnText: { color: '#FF9800', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  questionText: { color: '#aaa', fontSize: 12, fontStyle: 'italic', marginBottom: 6 },
  stalkerCard: {
    backgroundColor: '#1a0000',
    borderWidth: 1,
    borderColor: '#f44336',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  stalkerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stalkerIcon: { color: '#f44336', fontSize: 18, fontWeight: '900' },
  stalkerTitle: { color: '#f44336', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  stalkerAppName: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  stalkerPkg: { color: '#555', fontSize: 11, marginBottom: 8 },
  stalkerDesc: { color: '#ef9a9a', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  inhibitNote: { backgroundColor: '#0d1f2d', borderRadius: 6, padding: 8 },
  inhibitText: { color: '#64b5f6', fontSize: 12 },
  noteBox: {
    margin: 16,
    marginBottom: 36,
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
  },
  noteText: { color: '#555', fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
});
