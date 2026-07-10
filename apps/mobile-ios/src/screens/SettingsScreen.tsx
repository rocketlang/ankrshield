/**
 * Settings Screen
 * App configuration and preferences
 */

import type { ProtectionMode } from '@ankrshield/privacy-engine';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
  NativeModules,
  PermissionsAndroid,
} from 'react-native';

import { setLanguage, getLanguage, supportedLanguages, type Lang } from '../i18n';
import { MdmStorage } from '../mdm/storage';
import { vpnService } from '../services/VpnService';
import { APP_VERSION } from '../appVersion';

const { WhatsAppGuard, BitwardenBridge } = NativeModules;

const PROTECTION_MODE_KEY = '@ankrshield/protection-mode';

const MODE_INFO: Record<ProtectionMode, { label: string; icon: string; desc: string }> = {
  smart: {
    label: 'Smart',
    icon: '🧠',
    desc: 'Block only real threats — browsers and normal apps always work',
  },
  strict: {
    label: 'Strict',
    icon: '🛡',
    desc: 'Block all trackers including analytics and advertising',
  },
  monitor: {
    label: 'Monitor',
    icon: '👁',
    desc: "Watch only — never block, just show what's happening",
  },
};

export function SettingsScreen({ navigation }: any) {
  // Network protection mirrors DNS filtering — same VPN, kept in sync
  const [activeLang, setActiveLang] = useState<Lang>(getLanguage());
  const [bwInstalled, setBwInstalled] = useState<boolean | null>(null);
  const [bwAutofill, setBwAutofill] = useState(false);
  const [dnsFiltering, setDnsFiltering] = useState(false);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsPaused, setDnsPaused] = useState(false);
  const [pauseUntilMs, setPauseUntilMs] = useState(0);
  const [notifications, setNotifications] = useState(true);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [protectionMode, setProtectionModeState] = useState<ProtectionMode>('smart');
  const [simpleMode, setSimpleMode] = useState(false);

  useEffect(() => {
    MdmStorage.getItem('@ankrshield/mode')
      .then((m) => setSimpleMode(m !== 'tech')) // default is Simple
      .catch(() => {});
  }, []);

  function handleLangChange(lang: Lang) {
    setLanguage(lang);
    setActiveLang(lang);
    MdmStorage.setItem('@ankrshield/language', lang).catch(() => {});
  }

  async function handleModeChange(mode: ProtectionMode) {
    setProtectionModeState(mode);
    await MdmStorage.setItem(PROTECTION_MODE_KEY, mode);
    // VPN applies mode on next rule reload — no restart needed for next connection
  }

  // Sync DNS + pause state every 5 s; load saved notification preference
  useEffect(() => {
    async function syncState() {
      const stats = await vpnService.getStats().catch(() => null);
      if (stats) {
        setDnsFiltering(stats.running);
        setDnsPaused(stats.paused);
        setPauseUntilMs(stats.pauseUntilMs);
      }
    }
    syncState();
    const interval = setInterval(syncState, 5000);

    // Load persisted notification preference
    if (Platform.OS === 'android' && WhatsAppGuard) {
      WhatsAppGuard.getNotificationsEnabled()
        .then((v: boolean) => setNotifications(v))
        .catch(() => {});
    }

    // Load persisted protection mode
    MdmStorage.getItem(PROTECTION_MODE_KEY)
      .then((saved) => {
        if (saved === 'smart' || saved === 'strict' || saved === 'monitor') {
          setProtectionModeState(saved);
        }
      })
      .catch(() => {});

    // Restore persisted language preference
    MdmStorage.getItem('@ankrshield/language')
      .then((saved) => {
        if (saved === 'en' || saved === 'hi' || saved === 'ta' || saved === 'te') {
          setLanguage(saved as Lang);
          setActiveLang(saved as Lang);
        }
      })
      .catch(() => {});

    // Bitwarden status (Android only)
    if (Platform.OS === 'android' && BitwardenBridge) {
      BitwardenBridge.getStatus()
        .then((s: { installed: boolean; autofillEnabled: boolean }) => {
          setBwInstalled(s.installed);
          setBwAutofill(s.autofillEnabled);
        })
        .catch(() => setBwInstalled(false));
    }

    return () => clearInterval(interval);
  }, []);

  function pauseLabel(): string {
    if (!dnsPaused) {
      return '';
    }
    if (pauseUntilMs === 0) {
      return 'Paused — phone call active';
    }
    const mins = Math.max(0, Math.round((pauseUntilMs - Date.now()) / 60000));
    return `Paused — resumes in ${mins} min`;
  }

  async function handlePause(minutes: number) {
    try {
      await vpnService.pause(minutes);
      setDnsPaused(true);
      setPauseUntilMs(Date.now() + minutes * 60000);
    } catch (e) {
      Alert.alert('Bypass', 'Could not pause DNS filtering');
    }
  }

  async function handleResume() {
    try {
      await vpnService.resume();
      setDnsPaused(false);
      setPauseUntilMs(0);
    } catch (e) {
      Alert.alert('Bypass', 'Could not resume DNS filtering');
    }
  }

  async function handleNotificationsToggle(value: boolean) {
    if (notifsLoading || Platform.OS !== 'android' || !WhatsAppGuard) {
      return;
    }
    setNotifsLoading(true);
    try {
      if (value) {
        // Android 13+ requires POST_NOTIFICATIONS runtime permission
        const apiLevel = Platform.Version as number;
        if (apiLevel >= 33) {
          const grant = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Allow notifications',
              message:
                'AnkrShield needs permission to alert you when a dangerous file is detected in WhatsApp.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            }
          );
          if (grant !== PermissionsAndroid.RESULTS.GRANTED) {
            setNotifsLoading(false);
            return;
          }
        }
      }
      await WhatsAppGuard.setNotificationsEnabled(value);
      setNotifications(value);
    } catch (_e) {
      Alert.alert('Notifications', 'Could not update notification preference.');
    } finally {
      setNotifsLoading(false);
    }
  }

  async function handleDnsToggle(value: boolean) {
    if (dnsLoading) {
      return;
    }
    setDnsLoading(true);
    try {
      if (value) {
        await vpnService.start();
        setDnsFiltering(true);
      } else {
        await vpnService.stop();
        setDnsFiltering(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'VPN error';
      Alert.alert('DNS Filtering', msg);
      // Revert to actual running state on error
      const running = await vpnService.isRunning().catch(() => false);
      setDnsFiltering(running);
    } finally {
      setDnsLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Interface</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Simple Mode</Text>
            <Text style={styles.settingDescription}>
              One-tap protection screen. Turn off for the full advanced toolset.
            </Text>
          </View>
          <Switch
            value={simpleMode}
            onValueChange={async (v) => {
              setSimpleMode(v);
              await MdmStorage.setItem('@ankrshield/mode', v ? 'simple' : 'tech').catch(() => {});
              if (v) {
                navigation.navigate('Simple');
              }
            }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Protection</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Network Protection</Text>
            <Text style={styles.settingDescription}>Block trackers and malicious connections</Text>
          </View>
          <Switch
            value={dnsFiltering}
            onValueChange={handleDnsToggle}
            disabled={dnsLoading || Platform.OS !== 'android'}
            trackColor={{ false: '#333', true: '#4CAF50' }}
            thumbColor={dnsLoading ? '#888' : '#fff'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>DNS Filtering</Text>
            <Text style={styles.settingDescription}>
              {Platform.OS === 'android'
                ? 'Intercepts DNS on-device — no data leaves your phone'
                : 'Available on Android (Sprint 4 for iOS)'}
            </Text>
          </View>
          <Switch
            value={dnsFiltering}
            onValueChange={handleDnsToggle}
            disabled={dnsLoading || Platform.OS !== 'android'}
            trackColor={{ false: '#333', true: '#4CAF50' }}
            thumbColor={dnsLoading ? '#888' : '#fff'}
          />
        </View>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => navigation.navigate('WhatsAppGuard')}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>💬 WhatsApp Guard</Text>
            <Text style={styles.settingDescription}>
              Scan attachments, detect impersonation & AI voice calls
            </Text>
          </View>
          <Text style={styles.settingValue}>&gt;</Text>
        </TouchableOpacity>

        {/* Bypass / pause controls — shown only when DNS filtering is active */}
        {dnsFiltering && Platform.OS === 'android' && (
          <View style={styles.bypassBox}>
            {dnsPaused ? (
              <>
                <Text style={styles.bypassStatus}>{pauseLabel()}</Text>
                {pauseUntilMs > 0 && (
                  <TouchableOpacity style={styles.bypassResumeBtn} onPress={handleResume}>
                    <Text style={styles.bypassResumeTxt}>Resume protection now</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={styles.bypassHint}>
                  Need to browse freely? Pause filtering temporarily. DNS resumes automatically on a
                  call too.
                </Text>
                <View style={styles.bypassRow}>
                  <TouchableOpacity style={styles.bypassBtn} onPress={() => handlePause(5)}>
                    <Text style={styles.bypassBtnTxt}>Pause 5 min</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bypassBtn} onPress={() => handlePause(30)}>
                    <Text style={styles.bypassBtnTxt}>Pause 30 min</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </View>

      {/* Protection Mode */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Protection Mode</Text>
        <View style={styles.modeRow}>
          {(['smart', 'strict', 'monitor'] as ProtectionMode[]).map((mode) => {
            const info = MODE_INFO[mode];
            const active = protectionMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
                onPress={() => handleModeChange(mode)}
              >
                <Text style={styles.modeBtnIcon}>{info.icon}</Text>
                <Text style={[styles.modeBtnLabel, active && styles.modeBtnLabelActive]}>
                  {info.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.modeDescBox}>
          <Text style={styles.modeDescText}>{MODE_INFO[protectionMode].desc}</Text>
          {protectionMode === 'smart' && <Text style={styles.modeRecommended}>Recommended</Text>}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Privacy Alerts</Text>
            <Text style={styles.settingDescription}>Get notified about privacy threats</Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={handleNotificationsToggle}
            disabled={notifsLoading || Platform.OS !== 'android'}
            trackColor={{ false: '#333', true: '#4CAF50' }}
            thumbColor={notifsLoading ? '#888' : '#fff'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Help</Text>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => navigation.navigate('SplitTunnel')}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>🔀 App Bypass (Split Tunnel)</Text>
            <Text style={styles.settingDescription}>
              Choose which apps bypass DNS filtering — banking & payment apps recommended
            </Text>
          </View>
          <Text style={styles.settingValue}>&gt;</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('Mdm')}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>🏢 Corporate Shield</Text>
            <Text style={styles.settingDescription}>
              MDM enrollment — manage device policy from your organisation
            </Text>
          </View>
          <Text style={styles.settingValue}>&gt;</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('Help')}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>❓ Help & Guide</Text>
            <Text style={styles.settingDescription}>
              What AnkrShield does, how to enable DNS filtering, scanner guide and more
            </Text>
          </View>
          <Text style={styles.settingValue}>&gt;</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => navigation.navigate('FeatureRequest')}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>💡 Feature Request</Text>
            <Text style={styles.settingDescription}>Suggest a new feature or improvement</Text>
          </View>
          <Text style={styles.settingValue}>&gt;</Text>
        </TouchableOpacity>
      </View>

      {/* Bitwarden Password Manager (Android only) */}
      {Platform.OS === 'android' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Password Manager</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>🔑 Bitwarden</Text>
              <Text style={styles.settingDescription}>
                {bwInstalled === null
                  ? 'Checking…'
                  : bwInstalled
                    ? bwAutofill
                      ? '✅ Installed · Autofill active'
                      : '⚠️ Installed · Autofill not enabled'
                    : 'Not installed — tap to get it free'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.bwBtn}
              onPress={() => {
                if (!bwInstalled) {
                  BitwardenBridge?.installPrompt();
                } else if (!bwAutofill) {
                  BitwardenBridge?.openSetup();
                } else {
                  BitwardenBridge?.openVault();
                }
              }}
            >
              <Text style={styles.bwBtnTxt}>
                {!bwInstalled ? 'Install' : !bwAutofill ? 'Enable' : 'Open'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.bwNote}>
            AnkrShield never reads your vault. Bitwarden is open-source and end-to-end encrypted.
          </Text>
        </View>
      )}

      {/* Language picker */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language</Text>
        <View style={styles.langRow}>
          {supportedLanguages.map((lang) => {
            const active = activeLang === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langBtn, active && styles.langBtnActive]}
                onPress={() => handleLangChange(lang.code)}
              >
                <Text style={[styles.langNative, active && styles.langNativeActive]}>
                  {lang.nativeName}
                </Text>
                <Text style={[styles.langEng, active && styles.langEngActive]}>{lang.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <TouchableOpacity style={styles.settingRow}>
          <Text style={styles.settingLabel}>Version</Text>
          <Text style={styles.settingValue}>{APP_VERSION}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => Linking.openURL('https://xshieldai.com/privacy')}
        >
          <Text style={styles.settingLabel}>Privacy Policy</Text>
          <Text style={styles.settingValue}>&gt;</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => Linking.openURL('https://xshieldai.com/terms')}
        >
          <Text style={styles.settingLabel}>Terms of Service</Text>
          <Text style={styles.settingValue}>&gt;</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  section: {
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  settingRow: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#aaa',
    lineHeight: 18,
  },
  settingValue: {
    fontSize: 16,
    color: '#aaa',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  modeBtnActive: {
    backgroundColor: '#0d1f0d',
    borderColor: '#4CAF50',
  },
  modeBtnIcon: {
    fontSize: 20,
  },
  modeBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  modeBtnLabelActive: {
    color: '#4CAF50',
  },
  modeDescBox: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  modeDescText: {
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
  },
  modeRecommended: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
  },
  bypassBox: {
    backgroundColor: '#0f1f0f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a3a1a',
    padding: 14,
    marginTop: 4,
  },
  bypassHint: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  bypassRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bypassBtn: {
    flex: 1,
    backgroundColor: '#1a2a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22c55e',
    paddingVertical: 10,
    alignItems: 'center',
  },
  bypassBtnTxt: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  bypassStatus: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  bypassResumeBtn: {
    backgroundColor: '#1a1a0a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingVertical: 10,
    alignItems: 'center',
  },
  bypassResumeTxt: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '600',
  },

  langRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  langBtnActive: {
    backgroundColor: '#080c14',
    borderColor: '#4ade80',
  },
  langNative: {
    fontSize: 15,
    fontWeight: '700',
    color: '#555',
  },
  langNativeActive: {
    color: '#4ade80',
  },
  langEng: {
    fontSize: 10,
    color: '#444',
  },
  langEngActive: {
    color: '#22c55e',
  },
  bwBtn: {
    backgroundColor: '#175ddc',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'center',
  },
  bwBtnTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  bwNote: {
    color: '#4b5563',
    fontSize: 11,
    paddingHorizontal: 4,
    paddingTop: 6,
    lineHeight: 16,
  },
});
