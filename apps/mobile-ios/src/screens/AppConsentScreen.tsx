/**
 * App Scope Monitor — A2
 * Shows installed apps validated against their stated category purpose.
 * Philosophy: only excess scope is flagged, not consciously-granted permissions.
 */

import {
  validateConsent,
  type ConsentValidation,
  AppPermissions,
} from '@ankrshield/android-monitor';
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';

// ---------------------------------------------------------------------------
// Mock data — real app populates these from the native PackageManager bridge
// ---------------------------------------------------------------------------

const MOCK_APPS: AppPermissions[] = [
  {
    packageName: 'com.whatsapp',
    appName: 'WhatsApp',
    installSource: 'play_store',
    isSystemApp: false,
    permissions: [
      'READ_CONTACTS',
      'WRITE_CONTACTS',
      'RECORD_AUDIO',
      'CAMERA',
      'ACCESS_FINE_LOCATION',
      'READ_EXTERNAL_STORAGE',
      'RECEIVE_BOOT_COMPLETED',
    ],
  },
  {
    packageName: 'com.android.chrome',
    appName: 'Chrome',
    installSource: 'play_store',
    isSystemApp: false,
    permissions: ['CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION'],
  },
  {
    packageName: 'com.superclean.booster',
    appName: 'Super Cleaner Pro',
    installSource: 'unknown',
    isSystemApp: false,
    permissions: [
      'READ_SMS',
      'READ_CONTACTS',
      'ACCESS_FINE_LOCATION',
      'RECORD_AUDIO',
      'READ_CALL_LOG',
      'SYSTEM_ALERT_WINDOW',
    ],
  },
  {
    packageName: 'com.flashlight.turbo',
    appName: 'Flashlight Turbo',
    installSource: 'file_manager',
    isSystemApp: false,
    permissions: ['READ_SMS', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS', 'RECORD_AUDIO'],
  },
  {
    packageName: 'com.hdfc.mobilebanking',
    appName: 'HDFC MobileBanking',
    installSource: 'play_store',
    isSystemApp: false,
    permissions: ['CAMERA', 'READ_PHONE_STATE', 'RECEIVE_SMS', 'READ_SMS', 'ACCESS_FINE_LOCATION'],
  },
  {
    packageName: 'com.netflix.mediaclient',
    appName: 'Netflix',
    installSource: 'play_store',
    isSystemApp: false,
    permissions: ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'],
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SEVERITY_COLORS = { critical: '#f44336', warning: '#FF9800', info: '#607D8B' };

function ScoreBar({ score }: { score: number }) {
  const color = score > 80 ? '#4CAF50' : score >= 50 ? '#FF9800' : '#f44336';
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>Trust score</Text>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${score}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreNum, { color }]}>{score}</Text>
    </View>
  );
}

function AppCard({ validation }: { validation: ConsentValidation }) {
  const [inhibited, setInhibited] = useState(false);
  const {
    appName,
    detectedCategory,
    legitimatePermissions,
    excessPermissions,
    consentScore,
    summary,
  } = validation;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.appName}>{appName}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {detectedCategory.toUpperCase().replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Legitimate scope */}
      <Text style={styles.legitimateRow}>
        {legitimatePermissions.length} permission{legitimatePermissions.length !== 1 ? 's' : ''}{' '}
        match its purpose
      </Text>

      {/* Excess permissions */}
      {excessPermissions.length > 0 && (
        <View style={styles.excessSection}>
          <Text style={styles.excessTitle}>Excess scope ({excessPermissions.length})</Text>
          {excessPermissions.map((ep) => (
            <View key={ep.permission} style={styles.excessRow}>
              <View
                style={[
                  styles.severityBadge,
                  {
                    backgroundColor: SEVERITY_COLORS[ep.severity] + '22',
                    borderColor: SEVERITY_COLORS[ep.severity],
                  },
                ]}
              >
                <Text style={[styles.severityText, { color: SEVERITY_COLORS[ep.severity] }]}>
                  {ep.severity.toUpperCase()}
                </Text>
              </View>
              <View style={styles.excessBody}>
                <Text style={styles.excessPerm}>{ep.permission}</Text>
                <Text style={styles.excessReason}>{ep.reason}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Score bar */}
      <ScoreBar score={consentScore} />

      {/* Summary */}
      <Text style={styles.summary}>{summary}</Text>

      {/* Inhibit toggle */}
      <View style={styles.inhibitRow}>
        <View style={styles.inhibitLeft}>
          <Text style={styles.inhibitLabel}>Inhibit Excess Scope</Text>
          {inhibited && (
            <Text style={styles.inhibitNote}>
              Excess network calls from this app will be blocked
            </Text>
          )}
        </View>
        <Switch
          value={inhibited}
          onValueChange={setInhibited}
          trackColor={{ false: '#333', true: '#1565C044' }}
          thumbColor={inhibited ? '#1565C0' : '#555'}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function AppConsentScreen() {
  const validations = MOCK_APPS.map((app) => validateConsent(app));
  const excessCount = validations.filter((v) => v.excessPermissions.length > 0).length;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>App Scope Monitor</Text>
        <Text style={styles.headerSub}>Apps using permissions beyond their purpose</Text>
      </View>

      {/* Summary bar */}
      <View style={[styles.summaryBar, { borderColor: excessCount > 0 ? '#FF9800' : '#4CAF50' }]}>
        <Text style={[styles.summaryText, { color: excessCount > 0 ? '#FF9800' : '#4CAF50' }]}>
          {excessCount} of {validations.length} apps have excess scope
        </Text>
      </View>

      {/* App cards */}
      <View style={styles.list}>
        {validations.map((v) => (
          <AppCard key={v.packageName} validation={v} />
        ))}
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
  headerSub: { color: '#666', fontSize: 13, marginTop: 4 },
  summaryBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#0d1117',
  },
  summaryText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#0d1117', borderRadius: 12, padding: 14, marginBottom: 4 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  appName: { color: '#e8eaed', fontSize: 16, fontWeight: '700' },
  categoryBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  categoryText: { color: '#64b5f6', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  legitimateRow: { color: '#4CAF50', fontSize: 12, marginBottom: 10 },
  excessSection: { backgroundColor: '#140a00', borderRadius: 8, padding: 10, marginBottom: 10 },
  excessTitle: {
    color: '#FF9800',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  excessRow: { flexDirection: 'row', marginBottom: 8, gap: 8, alignItems: 'flex-start' },
  severityBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 1,
  },
  severityText: { fontSize: 9, fontWeight: '700' },
  excessBody: { flex: 1 },
  excessPerm: { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 1 },
  excessReason: { color: '#888', fontSize: 11, lineHeight: 15 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  scoreLabel: { color: '#666', fontSize: 11, width: 68 },
  scoreTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreFill: { height: 4, borderRadius: 2 },
  scoreNum: { fontSize: 12, fontWeight: '700', width: 28, textAlign: 'right' },
  summary: { color: '#888', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  inhibitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  inhibitLeft: { flex: 1, marginRight: 8 },
  inhibitLabel: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  inhibitNote: { color: '#1565C0', fontSize: 11, marginTop: 3 },
});
