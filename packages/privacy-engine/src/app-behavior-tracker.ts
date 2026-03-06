/**
 * AppBehaviorTracker — Per-app safe zone scoring
 *
 * Records DNS/network events per package and computes a Safe Zone Score (0–100):
 *
 *   0–59   SAFE    (green)  — normal tracking for this type of app
 *  60–79   WATCH   (amber)  — elevated beyond expected range, user notified
 *  80–100  DANGER  (red)    — far outside safe zone, blocking recommended
 *
 * Score factors:
 *   1. Tracker domain ratio        — third-party trackers / total domains
 *   2. Category risk weights       — fingerprinting/malware > analytics > cdn
 *   3. Data volume anomaly         — above typical range for app category
 *   4. Known bad actor penalty     — any contact with known malicious infrastructure
 *   5. First-party ratio bonus     — mostly talking to own domains = lower score
 */

import type { TrustStorage } from './app-trust-engine';
import type { TrackerCategory } from './types';

// ─── Score Zone ───────────────────────────────────────────────────────────────

export type SafeZone = 'safe' | 'watch' | 'danger';

export function scoreToZone(score: number): SafeZone {
  if (score < 60) return 'safe';
  if (score < 80) return 'watch';
  return 'danger';
}

export const ZONE_COLOR: Record<SafeZone, string> = {
  safe: '#4CAF50',
  watch: '#FF9800',
  danger: '#F44336',
};

export const ZONE_LABEL: Record<SafeZone, string> = {
  safe: 'In safe zone',
  watch: 'Sending more than usual',
  danger: 'Far beyond safe zone',
};

// ─── Per-event record ─────────────────────────────────────────────────────────

export interface BehaviorEvent {
  ts: number; // unix ms
  domain: string;
  category: TrackerCategory;
  blocked: boolean;
  isFirstParty: boolean;
  byteCount?: number;
}

// ─── Per-app stats ────────────────────────────────────────────────────────────

export interface AppBehaviorStats {
  packageName: string;
  safeZoneScore: number;
  zone: SafeZone;
  totalEventsToday: number;
  blockedToday: number;
  trackerDomainsToday: number;
  uniqueThirdPartyDomains: string[];
  topCategories: Array<{ category: TrackerCategory; count: number }>;
  bytesToday: number;
  lastEventAt: number | null;
  // Human-readable explanation for the score
  explanation: string;
}

// ─── Category risk weights (0–1, higher = more concerning) ────────────────────

