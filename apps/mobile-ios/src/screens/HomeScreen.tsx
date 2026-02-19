/**
 * Home Screen
 * Main landing screen with privacy score overview
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';

import { PrivacyScoreCircle } from '../components/PrivacyScoreCircle';
import { StatsCard } from '../components/StatsCard';
import { PrivacyService } from '../services/PrivacyService';

export function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadData();

    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const privacyService = new PrivacyService();
      const [scoreData, statsData] = await Promise.all([
        privacyService.getPrivacyScore(),
        privacyService.getStats(),
      ]);

      setScore(scoreData);
      setStats(statsData);
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
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {score && (
        <View style={styles.scoreContainer}>
          <PrivacyScoreCircle score={score.totalScore} level={score.level} />

          <View style={styles.scoreBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Network</Text>
              <Text style={styles.breakdownValue}>{score.networkScore}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>DNS</Text>
              <Text style={styles.breakdownValue}>{score.dnsScore}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Apps</Text>
              <Text style={styles.breakdownValue}>{score.appScore}</Text>
            </View>
          </View>
        </View>
      )}

      {stats && (
        <View style={styles.statsGrid}>
          <StatsCard label="Trackers Blocked" value={stats.trackersBlocked} color="#4CAF50" />
          <StatsCard label="Total Connections" value={stats.totalConnections} color="#2196F3" />
          <StatsCard label="DNS Queries" value={stats.dnsQueries} color="#9C27B0" />
          <StatsCard label="Active Connections" value={stats.activeConnections} color="#FF9800" />
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.actionButtonText}>View Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('Activity')}
        >
          <Text style={styles.actionButtonText}>Recent Activity</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.actionButtonText}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.warriorButton]}
          onPress={() => navigation.navigate('Warrior')}
        >
          <Text style={styles.actionButtonText}>⚔️ AI Warrior</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.liveButton]}
          onPress={() => navigation.navigate('LiveThreats')}
        >
          <Text style={styles.actionButtonText}>🔴 Live Threats</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.scanButton]}
          onPress={() => navigation.navigate('AndroidMonitor')}
        >
          <Text style={styles.actionButtonText}>🔍 App Scanner</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.conferenceButton]}
          onPress={() => navigation.navigate('Conference')}
        >
          <Text style={styles.actionButtonText}>🎤 Join Conference</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    marginTop: 16,
    color: '#aaa',
    fontSize: 16,
  },
  scoreContainer: {
    padding: 24,
    alignItems: 'center',
  },
  scoreBreakdown: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 16,
  },
  breakdownItem: {
    alignItems: 'center',
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#2a2a2a',
  },
  warriorButton: {
    backgroundColor: '#1a1a3a',
    borderWidth: 1,
    borderColor: '#3949AB',
  },
  liveButton: {
    backgroundColor: '#1a0a0a',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  scanButton: {
    backgroundColor: '#0a1a1a',
    borderWidth: 1,
    borderColor: '#0891b2',
  },
  conferenceButton: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
