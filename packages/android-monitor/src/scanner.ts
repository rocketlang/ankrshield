/**
 * ANKR Shield — Android Monitor
 * Main scanner: AndroidMonitor class.
 *
 * Orchestrates IOC lookup, permission analysis and network-connection
 * inspection to produce a complete AndroidScanResult.
 *
 * The class is intentionally stateless and side-effect-free so it can
 * run safely inside a React Native JS thread or a Web Worker.
 */

import { randomUUID } from 'crypto';

import { analyzePermissions } from './analyzers/permission-analyzer.js';
import { KNOWN_STALKERWARE_PACKAGES, KNOWN_SPYWARE_DOMAINS } from './iocs/stalkerware-packages.js';
import type {
  AndroidScanResult,
  AppPermissions,
  NetworkConnection,
  SpyRiskLevel,
  SuspiciousApp,
} from './types.js';

// ---------------------------------------------------------------------------
// Risk level ordering helpers
// ---------------------------------------------------------------------------

const RISK_ORDER: Record<SpyRiskLevel, number> = {
  clean: 0,
  suspicious: 1,
  high: 2,
  critical: 3,
};

function maxRisk(a: SpyRiskLevel, b: SpyRiskLevel): SpyRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

function overallRisk(apps: SuspiciousApp[]): SpyRiskLevel {
  if (apps.length === 0) return 'clean';
  return apps.reduce<SpyRiskLevel>((acc, app) => maxRisk(acc, app.riskLevel), 'clean');
}

// ---------------------------------------------------------------------------
// Summary and recommendation generation
// ---------------------------------------------------------------------------

function buildSummary(result: Omit<AndroidScanResult, 'summary' | 'recommendations'>): string {
  const { suspiciousApps, totalAppsChecked, overallRiskLevel } = result;

  if (suspiciousApps.length === 0) {
    return `Scanned ${totalAppsChecked} apps — no spyware or stalkerware detected.`;
  }

  const critical = suspiciousApps.filter((a) => a.riskLevel === 'critical').length;
  const high = suspiciousApps.filter((a) => a.riskLevel === 'high').length;

  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (high > 0) parts.push(`${high} high-risk`);
  const remaining = suspiciousApps.length - critical - high;
  if (remaining > 0) parts.push(`${remaining} suspicious`);

  return (
    `Scanned ${totalAppsChecked} apps — found ${suspiciousApps.length} flagged ` +
    `(${parts.join(', ')}). Overall risk: ${overallRiskLevel.toUpperCase()}.`
  );
}

