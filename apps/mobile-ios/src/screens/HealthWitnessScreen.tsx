/**
 * HealthWitnessScreen — "Your watch knows your heartbeat. Make sure only you do."
 *
 * The wearable/health privacy wedge (Samsung thesis, 2026-07-10): a fitness or
 * wearable-companion app needs your biometrics to show them to YOU — not to send
 * them to an ad network. This screen filters the per-app witness to health,
 * fitness and wearable-companion apps and shows, cited, which of them contacted
 * trackers beyond their scope. Rides entirely on the shipped scope ledger — no
 * new plumbing. Every number is a counted event; every vendor a cited row; the
 * DNS vantage is stated (never overclaimed).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { HealthApp, KIND_META, matchHealthApp } from '../data/healthApps';
import { AppScopeVerdict, buildScopeReport, getReceipts } from '../services/ScopeService';
import { ScopeDetailRow, vpnService } from '../services/VpnService';

interface HealthRow {
  verdict: AppScopeVerdict;
  meta: HealthApp;
}

export function HealthWitnessScreen() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [shieldOn, setShieldOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, ScopeDetailRow[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [report, running] = await Promise.all([buildScopeReport(), vpnService.isRunning()]);
      setShieldOn(running);
      const health: HealthRow[] = [];
      for (const v of report.verdicts) {
        const meta = matchHealthApp(v.packageName);
        if (meta) {
          health.push({ verdict: v, meta });
        }
      }
      // Worst first: those that leaked beyond scope on top.
      health.sort((a, b) => b.verdict.beyondScope - a.verdict.beyondScope);
      setRows(health);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (v: AppScopeVerdict) => {
    if (expanded === v.packageName) {
      setExpanded(null);
      return;
    }
    setExpanded(v.packageName);
    if (!receipts[v.packageName] && v.status !== 'UNWITNESSED') {
      setReceipts((prev) => ({ ...prev, [v.packageName]: [] }));
      const r = await getReceipts(v.packageName);
      setReceipts((prev) => ({ ...prev, [v.packageName]: r }));
    }
  };

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color="#f472b6" />
      </View>
    );
  }

  const leaking = rows.filter((r) => r.verdict.beyondScope > 0);
  const totalLeak = leaking.reduce((n, r) => n + r.verdict.beyondScope, 0);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.heroIcon}>⌚❤️</Text>
        <Text style={s.heroTitle}>Your body is data too</Text>
        <Text style={s.heroSub}>
          A fitness or watch app needs your heart rate, steps and sleep to show{' '}
          <Text style={s.em}>you</Text>. It does not need to send them to an ad network. Here is
          what your health &amp; wearable apps did.
        </Text>
      </View>

      {!shieldOn && (
        <View style={s.warn}>
          <Text style={s.warnText}>
            ⚠ Turn on the DNS Shield to witness your health apps. Until then this is empty — never
            guessed.
          </Text>
        </View>
      )}

      {/* Headline */}
      {shieldOn && (
        <View style={s.headline}>
          <Text style={[s.bigNum, { color: totalLeak > 0 ? '#f472b6' : '#4ade80' }]}>
            {totalLeak.toLocaleString()}
          </Text>
          <Text style={s.bigLbl}>
            {totalLeak > 0
              ? 'times your health apps reached beyond their scope'
              : 'beyond-scope contacts from your health apps'}
          </Text>
        </View>
      )}

      {/* Empty state */}
      {shieldOn && rows.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No health or wearable apps witnessed yet</Text>
          <Text style={s.emptySub}>
            Open your fitness / watch app and sync — it will appear here with exactly who it
            contacted.
          </Text>
        </View>
      )}

      {/* Per-app */}
      {rows.map(({ verdict: v, meta }) => {
        const km = KIND_META[meta.kind];
        const leak = v.beyondScope > 0;
        return (
          <TouchableOpacity
            key={v.packageName}
            style={[s.card, leak && s.cardLeak]}
            onPress={() => toggle(v)}
            activeOpacity={0.7}
          >
            <View style={s.cardTop}>
              <Text style={s.kindIcon}>{km.icon}</Text>
              <View style={s.cardInfo}>
                <Text style={s.appName}>{meta.name}</Text>
                <Text style={s.kindLbl}>{km.label}</Text>
              </View>
              <View style={s.cardRight}>
                {leak ? (
                  <Text style={s.leakTag}>
                    {v.beyondScope} beyond-scope · {v.vendorCount} vendor
                    {v.vendorCount === 1 ? '' : 's'}
                  </Text>
                ) : (
                  <Text style={s.cleanTag}>no tracker contact</Text>
                )}
                <Text style={s.chev}>{expanded === v.packageName ? '▾' : '▸'}</Text>
              </View>
            </View>
            {expanded === v.packageName && (
              <View style={s.receipts}>
                {(receipts[v.packageName] ?? []).length === 0 ? (
                  <Text style={s.receiptNote}>
                    No tracker endpoints recorded — this app kept your data to itself. ✓
                  </Text>
                ) : (
                  (receipts[v.packageName] ?? []).slice(0, 12).map((r) => (
                    <View key={r.domain} style={s.receiptRow}>
                      <Text style={s.receiptDomain} numberOfLines={1}>
                        {r.domain}
                      </Text>
                      <Text style={s.receiptMeta}>
                        {r.category}
                        {r.vendor ? ` · ${r.vendor}` : ''} · ×{r.blocked + r.allowed}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      <Text style={s.footer}>
        Vantage: DNS-visible traffic from each app, attributed by the Android kernel. Your watch
        syncs through its phone app, so its flows show up here. Nothing leaves your phone; nothing
        is guessed.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0710' },
  content: { padding: 16, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center', paddingVertical: 20 },
  heroIcon: { fontSize: 40, marginBottom: 8 },
  heroTitle: { color: '#f1f5f9', fontSize: 24, fontWeight: '800' },
  heroSub: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 340,
  },
  em: { color: '#f472b6', fontWeight: '700' },

  warn: {
    backgroundColor: '#3b1d0a',
    borderWidth: 1,
    borderColor: '#b45309',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  warnText: { color: '#fbbf24', fontSize: 13, textAlign: 'center' },

  headline: { alignItems: 'center', paddingVertical: 16 },
  bigNum: { fontSize: 48, fontWeight: '800' },
  bigLbl: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 2, maxWidth: 300 },

  empty: { alignItems: 'center', padding: 28 },
  emptyTitle: { color: '#cbd5e1', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptySub: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },

  card: {
    backgroundColor: '#150e1e',
    borderWidth: 1,
    borderColor: '#2a1f38',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  cardLeak: { borderColor: '#831843', backgroundColor: '#1a0a14' },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  kindIcon: { fontSize: 24, marginRight: 12 },
  cardInfo: { flex: 1 },
  appName: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  kindLbl: { color: '#64748b', fontSize: 11, marginTop: 1 },
  cardRight: { alignItems: 'flex-end' },
  leakTag: { color: '#f472b6', fontSize: 12, fontWeight: '600' },
  cleanTag: { color: '#4ade80', fontSize: 12 },
  chev: { color: '#475569', fontSize: 14, marginTop: 4 },

  receipts: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#2a1f38', paddingTop: 10 },
  receiptNote: { color: '#4ade80', fontSize: 13, lineHeight: 19 },
  receiptRow: { marginBottom: 8 },
  receiptDomain: { color: '#f9a8d4', fontSize: 12, fontFamily: 'monospace' },
  receiptMeta: { color: '#64748b', fontSize: 11, marginTop: 1 },

  footer: { color: '#3f3350', fontSize: 11, lineHeight: 17, marginTop: 20, textAlign: 'center' },
});