const CATEGORY_RISK: Record<TrackerCategory, number> = {
  cdn: 0.05,
  analytics: 0.2,
  telemetry: 0.2,
  advertising: 0.4,
  social: 0.3,
  fingerprinting: 0.75,
  cryptomining: 0.9,
  phishing: 1.0,
  malware: 1.0,
  other: 0.15,
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@ankrshield/app-behavior';
const MAX_EVENTS_PER_APP = 500;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── AppBehaviorTracker ───────────────────────────────────────────────────────

export class AppBehaviorTracker {
  // packageName → ring buffer of events
  private events: Map<string, BehaviorEvent[]> = new Map();
  private storage: TrustStorage;

  constructor(storage: TrustStorage) {
    this.storage = storage;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, BehaviorEvent[]>;
        this.events = new Map(Object.entries(saved));
        this._evict();
      }
    } catch {
      // Start fresh
    }
  }

  // ── Record an event ───────────────────────────────────────────────────────

  recordEvent(
    packageName: string,
    domain: string,
    category: TrackerCategory,
    blocked: boolean,
    isFirstParty: boolean,
    byteCount?: number
  ): void {
    const buf = this.events.get(packageName) ?? [];
    buf.push({ ts: Date.now(), domain, category, blocked, isFirstParty, byteCount });

    // Keep ring buffer capped
    if (buf.length > MAX_EVENTS_PER_APP) buf.splice(0, buf.length - MAX_EVENTS_PER_APP);
    this.events.set(packageName, buf);

    // Async persist (fire and forget)
    this._persist().catch(() => {});
  }

  // ── Compute safe zone score ───────────────────────────────────────────────

  getSafeZoneScore(packageName: string): number {
    const stats = this.getAppStats(packageName);
    return stats.safeZoneScore;
  }

  // ── Full per-app stats ────────────────────────────────────────────────────

  getAppStats(packageName: string): AppBehaviorStats {
    const buf = this._todayEvents(packageName);
    const allBuf = this.events.get(packageName) ?? [];

    if (buf.length === 0) {
      return {
        packageName,
        safeZoneScore: 0,
        zone: 'safe',
        totalEventsToday: 0,
        blockedToday: 0,
        trackerDomainsToday: 0,
        uniqueThirdPartyDomains: [],
        topCategories: [],
        bytesToday: 0,
        lastEventAt: allBuf.length > 0 ? allBuf[allBuf.length - 1]!.ts : null,
        explanation: 'No network activity seen today',
      };
    }

    const thirdParty = buf.filter((e) => !e.isFirstParty);
    const uniqueTP = [...new Set(thirdParty.map((e) => e.domain))];
    const blocked = buf.filter((e) => e.blocked);
    const bytesToday = buf.reduce((acc, e) => acc + (e.byteCount ?? 0), 0);

    // Category counts
    const catCount: Partial<Record<TrackerCategory, number>> = {};
    for (const e of thirdParty) {
      catCount[e.category] = (catCount[e.category] ?? 0) + 1;
    }
    const topCategories = (Object.entries(catCount) as Array<[TrackerCategory, number]>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // ── Score computation ─────────────────────────────────────────────────

    let score = 0;

    // Factor 1: tracker domain ratio (0–40 pts)
    const trackerRatio = buf.length > 0 ? thirdParty.length / buf.length : 0;
    score += trackerRatio * 40;

    // Factor 2: category risk (0–35 pts)
    if (thirdParty.length > 0) {
      const avgRisk =
        thirdParty.reduce((acc, e) => acc + (CATEGORY_RISK[e.category] ?? 0.1), 0) /
        thirdParty.length;
      score += avgRisk * 35;
    }

    // Factor 3: volume anomaly — penalise if >100 third-party domains today (0–15 pts)
    const volumePenalty = Math.min(uniqueTP.length / 100, 1) * 15;
    score += volumePenalty;

    // Factor 4: known bad actor penalty (0–10 pts)
    const hasMalware = thirdParty.some(
      (e) => e.category === 'malware' || e.category === 'phishing'
    );
    if (hasMalware) score += 10;

    // Factor 5: first-party bonus — mostly first-party = reduce score
    const fpRatio = buf.length > 0 ? buf.filter((e) => e.isFirstParty).length / buf.length : 0;
    score -= fpRatio * 15; // up to -15 if nearly all traffic is first-party

    const finalScore = Math.round(Math.max(0, Math.min(100, score)));
    const zone = scoreToZone(finalScore);

    // ── Human explanation ─────────────────────────────────────────────────
    let explanation: string;
    if (finalScore < 20) {
      explanation = 'Mostly communicating with its own servers';
    } else if (finalScore < 40) {
      explanation = `Normal analytics and CDN traffic (${uniqueTP.length} third-party domains)`;
    } else if (finalScore < 60) {
      explanation = `Moderate ad/analytics tracking — ${uniqueTP.length} trackers seen today`;
    } else if (finalScore < 80) {
      explanation = `Above normal: ${uniqueTP.length} third-party domains, ${topCategories[0]?.category ?? 'advertising'} heavy`;
    } else {
      const topCat = topCategories[0]?.category ?? 'unknown';
      explanation = `High concern: ${uniqueTP.length} trackers, ${topCat} — consider restricting`;
    }

    return {
      packageName,
      safeZoneScore: finalScore,
      zone,
      totalEventsToday: buf.length,
      blockedToday: blocked.length,
      trackerDomainsToday: uniqueTP.length,
      uniqueThirdPartyDomains: uniqueTP.slice(0, 20),
      topCategories,
      bytesToday,
      lastEventAt: buf[buf.length - 1]?.ts ?? null,
      explanation,
    };
  }

  // ── All apps with any recorded behaviour ──────────────────────────────────

  getTrackedPackages(): string[] {
    return [...this.events.keys()];
  }

  // ── Private: events from today only ──────────────────────────────────────

  private _todayEvents(packageName: string): BehaviorEvent[] {
    const buf = this.events.get(packageName) ?? [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return buf.filter((e) => e.ts >= startOfDay.getTime());
  }

  // ── Private: evict stale events (> 7 days) ────────────────────────────────

  private _evict(): void {
    const cutoff = Date.now() - RETENTION_MS;
    for (const [pkg, buf] of this.events.entries()) {
      const fresh = buf.filter((e) => e.ts > cutoff);
      if (fresh.length === 0) {
        this.events.delete(pkg);
      } else {
        this.events.set(pkg, fresh);
      }
    }
  }

  // ── Private: persist to storage ───────────────────────────────────────────

  private async _persist(): Promise<void> {
    try {
      const obj: Record<string, BehaviorEvent[]> = {};
      this.events.forEach((buf, pkg) => {
        obj[pkg] = buf;
      });
      await this.storage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Storage unavailable
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAppBehaviorTracker(storage: TrustStorage): AppBehaviorTracker {
  return new AppBehaviorTracker(storage);
}
