/**
 * Dashboard Screen
 * Detailed analytics and charts
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { PrivacyService } from '../services/PrivacyService';

export function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const privacyService = new PrivacyService();
      const [historyData, breakdownData] = await Promise.all([
        privacyService.getScoreHistory(7),
        privacyService.getScoreBreakdown(),
      ]);

      setHistory(historyData);
      setBreakdown(breakdownData);
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

  return (
    <ScrollView style={styles.container}>
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
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(component.score, 100)}%` },
                  ]}
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
