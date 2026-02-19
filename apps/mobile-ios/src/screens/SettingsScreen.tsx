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

export function SettingsScreen() {
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [dnsFiltering, setDnsFiltering] = useState(false);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [notifications, setNotifications] = useState(true);

  // Sync DNS toggle with actual VPN state on mount
  useEffect(() => {
    vpnService
      .isRunning()
      .then(setDnsFiltering)
      .catch(() => {});
  }, []);

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
        <Text style={styles.sectionTitle}>About</Text>

        <TouchableOpacity style={styles.settingRow}>
          <Text style={styles.settingLabel}>Version</Text>
          <Text style={styles.settingValue}>1.1.9</Text>
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
});
