/**
 * SpywareScanner — main orchestrator
 *
 * Runs all enabled sub-detectors in parallel and aggregates their results
 * into a single SpywareScanResult.  Emits a 'scan-complete' event via
 * Node's EventEmitter when the scan finishes.
 *
 * Severity thresholds:
 *   overallConfidence < 30  → 'suspected'
 *   overallConfidence < 70  → 'probable'
 *   overallConfidence >= 70 → 'confirmed'
 *
 * Recommendations are generated per-family based on published guidance from
 * Amnesty International, Citizen Lab, and Access Now's Digital Security Lab.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  ScanOptions,
  SpywareFamily,
  SpywareIndicator,
  SpywareScanResult,
  SpywareSeverity,
} from './types.js';
import { NetworkIOCDetector } from './detectors/network-detector.js';
import { ProcessDetector } from './detectors/process-detector.js';
import { FileArtifactDetector } from './detectors/file-detector.js';

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: ScanOptions = {
  enableNetworkScan: true,
  enableProcessScan: true,
  enableFileScan: true,
  enableDnsScan: true,
  customIocs: [],
};

// ---------------------------------------------------------------------------
// Recommendation database keyed by family
// ---------------------------------------------------------------------------

const FAMILY_RECOMMENDATIONS: Record<SpywareFamily, string[]> = {
  pegasus: [
    'Factory reset the device and restore from a clean, pre-compromise backup.',
    'Run Amnesty International MVT (Mobile Verification Toolkit) for a full forensic analysis: https://github.com/mvt-project/mvt',
    'Contact Access Now Digital Security Helpline for assisted incident response: https://www.accessnow.org/help/',
    'Enable Lockdown Mode on iOS 16+ immediately while investigating.',
    'Rotate all credentials (email, messaging apps, banking) from a separate, clean device.',
    'Report to Citizen Lab for threat intelligence sharing: https://citizenlab.ca/spyware-voluntary-disclosure/',
  ],
  candiru: [
    'Isolate the Windows device from all networks immediately.',
    'Run Microsoft Safety Scanner and the MSRT tool.',
    'Contact Citizen Lab or Access Now for forensic assistance.',
    'Rotate all credentials from a separate, clean device.',
    'Apply all pending Windows security updates before reconnecting.',
  ],
  predator: [
    'Factory reset the device and do not restore from backup.',
    'Contact Access Now Digital Security Helpline for assisted analysis.',
    'Review and revoke OAuth tokens for all connected apps from a clean device.',
    'Enable Apple Lockdown Mode or Android equivalent security hardening.',
    'Monitor for recurrence using Amnesty International MVT on a clean machine.',
  ],
  finfisher: [
    'Disconnect from all networks and perform a full antivirus scan.',
    'Run ESET Online Scanner; ESET has published FinFisher detection signatures.',
    'Reinstall the operating system from clean media if infection is confirmed.',
    'Contact Citizen Lab for threat intelligence: https://citizenlab.ca/',
    'File a report with your national CERT or law enforcement cybercrime unit.',
  ],
  hermit: [
    'Factory reset the Android device immediately.',
    'Run Lookout Security scanner (Lookout published Hermit signatures).',
    'Contact Access Now or Amnesty International for mobile forensics support.',
    'Review all installed app permissions from a clean device after reset.',
  ],
  unknown: [
    'Do not dismiss unknown indicators — escalate to a digital security professional.',
    'Contact Access Now Digital Security Helpline: https://www.accessnow.org/help/',
    'Run Amnesty International MVT on a clean analysis machine.',
  ],
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Compute weighted average confidence across all indicators. */
function computeOverallConfidence(indicators: SpywareIndicator[]): number {
  if (indicators.length === 0) return 0;
  const total = indicators.reduce((sum, ind) => sum + ind.confidence, 0);
  return Math.round(total / indicators.length);
}

/** Map a numeric confidence score to a SpywareSeverity level. */
function confidenceToSeverity(confidence: number): SpywareSeverity {
  if (confidence >= 70) return 'confirmed';
  if (confidence >= 30) return 'probable';
  return 'suspected';
}

