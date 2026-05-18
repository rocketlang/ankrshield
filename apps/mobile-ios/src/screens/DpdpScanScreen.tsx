/**
 * DPDP Scan Screen
 * Simulates device permission state and runs the DPDP Act 2023 compliance scanner.
 */

import { scanApp } from '@ankrshield/dpdp-scanner';
import type { DpdpCheckResult, DpdpViolation } from '@ankrshield/dpdp-scanner';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

// ─── Permission definitions ───────────────────────────────────────────────────

interface PermissionEntry {
  label: string;
  androidName: string; // maps to PERMISSION_CHECKS in scanner
  description: string;
}

const PERMISSIONS: PermissionEntry[] = [
  { label: 'Location', androidName: 'ACCESS_FINE_LOCATION', description: 'GPS / precise location' },
  { label: 'Camera', androidName: 'CAMERA', description: 'Take photos & videos' },
  { label: 'Microphone', androidName: 'RECORD_AUDIO', description: 'Record audio' },
  { label: 'Contacts', androidName: 'READ_CONTACTS', description: 'Read device contacts' },
  { label: 'SMS', androidName: 'READ_SMS', description: 'Read SMS messages' },
  { label: 'Storage', androidName: 'READ_EXTERNAL_STORAGE', description: 'Read files & media' },
  { label: 'Phone / Calls', androidName: 'READ_CALL_LOG', description: 'Access call history' },
];

// ─── Score colour ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#4ade80'; // green
  if (score >= 60) return '#fbbf24'; // yellow
  return '#f87171'; // red
}

function severityColor(severity: DpdpViolation['severity']): string {
  switch (severity) {
    case 'critical':
      return '#ef4444';
    case 'high':
      return '#f97316';
    case 'medium':
      return '#eab308';
    default:
      return '#6b7280';
  }
}

function complianceLabel(level: DpdpCheckResult['overallCompliance']): string {
  switch (level) {
    case 'compliant':
      return 'COMPLIANT';
    case 'partial':
      return 'PARTIALLY COMPLIANT';
    default:
      return 'NON-COMPLIANT';
  }
}

function complianceBg(level: DpdpCheckResult['overallCompliance']): string {
  switch (level) {
    case 'compliant':
      return '#14532d';
    case 'partial':
      return '#451a03';
    default:
      return '#450a0a';
  }
}

