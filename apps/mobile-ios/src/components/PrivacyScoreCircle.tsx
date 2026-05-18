/**
 * Privacy Score Circle Component
 * Visual circular representation of privacy score
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PrivacyScoreCircleProps {
  score: number;
  level: string;
}

export function PrivacyScoreCircle({ score, level }: PrivacyScoreCircleProps) {
  const getScoreColor = (scoreValue: number) => {
    if (scoreValue <= 30) return '#4CAF50'; // Green - Excellent
    if (scoreValue <= 60) return '#FFC107'; // Yellow - Good
    if (scoreValue <= 80) return '#FF9800'; // Orange - Poor
    return '#F44336'; // Red - Critical
  };

  const color = getScoreColor(score);

  return (
    <View style={styles.container}>
      <View style={[styles.circle, { borderColor: color }]}>
        <Text style={[styles.scoreText, { color }]}>{score}</Text>
        <Text style={styles.maxText}>/100</Text>
      </View>
      <Text style={[styles.levelText, { color }]}>{level.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  circle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  scoreText: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  maxText: {
    fontSize: 20,
    color: '#aaa',
    marginTop: -8,
  },
  levelText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    letterSpacing: 2,
  },
});
