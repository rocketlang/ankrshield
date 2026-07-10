/**
 * Privacy Score Circle Component
 * Visual circular representation of privacy score
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PrivacyScoreCircleProps {
  score: number;
  level?: string; // ignored — label is derived from the score so it can't disagree with the colour
}

// Higher = safer (this is a privacy score, not a risk score). Label + colour are
// both computed from the score here, so 91 can never show red "POOR" again.
function grade(score: number): { label: string; color: string } {
  if (score >= 85) {
    return { label: 'Excellent', color: '#22c55e' };
  } // green
  if (score >= 70) {
    return { label: 'Good', color: '#eab308' };
  } // yellow
  if (score >= 50) {
    return { label: 'Fair', color: '#f59e0b' };
  } // orange
  return { label: 'Poor', color: '#ef4444' }; // red
}

export function PrivacyScoreCircle({ score }: PrivacyScoreCircleProps) {
  const { label, color } = grade(score);

  return (
    <View style={styles.container}>
      <View style={[styles.circle, { borderColor: color }]}>
        <Text style={[styles.scoreText, { color }]}>{score}</Text>
        <Text style={styles.maxText}>/100</Text>
      </View>
      <Text style={[styles.levelText, { color }]}>{label.toUpperCase()}</Text>
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
