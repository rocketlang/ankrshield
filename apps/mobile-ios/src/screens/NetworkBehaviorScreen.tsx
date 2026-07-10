/**
 * NetworkBehaviorScreen — A4
 * Per-app network behavior analysis — live DNS event feed from DnsVpnService.
 * No mock data. Shows real queries as they happen via DeviceEventEmitter.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

import { getBlocklistStats } from '../services/ioc-sync';

const { DnsVpn } = NativeModules;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DnsEvent {
  id: string;
  domain: string;
  /** Real requesting package (kernel-attributed, Android 10+); '' when unknown. */
  app: string;
  blocked: boolean;
  category: string;
  vendor: string;
  ts: number;
}

interface VpnStats {
  total: number;
  blocked: number;
  running: boolean;
}

// ─── Domain → App Name lookup ─────────────────────────────────────────────────

const DOMAIN_APP: Record<string, string> = {
  'whatsapp.net': 'WhatsApp',
  'fbcdn.net': 'Facebook',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'cdninstagram.com': 'Instagram',
  'googleapis.com': 'Google',
  'gstatic.com': 'Google',
  'google.com': 'Google',
  'youtube.com': 'YouTube',
  'ytimg.com': 'YouTube',
  'googlevideo.com': 'YouTube',
  'nflxvideo.net': 'Netflix',
  'nflximg.net': 'Netflix',
  'netflix.com': 'Netflix',
  'hdfcbank.com': 'HDFC Bank',
  'sbicard.com': 'SBI Card',
  'paytm.com': 'Paytm',
  'phonepe.com': 'PhonePe',
  'amazonpay.in': 'Amazon Pay',
  'amazon.in': 'Amazon',
  'flipkart.com': 'Flipkart',
  'akamai.net': 'CDN',
  'cloudflare.com': 'CDN',
  'fastly.net': 'CDN',
  'doubleclick.net': 'Google Ads',
  'googlesyndication.com': 'Google Ads',
  'appsflyer.com': 'AppsFlyer',
  'adjust.com': 'Adjust',
  'branch.io': 'Branch',
  'mixpanel.com': 'Mixpanel',
  'amplitude.com': 'Amplitude',
  'crashlytics.com': 'Firebase',
  'firebase.com': 'Firebase',
  'firebaseio.com': 'Firebase',
};

function domainToApp(domain: string): string | null {
  for (const [suffix, app] of Object.entries(DOMAIN_APP)) {
    if (domain === suffix || domain.endsWith('.' + suffix)) {
      return app;
    }
  }
  return null;
}

// ─── Category colours ─────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  analytics: '#f59e0b',
  advertising: '#ef4444',
  fingerprinting: '#dc2626',
  tracking: '#f97316',
  malware: '#991b1b',
  cdn: '#22c55e',
  clean: '#374151',
};

function catColor(cat: string): string {
  return CAT_COLOR[cat] ?? '#374151';
}

// ─── Component ────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'blocked' | 'allowed';

function formatSyncAge(d: Date | null): string {
  if (!d) {
    return 'never';
  }
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) {
    return 'just now';
  }
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

