/**
 * LogScreen — on-device diagnostic log viewer.
 * Shows the DebugLog ring buffer (newest first) so a tester can see what failed
 * when an "Enable" action doesn't take, then Share the text to the team.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';

import { DebugLog, type LogEntry } from '../services/DebugLog';

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: '#60a5fa',
  warn: '#fbbf24',
  error: '#f87171',
};

export function LogScreen() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => DebugLog.subscribe(setEntries), []);

  async function handleShare() {
    try {
      await Share.share({ message: DebugLog.toText(), title: 'AnkrShield diagnostic log' });
    } catch (_e) {
      // user cancelled — no-op
    }
  }

  return (
    <View style={s.container}>
      <View style={s.bar}>
        <Text style={s.barTitle}>Diagnostic Log · {entries.length}</Text>
        <View style={s.barBtns}>
          <TouchableOpacity style={s.btn} onPress={handleShare}>
            <Text style={s.btnTxt}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnClear]} onPress={() => DebugLog.clear()}>
            <Text style={s.btnTxt}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={s.hint}>
        Newest first. Tap an "Enable" tile, then come back here — any failure shows up with the
        exact reason. Use Share to send it to the team.
      </Text>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
        {entries.length === 0 ? (
          <Text style={s.empty}>No log entries yet.</Text>
        ) : (
          entries.map((e, i) => (
            <View key={`${e.ts}-${i}`} style={s.row}>
              <View style={s.rowHead}>
                <Text style={[s.level, { color: LEVEL_COLOR[e.level] }]}>
                  {e.level.toUpperCase()}
                </Text>
                <Text style={s.tag}>{e.tag}</Text>
                <Text style={s.time}>
                  {new Date(e.ts).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Text>
              </View>
              <Text style={s.msg} selectable>
                {e.msg}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  barTitle: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  barBtns: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  btnClear: { backgroundColor: '#3f1d1d' },
  btnTxt: { color: '#e2e8f0', fontSize: 12, fontWeight: '700' },
  hint: {
    color: '#4b5563',
    fontSize: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    lineHeight: 16,
  },
  scroll: { flex: 1, paddingHorizontal: 12 },
  empty: { color: '#4b5563', fontSize: 13, textAlign: 'center', paddingTop: 60 },
  row: {
    backgroundColor: '#141414',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1e293b',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  level: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tag: { color: '#94a3b8', fontSize: 11, fontWeight: '700', flex: 1 },
  time: { color: '#4b5563', fontSize: 10 },
  msg: { color: '#d1d5db', fontSize: 12, fontFamily: 'monospace', lineHeight: 17 },
});
