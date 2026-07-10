/**
 * Activity Screen — Live DNS Feed + Server Audit Log
 *
 * Tab 1 — DNS Feed: DnsQueryEvent ring buffer from on-device VPN.
 * Tab 2 — Server Log: commands and alerts pushed down from the Warrior.
 *   Shows what the server told the phone: block advisories, threat alerts,
 *   config updates. Full audit trail — nothing is hidden.
 *
 * Ring buffer capped at 500 entries (newest first).
 * DNS filter tabs: ALL | BLOCKED | ALLOWED
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';

import { getAuditLog, onServerCommand, AuditEntry, DeviceCommand } from '../services/StatsReporter';
import { vpnService, FeedEvent } from '../services/VpnService';

type Filter = 'all' | 'blocked' | 'allowed';
type Tab = 'dns' | 'trackers' | 'server';

// ── Tracker bucketing ────────────────────────────────────────────────────────

interface TrackerBucket {
  key: string;
  label: string;
  emoji: string;
  total: number;
  blocked: number;
  category: string;
  children?: TrackerBucket[]; // sub-vendors (e.g. Meta → Facebook, Instagram, WhatsApp)
}

const VENDOR_META: Record<string, { label: string; emoji: string }> = {
  Google: { label: 'Google', emoji: '🔴' },
  Meta: { label: 'Meta', emoji: '🔵' },
  Microsoft: { label: 'Microsoft', emoji: '🟦' },
  Amazon: { label: 'Amazon', emoji: '🟡' },
  ByteDance: { label: 'TikTok / ByteDance', emoji: '⬛' },
  'Twitter/X': { label: 'Twitter / X', emoji: '⚫' },
  Oracle: { label: 'Oracle', emoji: '🔶' },
  Yahoo: { label: 'Yahoo', emoji: '🟣' },
  Segment: { label: 'Segment', emoji: '⚙️' },
  NewRelic: { label: 'New Relic', emoji: '⚙️' },
  Criteo: { label: 'Criteo', emoji: '📊' },
  Xandr: { label: 'Xandr', emoji: '📊' },
  OpenX: { label: 'OpenX', emoji: '📊' },
  Magnite: { label: 'Magnite', emoji: '📊' },
  TradeDesk: { label: 'TradeDesk', emoji: '📊' },
  LiveRamp: { label: 'LiveRamp', emoji: '🗂️' },
  TransUnion: { label: 'TransUnion', emoji: '🗂️' },
  'NSO Group': { label: 'NSO Group', emoji: '🕵️' },
  mSpy: { label: 'mSpy', emoji: '🕵️' },
  FlexiSpy: { label: 'FlexiSpy', emoji: '🕵️' },
  Hoverwatch: { label: 'Hoverwatch', emoji: '🕵️' },
  Cocospy: { label: 'Cocospy', emoji: '🕵️' },
  TheTruthSpy: { label: 'TheTruthSpy', emoji: '🕵️' },
  Unknown: { label: 'Unknown', emoji: '❓' },
};

/** Classify a domain into a sub-vendor label when vendor is Meta. */
function metaSubLabel(domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes('whatsapp') || d.includes('wa.me')) {
    return 'WhatsApp';
  }
  if (d.includes('instagram')) {
    return 'Instagram';
  }
  return 'Facebook';
}

