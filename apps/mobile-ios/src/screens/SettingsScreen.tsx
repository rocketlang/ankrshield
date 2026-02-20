/**
 * Settings Screen
 * App configuration and preferences
 */

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
} from 'react-native';

import { vpnService } from '../services/VpnService';

export function SettingsScreen({ navigation }: any) {
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [dnsFiltering, setDnsFiltering] = useState(false);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsPaused, setDnsPaused] = useState(false);
  const [pauseUntilMs, setPauseUntilMs] = useState(0);
  const [notifications, setNotifications] = useState(true);

  // Sync DNS + pause state every 5 s
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
    return () => clearInterval(interval);
  }, []);

  function pauseLabel(): string {
    if (!dnsPaused) return '';
    if (pauseUntilMs === 0) return 'Paused — phone call active';
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

  async function handleDnsToggle(value: boolean) {
    if (dnsLoading) return;
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
        <Text style={styles.sectionTitle}>Protection</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Network Protection</Text>
            <Text style={styles.settingDescription}>Block trackers and malicious connections</Text>
          </View>
          <Switch
            value={protectionEnabled}
            onValueChange={setProtectionEnabled}
            trackColor={{ false: '#333', true: '#4CAF50' }}
            thumbColor="#fff"
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Privacy Alerts</Text>
            <Text style={styles.settingDescription}>Get notified about privacy threats</Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#333', true: '#4CAF50' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Help</Text>

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <TouchableOpacity style={styles.settingRow}>
          <Text style={styles.settingLabel}>Version</Text>
          <Text style={styles.settingValue}>1.2.9</Text>
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
});
