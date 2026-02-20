/**
 * ScanStore — lightweight in-memory cache for the last app scan result.
 *
 * Persists within the app session. The PrivacyService reads from here so
 * the Home screen score reflects the actual installed-app risk level instead
 * of defaulting to the server-side attack-chain proxy.
 */

import type { AndroidScanResult } from '@ankrshield/android-monitor';

export interface CachedScan {
  result: AndroidScanResult;
  scannedAt: number; // epoch ms
}

let _last: CachedScan | null = null;

/** Save a completed scan result. Called by AndroidMonitorScreen after every scan. */
export function saveScanResult(result: AndroidScanResult): void {
  _last = { result, scannedAt: Date.now() };
}

/** Return the last scan, or null if no scan has been run this session. */
export function getLastScan(): CachedScan | null {
  return _last;
}

/**
 * Derive an app privacy score (0–100) from the last scan result.
 * Returns null if no scan is available (caller should use a fallback).
 *
 * Scoring:
 *   Start at 100.
 *   −40 per CRITICAL app
 *   −15 per HIGH app
 *   −5  per SUSPICIOUS app
 *   Floor: 0
 *   If scan is older than 24 h, discount by 50 % (stale data).
 */
export function scanAppScore(): number | null {
  if (!_last) return null;

  const { result, scannedAt } = _last;
  let score = 100;

  for (const app of result.suspiciousApps) {
    if (app.riskLevel === 'critical') score -= 40;
    else if (app.riskLevel === 'high') score -= 15;
    else if (app.riskLevel === 'suspicious') score -= 5;
  }

  score = Math.max(0, score);

  // Stale-data discount: older than 24 h → treat as 50 % reliable
  const ageMs = Date.now() - scannedAt;
  if (ageMs > 24 * 60 * 60 * 1000) {
    score = Math.round(50 + score * 0.5);
  }

  return Math.min(100, score);
}