/** Deduplicate family list preserving insertion order. */
function uniqueFamilies(indicators: SpywareIndicator[]): SpywareFamily[] {
  const seen = new Set<SpywareFamily>();
  const result: SpywareFamily[] = [];
  for (const ind of indicators) {
    if (!seen.has(ind.family)) {
      seen.add(ind.family);
      result.push(ind.family);
    }
  }
  return result;
}

/** Build de-duplicated, prioritised recommendation list for detected families. */
function buildRecommendations(families: SpywareFamily[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  // Always include generic guidance first if any family found
  if (families.length > 0) {
    out.push(
      'URGENT: Stop using the potentially compromised device for sensitive communications immediately.'
    );
    seen.add(out[0]!);
  }

  for (const family of families) {
    const recs = FAMILY_RECOMMENDATIONS[family] ?? FAMILY_RECOMMENDATIONS.unknown;
    for (const rec of recs) {
      if (!seen.has(rec)) {
        seen.add(rec);
        out.push(rec);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// SpywareScanner class
// ---------------------------------------------------------------------------

export class SpywareScanner extends EventEmitter {
  private readonly options: ScanOptions;

  constructor(options: Partial<ScanOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Run all enabled detectors and return a consolidated SpywareScanResult.
   *
   * @param recentDomains  Optional list of recently resolved/connected hostnames.
   * @param recentIPs      Optional list of recently used outbound IP addresses.
   */
  async scan(
    recentDomains: string[] = [],
    recentIPs: string[] = []
  ): Promise<SpywareScanResult> {
    const startTime = Date.now();
    const scanId = randomUUID();
    const scannedAt = new Date().toISOString();

    // Run all enabled detectors concurrently
    const tasks: Promise<SpywareIndicator[]>[] = [];

    if (this.options.enableNetworkScan || this.options.enableDnsScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new NetworkIOCDetector(this.options.customIocs ?? []);
          return detector.scan(recentDomains, recentIPs);
        })
      );
    }

    if (this.options.enableProcessScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new ProcessDetector();
          const results = detector.scan();

          // On Linux, also check /proc
          if (process.platform === 'linux') {
            const procResults = detector.scanProcFs();
            return [...results, ...procResults];
          }

          return results;
        })
      );
    }

    if (this.options.enableFileScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new FileArtifactDetector();
          return detector.scan();
        })
      );
    }

    // Settle all tasks — we tolerate individual detector failures
    const settled = await Promise.allSettled(tasks);
    const allIndicators: SpywareIndicator[] = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        allIndicators.push(...result.value);
      }
      // Rejected tasks are silently swallowed; individual detectors already
      // handle their own errors and return empty arrays.
    }

    // Compute aggregate metrics
    const overallConfidence = computeOverallConfidence(allIndicators);
    const families = uniqueFamilies(allIndicators);
    const isClean = allIndicators.length === 0;
    const severity: SpywareSeverity | null = isClean
      ? null
      : confidenceToSeverity(overallConfidence);
    const recommendations = isClean ? [] : buildRecommendations(families);
    const scanDurationMs = Date.now() - startTime;

    const scanResult: SpywareScanResult = {
      id: scanId,
      scannedAt,
      platform: process.platform,
      indicatorsFound: allIndicators,
      families,
      overallConfidence,
      severity,
      isClean,
      scanDurationMs,
      recommendations,
    };

    // Notify listeners
    this.emit('scan-complete', scanResult);

    return scanResult;
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _defaultScanner: SpywareScanner | null = null;

/**
 * Returns a shared SpywareScanner instance with default options.
 * Pass `forceNew = true` to create a fresh instance (useful in tests).
 */
export function getDefaultScanner(forceNew = false): SpywareScanner {
  if (!_defaultScanner || forceNew) {
    _defaultScanner = new SpywareScanner();
  }
  return _defaultScanner;
}
