/**
 * ANKR Shield — Android Monitor
 * Public API surface.
 *
 * @module @ankrshield/android-monitor
 */

// ── Types ──────────────────────────────────────────────────────────────────
export type {
  SpyRiskLevel,
  SpyCategory,
  SuspiciousApp,
  AndroidScanResult,
  AppPermissions,
  NetworkConnection,
} from './types.js';

// ── IOCs ───────────────────────────────────────────────────────────────────
export {
  KNOWN_STALKERWARE_PACKAGES,
  KNOWN_SPYWARE_DOMAINS,
  KNOWN_SPYWARE_IP_RANGES,
} from './iocs/stalkerware-packages.js';

// ── Permission analyzer ────────────────────────────────────────────────────
export {
  DANGEROUS_PERMISSIONS,
  HIGH_RISK_COMBOS,
  analyzePermissions,
} from './analyzers/permission-analyzer.js';
export type { HighRiskCombo, PermissionAnalysisResult } from './analyzers/permission-analyzer.js';

// ── Scanner ────────────────────────────────────────────────────────────────
export { AndroidMonitor } from './scanner.js';
