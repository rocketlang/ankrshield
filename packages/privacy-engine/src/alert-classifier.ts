/**
 * AnkrShield Alert Classifier — 5-Level Hierarchy
 *
 * Maps raw threat events to one of 5 alert levels.
 * Only CRITICAL produces sound + full-screen overlay.
 *
 * SILENT   — tracker ping, ad beacon, analytics hit
 *            → logged locally, visible in weekly summary ONLY
 *            → NO notification, NO badge, NO sound
 *
 * SUBTLE   — new tracker category, minor reputation concern
 *            → status bar icon colour shift (green → amber dot)
 *            → no popup, no sound
 *
 * MEDIUM   — known bad actor (reputation 40–70)
 *            → pull-down notification, auto-dismiss 5s
 *            → no sound
 *
 * HIGH     — confirmed threat (phishing/C2, score 70–89)
 *            → persistent notification, subtle vibrate
 *            → no sound
 *
 * CRITICAL — active attack (live phishing you just clicked, live C2)
 *            → FULL SCREEN RED ALERT
 *            → loud alarm + long vibration
 *            → cannot be swiped away — user must tap "I understand"
 *            → calls xShield for immediate intel
 */

import crypto from 'crypto';
import type {
  AlertLevel,
  ShieldAlert,
  TrackerCategory,
  ProtectionLayer,
} from './types';

// ── Score thresholds ──────────────────────────────────────────────────────────

const THRESHOLDS = {
  SILENT: 0,    // 0–29
  SUBTLE: 30,   // 30–39
  MEDIUM: 40,   // 40–69
  HIGH: 70,     // 70–89
  CRITICAL: 90, // 90–100
} as const;

