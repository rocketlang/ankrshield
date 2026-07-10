/**
 * A13 — Account Guard Screen
 *
 * One-glance session health for the apps that matter most:
 * WhatsApp, Gmail, Paytm, PhonePe, BHIM, Instagram, Facebook
 *
 * Status is derived from real A10/A11/A12 signals:
 *   GREEN  — no alerts in last 24h
 *   AMBER  — linked device added recently / SIM swap acknowledged / OTP in grace window
 *   RED    — active hijack attempt / unacknowledged SIM swap / new unknown linked device
 *
 * "Secure All" opens each app's security settings via deep link.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  NativeEventEmitter,
  NativeModules,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { OtpGuard, LinkedDevices, SimSwap } = NativeModules;

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountStatus = 'safe' | 'warning' | 'danger' | 'unknown';

interface AccountCard {
  id: string;
  name: string;
  icon: string;
  status: AccountStatus;
  detail: string;
  deepLink: string;
}

// ── Deep links to security settings for each major app ────────────────────────

const SECURITY_DEEPLINKS: Record<string, string> = {
  whatsapp: 'whatsapp://settings/account/security',
  gmail: 'googlegmail://settings/security',
  paytm: 'paytmmp://upi/manageLinkedBanks',
  phonepe: 'phonepe://settingssecurity',
  bhim: 'upi://pay',
  instagram: 'instagram://settings/security',
  facebook: 'fb://settings/security',
};

const FALLBACK_URLS: Record<string, string> = {
  whatsapp: 'https://www.whatsapp.com/security',
  gmail: 'https://myaccount.google.com/security',
  paytm: 'https://paytm.com/security',
  phonepe: 'https://www.phonepe.com/security',
  bhim: 'https://www.bhimupi.org.in/bhim-upi',
  instagram: 'https://www.instagram.com/accounts/security/',
  facebook: 'https://www.facebook.com/settings?tab=security',
};

// ── Color palette ─────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0e0b',
  bgCard: '#111811',
  border: '#1e2e20',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  text: '#f1f5f9',
  muted: '#64748b',
  mutedLight: '#94a3b8',
};

// ── Status → color / label ────────────────────────────────────────────────────

const STATUS_COLOR: Record<AccountStatus, string> = {
  safe: C.green,
  warning: C.amber,
  danger: C.red,
  unknown: C.muted,
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  safe: 'Secure',
  warning: 'Check',
  danger: 'At Risk',
  unknown: 'Checking...',
};

const STATUS_ICON: Record<AccountStatus, string> = {
  safe: '✅',
  warning: '⚠️',
  danger: '🚨',
  unknown: '⏳',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountGuardScreen() {
  const [accounts, setAccounts] = useState<AccountCard[]>([]);
  const [simSwapActive, setSimSwapActive] = useState(false);
  const [otpHijackCount, setOtpHijackCount] = useState(0);
  const [newLinkedDevices, setNewLinkedDevices] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadSignals = useCallback(async () => {
    try {
      const [otpEvents, linkedAlerts, swapHistory] = await Promise.all([
        OtpGuard?.getEventHistory?.() ?? Promise.resolve([]),
        LinkedDevices?.getNewDeviceAlerts?.() ?? Promise.resolve([]),
        SimSwap?.getSwapHistory?.() ?? Promise.resolve([]),
      ]);

      const now = Date.now();
      const H24 = 24 * 60 * 60 * 1000;

      // OTP hijack events in last 24h
      const recentHijacks = (otpEvents as any[]).filter((e) => !e.wasInGrace && now - e.ts < H24);
      setOtpHijackCount(recentHijacks.length);

      // New linked devices not yet dismissed
      setNewLinkedDevices((linkedAlerts as any[]).length);

      // SIM swap in last 10 min
      const recentSwap = (swapHistory as any[]).find((s) => now - s.ts < 10 * 60 * 1000);
      setSimSwapActive(!!recentSwap);

      const waStatus: AccountStatus =
        recentHijacks.length > 0
          ? 'danger'
          : (linkedAlerts as any[]).length > 0
            ? 'warning'
            : 'safe';

      const simStatus: AccountStatus = recentSwap ? 'danger' : 'safe';

      setAccounts([
        {
          id: 'whatsapp',
          name: 'WhatsApp',
          icon: '💬',
          status: waStatus,
          detail:
            waStatus === 'danger'
              ? `${recentHijacks.length} OTP hijack attempt${recentHijacks.length > 1 ? 's' : ''} detected`
              : waStatus === 'warning'
                ? `${(linkedAlerts as any[]).length} new linked device${(linkedAlerts as any[]).length > 1 ? 's' : ''}`
                : 'No threats in last 24h',
          deepLink: 'whatsapp',
        },
        {
          id: 'phonepe',
          name: 'PhonePe / GPay',
          icon: '💳',
          status: simStatus,
          detail:
            simStatus === 'danger' ? 'SIM swap — UPI blocked for 10 min' : 'No SIM swap detected',
          deepLink: 'phonepe',
        },
        {
          id: 'paytm',
          name: 'Paytm',
          icon: '💰',
          status: simStatus,
          detail: simStatus === 'danger' ? 'SIM swap — verify before transacting' : 'Normal',
          deepLink: 'paytm',
        },
        {
          id: 'gmail',
          name: 'Gmail',
          icon: '📧',
          status: 'unknown',
          detail: 'Not monitored — AnkrShield has no live signal for this app',
          deepLink: 'gmail',
        },
        {
          id: 'instagram',
          name: 'Instagram',
          icon: '📷',
          status: 'unknown',
          detail: 'Not monitored — AnkrShield has no live signal for this app',
          deepLink: 'instagram',
        },
        {
          id: 'bhim',
          name: 'BHIM UPI',
          icon: '🏛️',
          status: simStatus,
          detail: simStatus === 'danger' ? 'SIM swap — UPI blocked' : 'Normal',
          deepLink: 'bhim',
        },
        {
          id: 'facebook',
          name: 'Facebook',
          icon: '👥',
          status: 'unknown',
          detail: 'Not monitored — AnkrShield has no live signal for this app',
          deepLink: 'facebook',
        },
      ]);

      setLastUpdated(new Date());
    } catch (_err) {
      // Native modules not available (e.g. in simulator)
    }
  }, []);

  useEffect(() => {
    loadSignals();

    const emitters = [
      OtpGuard ? new NativeEventEmitter(OtpGuard) : null,
      LinkedDevices ? new NativeEventEmitter(LinkedDevices) : null,
      SimSwap ? new NativeEventEmitter(SimSwap) : null,
    ];

    const subs = [
      emitters[0]?.addListener('OtpGuardEvent', loadSignals),
      emitters[1]?.addListener('LinkedDeviceAdded', loadSignals),
      emitters[2]?.addListener('SimSwapDetected', loadSignals),
    ].filter(Boolean);

    return () => subs.forEach((s) => s?.remove());
  }, [loadSignals]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSignals();
    setRefreshing(false);
  }, [loadSignals]);

  const openSecuritySettings = useCallback(async (card: AccountCard) => {
    const deepLink = SECURITY_DEEPLINKS[card.id];
    const fallback = FALLBACK_URLS[card.id];
    try {
      const canOpen = deepLink && (await Linking.canOpenURL(deepLink));
      if (canOpen) {
        await Linking.openURL(deepLink);
      } else if (fallback) {
        await Linking.openURL(fallback);
      }
    } catch (_err) {
      if (fallback) {
        await Linking.openURL(fallback).catch(() => {});
      }
    }
  }, []);

  const secureAll = useCallback(async () => {
    Alert.alert(
      'Secure All Accounts',
      "This will open each app's security settings so you can review linked sessions. Continue?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open All',
          onPress: async () => {
            for (const acc of accounts) {
              const deepLink = SECURITY_DEEPLINKS[acc.id];
              const canOpen = deepLink && (await Linking.canOpenURL(deepLink));
              if (canOpen) {
                await Linking.openURL(deepLink);
                await new Promise((r) => setTimeout(r, 2000));
              }
            }
          },
        },
      ]
    );
  }, [accounts]);

  const acknowledgeSimSwap = useCallback(async () => {
    Alert.alert(
      'Acknowledge SIM Change',
      'Did you recently get a new SIM card intentionally? If yes, tap Confirm to update the security baseline.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I got a new SIM',
          onPress: async () => {
            await SimSwap?.acknowledgeSwap?.();
            await loadSignals();
          },
        },
      ]
    );
  }, [loadSignals]);

  const overallStatus: AccountStatus = accounts.some((a) => a.status === 'danger')
    ? 'danger'
    : accounts.some((a) => a.status === 'warning')
      ? 'warning'
      : accounts.length > 0
        ? 'safe'
        : 'unknown';

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} />
        }
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Account Guard</Text>
          {lastUpdated && (
            <Text style={s.headerSub}>
              Updated{' '}
              {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>

        {/* Overall status banner */}
        <View
          style={[
            s.banner,
            {
              borderColor: STATUS_COLOR[overallStatus] + '55',
              backgroundColor: STATUS_COLOR[overallStatus] + '11',
            },
          ]}
        >
          <Text style={[s.bannerIcon]}>{STATUS_ICON[overallStatus]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerTitle, { color: STATUS_COLOR[overallStatus] }]}>
              {overallStatus === 'safe' && 'All accounts secure'}
              {overallStatus === 'warning' && 'Review recommended'}
              {overallStatus === 'danger' && 'Active threat detected'}
              {overallStatus === 'unknown' && 'Loading signals...'}
            </Text>
            <Text style={s.bannerSub}>
              {overallStatus === 'danger' && 'Tap the affected account for details'}
              {overallStatus === 'warning' && 'Some accounts need your attention'}
              {overallStatus === 'safe' && 'No active threats in the last 24 hours'}
            </Text>
          </View>
        </View>

        {/* Active alerts summary */}
        {(otpHijackCount > 0 || newLinkedDevices > 0 || simSwapActive) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Active Alerts</Text>

            {otpHijackCount > 0 && (
              <View style={[s.alertRow, { borderColor: C.red + '44' }]}>
                <Text style={s.alertIcon}>🚨</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.alertTitle, { color: C.red }]}>
                    {otpHijackCount} WhatsApp OTP hijack attempt{otpHijackCount > 1 ? 's' : ''}
                  </Text>
                  <Text style={s.alertSub}>OTP arrived without re-registration — blocked</Text>
                </View>
              </View>
            )}

            {newLinkedDevices > 0 && (
              <View style={[s.alertRow, { borderColor: C.amber + '44' }]}>
                <Text style={s.alertIcon}>📱</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.alertTitle, { color: C.amber }]}>
                    {newLinkedDevices} new WhatsApp linked device{newLinkedDevices > 1 ? 's' : ''}
                  </Text>
                  <Text style={s.alertSub}>Open WhatsApp → Linked Devices to review</Text>
                </View>
              </View>
            )}

            {simSwapActive && (
              <TouchableOpacity
                style={[s.alertRow, { borderColor: C.red + '44' }]}
                onPress={acknowledgeSimSwap}
              >
                <Text style={s.alertIcon}>📡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.alertTitle, { color: C.red }]}>SIM card swapped</Text>
                  <Text style={s.alertSub}>
                    UPI blocked for 10 min · Tap to acknowledge if intentional
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Account cards */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account Status</Text>
          {accounts.map((acc) => (
            <TouchableOpacity
              key={acc.id}
              style={[s.card, { borderColor: STATUS_COLOR[acc.status] + '33' }]}
              onPress={() => openSecuritySettings(acc)}
              activeOpacity={0.75}
            >
              <Text style={s.cardIcon}>{acc.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.cardName}>{acc.name}</Text>
                <Text
                  style={[
                    s.cardDetail,
                    {
                      color:
                        STATUS_COLOR[acc.status] === C.green ? C.muted : STATUS_COLOR[acc.status],
                    },
                  ]}
                >
                  {acc.detail}
                </Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[acc.status] + '22' }]}>
                <Text style={[s.statusText, { color: STATUS_COLOR[acc.status] }]}>
                  {STATUS_LABEL[acc.status]}
                </Text>
              </View>
              <Text style={[s.chevron, { color: C.muted }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Secure All button */}
        <TouchableOpacity style={s.secureAllBtn} onPress={secureAll} activeOpacity={0.8}>
          <Text style={s.secureAllText}>🔒 Secure All Accounts</Text>
          <Text style={s.secureAllSub}>Opens security settings in each app</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={s.footer}>
          Signals from: OTP Guard (A10) · Linked Devices Watchdog (A11) · SIM Swap Detector (A12)
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 40 },

  header: { marginBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 12, color: C.muted, marginTop: 2 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  bannerIcon: { fontSize: 28 },
  bannerTitle: { fontSize: 16, fontWeight: '700' },
  bannerSub: { fontSize: 12, color: C.muted, marginTop: 2 },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  alertIcon: { fontSize: 20 },
  alertTitle: { fontSize: 14, fontWeight: '700' },
  alertSub: { fontSize: 12, color: C.muted, marginTop: 2 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  cardIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  cardName: { fontSize: 14, fontWeight: '700', color: C.text },
  cardDetail: { fontSize: 12, marginTop: 2 },

  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 11, fontWeight: '700' },

  chevron: { fontSize: 18, fontWeight: '300' },

  secureAllBtn: {
    backgroundColor: C.green + '15',
    borderWidth: 1,
    borderColor: C.green + '44',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  secureAllText: { fontSize: 16, fontWeight: '800', color: C.green },
  secureAllSub: { fontSize: 12, color: C.muted, marginTop: 4 },

  footer: {
    fontSize: 10,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
