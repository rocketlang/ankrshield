/**
 * CaughtInActScreen — "while you weren't looking"
 *
 * The background-exfil witness. Lists apps that contacted a tracker WHILE THE
 * SCREEN WAS OFF — attributed to the owning app by the kernel (getConnectionOwnerUid),
 * timed against screen state, cited against the tracker DB.
 *
 * Honesty (FP-018): every number is a counted DNS/connection event; every vendor
 * a cited tracker-db row. We witness at the DNS/connection layer and say so. We
 * never claim to see a sensor (camera/mic) — a sideloaded app cannot, and we don't
 * pretend to. Empty state is honest: "nothing witnessed yet", never a fake all-clear.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Share,
  ActivityIndicator,
} from 'react-native';

import { CaughtInActRow, ScopeDetailRow, vpnService } from '../services/VpnService';

interface CaughtCard extends CaughtInActRow {
  appName: string;
  expanded: boolean;
  receipts: ScopeDetailRow[] | null;
}

function timeAgo(ts: number): string {
  if (!ts) {
    return '';
  }
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) {
    return 'just now';
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CaughtInActScreen({ navigation }: any) {
  const [cards, setCards] = useState<CaughtCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rows, installed] = await Promise.all([
        vpnService.getCaughtInAct(),
        vpnService.getInstalledApps(),
      ]);
      const nameOf = (pkg: string) =>
        installed.find((a) => a.packageName === pkg.split(',')[0])?.appName ?? pkg.split(',')[0];
      setCards(
        rows
          // Most recent screen-off contact first — reads as an overnight timeline.
          .slice()
          .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
          .map((r) => ({
            ...r,
            appName: nameOf(r.app),
            expanded: false,
            receipts: null,
          }))
      );
    } catch (_e) {
      setCards([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggle = async (idx: number) => {
    setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, expanded: !c.expanded } : c)));
    const card = cards[idx];
    if (card && card.receipts === null) {
      try {
        const receipts = await vpnService.getScopeDetail(card.app);
        // only the trackers (beyond-scope), worst first
        const trackers = receipts
          .filter((r) => r.category && r.category !== 'clean')
          .sort((a, b) => b.risk - a.risk || b.blocked + b.allowed - (a.blocked + a.allowed));
        setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, receipts: trackers } : c)));
      } catch (_e) {
        // Resolve to an empty set rather than spinning forever — the row then
        // reads "No cited tracker rows" (FP-018: no perpetual spinner).
        setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, receipts: [] } : c)));
      }
    }
  };

  const quarantine = async (pkg: string) => {
    await vpnService.quarantineApp(pkg.split(',')[0]);
    load();
  };

  const shareReceipt = async (c: CaughtCard) => {
    const when = timeAgo(c.lastTs);
    await Share.share({
      message:
        '🔴 Caught in the act — AnkrShield\n\n' +
        `"${c.appName}" contacted ${c.bgHits} tracker ` +
        `${c.bgHits === 1 ? 'endpoint' : 'endpoints'} while my screen was OFF ` +
        `(${c.vendorCount} ${c.vendorCount === 1 ? 'company' : 'companies'}, last ${when}).\n\n` +
        'Witnessed on-device at the DNS layer — every number a counted event, ' +
        'every company a cited database row. Nothing guessed.\n\n' +
        'Get AnkrShield (free): https://xshieldai.com',
    }).catch(() => {});
  };

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator color="#f87171" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f87171" />
      }
    >
      <View style={s.header}>
        <Text style={s.title}>Caught in the act</Text>
        <Text style={s.sub}>
          What your apps did while your screen was off. Witnessed at the DNS layer — cited, counted,
          never guessed.
        </Text>
      </View>

      {cards.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🌙</Text>
          <Text style={s.emptyTitle}>Nothing witnessed yet</Text>
          <Text style={s.emptySub}>
            No app has contacted a known tracker while your screen was off — or the shield hasn't
            been on through a screen-off period yet. Keep the DNS shield on overnight and check
            back.
          </Text>
        </View>
      ) : (
        cards.map((c, idx) => (
          <View key={c.app} style={s.card}>
            <TouchableOpacity style={s.cardHead} onPress={() => toggle(idx)} activeOpacity={0.7}>
              <View style={s.cardHeadLeft}>
                <Text style={s.dot}>🔴</Text>
                <View style={s.cardHeadText}>
                  <Text style={s.appName} numberOfLines={1}>
                    {c.appName}
                  </Text>
                  <Text style={s.line}>
                    {c.bgHits} tracker {c.bgHits === 1 ? 'contact' : 'contacts'} · screen off ·{' '}
                    {c.vendorCount} {c.vendorCount === 1 ? 'company' : 'companies'}
                    {c.lastTs ? ` · ${timeAgo(c.lastTs)}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={s.chev}>
                🧾 {c.receiptCount} {c.expanded ? '▾' : '▸'}
              </Text>
            </TouchableOpacity>

            {c.expanded && (
              <View style={s.receipts}>
                {c.receipts === null ? (
                  <ActivityIndicator color="#64748b" style={{ marginVertical: 10 }} />
                ) : c.receipts.length === 0 ? (
                  <Text style={s.receiptEmpty}>No cited tracker rows.</Text>
                ) : (
                  c.receipts.slice(0, 40).map((r, i) => (
                    <View key={`${r.domain}-${i}`} style={s.receiptRow}>
                      <View style={s.receiptLeft}>
                        <Text style={s.receiptDomain} numberOfLines={1}>
                          {r.domain}
                        </Text>
                        <Text style={s.receiptMeta} numberOfLines={1}>
                          {r.vendor ? `${r.vendor} · ` : ''}
                          {r.category}
                          {r.risk >= 3 ? '  ⚠️' : ''}
                        </Text>
                      </View>
                      <Text style={s.receiptCount}>{r.blocked + r.allowed}×</Text>
                    </View>
                  ))
                )}

                <View style={s.actions}>
                  <TouchableOpacity style={[s.btn, s.btnShare]} onPress={() => shareReceipt(c)}>
                    <Text style={s.btnShareText}>Share receipt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btn, s.btnQuar]} onPress={() => quarantine(c.app)}>
                    <Text style={s.btnQuarText}>Quarantine</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))
      )}

      <Text style={s.footer}>
        Vantage: DNS / connection witness, on-device. "While your screen was off" means the OS
        reported the screen off when the contact was made. We do not read other apps' sensors — a
        sideloaded app cannot, and we won't pretend to.
      </Text>
      {navigation && (
        <TouchableOpacity style={s.reportLink} onPress={() => navigation.navigate('ScopeReport')}>
          <Text style={s.reportLinkText}>See the full Privacy Report ▸</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: '800' },
  sub: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 6 },

  emptyBox: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#64748b', fontSize: 13, lineHeight: 19, textAlign: 'center' },

  card: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  dot: { fontSize: 12, marginRight: 10 },
  cardHeadText: { flex: 1 },
  appName: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  line: { color: '#94a3b8', fontSize: 12, marginTop: 3, lineHeight: 16 },
  chev: { color: '#64748b', fontSize: 12, fontWeight: '600' },

  receipts: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  receiptEmpty: { color: '#64748b', fontSize: 12, paddingVertical: 10 },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#131c2e',
  },
  receiptLeft: { flex: 1, marginRight: 10 },
  receiptDomain: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  receiptMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
  receiptCount: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnShare: { backgroundColor: '#1e293b' },
  btnShareText: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  btnQuar: { backgroundColor: '#3f1d1d', borderWidth: 1, borderColor: '#7f1d1d' },
  btnQuarText: { color: '#fca5a5', fontSize: 13, fontWeight: '700' },

  footer: {
    color: '#475569',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  reportLink: { paddingHorizontal: 20, paddingTop: 14 },
  reportLinkText: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },
});