function buildBuckets(events: FeedEvent[]): TrackerBucket[] {
  const map = new Map<
    string,
    {
      total: number;
      blocked: number;
      category: string;
      domains: Map<string, { t: number; b: number }>;
    }
  >();

  for (const e of events) {
    const vendor = e.vendor || 'Unknown';
    if (!map.has(vendor)) {
      map.set(vendor, { total: 0, blocked: 0, category: e.category || '', domains: new Map() });
    }
    const bucket = map.get(vendor)!;
    bucket.total++;
    if (e.blocked) {
      bucket.blocked++;
    }

    // Track per-domain for sub-classification
    const key = e.domain;
    const dm = bucket.domains.get(key) ?? { t: 0, b: 0 };
    dm.t++;
    if (e.blocked) {
      dm.b++;
    }
    bucket.domains.set(key, dm);
  }

  const buckets: TrackerBucket[] = [];

  for (const [vendor, data] of map) {
    const meta = VENDOR_META[vendor] ?? { label: vendor, emoji: '📡' };

    let children: TrackerBucket[] | undefined;

    // Sub-classify Meta into Facebook / Instagram / WhatsApp
    if (vendor === 'Meta') {
      const subMap = new Map<string, { total: number; blocked: number }>();
      for (const [domain, dm] of data.domains) {
        const sub = metaSubLabel(domain);
        const existing = subMap.get(sub) ?? { total: 0, blocked: 0 };
        existing.total += dm.t;
        existing.blocked += dm.b;
        subMap.set(sub, existing);
      }
      const subEmojis: Record<string, string> = { Facebook: '🔵', Instagram: '🟣', WhatsApp: '🟢' };
      children = [...subMap.entries()]
        .map(([sub, sd]) => ({
          key: sub,
          label: sub,
          emoji: subEmojis[sub] ?? '🔵',
          total: sd.total,
          blocked: sd.blocked,
          category: 'social',
        }))
        .sort((a, b) => b.total - a.total);
    }

    buckets.push({
      key: vendor,
      label: meta.label,
      emoji: meta.emoji,
      total: data.total,
      blocked: data.blocked,
      category: data.category,
      children,
    });
  }

  return buckets.sort((a, b) => b.total - a.total);
}

const AUDIT_TYPE_COLORS: Record<string, string> = {
  push_received: '#3b82f6',
  stats_sent: '#4ade80',
  command_executed: '#f59e0b',
  error: '#ef4444',
};

