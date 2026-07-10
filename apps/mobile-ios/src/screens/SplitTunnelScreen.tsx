/**
 * SplitTunnelScreen — A1-4 Per-App DNS Bypass Registry
 *
 * Lists all installed user apps. Toggle any app to bypass AnkrShield's
 * DNS filtering (useful for banking apps, MDM corporate apps, etc.).
 *
 * Banking apps (PhonePe, GPay, Paytm, BHIM, Kotak, HDFC, ICICI, SBI,
 * Axis) are pre-flagged as "Recommended Bypass" — giving users a smart
 * default without any config work.
 *
 * Passive Mode toggle: when enabled, AnkrShield logs tracker activity
 * for every app (including bypassed ones) but never blocks anything.
 * Good for diagnostic sessions.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeModules,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

const { DnsVpn } = NativeModules;

// ── Well-known banking/payment apps that should be bypassed by default ──────

const RECOMMENDED_BYPASS = new Set([
  'com.phonepe.app',
  'com.google.android.apps.nbu.paisa.user', // Google Pay
  'net.one97.paytm',
  'in.gov.uidai.mAadhaar',
  'com.bhim.axisbank',
  'com.sbi.lotusintouch',
  'net.hdfcbank.hdfcmobilenetbanking',
  'com.icicibank.pockets',
  'com.axis.mobile',
  'com.kotak.mahindra.kotak811',
  'in.org.npci.upiapp', // BHIM
  'com.whatsapp', // WA – blocked separately by OTP Guard
]);

interface InstalledApp {
  packageName: string;
  appName: string;
  bypassed: boolean;
  autoBypassed?: boolean;
}

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  sub: '#94a3b8',
  accent: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

export default function SplitTunnelScreen() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [passiveMode, setPassiveMode] = useState(false);
  const [savingPkg, setSavingPkg] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    if (Platform.OS !== 'android' || !DnsVpn) {
      return;
    }
    setLoading(true);
    try {
      const [list, passive] = await Promise.all([
        DnsVpn.getInstalledApps() as Promise<InstalledApp[]>,
        DnsVpn.isPassiveMode() as Promise<boolean>,
      ]);
      // Sort: bypassed first, then recommended, then alphabetical
      list.sort((a, b) => {
        if (a.bypassed !== b.bypassed) {
          return a.bypassed ? -1 : 1;
        }
        const aRec = RECOMMENDED_BYPASS.has(a.packageName);
        const bRec = RECOMMENDED_BYPASS.has(b.packageName);
        if (aRec !== bRec) {
          return aRec ? -1 : 1;
        }
        return a.appName.localeCompare(b.appName);
      });
      setApps(list);
      setPassiveMode(passive);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const filtered = useMemo(
    () =>
      query.trim()
        ? apps.filter(
            (a) =>
              a.appName.toLowerCase().includes(query.toLowerCase()) ||
              a.packageName.toLowerCase().includes(query.toLowerCase())
          )
        : apps,
    [apps, query]
  );

  const handleToggle = async (pkg: string, newVal: boolean) => {
    if (Platform.OS !== 'android' || !DnsVpn) {
      return;
    }
    setSavingPkg(pkg);
    try {
      await DnsVpn.toggleBypassApp(pkg, newVal);
      setApps((prev) => prev.map((a) => (a.packageName === pkg ? { ...a, bypassed: newVal } : a)));
    } finally {
      setSavingPkg(null);
    }
  };

  const handlePassiveMode = async (val: boolean) => {
    if (Platform.OS !== 'android' || !DnsVpn) {
      return;
    }
    await DnsVpn.setPassiveMode(val);
    setPassiveMode(val);
  };

  const renderApp = ({ item }: { item: InstalledApp }) => {
    const isRec = RECOMMENDED_BYPASS.has(item.packageName);
    const saving = savingPkg === item.packageName;
    return (
      <View style={styles.row}>
        <View style={styles.appInfo}>
          <Text style={styles.appName} numberOfLines={1}>
            {item.appName}
          </Text>
          <Text style={styles.pkg} numberOfLines={1}>
            {item.packageName}
          </Text>
          {item.bypassed && item.autoBypassed && (
            <Text style={styles.recTag}>🏦 Auto-excluded — Intelligent mode (unwitnessed)</Text>
          )}
          {isRec && !item.bypassed && <Text style={styles.recTag}>⭐ Recommended bypass</Text>}
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.accent} />
        ) : (
          <Switch
            value={item.bypassed}
            onValueChange={(v) => handleToggle(item.packageName, v)}
            trackColor={{ false: COLORS.border, true: COLORS.accent }}
            thumbColor={item.bypassed ? '#fff' : COLORS.sub}
          />
        )}
      </View>
    );
  };

  const bypassCount = apps.filter((a) => a.bypassed).length;

  return (
    <View style={styles.container}>
      {/* Passive Mode Banner */}
      <View style={styles.passiveCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.passiveTitle}>Passive Analysis Mode</Text>
          <Text style={styles.passiveSub}>
            {passiveMode
              ? 'Observe-only active — trackers logged but NOT blocked'
              : 'Trackers are blocked. Toggle to observe without blocking.'}
          </Text>
        </View>
        <Switch
          value={passiveMode}
          onValueChange={handlePassiveMode}
          trackColor={{ false: COLORS.border, true: COLORS.amber }}
          thumbColor={passiveMode ? '#fff' : COLORS.sub}
        />
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {bypassCount} app{bypassCount !== 1 ? 's' : ''} bypassing DNS filter
        </Text>
        <Text style={styles.summaryNote}>
          Bypassed apps connect directly — DNS queries unfiltered
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search apps…"
          placeholderTextColor={COLORS.sub}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.passiveSub, { marginTop: 12 }]}>Loading installed apps…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => a.packageName}
          renderItem={renderApp}
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  passiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#292524',
    margin: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.amber + '44',
  },
  passiveTitle: { color: COLORS.amber, fontWeight: '700', fontSize: 15, marginBottom: 2 },
  passiveSub: { color: COLORS.sub, fontSize: 12 },
  summaryBar: { paddingHorizontal: 16, paddingVertical: 8, marginBottom: 4 },
  summaryText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  summaryNote: { color: COLORS.sub, fontSize: 11, marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 40, color: COLORS.text, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  appInfo: { flex: 1, marginRight: 12 },
  appName: { color: COLORS.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  pkg: { color: COLORS.sub, fontSize: 11, fontFamily: 'monospace' },
  recTag: { color: COLORS.amber, fontSize: 11, marginTop: 3 },
  sep: { height: 1, backgroundColor: COLORS.border, marginLeft: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
});
