/**
 * Agent Manager Screen — view quarantined agents, scope violations, release controls
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';

import { WarriorService, QuarantinedAgent, ScopeViolation } from '../services/WarriorService';

const service = new WarriorService();

const VIOLATION_LABELS: Record<string, string> = {
  file_out_of_scope: 'File Out of Scope',
  file_explicitly_denied: 'Denied File',
  domain_not_allowed: 'Unauthorized Domain',
  upload_size_exceeded: 'Upload Limit Exceeded',
  clipboard_not_permitted: 'Clipboard Blocked',
  screenshot_not_permitted: 'Screenshot Blocked',
  after_hours_access: 'After-Hours Access',
  off_day_access: 'Off-Day Access',
};

function AgentCard({
  agent,
  onRelease,
}: {
  agent: QuarantinedAgent;
  onRelease: (id: string) => void;
}) {
  const when = new Date(agent.quarantinedAt).toLocaleString();

  const confirmRelease = () => {
    Alert.alert(
      'Release Agent',
      `Release ${agent.agentName} from quarantine? It will resume normal operation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', style: 'destructive', onPress: () => onRelease(agent.agentId) },
      ]
    );
  };

  return (
    <View style={[styles.card, agent.isActive && styles.cardActive]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.agentName}>{agent.agentName}</Text>
          <Text style={styles.agentId}>{agent.agentId}</Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: agent.isActive ? '#2a1111' : '#1a2a1a' }]}
        >
          <Text style={[styles.statusText, { color: agent.isActive ? '#f44336' : '#4CAF50' }]}>
            {agent.isActive ? 'QUARANTINED' : 'RELEASED'}
          </Text>
        </View>
      </View>

      <Text style={styles.cardReason}>{agent.reason}</Text>
      <Text style={styles.cardTime}>{when}</Text>

      {agent.isActive && (
        <TouchableOpacity style={styles.releaseBtn} onPress={confirmRelease}>
          <Text style={styles.releaseBtnText}>Release Agent</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ViolationRow({ violation }: { violation: ScopeViolation }) {
  const label = VIOLATION_LABELS[violation.violationType] ?? violation.violationType;
  const actionColor =
    violation.action === 'QUARANTINE'
      ? '#f44336'
      : violation.action === 'BLOCK'
        ? '#FF9800'
        : '#FFC107';
  const time = new Date(violation.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.violationRow}>
      <View style={styles.violationLeft}>
        <Text style={styles.violationAgent}>{violation.agentName}</Text>
        <Text style={styles.violationType}>{label}</Text>
        <Text style={styles.violationResource} numberOfLines={1}>
          {violation.resource}
        </Text>
      </View>
      <View style={styles.violationRight}>
        <View style={[styles.actionBadge, { borderColor: actionColor }]}>
          <Text style={[styles.actionBadgeText, { color: actionColor }]}>{violation.action}</Text>
        </View>
        <Text style={styles.violationTime}>{time}</Text>
      </View>
    </View>
  );
}

export function AgentManagerScreen() {
  const [quarantined, setQuarantined] = useState<QuarantinedAgent[]>([]);
  const [violations, setViolations] = useState<ScopeViolation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [q, v] = await Promise.all([
        service.getQuarantinedAgents(),
        service.getScopeViolations(30),
      ]);
      setQuarantined(q);
      setViolations(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleRelease = async (agentId: string) => {
    try {
      await service.releaseAgent(agentId);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const sections = [
    {
      title: `Quarantined Agents (${quarantined.length})`,
      data: quarantined,
      renderItem: ({ item }: any) => <AgentCard agent={item} onRelease={handleRelease} />,
    },
    {
      title: `Recent Scope Violations (${violations.length})`,
      data: violations,
      renderItem: ({ item }: any) => <ViolationRow violation={item} />,
    },
  ];

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item, i) => `${(item as any).agentId ?? i}-${i}`}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item, section }) => section.renderItem({ item })}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9800" />
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🤖</Text>
          <Text style={styles.emptyTitle}>All Agents Compliant</Text>
          <Text style={styles.emptySub}>No violations or quarantines detected.</Text>
        </View>
      }
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { paddingBottom: 32 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#0d0d0d' },
  sectionHeaderText: { color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  // Agent card
  card: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 14,
  },
  cardActive: { borderLeftWidth: 3, borderLeftColor: '#f44336' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  agentName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  agentId: { color: '#555', fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardReason: { color: '#aaa', fontSize: 13, marginBottom: 6 },
  cardTime: { color: '#555', fontSize: 11 },
  releaseBtn: {
    marginTop: 12,
    backgroundColor: '#2a1a1a',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  releaseBtnText: { color: '#f44336', fontSize: 13, fontWeight: '600' },
  // Violation row
  violationRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  violationLeft: { flex: 1, marginRight: 8 },
  violationAgent: { color: '#fff', fontSize: 13, fontWeight: '600' },
  violationType: { color: '#aaa', fontSize: 12, marginTop: 2 },
  violationResource: { color: '#555', fontSize: 11, marginTop: 2 },
  violationRight: { alignItems: 'flex-end' },
  actionBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  actionBadgeText: { fontSize: 10, fontWeight: '700' },
  violationTime: { color: '#555', fontSize: 11 },
  // Empty
  emptyState: { alignItems: 'center', padding: 60 },
  emptyIcon: { fontSize: 60, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center' },
});
