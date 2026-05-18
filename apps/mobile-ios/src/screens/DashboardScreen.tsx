/**
 * Dashboard Screen
 * Detailed analytics and charts
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';

import { PrivacyService } from '../services/PrivacyService';
import { vpnService, VpnStats } from '../services/VpnService';

const DEFAULT_VPN: VpnStats = {
  totalQueries: 0,
  blockedCount: 0,
  allowedCount: 0,
  lastBlocked: '',
  running: false,
};

export function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [vpnStats, setVpnStats] = useState<VpnStats>(DEFAULT_VPN);

  useEffect(() => {
    loadData();
    const vpnInterval = setInterval(async () => {
      const s = await vpnService.getStats().catch(() => DEFAULT_VPN);
      setVpnStats(s);
    }, 5000);
    return () => clearInterval(vpnInterval);
  }, []);

  async function loadData() {
    try {
      const privacyService = new PrivacyService();
      const [historyData, breakdownData, vpnData] = await Promise.all([
        privacyService.getScoreHistory(7),
        privacyService.getScoreBreakdown(),
        vpnService.getStats().catch(() => DEFAULT_VPN),
      ]);

      setHistory(historyData);
      setBreakdown(breakdownData);
      setVpnStats(vpnData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  const blockRate =
    vpnStats.totalQueries > 0
      ? Math.round((vpnStats.blockedCount / vpnStats.totalQueries) * 100)
      : 0;

  return (
    <ScrollView style={styles.container}>
      {/* On-Device DNS Shield */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>On-Device DNS Shield</Text>
        <View style={[styles.dnsCard, vpnStats.running ? styles.dnsCardActive : styles.dnsCardOff]}>
          <View style={styles.dnsStatus}>
            <View style={[styles.dot, vpnStats.running ? styles.dotGreen : styles.dotGrey]} />
            <Text style={styles.dnsStatusText}>
              {vpnStats.running ? 'Intercepting DNS' : 'DNS Shield Off — enable in Settings'}
            </Text>
          </View>
          {vpnStats.running && (
            <>
              <View style={styles.dnsGrid}>
                <View style={styles.dnsStat}>
                  <Text style={styles.dnsStatVal}>{vpnStats.blockedCount}</Text>
                  <Text style={styles.dnsStatLbl}>Blocked</Text>
                </View>
                <View style={styles.dnsStat}>
                  <Text style={styles.dnsStatVal}>{vpnStats.allowedCount}</Text>
                  <Text style={styles.dnsStatLbl}>Allowed</Text>
                </View>
                <View style={styles.dnsStat}>
                  <Text style={styles.dnsStatVal}>{vpnStats.totalQueries}</Text>
                  <Text style={styles.dnsStatLbl}>Total</Text>
                </View>
                <View style={styles.dnsStat}>
                  <Text style={[styles.dnsStatVal, styles.blockRateVal]}>{blockRate}%</Text>
                  <Text style={styles.dnsStatLbl}>Block Rate</Text>
                </View>
              </View>
              {vpnStats.lastBlocked !== '' && (
                <View style={styles.lastBlockedRow}>
                  <Text style={styles.lastBlockedLbl}>Last blocked </Text>
                  <Text style={styles.lastBlockedVal} numberOfLines={1}>
                    {vpnStats.lastBlocked}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy Score History (7 Days)</Text>
        <View style={styles.historyContainer}>
          {history.map((item, index) => (
            <View key={index} style={styles.historyItem}>
              <Text style={styles.historyDate}>
                {new Date(item.timestamp).toLocaleDateString()}
              </Text>
              <Text style={styles.historyScore}>{item.score}</Text>
            </View>
          ))}
        </View>
      </View>

      {breakdown && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Score Breakdown</Text>
          {breakdown.components.map((component: any, index: number) => (
            <View key={index} style={styles.componentCard}>
              <View style={styles.componentHeader}>
                <Text style={styles.componentName}>{component.name}</Text>
                <Text style={styles.componentScore}>{component.score}</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${Math.min(component.score, 100)}%` }]}
                />
              </View>
              <Text style={styles.componentWeight}>
                Weight: {(component.weight * 100).toFixed(0)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {breakdown && breakdown.recommendations && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          {breakdown.recommendations.map((rec: string, index: number) => (
            <View key={index} style={styles.recommendationCard}>
              <Text style={styles.recommendationText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  dnsCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  dnsCardActive: {
    backgroundColor: '#0a1f0a',
    borderColor: '#22c55e',
  },
  dnsCardOff: {
    backgroundColor: '#1a1a1a',
    borderColor: '#374151',
  },
  dnsStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotGreen: { backgroundColor: '#22c55e' },
  dotGrey: { backgroundColor: '#6b7280' },
  dnsStatusText: { color: '#d1d5db', fontSize: 13 },
  dnsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dnsStat: { alignItems: 'center', flex: 1 },
  dnsStatVal: { color: '#4ade80', fontSize: 20, fontWeight: '800' },
  blockRateVal: { color: '#facc15' },
  dnsStatLbl: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
  lastBlockedRow: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 6,
    padding: 8,
  },
  lastBlockedLbl: { color: '#6b7280', fontSize: 11 },
  lastBlockedVal: { color: '#f87171', fontSize: 11, flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  historyContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  historyDate: {
    color: '#aaa',
    fontSize: 14,
  },
  historyScore: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  componentCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  componentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  componentName: {
    fontSize: 16,
    color: '#fff',
  },
  componentScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  componentWeight: {
    fontSize: 12,
    color: '#aaa',
  },
  recommendationCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  recommendationText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
});
