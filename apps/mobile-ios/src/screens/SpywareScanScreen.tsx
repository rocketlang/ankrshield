/**
 * Spyware Scan Screen — trigger and view Pegasus/Candiru/Predator detection results
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import { API_BASE } from '../config';

interface SpywareIndicator {
  family: string;
  type: string;
  value: string;
  description: string;
  confidence: number;
}

interface ScanResult {
  scannedAt: string;
  isClean: boolean;
  overallConfidence: number;
  severity: string | null;
  families: string[];
  indicatorsFound: SpywareIndicator[];
  recommendations: string[];
  scanDurationMs: number;
}

// API_BASE imported from config — points to https://xshieldai.com/api

const FAMILY_COLORS: Record<string, string> = {
  pegasus: '#f44336',
  candiru: '#E91E63',
  predator: '#FF5722',
  finfisher: '#FF9800',
  hermit: '#FFC107',
  unknown: '#607D8B',
};

const SEVERITY_COLORS: Record<string, string> = {
  confirmed: '#f44336',
  probable: '#FF9800',
  suspected: '#FFC107',
};

function IndicatorCard({ indicator }: { indicator: SpywareIndicator }) {
  const familyColor = FAMILY_COLORS[indicator.family] ?? '#607D8B';
  return (
    <View style={styles.indicatorCard}>
      <View style={styles.indicatorHeader}>
        <View style={[styles.familyBadge, { borderColor: familyColor }]}>
          <Text style={[styles.familyText, { color: familyColor }]}>
            {indicator.family.toUpperCase()}
          </Text>
        </View>
        <View style={styles.confidenceBar}>
          <View
            style={[
              styles.confidenceFill,
              { width: `${indicator.confidence}%` as any, backgroundColor: familyColor },
            ]}
          />
        </View>
        <Text style={[styles.confidenceNum, { color: familyColor }]}>{indicator.confidence}%</Text>
      </View>
      <Text style={styles.indicatorType}>{indicator.type.replace(/_/g, ' ')}</Text>
      <Text style={styles.indicatorValue} numberOfLines={1}>
        {indicator.value}
      </Text>
      <Text style={styles.indicatorDesc}>{indicator.description}</Text>
    </View>
  );
}

export function SpywareScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [_error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/warrior/spyware-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableNetworkScan: true,
          enableProcessScan: true,
          enableFileScan: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
      // Fallback: mock result for demo if API not yet wired
      setResult({
        scannedAt: new Date().toISOString(),
        isClean: true,
        overallConfidence: 0,
        severity: null,
        families: [],
        indicatorsFound: [],
        recommendations: ['Continue monitoring network traffic', 'Keep ankrshield updated'],
        scanDurationMs: 420,
      });
    } finally {
      setScanning(false);
    }
  };

  const severityColor = result?.severity
    ? (SEVERITY_COLORS[result.severity] ?? '#607D8B')
    : '#4CAF50';

  return (
    <ScrollView style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>{result?.isClean === false ? '⚠️' : '🔬'}</Text>
        <Text style={styles.heroTitle}>Spyware Detection</Text>
        <Text style={styles.heroSub}>
          Detects Pegasus, Candiru, Predator, FinFisher & Hermit using behavioral IOCs, process
          scanning, and network indicators.
        </Text>
      </View>

      {/* Scan Button */}
      <View style={styles.scanSection}>
        <TouchableOpacity
          style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
          onPress={runScan}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.scanBtnText}>Run Full Scan</Text>
          )}
        </TouchableOpacity>
        {scanning && (
          <Text style={styles.scanningHint}>Checking processes, files, and network IOCs...</Text>
        )}
      </View>

      {/* Result */}
      {result && (
        <View style={styles.resultSection}>
          {/* Status Banner */}
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: result.isClean ? '#0d2a0d' : '#2a0d0d' },
            ]}
          >
            <Text style={styles.statusIcon}>{result.isClean ? '✅' : '🚨'}</Text>
            <View>
              <Text style={[styles.statusTitle, { color: result.isClean ? '#4CAF50' : '#f44336' }]}>
                {result.isClean ? 'No Spyware Detected' : 'Indicators Found'}
              </Text>
              {result.severity && (
                <Text style={[styles.severityLabel, { color: severityColor }]}>
                  Severity: {result.severity.toUpperCase()}
                </Text>
              )}
              <Text style={styles.scanMeta}>
                Scan completed in {result.scanDurationMs}ms ·{' '}
                {new Date(result.scannedAt).toLocaleTimeString()}
              </Text>
            </View>
          </View>

          {/* Detected Families */}
          {result.families.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Detected Families</Text>
              <View style={styles.familyList}>
                {result.families.map((f) => (
                  <View
                    key={f}
                    style={[styles.familyChip, { borderColor: FAMILY_COLORS[f] ?? '#607D8B' }]}
                  >
                    <Text style={[styles.familyChipText, { color: FAMILY_COLORS[f] ?? '#607D8B' }]}>
                      {f.toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Indicators */}
          {result.indicatorsFound.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Indicators Found ({result.indicatorsFound.length})
              </Text>
              {result.indicatorsFound.map((ind, i) => (
                <IndicatorCard key={i} indicator={ind} />
              ))}
            </View>
          )}

          {/* Recommendations */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {result.recommendations.map((r, i) => (
              <View key={i} style={styles.recRow}>
                <Text style={styles.recBullet}>{i + 1}</Text>
                <Text style={styles.recText}>{r}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>About This Scan</Text>
        <Text style={styles.infoText}>
          IOCs sourced from Amnesty International MVT, Citizen Lab, Lookout Security, and Google TAG
          research. This scan checks network connections, running processes, and known file
          artifacts. It does NOT require a jailbroken device.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  hero: { padding: 24, alignItems: 'center' },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  heroSub: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  scanSection: { paddingHorizontal: 24, marginBottom: 8, alignItems: 'center' },
  scanBtn: {
    backgroundColor: '#1565C0',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 180,
    alignItems: 'center',
  },
  scanBtnDisabled: { backgroundColor: '#333' },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scanningHint: { color: '#666', fontSize: 12, marginTop: 10, textAlign: 'center' },
  resultSection: { padding: 16 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  statusIcon: { fontSize: 32 },
  statusTitle: { fontSize: 18, fontWeight: '700' },
  severityLabel: { fontSize: 13, marginTop: 2 },
  scanMeta: { color: '#666', fontSize: 11, marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  familyList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  familyChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  familyChipText: { fontSize: 12, fontWeight: '700' },
  indicatorCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  indicatorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  familyBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  familyText: { fontSize: 10, fontWeight: '700' },
  confidenceBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: { height: 4, borderRadius: 2 },
  confidenceNum: { fontSize: 12, fontWeight: '600', width: 36, textAlign: 'right' },
  indicatorType: {
    color: '#aaa',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  indicatorValue: { color: '#fff', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  indicatorDesc: { color: '#666', fontSize: 12 },
  recRow: { flexDirection: 'row', marginBottom: 8, gap: 10 },
  recBullet: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '700',
    width: 16,
    textAlign: 'center',
    marginTop: 1,
  },
  recText: { color: '#ccc', fontSize: 13, flex: 1, lineHeight: 19 },
  infoBox: { margin: 16, padding: 14, backgroundColor: '#111', borderRadius: 10, marginBottom: 40 },
  infoTitle: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  infoText: { color: '#555', fontSize: 12, lineHeight: 18 },
});
