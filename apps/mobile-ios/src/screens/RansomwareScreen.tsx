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

const { RansomwareWatcher } = NativeModules;

interface RansomAlert {
  id: string;
  type: 'ransom_note' | 'encrypted_file' | 'burst';
  filePath: string;
  details: string;
  ts: number;
}

const ALERT_META: Record<string, { icon: string; color: string; title: string }> = {
  ransom_note: {
    icon: '📄',
    color: '#ef4444',
    title: 'Ransom Note Detected',
  },
  encrypted_file: {
    icon: '🔒',
    color: '#f97316',
    title: 'Encrypted File Extension',
  },
  burst: {
    icon: '⚡',
    color: '#eab308',
    title: 'Rapid Encryption Burst',
  },
};

let _alertId = 0;

export function RansomwareScreen() {
  const [alerts, setAlerts] = useState<RansomAlert[]>([]);
  const [watching, setWatching] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !RansomwareWatcher) return;

    // Load existing alert history
    RansomwareWatcher.getAlertHistory()
      .then((history: any[]) => {
        const loaded = (history ?? []).map((h: any) => ({
          id: String(++_alertId),
          type: h.type ?? 'encrypted_file',
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
        filePath: ev.filePath ?? '',
        details: ev.details ?? '',
        ts: Date.now(),
      };
      setAlerts((prev) => [alert, ...prev]);
    });

    return () => sub.remove();
  }, []);

  async function handleToggle() {
    if (!RansomwareWatcher || starting) return;
    setStarting(true);
    try {
      if (watching) {
        await RansomwareWatcher.stopWatcher();
        setWatching(false);
      } else {
        await RansomwareWatcher.startWatcher();
        setWatching(true);
      }
    } catch (_e) {
      // Permission or service error — leave state unchanged
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
              return (
                <View key={a.id} style={[s.alertCard, { borderLeftColor: meta.color }]}>
                  <View style={s.alertHeader}>
                    <Text style={s.alertIcon}>{meta.icon}</Text>
                    <Text style={[s.alertTitle, { color: meta.color }]}>{meta.title}</Text>
                    <Text style={s.alertTime}>
                      {new Date(a.ts).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={s.alertDetails}>{a.details}</Text>
                  <Text style={s.alertPath} numberOfLines={2}>
                    {a.filePath}
                  </Text>
                </View>
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
  alertCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#1a0a0a',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 12,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  alertIcon: { fontSize: 18 },
  alertTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  alertTime: { color: '#4b5563', fontSize: 11 },
  alertDetails: { color: '#d1d5db', fontSize: 12, marginBottom: 4 },
  alertPath: { color: '#4b5563', fontSize: 10, fontFamily: 'monospace' },

  noticeBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  noticeIcon: { fontSize: 48, marginBottom: 16 },
  noticeText: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
