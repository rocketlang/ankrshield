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

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';

import { getAuditLog, onServerCommand, AuditEntry, DeviceCommand } from '../services/StatsReporter';
import { vpnService, FeedEvent } from '../services/VpnService';

type Filter = 'all' | 'blocked' | 'allowed';
type Tab = 'dns' | 'server';

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
      {/* Top-level tab bar: DNS | Server */}
      <View style={styles.topTabs}>
        <TouchableOpacity
          style={[styles.topTab, tab === 'dns' && styles.topTabActive]}
          onPress={() => setTab('dns')}
        >
          <Text style={[styles.topTabText, tab === 'dns' && styles.topTabTextActive]}>
            📡 DNS Feed
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTab, tab === 'server' && styles.topTabActiveServer]}
          onPress={() => setTab('server')}
        >
          <Text style={[styles.topTabText, tab === 'server' && styles.topTabTextActive]}>
            🖥 Server Log {audit.length > 0 ? `(${audit.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'server' ? (
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
});
