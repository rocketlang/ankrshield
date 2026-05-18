/**
 * AV Scanner Screen
 * Checks installed apps against SHA-256 IOC database + optional VirusTotal API.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  NativeEventEmitter,
  NativeModules,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { AvScanner } = NativeModules;

interface ScanResult {
  packageName: string;
  appName: string;
  sha256: string;
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  vtMalicious: number;
  vtTotal: number;
  reason: string;
}

interface ScanProgress {
  current: number;
  total: number;
  appName: string;
}

const VERDICT_CONFIG = {
  malicious: { color: '#ef4444', bg: '#1a0000', icon: '☠️', label: 'Malicious' },
  suspicious: { color: '#f59e0b', bg: '#1a0e00', icon: '⚠️', label: 'Suspicious' },
  unknown: { color: '#64748b', bg: '#0d1117', icon: '❓', label: 'Unknown' },
  clean: { color: '#22c55e', bg: '#001a06', icon: '✅', label: 'Clean' },
};

function ResultCard({ item }: { item: ScanResult }) {
  const cfg = VERDICT_CONFIG[item.verdict] ?? VERDICT_CONFIG.clean;
  return (
    <View style={[s.card, { backgroundColor: cfg.bg, borderLeftColor: cfg.color }]}>
      <View style={s.cardHeader}>
        <Text style={s.appName} numberOfLines={1}>
          {item.appName}
        </Text>
        <View
          style={[s.verdictBadge, { backgroundColor: cfg.color + '22', borderColor: cfg.color }]}
        >
          <Text style={[s.verdictText, { color: cfg.color }]}>
            {cfg.icon} {cfg.label}
          </Text>
        </View>
      </View>
      <Text style={s.pkgName} numberOfLines={1}>
        {item.packageName}
      </Text>
      <Text style={s.reasonText}>{item.reason}</Text>
      {item.vtTotal > 0 && (
        <Text style={s.vtText}>
          VirusTotal: {item.vtMalicious}/{item.vtTotal} engines
        </Text>
      )}
    </View>
  );
}

export function AvScannerScreen() {
  const [vtApiKey, setVtApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scannedOnce, setScannedOnce] = useState(false);
  const emitterRef = useRef<NativeEventEmitter | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !AvScanner) return;
    emitterRef.current = new NativeEventEmitter(AvScanner);

    const subProgress = emitterRef.current.addListener('AvScanProgress', (ev: ScanProgress) =>
      setProgress(ev)
    );
    const subComplete = emitterRef.current.addListener('AvScanComplete', () => {
      setScanning(false);
      setProgress(null);
      setScannedOnce(true);
    });

    return () => {
      subProgress.remove();
      subComplete.remove();
    };
  }, []);

  const startScan = useCallback(async () => {
    if (!AvScanner) return;
    setScanning(true);
    setResults([]);
    setProgress({ current: 0, total: 0, appName: 'Initialising…' });
    try {
      const raw: ScanResult[] = await AvScanner.startScan(vtApiKey.trim() || null);
      setResults(raw);
    } catch (_) {
      setScanning(false);
    }
  }, [vtApiKey]);

  const cancelScan = useCallback(() => {
    AvScanner?.cancelScan?.();
  }, []);

  if (Platform.OS !== 'android') {
    return (
      <View style={s.center}>
        <Text style={s.unavail}>AV Scanner is available on Android only.</Text>
      </View>
    );
  }

  // Derived counts
  const maliciousCount = results.filter((r) => r.verdict === 'malicious').length;
  const suspiciousCount = results.filter((r) => r.verdict === 'suspicious').length;
  const cleanCount = results.filter((r) => r.verdict === 'clean').length;

  // Sort: malicious first, then suspicious, then unknown, then clean
  const VERDICT_ORDER = { malicious: 0, suspicious: 1, unknown: 2, clean: 3 };
  const sorted = [...results].sort(
    (a, b) => (VERDICT_ORDER[a.verdict] ?? 3) - (VERDICT_ORDER[b.verdict] ?? 3)
  );

  const pct =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>🔬 AV Scanner</Text>
        <Text style={s.subtitle}>Checks installed apps against malware databases</Text>
      </View>

      {/* VT key toggle */}
      <View style={s.keySection}>
        <TouchableOpacity style={s.keyToggle} onPress={() => setShowKeyInput((v) => !v)}>
          <Text style={s.keyToggleText}>
            {vtApiKey ? '🔑 VirusTotal key set' : '+ Add VirusTotal API key (optional)'}
          </Text>
          <Text style={s.keyToggleChevron}>{showKeyInput ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showKeyInput && (
          <View style={s.keyInputWrap}>
            <TextInput
              style={s.keyInput}
              placeholder="Paste your free VT API key here"
              placeholderTextColor="#475569"
              value={vtApiKey}
              onChangeText={setVtApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={false}
            />
            <Text style={s.keyHint}>
              Free key: virustotal.com → Sign up → API key (4 lookups/min)
            </Text>
          </View>
        )}
      </View>

      {/* Scan / Cancel button */}
      <View style={s.btnRow}>
        {!scanning ? (
          <TouchableOpacity style={s.scanBtn} onPress={startScan}>
            <Text style={s.scanBtnText}>
              {scannedOnce ? '↺ Re-scan Apps' : '▶ Scan Installed Apps'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.cancelBtn} onPress={cancelScan}>
            <Text style={s.cancelBtnText}>✕ Cancel Scan</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress */}
      {scanning && progress && (
        <View style={s.progressBox}>
          <View style={s.progressBarBg}>
            <View style={[s.progressBarFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.progressLabel}>
            {progress.current}/{progress.total} — {progress.appName}
          </Text>
        </View>
      )}

      {/* Summary chips */}
      {scannedOnce && !scanning && (
        <View style={s.summaryRow}>
          <View style={[s.chip, { borderColor: '#ef4444' }]}>
            <Text style={[s.chipCount, { color: '#ef4444' }]}>{maliciousCount}</Text>
            <Text style={s.chipLabel}>malicious</Text>
          </View>
          <View style={[s.chip, { borderColor: '#f59e0b' }]}>
            <Text style={[s.chipCount, { color: '#f59e0b' }]}>{suspiciousCount}</Text>
            <Text style={s.chipLabel}>suspicious</Text>
          </View>
          <View style={[s.chip, { borderColor: '#22c55e' }]}>
            <Text style={[s.chipCount, { color: '#22c55e' }]}>{cleanCount}</Text>
            <Text style={s.chipLabel}>clean</Text>
          </View>
          <View style={[s.chip, { borderColor: '#1e293b' }]}>
            <Text style={[s.chipCount, { color: '#94a3b8' }]}>{results.length}</Text>
            <Text style={s.chipLabel}>total</Text>
          </View>
        </View>
      )}

      {/* Empty state */}
      {!scanning && !scannedOnce && (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🔬</Text>
          <Text style={s.emptyTitle}>Ready to scan</Text>
          <Text style={s.emptyBody}>
            Checks every installed app against known malware hashes.{'\n'}
            Add a free VirusTotal key for cloud-backed detection.
          </Text>
          <View style={s.bulletBox}>
            <Text style={s.bullet}>• No APK data leaves your device — only SHA-256 hashes</Text>
            <Text style={s.bullet}>• System apps are excluded from the scan</Text>
            <Text style={s.bullet}>• Scan takes 30–120 seconds depending on app count</Text>
          </View>
        </View>
      )}

      {/* Results list */}
      {sorted.length > 0 && (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.packageName}
          style={s.list}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          renderItem={({ item }) => <ResultCard item={item} />}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          removeClippedSubviews
          ListHeaderComponent={
            maliciousCount > 0 ? (
              <View style={s.threatBanner}>
                <Text style={s.threatBannerText}>
                  ☠️ {maliciousCount} malicious app{maliciousCount > 1 ? 's' : ''} found — uninstall
                  immediately
                </Text>
              </View>
            ) : suspiciousCount > 0 ? (
              <View style={s.warnBanner}>
                <Text style={s.warnBannerText}>
                  ⚠️ {suspiciousCount} suspicious app{suspiciousCount > 1 ? 's' : ''} — review
                  carefully
                </Text>
              </View>
            ) : (
              <View style={s.cleanBanner}>
                <Text style={s.cleanBannerText}>✅ All {cleanCount} apps are clean</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0a0a0a',
  },
  unavail: { color: '#64748b', fontSize: 14, textAlign: 'center' },

  header: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 3 },

  keySection: {
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  keyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  keyToggleText: { color: '#60a5fa', fontSize: 13 },
  keyToggleChevron: { color: '#60a5fa', fontSize: 11 },
  keyInputWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  keyInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e2e8f0',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  keyHint: { color: '#475569', fontSize: 11, marginTop: 6 },

  btnRow: {
    padding: 16,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  scanBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    backgroundColor: '#1c1917',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },

  progressBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#22c55e',
    borderRadius: 2,
  },
  progressLabel: { color: '#64748b', fontSize: 12 },

  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#080c14',
  },
  chipCount: { fontSize: 20, fontWeight: '800' },
  chipLabel: { color: '#475569', fontSize: 10, marginTop: 2 },

  emptyBox: { flex: 1, alignItems: 'center', padding: 28 },
  emptyIcon: { fontSize: 56, marginTop: 40, marginBottom: 12 },
  emptyTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  bulletBox: {
    alignSelf: 'stretch',
    backgroundColor: '#0d1117',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  bullet: { color: '#475569', fontSize: 13, lineHeight: 20 },

  list: { flex: 1 },

  card: {
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    marginTop: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  appName: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', flex: 1 },
  verdictBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verdictText: { fontSize: 11, fontWeight: '700' },
  pkgName: { color: '#475569', fontSize: 11, marginBottom: 4, fontFamily: 'monospace' },
  reasonText: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  vtText: { color: '#64748b', fontSize: 11, marginTop: 4 },

  threatBanner: {
    backgroundColor: '#1a0000',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  threatBannerText: { color: '#ef4444', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  warnBanner: {
    backgroundColor: '#1a0e00',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  warnBannerText: { color: '#f59e0b', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cleanBanner: {
    backgroundColor: '#001a06',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  cleanBannerText: { color: '#22c55e', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
