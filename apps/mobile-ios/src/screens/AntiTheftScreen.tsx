/**
 * AntiTheftScreen — Device lock and remote wipe protection.
 * Requires Device Admin activation (one-time, in Android Settings).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  NativeModules,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { DebugLog } from '../services/DebugLog';

const { AntiTheft } = NativeModules;

interface LocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  provider: string;
  ageMs: number;
}

function formatAge(ms: number): string {
  if (ms < 60_000) {
    return 'just now';
  }
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)}m ago`;
  }
  if (ms < 86_400_000) {
    return `${Math.floor(ms / 3_600_000)}h ago`;
  }
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatCoord(n: number, pos: string, neg: string): string {
  const dir = n >= 0 ? pos : neg;
  return `${Math.abs(n).toFixed(5)}° ${dir}`;
}

export function AntiTheftScreen() {
  const [adminActive, setAdminActive] = useState<boolean | null>(null);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [showWipeInput, setShowWipeInput] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  const refresh = useCallback(async () => {
    if (!AntiTheft) {
      return;
    }
    const active: boolean = await AntiTheft.isDeviceAdminActive().catch(() => false);
    setAdminActive(active);
  }, []);

  const fetchLocation = useCallback(async () => {
    if (!AntiTheft) {
      return;
    }
    setLocLoading(true);
    try {
      const loc: LocationResult | null = await AntiTheft.getLastLocation();
      setLocation(loc);
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    fetchLocation();
  }, [refresh, fetchLocation]);

  const handleActivate = useCallback(async () => {
    try {
      DebugLog.log('AntiTheft', 'opening Device Admin activation screen');
      await AntiTheft?.requestAdminActivation?.();
    } catch (e: any) {
      const msg = e?.message ?? 'Could not open the Device Admin screen.';
      DebugLog.error('AntiTheft', 'activation failed:', msg);
      Alert.alert(
        'Could not open Device Admin',
        `${msg}\n\nYou can enable it manually: Settings → Security → Device admin apps → AnkrShield.`
      );
    }
    // Re-check status a few times (user may return after activating in Settings).
    setTimeout(refresh, 2000);
    setTimeout(refresh, 5000);
    setTimeout(refresh, 10000);
  }, [refresh]);

  const handleLock = useCallback(() => {
    Alert.alert(
      'Lock Device?',
      'This will immediately lock your screen. You will need your PIN/password to unlock.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock Now',
          style: 'destructive',
          onPress: async () => {
            setActionInProgress(true);
            try {
              await AntiTheft.lockDevice();
            } catch (e: any) {
              Alert.alert('Lock Failed', e?.message ?? 'Could not lock device.');
            } finally {
              setActionInProgress(false);
            }
          },
        },
      ]
    );
  }, []);

  const handleWipe = useCallback(() => {
    if (wipeConfirmText.trim().toUpperCase() !== 'WIPE') {
      return;
    }
    Alert.alert(
      '⚠️ Final Confirmation',
      'This will PERMANENTLY erase all data on this device. It cannot be undone. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase Everything',
          style: 'destructive',
          onPress: async () => {
            setActionInProgress(true);
            try {
              await AntiTheft.wipeDevice();
            } catch (e: any) {
              Alert.alert('Wipe Failed', e?.message ?? 'Could not initiate factory reset.');
              setActionInProgress(false);
            }
          },
        },
      ]
    );
  }, [wipeConfirmText]);

  if (Platform.OS !== 'android') {
    return (
      <View style={s.center}>
        <Text style={s.unavail}>Anti-Theft is available on Android only.</Text>
      </View>
    );
  }

  if (!AntiTheft) {
    return (
      <View style={s.center}>
        <Text style={s.unavail}>AntiTheft module not available.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>🔒 Anti-Theft</Text>
        <Text style={s.subtitle}>Remote lock and wipe protection for lost or stolen devices</Text>
      </View>

      {/* Device Admin Status */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>DEVICE ADMIN STATUS</Text>
        <View style={[s.statusCard, adminActive ? s.statusCardActive : s.statusCardInactive]}>
          <View style={s.statusRow}>
            <Text style={s.statusIcon}>{adminActive ? '🛡' : '⚠️'}</Text>
            <View style={s.statusTextBlock}>
              <Text
                style={[s.statusTitle, adminActive ? s.statusTitleActive : s.statusTitleInactive]}
              >
                {adminActive === null
                  ? 'Checking...'
                  : adminActive
                    ? 'Device Admin Active'
                    : 'Device Admin Not Active'}
              </Text>
              <Text style={s.statusDesc}>
                {adminActive
                  ? 'Lock and wipe are available.'
                  : 'Activate Device Admin to enable lock and wipe.'}
              </Text>
            </View>
          </View>
          {!adminActive && adminActive !== null && (
            <TouchableOpacity style={s.activateBtn} onPress={handleActivate}>
              <Text style={s.activateBtnText}>Activate Device Admin →</Text>
            </TouchableOpacity>
          )}
          {adminActive && (
            <TouchableOpacity style={s.refreshBtn} onPress={refresh}>
              <Text style={s.refreshBtnText}>↻ Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Last Known Location */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>LAST KNOWN LOCATION</Text>
        <View style={s.locationCard}>
          {locLoading ? (
            <Text style={s.locLoading}>Reading location...</Text>
          ) : location ? (
            <>
              <View style={s.coordRow}>
                <View style={s.coordItem}>
                  <Text style={s.coordLabel}>LAT</Text>
                  <Text style={s.coordValue}>{formatCoord(location.lat, 'N', 'S')}</Text>
                </View>
                <View style={s.coordDivider} />
                <View style={s.coordItem}>
                  <Text style={s.coordLabel}>LNG</Text>
                  <Text style={s.coordValue}>{formatCoord(location.lng, 'E', 'W')}</Text>
                </View>
              </View>
              <View style={s.locMeta}>
                <Text style={s.locMetaText}>
                  ±{Math.round(location.accuracy)}m · via {location.provider} ·{' '}
                  {formatAge(location.ageMs)}
                </Text>
              </View>
            </>
          ) : (
            <View style={s.noLoc}>
              <Text style={s.noLocText}>
                No cached location available.{'\n'}
                Open Maps or any location-enabled app once to cache a fix.
              </Text>
            </View>
          )}
          <TouchableOpacity style={s.locRefreshBtn} onPress={fetchLocation}>
            <Text style={s.locRefreshText}>↻ Refresh location</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lock Device */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>LOCK DEVICE</Text>
        <View style={s.actionCard}>
          <Text style={s.actionDesc}>
            Immediately locks the screen. Your PIN or password will be required to unlock.
          </Text>
          <TouchableOpacity
            style={[s.lockBtn, (!adminActive || actionInProgress) && s.btnDisabled]}
            onPress={handleLock}
            disabled={!adminActive || actionInProgress}
          >
            <Text style={s.lockBtnText}>🔒 Lock Device Now</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Remote Wipe */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>FACTORY RESET (IRREVERSIBLE)</Text>
        <View style={[s.actionCard, s.wipeCard]}>
          <View style={s.wipeWarning}>
            <Text style={s.wipeWarningIcon}>☠️</Text>
            <Text style={s.wipeWarningText}>
              This permanently erases ALL data on the device — apps, photos, messages, everything.
              It cannot be undone. Only use if the device is lost or stolen and you need to protect
              your data.
            </Text>
          </View>

          {!showWipeInput ? (
            <TouchableOpacity
              style={[s.wipeRevealBtn, !adminActive && s.btnDisabled]}
              onPress={() => adminActive && setShowWipeInput(true)}
              disabled={!adminActive}
            >
              <Text style={s.wipeRevealBtnText}>I understand — show wipe option</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={s.wipeInstructions}>
                Type <Text style={s.wipeWord}>WIPE</Text> to confirm factory reset:
              </Text>
              <TextInput
                style={[s.wipeInput, wipeConfirmText.toUpperCase() === 'WIPE' && s.wipeInputReady]}
                placeholder="Type WIPE here"
                placeholderTextColor="#4b5563"
                value={wipeConfirmText}
                onChangeText={setWipeConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <View style={s.wipeBtnRow}>
                <TouchableOpacity
                  style={s.wipeCancelBtn}
                  onPress={() => {
                    setShowWipeInput(false);
                    setWipeConfirmText('');
                  }}
                >
                  <Text style={s.wipeCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.wipeBtn, wipeConfirmText.toUpperCase() !== 'WIPE' && s.btnDisabled]}
                  onPress={handleWipe}
                  disabled={wipeConfirmText.toUpperCase() !== 'WIPE' || actionInProgress}
                >
                  <Text style={s.wipeBtnText}>Erase Device</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Privacy note */}
      <View style={s.privacyNote}>
        <Text style={s.privacyNoteText}>
          🔒 Lock and wipe work locally on this device.{'\n'}
          Remote commands over the network are coming in a future release.
        </Text>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingBottom: 20 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0a0a0a',
  },
  unavail: { color: '#64748b', fontSize: 14, textAlign: 'center' },

  header: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 3 },

  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },

  statusCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  statusCardActive: { backgroundColor: '#051a0a', borderColor: '#166534' },
  statusCardInactive: { backgroundColor: '#1a0e00', borderColor: '#92400e' },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusIcon: { fontSize: 28, marginTop: 2 },
  statusTextBlock: { flex: 1 },
  statusTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  statusTitleActive: { color: '#22c55e' },
  statusTitleInactive: { color: '#f59e0b' },
  statusDesc: { color: '#64748b', fontSize: 12 },
  activateBtn: {
    marginTop: 12,
    backgroundColor: '#92400e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activateBtnText: { color: '#fde68a', fontSize: 13, fontWeight: '700' },
  refreshBtn: { marginTop: 8, alignSelf: 'flex-end' },
  refreshBtnText: { color: '#22c55e', fontSize: 12 },

  locationCard: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
  },
  locLoading: { color: '#64748b', fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  coordItem: { flex: 1, alignItems: 'center' },
  coordLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  coordValue: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', fontFamily: 'monospace' },
  coordDivider: { width: 1, height: 32, backgroundColor: '#1e293b', marginHorizontal: 8 },
  locMeta: { alignItems: 'center', paddingTop: 4, borderTopWidth: 1, borderTopColor: '#1e293b' },
  locMetaText: { color: '#475569', fontSize: 11 },
  noLoc: { paddingVertical: 10 },
  noLocText: { color: '#475569', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  locRefreshBtn: { marginTop: 10, alignSelf: 'flex-end' },
  locRefreshText: { color: '#60a5fa', fontSize: 12 },

  actionCard: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
  },
  wipeCard: { borderColor: '#7f1d1d' },
  actionDesc: { color: '#94a3b8', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  lockBtn: {
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  lockBtnText: { color: '#93c5fd', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.35 },

  wipeWarning: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#1a0000',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  wipeWarningIcon: { fontSize: 22 },
  wipeWarningText: { flex: 1, color: '#fca5a5', fontSize: 12, lineHeight: 18 },
  wipeRevealBtn: {
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  wipeRevealBtnText: { color: '#f87171', fontSize: 13 },
  wipeInstructions: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
  wipeWord: { color: '#ef4444', fontWeight: '700' },
  wipeInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 10,
  },
  wipeInputReady: { borderColor: '#ef4444', backgroundColor: '#1a0000' },
  wipeBtnRow: { flexDirection: 'row', gap: 8 },
  wipeCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  wipeCancelBtnText: { color: '#64748b', fontSize: 13 },
  wipeBtn: {
    flex: 2,
    backgroundColor: '#7f1d1d',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  wipeBtnText: { color: '#fca5a5', fontSize: 13, fontWeight: '700' },

  privacyNote: {
    margin: 16,
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  privacyNoteText: { color: '#475569', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
