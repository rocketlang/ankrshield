/**
 * Threat Alerts Screen — correlated attack chains from the AI Warrior
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { WarriorService, AttackChain } from '../services/WarriorService';

const service = new WarriorService();

const ATTACK_TYPE_LABELS: Record<string, string> = {
  data_exfiltration: 'Data Exfiltration',
  credential_theft: 'Credential Theft',
  lateral_movement: 'Lateral Movement',
  ransomware: 'Ransomware',
  surveillance: 'Surveillance',
  supply_chain_compromise: 'Supply Chain',
  privilege_escalation: 'Privilege Escalation',
  honeypot_triggered: 'Honeypot Triggered',
  unknown: 'Unknown',
};

function ChainCard({ chain, onPress }: { chain: AttackChain; onPress: () => void }) {
  const color = service.threatColor(chain.threatScore);
  const label = ATTACK_TYPE_LABELS[chain.attackType] ?? chain.attackType;
  const when = new Date(chain.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity style={styles.chainCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.chainHeader}>
        <View style={[styles.scoreBadge, { backgroundColor: color + '22', borderColor: color }]}>
          <Text style={[styles.scoreText, { color }]}>{chain.threatScore}</Text>
        </View>
        <View style={styles.chainMeta}>
          <Text style={styles.attackType}>{label}</Text>
          <Text style={styles.chainTime}>{when}</Text>
        </View>
      </View>
      <Text style={styles.narrative} numberOfLines={2}>{chain.narrative}</Text>
      {chain.autoActionsApplied.length > 0 && (
        <View style={styles.autoActions}>
          {chain.autoActionsApplied.map((a, i) => (
            <View key={i} style={styles.actionBadge}>
              <Text style={styles.actionBadgeText}>{a}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function ChainDetail({ chain, onClose }: { chain: AttackChain; onClose: () => void }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Attack Chain Detail</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody}>
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{ATTACK_TYPE_LABELS[chain.attackType] ?? chain.attackType}</Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Threat Score</Text>
            <Text style={[styles.detailValue, { color: service.threatColor(chain.threatScore) }]}>
              {chain.threatScore} / 100
            </Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Detected At</Text>
            <Text style={styles.detailValue}>{new Date(chain.detectedAt).toLocaleString()}</Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Narrative</Text>
            <Text style={styles.detailParagraph}>{chain.narrative}</Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Affected Assets</Text>
            {chain.affectedAssets.map((a, i) => (
              <Text key={i} style={styles.listItem}>• {a}</Text>
            ))}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Suggested Actions</Text>
            {chain.suggestedActions.map((a, i) => (
              <Text key={i} style={[styles.listItem, styles.suggestionItem]}>
                {i + 1}. {a}
              </Text>
            ))}
          </View>

          {chain.autoActionsApplied.length > 0 && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Auto-Applied Actions</Text>
              {chain.autoActionsApplied.map((a, i) => (
                <Text key={i} style={[styles.listItem, { color: '#4CAF50' }]}>✓ {a}</Text>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ThreatAlertsScreen() {
  const [chains, setChains] = useState<AttackChain[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AttackChain | null>(null);

  const load = useCallback(async () => {
    try {
      setChains(await service.getAttackChains(50));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {selected && <ChainDetail chain={selected} onClose={() => setSelected(null)} />}

      <FlatList
        data={chains}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <ChainCard chain={item} onPress={() => setSelected(item)} />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f44336" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={styles.emptyTitle}>No Threats Detected</Text>
            <Text style={styles.emptySub}>The warrior is watching. You're safe.</Text>
          </View>
        }
        contentContainerStyle={chains.length === 0 ? styles.emptyContainer : styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  listContent: { padding: 12 },
  chainCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f44336',
  },
  chainHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  scoreText: { fontSize: 14, fontWeight: '700' },
  chainMeta: { flex: 1 },
  attackType: { color: '#fff', fontSize: 15, fontWeight: '600' },
  chainTime: { color: '#666', fontSize: 12, marginTop: 2 },
  narrative: { color: '#aaa', fontSize: 13, lineHeight: 18 },
  autoActions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  actionBadge: { backgroundColor: '#1a2a1a', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  actionBadgeText: { color: '#4CAF50', fontSize: 11 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 60, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#0d0d0d' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  closeBtn: { color: '#4CAF50', fontSize: 16 },
  modalBody: { padding: 20 },
  detailSection: { marginBottom: 20 },
  detailLabel: { color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  detailValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
  detailParagraph: { color: '#ccc', fontSize: 14, lineHeight: 21 },
  listItem: { color: '#aaa', fontSize: 13, lineHeight: 20 },
  suggestionItem: { color: '#fff', marginBottom: 4 },
});
