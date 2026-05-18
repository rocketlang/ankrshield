/**
 * SafeZoneMeter — Visual safe zone bar
 *
 * Shows where an app sits on the privacy behaviour spectrum:
 *
 *   [●●●●●●░░░░] SAFE    green  0–59
 *   [●●●●●●●●░░] WATCH   amber  60–79
 *   [●●●●●●●●●●] DANGER  red    80–100
 *
 * Two variants:
 *   compact  — single thin bar, used in app lists
 *   full     — bar + zone labels + score number, used in detail sheets
 */

import type { SafeZone } from '@ankrshield/privacy-engine';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ─── Zone boundaries for visual splits ───────────────────────────────────────

const SAFE_END = 59; // 0–59 = safe zone
const WATCH_END = 79; // 60–79 = watch zone
// 80–100 = danger zone

interface SafeZoneMeterProps {
  score: number; // 0–100
  variant?: 'compact' | 'full';
  showScore?: boolean;
  showExplanation?: boolean;
  explanation?: string;
}

function scoreToColors(score: number): { fill: string; glow: string } {
  if (score < 60) return { fill: '#4CAF50', glow: '#4CAF5033' };
  if (score < 80) return { fill: '#FF9800', glow: '#FF980033' };
  return { fill: '#F44336', glow: '#F4433633' };
}

function scoreToZoneLabel(score: number): SafeZone {
  if (score < 60) return 'safe';
  if (score < 80) return 'watch';
  return 'danger';
}

const ZONE_LABEL: Record<SafeZone, string> = {
  safe: 'Safe Zone',
  watch: 'Being Watched',
  danger: 'High Concern',
};

export function SafeZoneMeter({
  score,
  variant = 'compact',
  showScore = false,
  showExplanation = false,
  explanation,
}: SafeZoneMeterProps) {
  const pct = Math.max(0, Math.min(100, score));
  const { fill, glow } = scoreToColors(pct);
  const zone = scoreToZoneLabel(pct);

  if (variant === 'compact') {
    return (
      <View style={styles.compactContainer}>
        <View style={[styles.compactTrack, { backgroundColor: glow }]}>
          {/* Safe segment (0–59) */}
          <View
            style={[
              styles.segment,
              {
                flex: SAFE_END,
                backgroundColor: pct <= SAFE_END ? fill : pct <= WATCH_END ? '#FF9800' : '#F44336',
                opacity: pct > 0 && pct <= SAFE_END ? 1 : pct > SAFE_END ? 0.3 : 0.15,
              },
            ]}
          />
          {/* Watch segment (60–79) */}
          <View
            style={[
              styles.segment,
              styles.segmentGap,
              {
                flex: WATCH_END - SAFE_END,
                backgroundColor: '#FF9800',
                opacity: pct > SAFE_END && pct <= WATCH_END ? 1 : pct > WATCH_END ? 0.3 : 0.15,
              },
            ]}
          />
          {/* Danger segment (80–100) */}
          <View
            style={[
              styles.segment,
              styles.segmentGap,
              {
                flex: 100 - WATCH_END,
                backgroundColor: '#F44336',
                opacity: pct > WATCH_END ? 1 : 0.15,
              },
            ]}
          />
          {/* Position dot */}
          <View
            style={[
              styles.positionDot,
              {
                left: `${pct}%` as any,
                backgroundColor: fill,
                shadowColor: fill,
              },
            ]}
          />
        </View>
        {showScore && <Text style={[styles.compactScore, { color: fill }]}>{pct}</Text>}
      </View>
    );
  }

  // ── Full variant ─────────────────────────────────────────────────────────

  return (
    <View style={styles.fullContainer}>
      {/* Score number + zone label row */}
      <View style={styles.fullHeader}>
        <View>
          <Text style={[styles.scoreNumber, { color: fill }]}>{pct}</Text>
          <Text style={styles.scoreSubtext}>/ 100</Text>
        </View>
        <View style={[styles.zoneBadge, { backgroundColor: glow, borderColor: fill }]}>
          <Text style={[styles.zoneBadgeText, { color: fill }]}>{ZONE_LABEL[zone]}</Text>
        </View>
      </View>

      {/* Main bar */}
      <View style={styles.fullTrack}>
        {/* Filled portion */}
        <View
          style={[
            styles.fullFill,
            {
              width: `${pct}%`,
              backgroundColor: fill,
            },
          ]}
        />
        {/* Zone dividers */}
        <View style={[styles.divider, { left: `${SAFE_END}%` as any }]} />
        <View style={[styles.divider, { left: `${WATCH_END}%` as any }]} />
      </View>

      {/* Zone labels under bar */}
      <View style={styles.zoneLabelsRow}>
        <Text style={[styles.zoneLabel, { color: '#4CAF50' }]}>Safe</Text>
        <Text style={[styles.zoneLabel, { color: '#FF9800', textAlign: 'center' }]}>Watch</Text>
        <Text style={[styles.zoneLabel, { color: '#F44336', textAlign: 'right' }]}>Danger</Text>
      </View>

      {/* Explanation */}
      {showExplanation && explanation && <Text style={styles.explanation}>{explanation}</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Compact
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'visible',
    position: 'relative',
  },
  segment: {
    height: 6,
    borderRadius: 3,
  },
  segmentGap: {
    marginLeft: 2,
  },
  positionDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -2,
    marginLeft: -5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  compactScore: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'right',
  },

  // Full
  fullContainer: {
    width: '100%',
  },
  fullHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  scoreSubtext: {
    fontSize: 12,
    color: '#666',
  },
  zoneBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zoneBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fullTrack: {
    height: 10,
    backgroundColor: '#2a2a2a',
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  fullFill: {
    height: '100%',
    borderRadius: 5,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  divider: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: '#1a1a1a',
    top: 0,
  },
  zoneLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  zoneLabel: {
    fontSize: 10,
    flex: 1,
    opacity: 0.7,
  },
  explanation: {
    fontSize: 13,
    color: '#aaa',
    marginTop: 12,
    lineHeight: 18,
  },
});