export function NetworkBehaviorScreen() {
  const [events, setEvents] = useState<DnsEvent[]>([]);
  const [stats, setStats] = useState<VpnStats>({ total: 0, blocked: 0, running: false });
  const [filter, setFilter] = useState<FilterMode>('all');
  const [syncStats, setSyncStats] = useState(getBlocklistStats());
  const idRef = useRef(0);

  const refreshStats = useCallback(() => {
    if (Platform.OS !== 'android' || !DnsVpn) {
      return;
    }
    DnsVpn.getStats()
      .then((s: any) => {
        setStats({ total: s.totalQueries, blocked: s.blockedCount, running: s.running });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 3000);

    if (Platform.OS !== 'android' || !DnsVpn) {
      return () => clearInterval(interval);
    }

    const emitter = new NativeEventEmitter(DnsVpn);
    const sub = emitter.addListener('DnsQueryEvent', (ev: any) => {
      const e: DnsEvent = {
        id: String(++idRef.current),
        domain: ev.domain ?? '',
        app: ev.app ?? '',
        blocked: !!ev.blocked,
        category: ev.category ?? 'clean',
        vendor: ev.vendor ?? '',
        ts: Date.now(),
      };
      setEvents((prev) => {
        const next = [e, ...prev];
        return next.length > 300 ? next.slice(0, 300) : next;
      });
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [refreshStats]);

  // Poll blocklist sync stats every 30s
  useEffect(() => {
    const t = setInterval(() => setSyncStats(getBlocklistStats()), 30000);
    return () => clearInterval(t);
  }, []);

  const shown =
    filter === 'all'
      ? events
      : filter === 'blocked'
        ? events.filter((e) => e.blocked)
        : events.filter((e) => !e.blocked);

  const renderItem = useCallback(({ item }: { item: DnsEvent }) => {
    // Prefer kernel-attributed requester (truth) over the domain-owner guess
    const app = item.app || domainToApp(item.domain);
    const cc = catColor(item.category);
    return (
      <View style={[s.row, item.blocked && s.rowBlocked]}>
        <View style={s.rowLeft}>
          {app && <Text style={s.rowApp}>{app}</Text>}
          <Text style={[s.rowDomain, item.blocked && s.rowDomainBlocked]} numberOfLines={1}>
            {item.domain}
          </Text>
          {item.category !== 'clean' && (
            <View style={[s.catBadge, { borderColor: cc }]}>
              <Text style={[s.catText, { color: cc }]}>{item.category}</Text>
            </View>
          )}
        </View>
        <View style={s.rowRight}>
          <View style={[s.verdictPill, item.blocked ? s.verdictBlock : s.verdictAllow]}>
            <Text style={s.verdictText}>{item.blocked ? 'BLOCKED' : 'ALLOWED'}</Text>
          </View>
          <Text style={s.rowTime}>
            {new Date(item.ts).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  }, []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#080c14" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Network Behavior</Text>
        <Text style={s.subtitle}>Live DNS feed — per-connection resolution log</Text>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        <View style={s.statPill}>
          <Text style={s.statNum}>{stats.blocked}</Text>
          <Text style={s.statLabel}>blocked</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statPill}>
          <Text style={s.statNum}>{Math.max(0, stats.total - stats.blocked)}</Text>
          <Text style={s.statLabel}>allowed</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statPill}>
          <Text style={s.statNum}>{events.length}</Text>
          <Text style={s.statLabel}>this session</Text>
        </View>
        <View style={[s.vpnPill, stats.running ? s.vpnOn : s.vpnOff]}>
          <Text style={s.vpnText}>{stats.running ? '● VPN ON' : '○ VPN OFF'}</Text>
        </View>
      </View>

      {/* Blocklist sync status */}
      <View style={s.syncBar}>
        <Text style={s.syncText}>
          {syncStats.syncInProgress
            ? '⟳ Syncing blocklist...'
            : syncStats.count > 0
              ? `🛡 ${syncStats.count.toLocaleString()} domains · ${formatSyncAge(syncStats.lastSyncAt)}`
              : '🛡 Blocklist not yet synced'}
        </Text>
      </View>

      {/* VPN offline notice */}
      {!stats.running && Platform.OS === 'android' && (
        <View style={s.offlineNotice}>
          <Text style={s.offlineText}>
            Enable DNS filtering in Settings to see live network data.
          </Text>
        </View>
      )}

      {/* Filter tabs */}
      <View style={s.filterRow}>
        {(['all', 'blocked', 'allowed'] as FilterMode[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterTab, filter === f && s.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterTabText, filter === f && s.filterTabTextActive]}>
              {f === 'all'
                ? `All (${events.length})`
                : f === 'blocked'
                  ? `Blocked (${events.filter((e) => e.blocked).length})`
                  : `Allowed (${events.filter((e) => !e.blocked).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Empty state */}
      {shown.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>📡</Text>
          <Text style={s.emptyText}>
            {stats.running
              ? 'Waiting for DNS queries…\nBrowse any app to see live traffic.'
              : 'Start DNS filtering in Settings\nto monitor network activity.'}
          </Text>
          {events.length > 0 && filter !== 'all' && (
            <TouchableOpacity style={s.clearFilter} onPress={() => setFilter('all')}>
              <Text style={s.clearFilterText}>Show all events</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          style={s.list}
          contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 10 }}
          renderItem={renderItem}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },

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

  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 6,
  },
  statPill: { alignItems: 'center', minWidth: 44 },
  statNum: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  statLabel: { color: '#475569', fontSize: 10, marginTop: 1 },
  statDivider: { width: 1, height: 24, backgroundColor: '#1e293b', marginHorizontal: 4 },

  vpnPill: {
    marginLeft: 'auto',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  vpnOn: { backgroundColor: '#052e16' },
  vpnOff: { backgroundColor: '#1c1917' },
  vpnText: { fontSize: 11, fontWeight: '700', color: '#22c55e' },

  offlineNotice: {
    backgroundColor: '#1c1400',
    borderBottomWidth: 1,
    borderBottomColor: '#78350f',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineText: { color: '#d97706', fontSize: 12 },

  syncBar: {
    backgroundColor: '#060d0d',
    borderBottomWidth: 1,
    borderBottomColor: '#0d2020',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  syncText: { color: '#22c55e', fontSize: 11 },

  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 10,
    gap: 4,
    paddingTop: 6,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: { borderBottomColor: '#3b82f6' },
  filterTabText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  filterTabTextActive: { color: '#93c5fd' },

  list: { flex: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  rowBlocked: { backgroundColor: '#0d0000' },
  rowLeft: { flex: 1, marginRight: 10 },
  rowApp: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  rowDomain: { color: '#cbd5e1', fontSize: 13, fontWeight: '500' },
  rowDomainBlocked: { color: '#6b7280', textDecorationLine: 'line-through' },
  catBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 3,
  },
  catText: { fontSize: 10, fontWeight: '600' },

  rowRight: { alignItems: 'flex-end', gap: 4 },
  verdictPill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  verdictBlock: { backgroundColor: '#450a0a' },
  verdictAllow: { backgroundColor: '#052e16' },
  verdictText: { fontSize: 9, fontWeight: '800', color: '#e2e8f0', letterSpacing: 0.5 },
  rowTime: { color: '#334155', fontSize: 10 },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#4b5563', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  clearFilter: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  clearFilterText: { color: '#60a5fa', fontSize: 13 },
});