function scoreToLevel(riskScore: number, category: TrackerCategory): AlertLevel {
  // Malware and phishing jump straight to at-least-MEDIUM regardless of score
  if (category === 'malware' || category === 'phishing') {
    if (riskScore >= THRESHOLDS.CRITICAL) return 'CRITICAL';
    if (riskScore >= THRESHOLDS.HIGH) return 'HIGH';
    return 'MEDIUM';
  }

  if (riskScore >= THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (riskScore >= THRESHOLDS.HIGH) return 'HIGH';
  if (riskScore >= THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (riskScore >= THRESHOLDS.SUBTLE) return 'SUBTLE';
  return 'SILENT';
}

// ── Android notification channels ────────────────────────────────────────────

const ANDROID_CHANNELS: Record<AlertLevel, string> = {
  SILENT: 'ankrshield_silent',
  SUBTLE: 'ankrshield_subtle',
  MEDIUM: 'ankrshield_medium',
  HIGH: 'ankrshield_high',
  CRITICAL: 'ankrshield_critical',
};

// ── Notification priority mapping ────────────────────────────────────────────

const NOTIFICATION_PRIORITY: Record<AlertLevel, ShieldAlert['priority']> = {
  SILENT: 'min',
  SUBTLE: 'min',
  MEDIUM: 'default',
  HIGH: 'high',
  CRITICAL: 'max',
};

// ── Display labels ────────────────────────────────────────────────────────────

function buildTitle(level: AlertLevel, category: TrackerCategory, domain: string): string {
  switch (level) {
    case 'SILENT': return 'Tracker blocked';
    case 'SUBTLE': return `New ${category} tracker`;
    case 'MEDIUM': return `Blocked: ${domain}`;
    case 'HIGH': return `Threat blocked: ${domain}`;
    case 'CRITICAL': return 'ACTIVE THREAT DETECTED';
  }
}

function buildBody(level: AlertLevel, category: TrackerCategory, domain: string, source: ProtectionLayer): string {
  const layerLabel = source === 'dns_only' ? 'DNS layer' : source === 'passive' ? 'Network monitor' : 'Active protection';
  switch (level) {
    case 'SILENT': return `${domain} silently blocked`;
    case 'SUBTLE': return `${layerLabel} detected a new ${category} source`;
    case 'MEDIUM': return `${layerLabel} blocked ${domain} (known ${category})`;
    case 'HIGH': return `Confirmed threat blocked: ${domain}. Tap to review.`;
    case 'CRITICAL': return `${domain} is actively targeting your device. Tap "I understand" to see details.`;
  }
}

function buildEmoji(level: AlertLevel): string {
  switch (level) {
    case 'SILENT': return '🟢';
    case 'SUBTLE': return '🟡';
    case 'MEDIUM': return '🟠';
    case 'HIGH': return '🔴';
    case 'CRITICAL': return '🚨';
  }
}

// ── Main classifier function ──────────────────────────────────────────────────

export interface ClassifyInput {
  domain: string;
  category: TrackerCategory;
  riskScore: number;
  signal: string;
  source: ProtectionLayer;
  detectedAt?: Date;
}

export function classifyAlert(input: ClassifyInput): ShieldAlert {
  const { domain, category, riskScore, signal, source, detectedAt = new Date() } = input;
  const level = scoreToLevel(riskScore, category);

  return {
    id: crypto.randomUUID(),
    level,
    domain,
    category,
    signal,
    riskScore,
    title: buildTitle(level, category, domain),
    body: buildBody(level, category, domain, source),
    emoji: buildEmoji(level),

    // Behaviour
    shouldNotify: level !== 'SILENT',
    shouldVibrate: level === 'HIGH' || level === 'CRITICAL',
    shouldPlaySound: level === 'CRITICAL',
    isFullScreen: level === 'CRITICAL',
    requiresAck: level === 'CRITICAL',
    autoDismissMs: level === 'MEDIUM' ? 5000 : 0,

    // Metadata
    channelId: ANDROID_CHANNELS[level],
    priority: NOTIFICATION_PRIORITY[level],
    detectedAt,
    source,
  };
}

// ── Batch classifier for daily summary ───────────────────────────────────────

export interface DailySummary {
  date: Date;
  totalBlocked: number;
  silentCount: number;
  subtleCount: number;
  mediumCount: number;
  highCount: number;
  criticalCount: number;
  topBlockedDomains: string[];
  topCategories: string[];
  overallLevel: AlertLevel; // highest level seen today
}

export function buildDailySummary(alerts: ShieldAlert[]): DailySummary {
  const counts: Record<AlertLevel, number> = {
    SILENT: 0, SUBTLE: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0,
  };
  const domainCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};

  for (const alert of alerts) {
    counts[alert.level]++;
    domainCounts[alert.domain] = (domainCounts[alert.domain] ?? 0) + 1;
    categoryCounts[alert.category] = (categoryCounts[alert.category] ?? 0) + 1;
  }

  const levels: AlertLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'SUBTLE', 'SILENT'];
  const overallLevel = levels.find(l => counts[l] > 0) ?? 'SILENT';

  const topBlockedDomains = Object.entries(domainCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([domain]) => domain);

  const topCategories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat]) => cat);

  return {
    date: new Date(),
    totalBlocked: alerts.length,
    silentCount: counts.SILENT,
    subtleCount: counts.SUBTLE,
    mediumCount: counts.MEDIUM,
    highCount: counts.HIGH,
    criticalCount: counts.CRITICAL,
    topBlockedDomains,
    topCategories,
    overallLevel,
  };
}

// ── Onboarding scan result builder ───────────────────────────────────────────

import type { ScanState } from './types';

export function buildScanState(recentAlerts: ShieldAlert[]): ScanState {
  if (recentAlerts.length === 0) {
    return { phase: 'scanning' };
  }

  const critical = recentAlerts.find(a => a.level === 'CRITICAL');
  if (critical) {
    return { phase: 'threat', domain: critical.domain, level: 'CRITICAL' };
  }

  const high = recentAlerts.find(a => a.level === 'HIGH');
  if (high) {
    return { phase: 'threat', domain: high.domain, level: 'HIGH' };
  }

  const trackerCount = recentAlerts.filter(a => a.level !== 'SILENT').length;
  if (trackerCount > 0) {
    return { phase: 'monitoring', trackerCount };
  }

  const blockedToday = recentAlerts.length;
  return { phase: 'clean', blockedToday };
}

export { scoreToLevel, AlertLevel };
