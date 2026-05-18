/**
 * Stats Card Component
 * Display a single statistic
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatsCardProps {
  label: string;
  value: number | string;
  color: string;
}

export function StatsCard({ label, value, color }: StatsCardProps) {
  const formatValue = (val: number | string) => {
    if (typeof val === 'string') return val;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toString();
  };

  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color }]}>{formatValue(value)}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    flex: 1,
    minWidth: 150,
    alignItems: 'center',
  },
  value: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
  },
});
