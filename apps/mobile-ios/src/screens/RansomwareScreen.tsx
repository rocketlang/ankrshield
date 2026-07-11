/**
 * RansomwareScreen — P2-1
 * Real-time ransomware detection feed from RansomwareWatcherService.
 * Shows alerts for encrypted extensions, ransom notes, and rename bursts.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  Platform,
  ActivityIndicator,
} from 'react-native';

import { RemedyCard, type Severity } from '../components/RemedyCard';
import { DebugLog } from '../services/DebugLog';

const { RansomwareWatcher } = NativeModules;

interface RansomAlert {
  id: string;
  type: 'ransom_note' | 'encrypted_file' | 'burst';
  severity: Severity;
  filePath: string;
  details: string;
  ts: number;
}

const ALERT_META: Record<string, { icon: string; title: string }> = {
  ransom_note: { icon: '📄', title: 'Ransom Note Detected' },
  encrypted_file: { icon: '🔒', title: 'Encrypted File Extension' },
  burst: { icon: '⚡', title: 'Rapid Encryption Burst' },
};

// A file's parent directory — what "Ignore this folder" silences.
function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : path;
}

let _alertId = 0;

export function RansomwareScreen({ navigation }: any) {
  const [alerts, setAlerts] = useState<RansomAlert[]>([]);
  const [watching, setWatching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !RansomwareWatcher) {
      return;
    }

    // Load existing alert history
    RansomwareWatcher.getAlertHistory()
      .then((history: any[]) => {
        const loaded = (history ?? []).map((h: any) => ({
          id: String(++_alertId),
          type: h.type ?? 'encrypted_file',
          severity: (h.severity ?? 'critical') as Severity,
          filePath: h.filePath ?? '',
          details: h.details ?? '',
          ts: h.ts ?? Date.now(),
        }));
        setAlerts(loaded);
      })
      .catch(() => {});

    RansomwareWatcher.isRunning()
      .then((r: boolean) => setWatching(r))
      .catch(() => {});

    const emitter = new NativeEventEmitter(RansomwareWatcher);
    const sub = emitter.addListener('RansomwareAlert', (ev: any) => {
      const alert: RansomAlert = {
        id: String(++_alertId),
        type: ev.type ?? 'encrypted_file',
        severity: (ev.severity ?? 'critical') as Severity,
        filePath: ev.filePath ?? '',
        details: ev.details ?? '',
        ts: Date.now(),
      };
      setAlerts((prev) => [alert, ...prev]);
    });

    // A remedy applied from the notification (app was closed) — reconcile the feed.
    const remedySub = emitter.addListener('RansomwareRemedyApplied', (ev: any) => {
      if (ev?.remedy === 'ignore_dir' && ev.dir) {
        setAlerts((prev) => prev.filter((a) => !a.filePath.startsWith(ev.dir)));
      }
    });

    return () => {
      sub.remove();
      remedySub.remove();
    };
  }, []);

  // ── Remedies (founder law: every alert carries an action) ──────────────────
  async function ignoreFolder(a: RansomAlert) {
    const dir = parentDir(a.filePath);
    try {
      await RansomwareWatcher.ignoreDir(dir);
      // Drop every alert under that folder from the feed.
      setAlerts((prev) => prev.filter((x) => !x.filePath.startsWith(dir)));
      DebugLog.log('Ransomware', `ignored folder ${dir}`);
    } catch (e: any) {
      DebugLog.error('Ransomware', 'ignoreDir failed:', e?.message || String(e));
    }
  }

  function reviewApps() {
    // We can't attribute the writing app from a file event — hand the user the
    // installed-app list where they can force-stop / uninstall a culprit.
    navigation?.navigate?.('AndroidMonitor');
  }

  function dismiss(a: RansomAlert) {
    setAlerts((prev) => prev.filter((x) => x.id !== a.id));
  }

  async function handleToggle() {
    if (!RansomwareWatcher || starting) {
      return;
    }
    setStarting(true);
    setLastError(null);
    try {
      if (watching) {
        await RansomwareWatcher.stopWatcher();
        setWatching(false);
      } else {
        await RansomwareWatcher.startWatcher();
        // Re-read the real service state instead of assuming it started — on
        // Android 14 the service can reject the foreground start.
        const running = await RansomwareWatcher.isRunning().catch(() => true);
        setWatching(running);
        DebugLog.log(
          'Ransomware',
          running ? 'watcher started' : 'startWatcher returned not-running'
        );
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLastError(msg);
      DebugLog.error('Ransomware', 'toggle failed:', msg);
    } finally {
      setStarting(false);
    }
  }

  if (Platform.OS !== 'android') {
    return (
      <View style={s.container}>
        <View style={s.noticeBox}>
          <Text style={s.noticeIcon}>🤖</Text>
          <Text style={s.noticeText}>
            Ransomware monitoring requires Android's FileObserver API and is not available on iOS.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Status bar */}
      <View style={[s.statusBar, watching ? s.statusOn : s.statusOff]}>
        <View style={s.statusLeft}>
          <Text style={s.statusIcon}>{watching ? '🛡' : '○'}</Text>
          <View>
            <Text style={s.statusTitle}>
              {watching ? 'Ransomware Watch Active' : 'Watcher Inactive'}
            </Text>
            <Text style={s.statusSub}>
              {watching
                ? 'Monitoring Documents, Downloads, DCIM, WhatsApp'
                : 'Start to monitor file system for encryption activity'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.toggleBtn, watching ? s.toggleOff : s.toggleOn]}
          onPress={handleToggle}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.toggleTxt}>{watching ? 'Stop' : 'Start'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Inline failure reason — so a tester sees WHY Start didn't take. */}
      {lastError && (
        <View style={s.errBox}>
          <Text style={s.errTxt} selectable>
            Couldn&apos;t start: {lastError}
          </Text>
        </View>
      )}

      {/* How it works info */}
      <View style={s.infoRow}>
        <Text style={s.infoItem}>🔒 Detects .locked/.encrypted files</Text>
        <Text style={s.infoItem}>📄 Finds ransom notes (README, DECRYPT)</Text>
        <Text style={s.infoItem}>⚡ Alerts on rapid rename bursts (20+ in 30s)</Text>
      </View>

      {/* Alert feed */}
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingVertical: 10 }}>
        {alerts.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>✅</Text>
            <Text style={s.emptyTitle}>No ransomware activity detected</Text>
            <Text style={s.emptySub}>
              {watching
                ? 'File system is clean — monitoring continues in background.'
                : 'Start the watcher to monitor your storage in real time.'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.feedHeader}>
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''} detected
            </Text>
            {alerts.map((a) => {
              const meta = ALERT_META[a.type] ?? ALERT_META.encrypted_file;
              // Every alert carries a remedy. Advisory (benign path): ignore or
              // dismiss. Critical: ignore the folder or go review installed apps.
              const remedies =
                a.severity === 'advisory'
                  ? [
                      {
                        label: 'Ignore this folder',
                        kind: 'primary' as const,
                        onPress: () => ignoreFolder(a),
                      },
                      { label: 'Dismiss', kind: 'neutral' as const, onPress: () => dismiss(a) },
                    ]
                  : [
                      { label: 'Review apps', kind: 'primary' as const, onPress: reviewApps },
                      {
                        label: 'Ignore this folder',
                        kind: 'neutral' as const,
                        onPress: () => ignoreFolder(a),
                      },
                    ];
              return (
                <RemedyCard
                  key={a.id}
                  icon={meta.icon}
                  title={meta.title}
                  severity={a.severity}
                  detail={a.details}
                  subPath={a.filePath}
                  remedies={remedies}
                />
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  statusOn: { backgroundColor: '#052e16', borderBottomColor: '#166534' },
  statusOff: { backgroundColor: '#1c1917', borderBottomColor: '#292524' },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  statusIcon: { fontSize: 24 },
  statusTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  statusSub: { color: '#6b7280', fontSize: 11, marginTop: 2, flexShrink: 1 },
  toggleBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 60,
    alignItems: 'center',
  },
  toggleOn: { backgroundColor: '#16a34a' },
  toggleOff: { backgroundColor: '#7f1d1d' },
  toggleTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  errBox: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: '#2a0a0a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    padding: 10,
  },
  errTxt: { color: '#fca5a5', fontSize: 12, fontFamily: 'monospace' },
  infoRow: {
    padding: 12,
    gap: 4,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  infoItem: { color: '#555', fontSize: 12 },

  scroll: { flex: 1 },

  emptyBox: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 56, marginBottom: 14 },
  emptyTitle: { color: '#4ade80', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  feedHeader: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  noticeBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  noticeIcon: { fontSize: 48, marginBottom: 16 },
  noticeText: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
