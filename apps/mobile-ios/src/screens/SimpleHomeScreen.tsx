/**
 * SimpleHomeScreen — the front door for a normal person (not a tester).
 *
 * Founder brief (2026-07-10): "a user needs simplicity… same simplicity without
 * hampering the app but ensuring no overreach. A simple mode, yet complexity
 * underneath. Then a complete tech-enabled mode toggle."
 *
 * One switch. One honest number. Apps just work (banking/UPI/dev auto-bypassed
 * underneath by Intelligent mode). Complexity is not removed — it is compiled
 * into one calm truth, the ANKR way. Every number here is a real counter from
 * the shield (compute), never invented.
 *
 * "Advanced" reveals the full tester interface (Tech Mode) and persists the choice.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { MdmStorage } from '../mdm/storage';
import { syncBlocklist } from '../services/ioc-sync';
import { buildScopeReport } from '../services/ScopeService';
import { vpnService } from '../services/VpnService';

export const MODE_KEY = '@ankrshield/mode'; // 'simple' | 'tech'

export function SimpleHomeScreen({ navigation }: { navigation: any }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(0);
  const [criticalApp, setCriticalApp] = useState<string | null>(null);
  const [caughtCount, setCaughtCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [running, stats, report, caught] = await Promise.all([
        vpnService.isRunning(),
        vpnService.getStats(),
        buildScopeReport().catch(() => null),
        vpnService.getCaughtInAct().catch(() => []),
      ]);
      setOn(running);
      setBlocked(stats.blockedCount || 0);
      const crit = report?.verdicts.find((v) => v.critical);
      setCriticalApp(crit ? crit.appName : null);
      setCaughtCount(caught.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const t = setInterval(refresh, 5000);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [refresh]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        await vpnService.start(); // OS VPN prompt; Intelligent mode auto-handles banking/dev
        setOn(true);
        // Refresh the IOC/tracker blocklist on shield activation (founder ask —
        // no longer waits for the tech Home screen to mount). Fire-and-forget.
        syncBlocklist().catch(() => {});
      } else {
        await vpnService.stop();
        setOn(false);
      }
    } catch {
      setOn(false);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const goAdvanced = async () => {
    await MdmStorage.setItem(MODE_KEY, 'tech').catch(() => {});
    navigation.navigate('Home');
  };

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.top}>
        <Text style={s.brand}>AnkrShield</Text>
      </View>

      {/* The one thing: are you protected? */}
      <View style={s.center}>
        <Text style={[s.bigShield, { opacity: on ? 1 : 0.35 }]}>{on ? '🛡️' : '🛡'}</Text>
        <Text style={s.status}>{on ? "You're protected" : 'Protection is off'}</Text>
        <Text style={s.statusSub}>
          {on
            ? 'Your apps are working normally. Banking and payments are untouched.'
            : 'Turn on to block trackers and spyware — your apps keep working.'}
        </Text>

        <View style={s.switchWrap}>
          {busy ? (
            <ActivityIndicator color="#4ade80" />
          ) : (
            <Switch
              value={on}
              onValueChange={toggle}
              trackColor={{ false: '#1e293b', true: '#166534' }}
              thumbColor={on ? '#4ade80' : '#64748b'}
              style={{ transform: [{ scaleX: 1.6 }, { scaleY: 1.6 }] }}
            />
          )}
        </View>

        {/* One honest number — a real counter, never invented */}
        {on && (
          <View style={s.stat}>
            <Text style={s.statNum}>{blocked.toLocaleString()}</Text>
            <Text style={s.statLbl}>tracking attempts stopped</Text>
          </View>
        )}
      </View>

      {/* The only alert a normal user should ever see */}
      {criticalApp && (
        <TouchableOpacity style={s.danger} onPress={() => navigation.navigate('ScopeReport')}>
          <Text style={s.dangerText}>
            ⚠ "{criticalApp}" is doing something dangerous. Tap to review.
          </Text>
        </TouchableOpacity>
      )}

      {/* Caught in the act — one calm line, only when there's something real to show */}
      {on && caughtCount > 0 && (
        <TouchableOpacity style={s.night} onPress={() => navigation.navigate('CaughtInAct')}>
          <Text style={s.nightText}>
            🌙 {caughtCount} app{caughtCount > 1 ? 's' : ''} contacted trackers while your screen
            was off. Tap to see.
          </Text>
        </TouchableOpacity>
      )}

      {/* Always available: the witnessed privacy report + one-tap DPDP / GDPR complaint.
          Per-app Evidence Pack (cited, filable) lives inside this screen. */}
      <TouchableOpacity style={s.report} onPress={() => navigation.navigate('ScopeReport')}>
        <Text style={s.reportText}>📄 Privacy report — file a DPDP / GDPR complaint</Text>
      </TouchableOpacity>

      {/* Quiet escape hatch to the full interface */}
      <TouchableOpacity style={s.advanced} onPress={goAdvanced}>
        <Text style={s.advancedText}>Advanced tools →</Text>
      </TouchableOpacity>

      <Text style={s.footer}>Everything runs on your phone. Nothing is uploaded.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14', paddingHorizontal: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { paddingTop: 20, alignItems: 'center' },
  brand: { color: '#60a5fa', fontSize: 15, fontWeight: '800', letterSpacing: 1 },

  bigShield: { fontSize: 96, marginBottom: 8 },
  status: { color: '#f1f5f9', fontSize: 28, fontWeight: '800', marginTop: 4 },
  statusSub: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 320,
  },
  switchWrap: { marginTop: 34, height: 44, justifyContent: 'center' },

  stat: { alignItems: 'center', marginTop: 40 },
  statNum: { color: '#4ade80', fontSize: 40, fontWeight: '800' },
  statLbl: { color: '#64748b', fontSize: 13, marginTop: 2 },

  danger: {
    backgroundColor: '#160808',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  dangerText: { color: '#fca5a5', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  night: {
    backgroundColor: '#0c1424',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  nightText: { color: '#93c5fd', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  report: {
    backgroundColor: '#0a1a0f',
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  reportText: { color: '#86efac', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  advanced: { alignItems: 'center', paddingVertical: 14 },
  advancedText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  footer: { color: '#334155', fontSize: 12, textAlign: 'center', paddingBottom: 24 },
});