function complianceText(level: DpdpCheckResult['overallCompliance']): string {
  switch (level) {
    case 'compliant':
      return '#4ade80';
    case 'partial':
      return '#fbbf24';
    default:
      return '#fca5a5';
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function DpdpScanScreen() {
  // Track which permissions are "granted"
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<DpdpCheckResult | null>(null);

  function togglePermission(androidName: string, value: boolean) {
    setGranted((prev) => ({ ...prev, [androidName]: value }));
    // Clear results when permissions change
    setResult(null);
  }

  function grantedPermissions(): string[] {
    return PERMISSIONS.filter((p) => granted[p.androidName]).map((p) => p.androidName);
  }

  function handleScan() {
    const activePermissions = grantedPermissions();
    const res = scanApp({
      appName: 'AnkrShield',
      packageName: 'com.ankrshield.app',
      permissions: activePermissions,
      hasPrivacyPolicy: true,
      hasDataDeletion: true,
      targetsChildren: false,
      crossBorderTransfer: false,
    });
    setResult(res);
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>DPDP Compliance</Text>
      <Text style={styles.subheading}>
        Toggle the permissions your app uses, then scan for Digital Personal Data Protection Act
        2023 violations.
      </Text>

      {/* Permission toggles */}
      <View style={styles.permissionsCard}>
        <Text style={styles.cardTitle}>Device Permissions</Text>
        {PERMISSIONS.map((perm) => (
          <View key={perm.androidName} style={styles.permissionRow}>
            <View style={styles.permissionInfo}>
              <Text style={styles.permissionLabel}>{perm.label}</Text>
              <Text style={styles.permissionDesc}>{perm.description}</Text>
            </View>
            <Switch
              value={!!granted[perm.androidName]}
              onValueChange={(v) => togglePermission(perm.androidName, v)}
              trackColor={{ false: '#1f2937', true: '#1d4ed8' }}
              thumbColor={granted[perm.androidName] ? '#60a5fa' : '#6b7280'}
            />
          </View>
        ))}
      </View>

      {/* Scan button */}
      <TouchableOpacity style={styles.scanBtn} onPress={handleScan}>
        <Text style={styles.scanBtnText}>Scan DPDP Compliance</Text>
      </TouchableOpacity>

      {/* Results */}
      {result && (
        <View style={styles.resultCard}>
          {/* Compliance badge */}
          <View style={[styles.badge, { backgroundColor: complianceBg(result.overallCompliance) }]}>
            <Text style={[styles.badgeText, { color: complianceText(result.overallCompliance) }]}>
              {complianceLabel(result.overallCompliance)}
            </Text>
          </View>

          {/* Score */}
          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Compliance Score</Text>
            <Text style={[styles.scoreValue, { color: scoreColor(result.score) }]}>
              {result.score}/100
            </Text>
          </View>

          {/* Violations */}
          {result.violations.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Violations Found ({result.violations.length})</Text>
              {result.violations.map((v, i) => (
                <View key={i} style={styles.violationCard}>
                  <View style={styles.violationHeader}>
                    <Text style={[styles.violationSection, { color: severityColor(v.severity) }]}>
                      {v.section}
                    </Text>
                    <View
                      style={[
                        styles.severityPill,
                        { backgroundColor: severityColor(v.severity) + '22' },
                      ]}
                    >
                      <Text style={[styles.severityText, { color: severityColor(v.severity) }]}>
                        {v.severity.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {v.permission && <Text style={styles.permissionName}>{v.permission}</Text>}
                  <Text style={styles.violationDesc}>{v.description}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noViolations}>
              <Text style={styles.noViolationsText}>No violations found</Text>
            </View>
          )}

          {/* Requirements checklist */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Requirements Checklist</Text>
            {result.requirements.map((req, i) => (
              <View key={i} style={styles.requirementRow}>
                <Text style={styles.requirementIcon}>
                  {req.status === 'met' ? '✓' : req.status === 'unmet' ? '✗' : '?'}
                </Text>
                <View style={styles.requirementInfo}>
                  <Text
                    style={[
                      styles.requirementName,
                      {
                        color:
                          req.status === 'met'
                            ? '#4ade80'
                            : req.status === 'unmet'
                              ? '#f87171'
                              : '#9ca3af',
                      },
                    ]}
                  >
                    {req.requirement}
                  </Text>
                  <Text style={styles.requirementDetails}>{req.details}</Text>
                </View>
              </View>
            ))}
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
  subheading: { color: '#6b7280', fontSize: 13, lineHeight: 18, marginBottom: 20 },
  permissionsCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 12 },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  permissionInfo: { flex: 1, marginRight: 12 },
  permissionLabel: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  permissionDesc: { color: '#4b5563', fontSize: 11, marginTop: 2 },
  scanBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    gap: 14,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel: { color: '#9ca3af', fontSize: 13 },
  scoreValue: { fontSize: 24, fontWeight: '800' },
  section: { gap: 8 },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  violationCard: {
    backgroundColor: '#0a0f1e',
    borderRadius: 8,
    padding: 12,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  violationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  violationSection: { fontSize: 13, fontWeight: '700' },
  severityPill: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  severityText: { fontSize: 10, fontWeight: '700' },
  permissionName: { color: '#60a5fa', fontSize: 11, fontFamily: 'monospace' },
  violationDesc: { color: '#6b7280', fontSize: 12, lineHeight: 17 },
  noViolations: {
    backgroundColor: '#14532d',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  noViolationsText: { color: '#4ade80', fontWeight: '700', fontSize: 13 },
  requirementRow: { flexDirection: 'row', gap: 8 },
  requirementIcon: {
    fontSize: 14,
    fontWeight: '800',
    width: 16,
    textAlign: 'center',
    marginTop: 1,
  },
  requirementInfo: { flex: 1 },
  requirementName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  requirementDetails: { color: '#4b5563', fontSize: 11, lineHeight: 15 },
  bottomPad: { height: 40 },
});
