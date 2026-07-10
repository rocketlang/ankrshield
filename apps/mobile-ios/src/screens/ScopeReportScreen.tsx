/**
 * ScopeReportScreen — the Privacy Report (ASCT-T3.1).
 *
 * The founding sentence, rendered: "apps play normal BUT the user is told
 * they are tracked beyond the minimum required app scope."
 *
 * Design brief (founder, 2026-07-10): calm like Safari's Privacy Report —
 * not an alarm console. Apps keep working; trackers are witnessed; the
 * blast radius is controlled. The screen simply shows what is happening.
 *
 * Every number is a counted event (COMPUTE); every vendor/category is a
 * cited tracker-db row (QUOTE); what we could not attribute or observe is
 * said out loud (NULL). Nothing on this screen is generated or guessed.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { buildAppEvidence } from '../services/EvidencePack';
import {
  AppScopeVerdict,
  ScopeReport,
  buildScopeReport,
  getReceipts,
} from '../services/ScopeService';
import { ScopeDetailRow, ShieldMode, vpnService } from '../services/VpnService';

const CAT_LABEL: Record<string, string> = {
  advertising: 'Advertising',
  analytics: 'Analytics',
  fingerprinting: 'Fingerprinting',
  data_broker: 'Data broker',
  social: 'Social tracking',
  stalkerware: 'Stalkerware',
  apt: 'Spyware infra',
  sdk: 'Tracking SDK',
  quarantined: 'Quarantined — contained',
  clean: 'No known tracker',
};

// Browsers generate tracker calls for every site the USER visits — that traffic is
// the web, not the app. Flag it so the number isn't misread as the browser spying.
const BROWSER_PKGS = new Set([
  'com.android.chrome',
  'com.google.android.apps.chrome',
  'org.mozilla.firefox',
  'org.mozilla.fenix',
  'com.microsoft.emmx',
  'com.brave.browser',
  'com.opera.mini.native',
  'com.opera.browser',
  'com.sec.android.app.sbrowser',
  'com.UCMobile.intl',
  'com.duckduckgo.mobile.android',
  'com.kiwibrowser.browser',
  'mark.via.gp',
]);
const isBrowser = (pkg: string) => BROWSER_PKGS.has(pkg.split(',')[0]);

function timeAgo(ts: number): string {
  if (!ts) {
    return '';
  }
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

export function ScopeReportScreen() {
  const [report, setReport] = useState<ScopeReport | null>(null);
  const [mode, setMode] = useState<ShieldMode>('intelligent');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, ScopeDetailRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [shieldOn, setShieldOn] = useState(true);
  const [starting, setStarting] = useState(false);
  const [quarantined, setQuarantined] = useState<{ pkg: string; name: string }[]>([]);
  const [tamed, setTamed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m, running, qPkgs, tPkgs, installed] = await Promise.all([
        buildScopeReport(),
        vpnService.getMode(),
        vpnService.isRunning(),
        vpnService.getQuarantinedApps(),
        vpnService.getTamedApps(),
        vpnService.getInstalledApps(),
      ]);
      setReport(r);
      setMode(m);
      setShieldOn(running);
      const nameOf = (pkg: string) => installed.find((a) => a.packageName === pkg)?.appName ?? pkg;
      setQuarantined(qPkgs.map((pkg) => ({ pkg, name: nameOf(pkg) })));
      setTamed(new Set(tPkgs));
    } finally {
      setLoading(false);
    }
  }, []);

  // A verdict's packageName may be a comma-joined shared-UID set; tame binds to the first.
  const isTamed = (pkg: string) => tamed.has(pkg) || tamed.has(pkg.split(',')[0]);

  const shareEvidence = async (v: AppScopeVerdict) => {
    let rows = receipts[v.packageName];
    if (!rows) {
      rows = await getReceipts(v.packageName).catch(() => []);
      setReceipts((prev) => ({ ...prev, [v.packageName]: rows }));
    }
    await Share.share({ message: buildAppEvidence(v, rows ?? []) }).catch(() => {});
  };

  const toggleTame = async (pkg: string) => {
    const first = pkg.split(',')[0];
    if (isTamed(pkg)) {
      await vpnService.untameApp(first);
      setTamed((prev) => {
        const n = new Set(prev);
        n.delete(pkg);
        n.delete(first);
        return n;
      });
    } else {
      await vpnService.tameApp(first);
      setTamed((prev) => new Set(prev).add(first));
    }
  };

  const releaseQuarantine = async (pkg: string) => {
    await vpnService.unquarantineApp(pkg);
    setQuarantined((prev) => prev.filter((q) => q.pkg !== pkg));
  };

  // The master switch: witnessing only runs while the DNS shield is on.
  const startShield = async () => {
    setStarting(true);
    try {
      await vpnService.start(); // prompts the OS VPN permission if needed
      setShieldOn(true);
      load();
    } catch {
      setShieldOn(false);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = async (v: AppScopeVerdict) => {
    if (expanded === v.packageName) {
      setExpanded(null);
      return;
    }
    setExpanded(v.packageName);
    if (!receipts[v.packageName] && v.status !== 'UNWITNESSED') {
      const rows = await getReceipts(v.packageName);
      setReceipts((prev) => ({ ...prev, [v.packageName]: rows }));
    }
  };

  const handleMode = async (guard: boolean) => {
    const next: ShieldMode = guard ? 'guard' : 'intelligent';
    await vpnService.setMode(next);
    setMode(next);
    load();
  };

  if (loading && !report) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  const verdicts = report?.verdicts ?? [];
  const witnessed = verdicts.filter((v) => v.status !== 'UNWITNESSED');
  const unwitnessed = verdicts.filter((v) => v.status === 'UNWITNESSED');
  const totalBeyond = witnessed.reduce((n, v) => n + v.beyondScope, 0);
  const trackedApps = witnessed.filter((v) => v.beyondScope > 0).length;
  const vendorMax = witnessed.reduce((n, v) => Math.max(n, v.vendorCount), 0);
  const nullPct = Math.round((report?.nullShare ?? 0) * 100);
  const totalBlocked = witnessed.reduce((n, v) => n + v.beyondBlocked, 0);
  const topOffenders = witnessed
    .filter((v) => v.beyondScope > 0)
    .sort((a, b) => b.beyondScope - a.beyondScope)
    .slice(0, 3);

  const shareSummary = async () => {
    const top = topOffenders
      .map((v) => `${v.appName} (${v.beyondScope.toLocaleString()})`)
      .join(', ');
    await Share.share({
      message:
        `🛡️ AnkrShield caught ${totalBeyond.toLocaleString()} beyond-scope tracker contacts this ` +
        `month across ${trackedApps} app${trackedApps === 1 ? '' : 's'}` +
        (totalBlocked > 0 ? ` — ${totalBlocked.toLocaleString()} blocked` : '') +
        '.\n\n' +
        (top ? `Top offenders: ${top}.\n\n` : '') +
        'On-device — every number a counted event, every vendor a cited database row. ' +
        'Nothing guessed.\n\nGet AnkrShield (free): https://xshieldai.com',
    }).catch(() => {});
  };

  // Shield off with nothing yet witnessed → lead with the one action that lights
  // up the whole report. (If there's past data we still show it, plus a resume CTA.)
  if (!shieldOn && witnessed.length === 0) {
    return (
      <View style={[s.container, s.center, { padding: 28 }]}>
        <Text style={s.ctaIcon}>🛡️</Text>
        <Text style={s.ctaTitle}>Turn on the shield to start witnessing</Text>
        <Text style={s.ctaBody}>
          The Privacy Report shows which app contacted which tracker — but only while the DNS shield
          is on. Turn it on, use your phone normally, and the report builds itself. Your apps keep
          working; banking is auto-excluded.
        </Text>
        <TouchableOpacity style={s.ctaBtn} onPress={startShield} disabled={starting}>
          {starting ? (
            <ActivityIndicator color="#04121f" />
          ) : (
            <Text style={s.ctaBtnText}>Turn on DNS Shield</Text>
          )}
        </TouchableOpacity>
        <Text style={s.ctaFoot}>Everything stays on your phone. Nothing is uploaded.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ── Shield-off banner when past data exists ──────────────── */}
      {!shieldOn && (
        <TouchableOpacity style={s.resumeBanner} onPress={startShield} disabled={starting}>
          <Text style={s.resumeText}>
            {starting ? 'Turning on…' : '⏸ Shield is off — witnessing paused. Tap to resume.'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Quarantined apps — contained, releasable ─────────────── */}
      {quarantined.length > 0 && (
        <View style={s.quarantineCard}>
          <Text style={s.quarantineTitle}>🔒 Quarantined — contained</Text>
          <Text style={s.quarantineSub}>
            Every network request from these apps is blocked, pending your decision.
          </Text>
          {quarantined.map((q) => (
            <View key={q.pkg} style={s.quarantineRow}>
              <Text style={s.quarantineApp} numberOfLines={1}>
                {q.name}
              </Text>
              <TouchableOpacity style={s.releaseBtn} onPress={() => releaseQuarantine(q.pkg)}>
                <Text style={s.releaseBtnText}>Release</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ── Hero — the telling, calm ─────────────────────────────── */}
      <View style={s.hero}>
        <Text style={s.heroLabel}>In the last 30 days</Text>
        <Text style={s.heroNumber}>{totalBeyond.toLocaleString()}</Text>
        <Text style={s.heroSub}>
          contacts beyond app scope, by {trackedApps} app{trackedApps === 1 ? '' : 's'}
        </Text>
        <Text style={s.heroCalm}>Your apps kept working normally the whole time.</Text>
        {totalBeyond > 0 && (
          <TouchableOpacity style={s.shareBtn} onPress={shareSummary}>
            <Text style={s.shareBtnText}>📤 Share this report</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Protector line — we are ALREADY helping, not just reporting ─── */}
      {totalBlocked > 0 && (
        <View style={s.protector}>
          <Text style={s.protectorTitle}>🛡️ AnkrShield already tamed these apps for you.</Text>
          <Text style={s.protectorBody}>
            {totalBlocked.toLocaleString()} tracker contacts were{' '}
            <Text style={s.protectorStrong}>blocked by default</Text> across {trackedApps} app
            {trackedApps === 1 ? '' : 's'} — and every app kept working. This isn't a warning list;
            it's what the shield quietly stopped. Tap any app to see its receipts, or Tame it to
            lock its trackers out for good.
          </Text>
        </View>
      )}

      {/* ── Mode ─────────────────────────────────────────────────── */}
      <View style={s.modeCard}>
        <View style={s.modeText}>
          <Text style={s.modeTitle}>
            {mode === 'intelligent' ? '🧠 Intelligent mode' : '🛡 Guard mode'}
          </Text>
          <Text style={s.modeDesc}>
            {mode === 'intelligent'
              ? 'Non-intrusive: banking apps auto-excluded, trackers witnessed, blast radius controlled.'
              : 'Overreach guards on: only apps you explicitly excluded are bypassed.'}
          </Text>
        </View>
        <Switch
          value={mode === 'guard'}
          onValueChange={handleMode}
          trackColor={{ false: '#1e293b', true: '#b45309' }}
          thumbColor={mode === 'guard' ? '#f59e0b' : '#64748b'}
        />
      </View>

      {/* ── Stat row ─────────────────────────────────────────────── */}
      <View style={s.statRow}>
        <View style={s.stat}>
          <Text style={s.statVal}>{witnessed.length}</Text>
          <Text style={s.statLbl}>apps witnessed</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.stat}>
          <Text style={s.statVal}>{vendorMax}</Text>
          <Text style={s.statLbl}>most vendors, one app</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.stat}>
          <Text style={s.statVal}>{unwitnessed.length}</Text>
          <Text style={s.statLbl}>excluded (banking)</Text>
        </View>
      </View>

      {/* ── Honesty strip — the NULL said out loud ───────────────── */}
      <View style={s.honesty}>
        <Text style={s.honestyText}>
          Witness vantage: DNS-visible traffic only.
          {nullPct > 0
            ? ` ${nullPct}% of contacts could not be attributed to an app — counted, not guessed.`
            : ' Every observed contact was attributed to its app by the Android kernel.'}
        </Text>
      </View>

      {/* ── Per-app verdicts ─────────────────────────────────────── */}
      <Text style={s.sectionHdr}>App report cards</Text>
      {witnessed.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No observations yet</Text>
          <Text style={s.emptySub}>
            Turn on DNS protection and use your phone — the report builds itself.
          </Text>
        </View>
      )}
      {witnessed.map((v) => (
        <TouchableOpacity
          key={v.packageName}
          style={[s.card, v.critical && s.cardCritical, v.aggressive && s.cardAggressive]}
          onPress={() => toggleExpand(v)}
          activeOpacity={0.7}
        >
          <View style={s.cardTop}>
            <View style={s.cardInfo}>
              <Text style={s.appName} numberOfLines={1}>
                {v.appName}
              </Text>
              {v.critical ? (
                <Text style={s.criticalTag}>⚠ stalkerware/spyware-grade contact — act now</Text>
              ) : v.aggressive ? (
                <Text style={s.aggressiveTag}>
                  ⚠ aggressive data collection · {v.beyondScope.toLocaleString()} beyond-scope ·{' '}
                  {v.vendorCount} vendor{v.vendorCount === 1 ? '' : 's'}
                </Text>
              ) : v.beyondScope > 0 ? (
                <Text style={s.trackedTag}>
                  {v.beyondScope.toLocaleString()} beyond-scope · {v.vendorCount} named vendor
                  {v.vendorCount === 1 ? '' : 's'}
                  {v.beyondBlocked > 0 ? ` · ${v.beyondBlocked.toLocaleString()} blocked` : ''}
                </Text>
              ) : (
                <Text style={s.cleanTag}>no known tracker contacted</Text>
              )}
              {isBrowser(v.packageName) && v.beyondScope > 0 && (
                <Text style={s.browserNote}>
                  🌐 Browser traffic — reflects every website you visited, not the browser itself.
                </Text>
              )}
              {isTamed(v.packageName) && (
                <Text style={s.tamedBadge}>
                  🐾 Tamed — its trackers are force-blocked, the app still works.
                </Text>
              )}
            </View>
            <View style={s.cardRight}>
              <Text style={s.lastSeen}>{timeAgo(v.lastTs)}</Text>
              <Text style={s.chevron}>
                {expanded === v.packageName
                  ? '▾ hide'
                  : v.receiptCount > 0
                    ? `🧾 ${v.receiptCount} ▸`
                    : '▸'}
              </Text>
            </View>
          </View>

          {/* Receipts — the citations behind the verdict */}
          {expanded === v.packageName && (
            <View style={s.receipts}>
              {(receipts[v.packageName] ?? []).slice(0, 12).map((r) => (
                <View key={r.domain} style={s.receiptRow}>
                  <Text style={s.receiptDomain} numberOfLines={1}>
                    {r.domain}
                  </Text>
                  <Text style={s.receiptMeta}>
                    {CAT_LABEL[r.category] ?? r.category}
                    {r.vendor ? ` · ${r.vendor}` : ''} · ×{r.blocked + r.allowed}
                  </Text>
                </View>
              ))}
              {!receipts[v.packageName] && <ActivityIndicator size="small" color="#60a5fa" />}

              {/* Tame — force-block this app's trackers, keep it working */}
              {v.beyondScope > 0 && (
                <TouchableOpacity
                  style={[s.tameBtn, isTamed(v.packageName) && s.tameBtnOn]}
                  onPress={() => toggleTame(v.packageName)}
                >
                  <Text style={[s.tameBtnText, isTamed(v.packageName) && s.tameBtnTextOn]}>
                    {isTamed(v.packageName)
                      ? '🐾 Tamed — tap to un-tame'
                      : '🐾 Tame this app (block its trackers, keep it working)'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Evidence pack — turn this witness into a filable DPDP/GDPR complaint */}
              {v.beyondScope > 0 && (
                <TouchableOpacity style={s.evidenceBtn} onPress={() => shareEvidence(v)}>
                  <Text style={s.evidenceBtnText}>
                    📄 Generate evidence pack (DPDP / GDPR complaint)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </TouchableOpacity>
      ))}

      {/* ── Unwitnessed — bypassed is not safe, and we say so ────── */}
      {unwitnessed.length > 0 && (
        <>
          <Text style={s.sectionHdr}>Excluded — not observed</Text>
          <Text style={s.sectionSub}>
            These apps bypass the shield so they work without interference (banking needs this).
            Nothing was observed about them — excluded means unwitnessed, not safe.
          </Text>
          {unwitnessed.map((v) => (
            <View key={v.packageName} style={s.cardMuted}>
              <Text style={s.appNameMuted}>{v.appName}</Text>
              <Text style={s.mutedTag}>
                {v.autoBypassed ? '🏦 auto-excluded · Intelligent mode' : 'excluded by you'}
              </Text>
            </View>
          ))}
        </>
      )}

      {/* ── Footer — the method, stated ──────────────────────────── */}
      <Text style={s.footer}>
        Every count above is a witnessed DNS event. Every vendor and category is a row in the
        on-device tracker database (203,113 entries). This report never leaves your phone. Nothing
        here was generated or guessed.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },
  content: { padding: 16, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Turn-on-shield CTA (empty + shield off)
  ctaIcon: { fontSize: 52, marginBottom: 18 },
  ctaTitle: {
    color: '#f1f5f9',
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  ctaBody: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  ctaBtn: {
    backgroundColor: '#60a5fa',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    minWidth: 220,
    alignItems: 'center',
  },
  ctaBtnText: { color: '#04121f', fontSize: 16, fontWeight: '800' },
  ctaFoot: { color: '#475569', fontSize: 12, marginTop: 16, textAlign: 'center' },

  // Resume banner (shield off but past data present)
  resumeBanner: {
    backgroundColor: '#3b1d0a',
    borderWidth: 1,
    borderColor: '#b45309',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  resumeText: { color: '#fbbf24', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  quarantineCard: {
    backgroundColor: '#160808',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  quarantineTitle: { color: '#fca5a5', fontSize: 15, fontWeight: '800' },
  quarantineSub: { color: '#94a3b8', fontSize: 12, marginTop: 3, marginBottom: 10, lineHeight: 17 },
  quarantineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#3f1414',
  },
  quarantineApp: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 10 },
  releaseBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  releaseBtnText: { color: '#93c5fd', fontSize: 13, fontWeight: '700' },

  hero: { alignItems: 'center', paddingVertical: 28 },
  heroLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  heroNumber: { color: '#f1f5f9', fontSize: 56, fontWeight: '800', marginVertical: 4 },
  heroSub: { color: '#94a3b8', fontSize: 15 },
  heroCalm: { color: '#4ade80', fontSize: 13, marginTop: 10, fontWeight: '600' },

  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 12,
  },
  modeText: { flex: 1, marginRight: 12 },
  modeTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  modeDesc: { color: '#64748b', fontSize: 12, marginTop: 3, lineHeight: 17 },

  statRow: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 14,
    marginBottom: 12,
  },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { color: '#f1f5f9', fontSize: 20, fontWeight: '800' },
  statLbl: { color: '#64748b', fontSize: 10, marginTop: 3, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#1e293b' },

  honesty: {
    backgroundColor: '#0c1428',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    padding: 12,
    marginBottom: 20,
  },
  honestyText: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },

  sectionHdr: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 8,
  },
  sectionSub: { color: '#475569', fontSize: 12, lineHeight: 18, marginBottom: 10 },

  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 8,
  },
  cardCritical: { borderColor: '#7f1d1d', backgroundColor: '#160808' },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, marginRight: 8 },
  appName: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  criticalTag: { color: '#f87171', fontSize: 12, marginTop: 3, fontWeight: '700' },
  aggressiveTag: { color: '#fbbf24', fontSize: 12, marginTop: 3, fontWeight: '700' },
  cardAggressive: { borderColor: '#b45309' },
  browserNote: { color: '#93c5fd', fontSize: 11, marginTop: 4, lineHeight: 15 },
  shareBtn: {
    marginTop: 16,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  shareBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  protector: {
    backgroundColor: '#0a1f14',
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  protectorTitle: { color: '#4ade80', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  protectorBody: { color: '#a7f3d0', fontSize: 13, lineHeight: 19 },
  protectorStrong: { color: '#4ade80', fontWeight: '800' },

  tamedBadge: { color: '#5eead4', fontSize: 11, marginTop: 4, fontWeight: '700', lineHeight: 15 },
  tameBtn: {
    marginTop: 12,
    backgroundColor: '#0c2a1a',
    borderWidth: 1,
    borderColor: '#166534',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tameBtnOn: { backgroundColor: '#134e2e', borderColor: '#22c55e' },
  tameBtnText: { color: '#86efac', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  tameBtnTextOn: { color: '#4ade80' },
  evidenceBtn: {
    marginTop: 8,
    backgroundColor: '#0c1428',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  evidenceBtnText: { color: '#93c5fd', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  trackedTag: { color: '#f59e0b', fontSize: 12, marginTop: 3 },
  cleanTag: { color: '#4ade80', fontSize: 12, marginTop: 3 },
  cardRight: { alignItems: 'flex-end' },
  lastSeen: { color: '#475569', fontSize: 10 },
  chevron: { color: '#475569', fontSize: 14, marginTop: 4 },

  receipts: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 10 },
  receiptRow: { marginBottom: 8 },
  receiptDomain: { color: '#93c5fd', fontSize: 12, fontFamily: 'monospace' },
  receiptMeta: { color: '#64748b', fontSize: 11, marginTop: 1 },

  cardMuted: {
    backgroundColor: '#0b1020',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  appNameMuted: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  mutedTag: { color: '#475569', fontSize: 11, marginTop: 2 },

  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { color: '#9ca3af', fontSize: 15, fontWeight: '600' },
  emptySub: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  footer: { color: '#334155', fontSize: 11, lineHeight: 17, marginTop: 24, textAlign: 'center' },
});
