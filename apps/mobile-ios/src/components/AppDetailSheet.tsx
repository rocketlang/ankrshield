/**
 * AppDetailSheet — Bottom sheet showing per-app privacy behaviour
 *
 * Shows:
 *   - App name + auto-detected tier
 *   - SafeZoneMeter (full variant) with score + explanation
 *   - Today's stats: trackers seen, data sent, top domains
 *   - First-party vs third-party breakdown
 *   - Trust tier selector — user can override tier
 */

import type { AppTrustTier, AppBehaviorStats, TrackerCategory } from '@ankrshield/privacy-engine';
import { TIER_COLOR, TIER_LABEL } from '@ankrshield/privacy-engine';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  SafeAreaView,
} from 'react-native';

import { SafeZoneMeter } from './SafeZoneMeter';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppDetailInfo {
  packageName: string;
  displayName: string;
  autoTier: AppTrustTier;
  effectiveTier: AppTrustTier;
  userTier?: AppTrustTier;
  stats: AppBehaviorStats;
}

interface AppDetailSheetProps {
  app: AppDetailInfo | null;
  visible: boolean;
  onClose: () => void;
  onTierChange: (packageName: string, tier: AppTrustTier) => void;
}

// ─── Tier options shown in selector ──────────────────────────────────────────

const TIER_OPTIONS: Array<{ tier: AppTrustTier; label: string; description: string }> = [
  {
    tier: 'TRUSTED',
    label: 'Trusted',
    description: 'Show tracking silently, block only critical threats',
  },
  {
    tier: 'STANDARD',
    label: 'Standard',
    description: 'Block high-risk trackers, flag advertising',
  },
  {
    tier: 'WATCHLIST',
    label: 'Watch Closely',
    description: 'Block advertising and above, notify each time',
  },
  { tier: 'BLOCKED', label: 'Block Entirely', description: 'Cut all network access for this app' },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppDetailSheet({ app, visible, onClose, onTierChange }: AppDetailSheetProps) {
  const [showTierPicker, setShowTierPicker] = useState(false);

  if (!app) return null;

  const { displayName, packageName, autoTier, effectiveTier, userTier, stats } = app;
  const tierColor = TIER_COLOR[effectiveTier];
  const isUserOverridden = userTier !== undefined && userTier !== autoTier;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          {/* App icon placeholder */}
          <View style={[styles.iconPlaceholder, { backgroundColor: tierColor + '22' }]}>
            <Text style={[styles.iconEmoji]}>
              {effectiveTier === 'SYSTEM'
                ? '⚙️'
                : effectiveTier === 'TRUSTED'
                  ? '✅'
                  : effectiveTier === 'STANDARD'
                    ? '📱'
                    : effectiveTier === 'WATCHLIST'
                      ? '👁️'
                      : '🚫'}
            </Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.appName}>{displayName}</Text>
            <Text style={styles.packageName}>{packageName}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Safe Zone Meter */}
          <View style={styles.section}>
            <SafeZoneMeter
              score={stats.safeZoneScore}
              variant="full"
              showExplanation
              explanation={stats.explanation}
            />
          </View>

          {/* Today's Activity */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Activity</Text>
            <View style={styles.statsGrid}>
              <StatBox
                label="Trackers"
                value={stats.trackerDomainsToday.toString()}
                color="#FF9800"
              />
              <StatBox label="Blocked" value={stats.blockedToday.toString()} color="#4CAF50" />
              <StatBox label="Data sent" value={formatBytes(stats.bytesToday)} color="#2196F3" />
            </View>
          </View>

          {/* Top tracker domains */}
          {stats.uniqueThirdPartyDomains.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Third-party contacts</Text>
              {stats.uniqueThirdPartyDomains.slice(0, 8).map((domain: string) => (
                <View key={domain} style={styles.domainRow}>
                  <View style={styles.domainDot} />
                  <Text style={styles.domainText}>{domain}</Text>
                </View>
              ))}
              {stats.uniqueThirdPartyDomains.length > 8 && (
                <Text style={styles.moreText}>
                  +{stats.uniqueThirdPartyDomains.length - 8} more domains
                </Text>
              )}
            </View>
          )}

          {/* Top categories */}
          {stats.topCategories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tracking categories</Text>
              {stats.topCategories.map(
                ({ category, count }: { category: TrackerCategory; count: number }) => (
                  <View key={category} style={styles.categoryRow}>
                    <Text style={styles.categoryName}>{category}</Text>
                    <Text style={styles.categoryCount}>{count}×</Text>
                  </View>
                )
              )}
            </View>
          )}

          {/* Trust tier */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trust Level</Text>
            <TouchableOpacity
              style={[styles.tierSelector, { borderColor: tierColor }]}
              onPress={() => setShowTierPicker(true)}
            >
              <View style={[styles.tierDot, { backgroundColor: tierColor }]} />
              <View style={styles.tierSelectorText}>
                <Text style={[styles.tierName, { color: tierColor }]}>
                  {TIER_LABEL[effectiveTier]}
                </Text>
                {isUserOverridden && (
                  <Text style={styles.overrideNote}>
                    You set this · Auto: {TIER_LABEL[autoTier]}
                  </Text>
                )}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
            {isUserOverridden && (
              <TouchableOpacity
                onPress={() => onTierChange(packageName, autoTier)}
                style={styles.resetLink}
              >
                <Text style={styles.resetLinkText}>
                  Reset to automatic ({TIER_LABEL[autoTier]})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Tier picker modal */}
        {showTierPicker && (
          <View style={styles.tierPicker}>
            <Text style={styles.tierPickerTitle}>Set Trust Level</Text>
            {TIER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.tier}
                style={[styles.tierOption, effectiveTier === opt.tier && styles.tierOptionSelected]}
                onPress={() => {
                  onTierChange(packageName, opt.tier);
                  setShowTierPicker(false);
                }}
              >
                <View style={[styles.tierDot, { backgroundColor: TIER_COLOR[opt.tier] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tierOptionLabel, { color: TIER_COLOR[opt.tier] }]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.tierOptionDesc}>{opt.description}</Text>
                </View>
                {effectiveTier === opt.tier && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTierPicker(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── StatBox ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={statStyles.box}>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    color: '#666',
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#121212',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  iconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconEmoji: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  appName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  packageName: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  domainDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#444',
    marginRight: 10,
  },
  domainText: {
    fontSize: 13,
    color: '#aaa',
    fontFamily: 'monospace',
  },
  moreText: {
    fontSize: 12,
    color: '#555',
    marginTop: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  categoryName: {
    fontSize: 13,
    color: '#bbb',
    textTransform: 'capitalize',
  },
  categoryCount: {
    fontSize: 13,
    color: '#555',
  },
  tierSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  tierDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tierSelectorText: {
    flex: 1,
  },
  tierName: {
    fontSize: 15,
    fontWeight: '600',
  },
  overrideNote: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  chevron: {
    color: '#444',
    fontSize: 20,
  },
  resetLink: {
    marginTop: 8,
  },
  resetLinkText: {
    fontSize: 12,
    color: '#555',
    textDecorationLine: 'underline',
  },
  // Tier picker
  tierPicker: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    padding: 20,
    paddingBottom: 36,
  },
  tierPickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  tierOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#222',
  },
  tierOptionSelected: {
    backgroundColor: '#2a2a2a',
  },
  tierOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  tierOptionDesc: {
    fontSize: 12,
    color: '#555',
  },
  checkmark: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: '700',
  },
  cancelBtn: {
    marginTop: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#666',
    fontSize: 14,
  },
});
