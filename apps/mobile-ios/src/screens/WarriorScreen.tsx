/**
 * Warrior Screen — AI Warrior status dashboard
 * Shows real-time warrior engine status, attack summary, and quick actions.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';

import { WarriorService, WarriorStatus } from '../services/WarriorService';

const service = new WarriorService();

function StatusDot({ active }: { active: boolean }) {
  return <View style={[styles.statusDot, { backgroundColor: active ? '#4CAF50' : '#f44336' }]} />;
}

function MetricCard({
  label,
  value,
  color = '#fff',
  onPress,
}: {
  label: string;
  value: string | number;
  color?: string;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.metricCard} onPress={onPress}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Wrapper>
  );
}

export function WarriorScreen({ navigation }: any) {
  const [status, setStatus] = useState<WarriorStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await service.getStatus();
      setStatus(s);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to connect to warrior');
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const deployHoneypots = async () => {
    Alert.alert(
      'Deploy Honeypots',
      'This will create decoy credential files to catch rogue AI agents. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deploy',
          style: 'destructive',
          onPress: async () => {
            try {
              await service.deployHoneypots();
              Alert.alert('Done', 'Honeypot files deployed successfully.');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <StatusDot active={status?.isRunning ?? false} />
          <Text style={styles.headerTitle}>AI Warrior</Text>
        </View>
        <Text style={styles.headerSub}>
          {status?.isRunning ? `Up ${service.formatUptime(status.uptimeMs)}` : 'Offline'}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Metrics Grid */}
      {status && (
        <View style={styles.metricsGrid}>
          <MetricCard
            label="Events Ingested"
            value={status.eventsIngested.toLocaleString()}
            color="#2196F3"
          />
          <MetricCard
            label="Attack Chains"
            value={status.attackChainsDetected}
            color={status.attackChainsDetected > 0 ? '#f44336' : '#4CAF50'}
            onPress={() => navigation.navigate('ThreatAlerts')}
          />
          <MetricCard
            label="Quarantined"
            value={status.quarantinedAgents}
            color={status.quarantinedAgents > 0 ? '#FF9800' : '#4CAF50'}
            onPress={() => navigation.navigate('AgentManager')}
          />
          <MetricCard
            label="Scope Violations"
            value={status.scopeViolations}
            color={status.scopeViolations > 0 ? '#FFC107' : '#4CAF50'}
            onPress={() => navigation.navigate('AgentManager')}
          />
          <MetricCard label="Policies Generated" value={status.policiesGenerated} color="#9C27B0" />
          <MetricCard
            label="Honeypot Triggers"
            value={status.honeypotTriggers}
            color={status.honeypotTriggers > 0 ? '#f44336' : '#607D8B'}
            onPress={() => navigation.navigate('ThreatAlerts')}
          />
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('ThreatAlerts')}
        >
          <Text style={styles.actionIcon}>⚔️</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionLabel}>Attack Chains</Text>
            <Text style={styles.actionSub}>View correlated threat chains</Text>
          </View>
          <Text style={styles.actionChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('AgentManager')}
        >
          <Text style={styles.actionIcon}>🤖</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionLabel}>Agent Manager</Text>
            <Text style={styles.actionSub}>Scope contracts & quarantine</Text>
          </View>
          <Text style={styles.actionChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('SpywareScan')}
        >
          <Text style={styles.actionIcon}>🔬</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionLabel}>Spyware Scan</Text>
            <Text style={styles.actionSub}>Detect Pegasus, Candiru & more</Text>
          </View>
          <Text style={styles.actionChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionRow, styles.dangerRow]} onPress={deployHoneypots}>
          <Text style={styles.actionIcon}>🍯</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionLabel}>Deploy Honeypots</Text>
            <Text style={styles.actionSub}>Place decoy credential files</Text>
          </View>
          <Text style={styles.actionChevron}>›</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#666', fontSize: 13 },
  errorBanner: {
    margin: 16,
    padding: 12,
    backgroundColor: '#2a1111',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: { color: '#f44336', fontSize: 13 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
  },
  metricCard: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  metricValue: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  metricLabel: { fontSize: 10, color: '#666', textAlign: 'center' },
  section: { margin: 16, marginTop: 20 },
  sectionTitle: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  dangerRow: { borderWidth: 1, borderColor: '#2a1a1a' },
  actionIcon: { fontSize: 20, marginRight: 12 },
  actionContent: { flex: 1 },
  actionLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  actionSub: { color: '#666', fontSize: 12, marginTop: 2 },
  actionChevron: { color: '#555', fontSize: 20 },
});