export function ActivityScreen() {
  // Seed from singleton history (all events since app start)
  const [events, setEvents] = useState<FeedEvent[]>(() => vpnService.getEventHistory());
  const [filter, setFilter] = useState<Filter>('all');
  const [vpnOff, setVpnOff] = useState(false);
  const [tab, setTab] = useState<Tab>('dns');
  const [audit, setAudit] = useState<AuditEntry[]>(() => getAuditLog());

  useEffect(() => {
    vpnService
      .isRunning()
      .then((r) => setVpnOff(!r))
      .catch(() => setVpnOff(true));

    // Subscribe to the singleton's history — fires with full array on each new event
    const unsubDns = vpnService.onEventHistory((updated) => {
      setEvents(updated);
      setVpnOff(false);
    });

    // Subscribe to server commands — refresh audit log on each new command
    const unsubCmd = onServerCommand((_cmd: DeviceCommand) => {
      setAudit(getAuditLog());
    });

    return () => {
      unsubDns();
      unsubCmd();
    };
  }, []);

  const filtered =
    filter === 'all' ? events : events.filter((e) => (filter === 'blocked') === e.blocked);

  const blockedCount = events.filter((e) => e.blocked).length;
  const allowedCount = events.filter((e) => !e.blocked).length;
  const buckets = useMemo(() => buildBuckets(events), [events]);

  const renderItem = ({ item }: { item: FeedEvent }) => (
    <View style={[styles.row, item.blocked ? styles.rowBlocked : styles.rowAllowed]}>
      <View style={[styles.dot, item.blocked ? styles.dotRed : styles.dotGreen]} />
      <View style={styles.rowBody}>
        <Text
          style={[styles.domain, item.blocked ? styles.domainBlocked : styles.domainAllowed]}
          numberOfLines={1}
        >
          {item.domain}
        </Text>
        <View style={styles.meta}>
          {item.app ? <Text style={styles.appChip}>📱 {item.app}</Text> : null}
          {item.category ? <Text style={styles.chip}>{item.category}</Text> : null}
          {item.vendor ? <Text style={styles.vendor}>{item.vendor}</Text> : null}
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[styles.badge, item.blocked ? styles.badgeRed : styles.badgeGreen]}>
          {item.blocked ? 'BLOCKED' : 'OK'}
        </Text>
        <Text style={styles.time}>
          {new Date(item.ts).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );

  const renderAuditItem = ({ item }: { item: AuditEntry }) => {
    const color = AUDIT_TYPE_COLORS[item.type] ?? '#9ca3af';
    return (
      <View style={[styles.auditRow, { borderLeftColor: color }]}>
        <View style={styles.auditLeft}>
          <Text style={[styles.auditType, { color }]}>
            {item.type.replace(/_/g, ' ').toUpperCase()}
          </Text>
          <Text style={styles.auditDetail} numberOfLines={3}>
            {item.detail}
          </Text>
        </View>
        <View style={styles.auditRight}>
          <Text
            style={[
              styles.auditSource,
              { color: item.source === 'server' ? '#3b82f6' : '#4b5563' },
            ]}
          >
            {item.source}
          </Text>
          <Text style={styles.auditTime}>
            {new Date(item.ts).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top-level tab bar: DNS | Trackers | Server */}
      <View style={styles.topTabs}>
        <TouchableOpacity
          style={[styles.topTab, tab === 'dns' && styles.topTabActive]}
          onPress={() => setTab('dns')}
        >
          <Text style={[styles.topTabText, tab === 'dns' && styles.topTabTextActive]}>📡 DNS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTab, tab === 'trackers' && styles.topTabActiveTrackers]}
          onPress={() => setTab('trackers')}
        >
          <Text style={[styles.topTabText, tab === 'trackers' && styles.topTabTextActive]}>
            🏢 Trackers {buckets.length > 0 ? `(${buckets.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTab, tab === 'server' && styles.topTabActiveServer]}
          onPress={() => setTab('server')}
        >
          <Text style={[styles.topTabText, tab === 'server' && styles.topTabTextActive]}>
            🖥 Server
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'trackers' ? (
        /* ── Tracker Buckets ──────────────────────────────────────── */
        buckets.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyTitle}>No tracker data yet</Text>
            <Text style={styles.emptySub}>
              Enable DNS filtering and use your phone — companies will appear here as they try to
              track you.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.bucketList}>
            <Text style={styles.bucketHdr}>
              Companies detected · {events.length} DNS queries · {blockedCount} blocked
            </Text>
            {buckets.map((b) => {
              const pct = b.total > 0 ? b.blocked / b.total : 0;
              const isSpy = b.category === 'stalkerware' || b.category === 'apt';
              return (
                <View key={b.key} style={[styles.bucketCard, isSpy && styles.bucketCardSpy]}>
                  <View style={styles.bucketTop}>
                    <Text style={styles.bucketEmoji}>{b.emoji}</Text>
                    <View style={styles.bucketInfo}>
                      <Text style={styles.bucketLabel}>{b.label}</Text>
                      <Text style={styles.bucketCat}>{b.category}</Text>
                    </View>
                    <View style={styles.bucketCounts}>
                      <Text style={styles.bucketTotal}>{b.total}</Text>
                      <Text style={styles.bucketCountLbl}>queries</Text>
                    </View>
                    <View style={styles.bucketCounts}>
                      <Text style={[styles.bucketTotal, b.blocked > 0 && styles.bucketRed]}>
                        {b.blocked}
                      </Text>
                      <Text style={styles.bucketCountLbl}>blocked</Text>
                    </View>
                  </View>
                  {/* Block rate bar */}
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` as any }]} />
                  </View>
                  {/* Sub-vendor chips (Meta → Facebook / Instagram / WhatsApp) */}
                  {b.children && b.children.length > 1 && (
                    <View style={styles.subChips}>
                      {b.children.map((c) => (
                        <View key={c.key} style={styles.subChip}>
                          <Text style={styles.subChipTxt}>
                            {c.emoji} {c.label} {c.total}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )
      ) : tab === 'server' ? (
        /* ── Server Audit Log ─────────────────────────────────────── */
        <>
          <View style={styles.auditHeader}>
            <Text style={styles.auditHeaderText}>
              Commands &amp; alerts pushed from the Warrior server
            </Text>
          </View>
          {audit.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No server events yet</Text>
              <Text style={styles.emptySub}>
                Commands and alerts from the server appear here when received.
              </Text>
            </View>
          ) : (
            <FlatList
              data={audit}
              renderItem={renderAuditItem}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.list}
              initialNumToRender={20}
            />
          )}
        </>
      ) : (
        /* ── DNS Feed ─────────────────────────────────────────────── */
        <>
          {/* Summary bar */}
          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{events.length}</Text>
              <Text style={styles.summaryLbl}>Total</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, styles.red]}>{blockedCount}</Text>
              <Text style={styles.summaryLbl}>Blocked</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, styles.green]}>{allowedCount}</Text>
              <Text style={styles.summaryLbl}>Allowed</Text>
            </View>
          </View>

          {/* Filter tabs */}
          <View style={styles.tabs}>
            {(['all', 'blocked', 'allowed'] as Filter[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.tab, filter === f && styles.tabActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Feed */}
          {vpnOff && events.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🛡</Text>
              <Text style={styles.emptyTitle}>DNS Shield is off</Text>
              <Text style={styles.emptySub}>
                {Platform.OS === 'android'
                  ? 'Go to Settings → DNS Filtering to start intercepting.'
                  : 'DNS filtering available on Android.'}
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Waiting for DNS queries…</Text>
              <Text style={styles.emptySub}>Open any app to see traffic appear here.</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              initialNumToRender={30}
              windowSize={5}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },

  topTabs: {
    flexDirection: 'row',
    backgroundColor: '#060a12',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  topTab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  topTabActive: { borderBottomColor: '#4ade80' },
  topTabActiveServer: { borderBottomColor: '#3b82f6' },
  topTabActiveTrackers: { borderBottomColor: '#f59e0b' },
  topTabText: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  topTabTextActive: { color: '#f1f5f9' },

  auditHeader: {
    backgroundColor: '#0c1428',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  auditHeaderText: { color: '#475569', fontSize: 11 },

  auditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    marginBottom: 4,
    borderRadius: 8,
    borderLeftWidth: 3,
    backgroundColor: '#0c1428',
  },
  auditLeft: { flex: 1, marginRight: 8 },
  auditType: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 3 },
  auditDetail: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  auditRight: { alignItems: 'flex-end', flexShrink: 0 },
  auditSource: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  auditTime: { color: '#4b5563', fontSize: 10, marginTop: 4 },

  summary: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { color: '#fff', fontSize: 22, fontWeight: '800' },
  summaryLbl: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: '#1f2937', marginVertical: 4 },
  red: { color: '#f87171' },
  green: { color: '#4ade80' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1f2937',
  },
  tabActive: { backgroundColor: '#1d4ed8' },
  tabText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  list: { padding: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginBottom: 4,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  rowBlocked: { backgroundColor: '#1a0a0a', borderLeftColor: '#ef4444' },
  rowAllowed: { backgroundColor: '#0a120a', borderLeftColor: '#22c55e' },

  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 10, flexShrink: 0 },
  dotRed: { backgroundColor: '#ef4444' },
  dotGreen: { backgroundColor: '#22c55e' },

  rowBody: { flex: 1, marginRight: 8 },
  domain: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  domainBlocked: { color: '#fca5a5' },
  domainAllowed: { color: '#bbf7d0' },

  meta: { flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  chip: {
    backgroundColor: '#1f2937',
    color: '#9ca3af',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  appChip: {
    backgroundColor: '#172554',
    color: '#93c5fd',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  vendor: { color: '#6b7280', fontSize: 10, marginTop: 2 },

  right: { alignItems: 'flex-end', flexShrink: 0 },
  badge: {
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  badgeRed: { backgroundColor: 'rgba(239,68,68,0.2)', color: '#f87171' },
  badgeGreen: { backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80' },
  time: { color: '#4b5563', fontSize: 10, marginTop: 4 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#9ca3af', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // ── Tracker bucket styles ─────────────────────────────────────────────────
  bucketList: { padding: 12, paddingBottom: 40 },
  bucketHdr: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  bucketCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 10,
  },
  bucketCardSpy: {
    borderColor: '#7f1d1d',
    backgroundColor: '#160808',
  },
  bucketTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bucketEmoji: { fontSize: 22, marginRight: 10 },
  bucketInfo: { flex: 1 },
  bucketLabel: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  bucketCat: { color: '#475569', fontSize: 11, marginTop: 1 },
  bucketCounts: { alignItems: 'center', marginLeft: 14 },
  bucketTotal: { color: '#f1f5f9', fontSize: 18, fontWeight: '800' },
  bucketRed: { color: '#f87171' },
  bucketCountLbl: { color: '#6b7280', fontSize: 10 },
  barTrack: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: {
    height: 4,
    backgroundColor: '#ef4444',
    borderRadius: 2,
  },
  subChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subChip: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  subChipTxt: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
});
