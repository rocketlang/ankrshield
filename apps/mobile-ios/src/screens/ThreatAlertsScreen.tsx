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

import { WarriorService, AttackChain, HoneypotHit } from '../services/WarriorService';

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
  const when = new Date(chain.detectedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

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
      <Text style={styles.narrative} numberOfLines={2}>
        {chain.narrative}
      </Text>
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
            <Text style={styles.detailValue}>
              {ATTACK_TYPE_LABELS[chain.attackType] ?? chain.attackType}
            </Text>
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
              <Text key={i} style={styles.listItem}>
                • {a}
              </Text>
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
                <Text key={i} style={[styles.listItem, { color: '#4CAF50' }]}>
                  ✓ {a}
                </Text>
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
  const [tab, setTab] = useState<'chains' | 'honeypots'>('chains');
  const [hits, setHits] = useState<HoneypotHit[]>([]);

  const load = useCallback(async () => {
    try {
      const [chains, honeypotHits] = await Promise.all([
        service.getAttackChains(50),
        service.getHoneypotHits(),
      ]);
      setChains(chains);
      setHits(honeypotHits);
    } catch (_e) {
      /* ignore fetch errors */
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

  return (
    <View style={styles.container}>
      {selected && <ChainDetail chain={selected} onClose={() => setSelected(null)} />}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'chains' && styles.tabBtnActive]}
          onPress={() => setTab('chains')}
        >
          <Text style={[styles.tabBtnText, tab === 'chains' && styles.tabBtnTextActive]}>
            ⚔️ Chains {chains.length > 0 ? `(${chains.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'honeypots' && styles.tabBtnActive]}
          onPress={() => setTab('honeypots')}
        >
          <Text style={[styles.tabBtnText, tab === 'honeypots' && styles.tabBtnTextActive]}>
            🍯 Honeypots {hits.length > 0 ? `(${hits.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'chains' ? (
        <FlatList
          data={chains}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ChainCard chain={item} onPress={() => setSelected(item)} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f44336" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛡️</Text>
              <Text style={styles.emptyTitle}>No Threats Detected</Text>
              <Text style={styles.emptySub}>The warrior is watching. You're safe.</Text>
            </View>
          }
          contentContainerStyle={chains.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(h, i) => `${h.ip}-${i}`}
          renderItem={({ item: h }) => (
            <View style={styles.honeypotRow}>
              <View style={styles.honeypotLeft}>
                <Text style={styles.honeypotIP}>{h.ip}</Text>
                <Text style={styles.honeypotPath}>{h.path}</Text>
                <Text style={styles.honeypotAgent} numberOfLines={1}>
                  {h.userAgent}
                </Text>
              </View>
              <View style={styles.honeypotRight}>
                <Text style={styles.honeypotScore}>{h.abuseScore}</Text>
                <Text style={styles.honeypotCountry}>{h.country}</Text>
                <Text style={styles.honeypotTime}>
                  {new Date(h.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f44336" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🍯</Text>
              <Text style={styles.emptyTitle}>No Honeypot Hits</Text>
              <Text style={styles.emptySub}>No attackers have triggered the traps yet.</Text>
            </View>
          }
          contentContainerStyle={hits.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}
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
  actionBadge: {
    backgroundColor: '#1a2a1a',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionBadgeText: { color: '#4CAF50', fontSize: 11 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 60, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center' },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#f44336' },
  tabBtnText: { color: '#666', fontSize: 13, fontWeight: '600' },
  tabBtnTextActive: { color: '#fff' },
  // Honeypot rows
  honeypotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1a0a0a',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f97316',
  },
  honeypotLeft: { flex: 1, marginRight: 12 },
  honeypotIP: { color: '#fbbf24', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  honeypotPath: { color: '#ef4444', fontSize: 12, marginTop: 2 },
  honeypotAgent: { color: '#6b7280', fontSize: 11, marginTop: 4 },
  honeypotRight: { alignItems: 'flex-end' },
  honeypotScore: { color: '#f87171', fontSize: 20, fontWeight: '800' },
  honeypotCountry: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  honeypotTime: { color: '#4b5563', fontSize: 11, marginTop: 4 },
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
  detailLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  detailValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
  detailParagraph: { color: '#ccc', fontSize: 14, lineHeight: 21 },
  listItem: { color: '#aaa', fontSize: 13, lineHeight: 20 },
  suggestionItem: { color: '#fff', marginBottom: 4 },
});