function buildRecommendations(apps: SuspiciousApp[]): string[] {
  const recs: string[] = [];

  const criticalApps = apps.filter((a) => a.riskLevel === 'critical');
  const highApps = apps.filter((a) => a.riskLevel === 'high');
  const hasKnownMalicious = apps.some((a) => a.knownMalicious);
  const hasSideloaded = apps.some((a) =>
    a.reasons.some((r) => r.includes('sideloaded') || r.includes('install source'))
  );

  if (hasKnownMalicious) {
    recs.push(
      'IMMEDIATE ACTION REQUIRED: One or more apps match known spyware/stalkerware signatures. ' +
        'Uninstall them immediately via Settings → Apps.'
    );
  }

  if (criticalApps.length > 0) {
    const names = criticalApps.map((a) => a.appName || a.packageName).join(', ');
    recs.push(`Uninstall critical-risk apps now: ${names}.`);
  }

  if (highApps.length > 0) {
    const names = highApps.map((a) => a.appName || a.packageName).join(', ');
    recs.push(
      `Review and consider removing high-risk apps: ${names}. ` +
        'Check whether you recognise them and whether they need the permissions listed.'
    );
  }

  if (hasSideloaded) {
    recs.push(
      'Some flagged apps were not installed from the Play Store. ' +
        'Sideloaded apps bypass Google Play Protect scanning — use extra caution.'
    );
  }

  recs.push(
    'Review app permissions in Settings → Privacy → Permission Manager for any app you do not fully trust.'
  );
  recs.push(
    'Enable Google Play Protect (Play Store → Profile → Play Protect) to receive ongoing threat scanning.'
  );

  if (apps.some((a) => a.categories.includes('stalkerware'))) {
    recs.push(
      'Stalkerware is often installed by someone with physical access to your device. ' +
        'If you feel unsafe, contact the Coalition Against Stalkerware helpline: stopstalkerware.org/get-help.'
    );
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Network connection analysis helpers
// ---------------------------------------------------------------------------

/**
 * Extract the effective hostname/domain from a raw remote address string.
 * Handles both hostnames and bare IPs (bare IPs are returned as-is so the
 * caller can do IP-range matching separately).
 */
function extractDomain(address: string): string {
  // Strip trailing dots and port numbers (e.g. "evil.com:8443")
  return address.replace(/:\d+$/, '').replace(/\.$/, '').toLowerCase();
}

/**
 * Return true if `address` is or is a subdomain of any domain in `domainSet`.
 */
function matchesDomainSet(address: string, domainSet: Set<string>): boolean {
  const host = extractDomain(address);
  if (domainSet.has(host)) return true;
  // Check parent domains (e.g. "api.spyware.com" → "spyware.com")
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (domainSet.has(parent)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// AndroidMonitor class
// ---------------------------------------------------------------------------

/**
 * Primary entry-point for device scanning.
 *
 * Usage (from React Native via a native bridge):
 * ```typescript
 * const monitor = new AndroidMonitor();
 * const result = monitor.scanApps(installedApps);
 * ```
 */
export class AndroidMonitor {
  // ---------------------------------------------------------------------------
  // App scanning
  // ---------------------------------------------------------------------------

  /**
   * Scan a list of installed apps and return a complete AndroidScanResult.
   *
   * @param apps - Array of AppPermissions objects returned by the native bridge
   *               (PackageManager query on the Android side).
   */
  scanApps(apps: AppPermissions[]): AndroidScanResult {
    const suspiciousApps: SuspiciousApp[] = [];

    for (const app of apps) {
      const flagged = this.evaluateApp(app);
      if (flagged !== null) {
        suspiciousApps.push(flagged);
      }
    }

    // Sort: critical first, then high, then suspicious, then by confidence desc
    suspiciousApps.sort((a, b) => {
      const riskDiff = RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel];
      return riskDiff !== 0 ? riskDiff : b.confidence - a.confidence;
    });

    const overallRiskLevel = overallRisk(suspiciousApps);

    const partial = {
      id: randomUUID(),
      scannedAt: new Date(),
      totalAppsChecked: apps.length,
      suspiciousApps,
      overallRiskLevel,
    };

    return {
      ...partial,
      summary: buildSummary(partial),
      recommendations: buildRecommendations(suspiciousApps),
    };
  }

  /**
   * Evaluate a single app against all detection layers.
   * Returns null if the app is clean, or a SuspiciousApp if flagged.
   */
  private evaluateApp(app: AppPermissions): SuspiciousApp | null {
    const knownMalicious = KNOWN_STALKERWARE_PACKAGES.has(app.packageName);

    // System apps are pre-installed by the OEM/Google and can't be removed
    // by a user anyway — skip unless they match a known IOC.
    if (app.isSystemApp && !knownMalicious) return null;

    const analysis = analyzePermissions(app, knownMalicious);

    // Only surface apps with at least 'suspicious' risk
    if (analysis.riskLevel === 'clean' && !knownMalicious) return null;

    return {
      packageName: app.packageName,
      appName: app.appName,
      riskLevel: analysis.riskLevel,
      categories: analysis.categories,
      reasons: analysis.reasons,
      dangerousPermissions: analysis.dangerousPerms,
      knownMalicious,
      confidence: analysis.confidence,
    };
  }

  // ---------------------------------------------------------------------------
  // Network connection analysis
  // ---------------------------------------------------------------------------

  /**
   * Inspect active network connections for communication with known
   * spyware C2 / exfiltration infrastructure.
   *
   * Connections are typically supplied by the VPN layer or the native
   * network-stats bridge which reads /proc/net/tcp on the device.
   *
   * @param connections - Live connections as observed by the VPN or native shim
   * @returns Array of SuspiciousApp objects (one per *unique* flagged package)
   */
  checkNetworkConnections(connections: NetworkConnection[]): SuspiciousApp[] {
    /** Map of packageName → accumulated findings */
    const findings = new Map<
      string,
      {
        app: NetworkConnection;
        matchedDomains: string[];
        connectionCount: number;
      }
    >();

    for (const conn of connections) {
      if (!matchesDomainSet(conn.remoteAddress, KNOWN_SPYWARE_DOMAINS)) continue;

      const existing = findings.get(conn.packageName);
      if (existing) {
        existing.matchedDomains.push(conn.remoteAddress);
        existing.connectionCount += 1;
      } else {
        findings.set(conn.packageName, {
          app: conn,
          matchedDomains: [conn.remoteAddress],
          connectionCount: 1,
        });
      }
    }

    const result: SuspiciousApp[] = [];

    for (const [packageName, finding] of findings) {
      const knownMalicious = KNOWN_STALKERWARE_PACKAGES.has(packageName);
      const uniqueDomains = [...new Set(finding.matchedDomains)];

      const reason =
        `Active network connection to known spyware infrastructure: ` +
        `${uniqueDomains.join(', ')} (${finding.connectionCount} connection(s))`;

      const confidence = Math.min(100, 70 + uniqueDomains.length * 10 + (knownMalicious ? 20 : 0));

      result.push({
        packageName,
        appName: finding.app.appName,
        riskLevel: confidence >= 80 ? 'critical' : 'high',
        categories: ['data_harvester', 'stalkerware'],
        reasons: [reason],
        dangerousPermissions: [],
        knownMalicious,
        confidence,
      });
    }

    // Sort by confidence descending
    result.sort((a, b) => b.confidence - a.confidence);

    return result;
  }

  // ---------------------------------------------------------------------------
  // Convenience: full scan including network layer
  // ---------------------------------------------------------------------------

  /**
   * Convenience method that merges app-permission scanning with network-level
   * detection into a single AndroidScanResult.
   *
   * @param apps        - Installed apps from PackageManager
   * @param connections - Live network connections from VPN layer (optional)
   */
  fullScan(apps: AppPermissions[], connections: NetworkConnection[] = []): AndroidScanResult {
    const appResult = this.scanApps(apps);

    if (connections.length === 0) return appResult;

    const networkFindings = this.checkNetworkConnections(connections);

    // Merge network findings into app scan results, deduplicating by packageName
    const existingPackages = new Set(appResult.suspiciousApps.map((a) => a.packageName));
    const newFindings: SuspiciousApp[] = [];

    for (const nf of networkFindings) {
      if (existingPackages.has(nf.packageName)) {
        // Enrich existing entry
        const existing = appResult.suspiciousApps.find((a) => a.packageName === nf.packageName);
        if (existing) {
          existing.reasons.push(...nf.reasons);
          existing.categories = [...new Set([...existing.categories, ...nf.categories])];
          existing.confidence = Math.min(100, Math.max(existing.confidence, nf.confidence));
          existing.riskLevel = maxRisk(existing.riskLevel, nf.riskLevel);
        }
      } else {
        newFindings.push(nf);
        existingPackages.add(nf.packageName);
      }
    }

    const merged = [...appResult.suspiciousApps, ...newFindings];

    // Re-sort
    merged.sort((a, b) => {
      const riskDiff = RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel];
      return riskDiff !== 0 ? riskDiff : b.confidence - a.confidence;
    });

    const overallRiskLevel = overallRisk(merged);

    const partial = {
      id: appResult.id,
      scannedAt: appResult.scannedAt,
      totalAppsChecked: appResult.totalAppsChecked,
      suspiciousApps: merged,
      overallRiskLevel,
    };

    return {
      ...partial,
      summary: buildSummary(partial),
      recommendations: buildRecommendations(merged),
    };
  }
}
