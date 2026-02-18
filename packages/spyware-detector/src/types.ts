/**
 * @ankrshield/spyware-detector — Type definitions
 *
 * Nation-state spyware detection types covering Pegasus, Candiru,
 * Predator, FinFisher, and Hermit threat families.
 */

// ---------------------------------------------------------------------------
// Core enumerations
// ---------------------------------------------------------------------------

/** Known nation-state spyware families tracked by this engine. */
export type SpywareFamily =
  | 'pegasus'
  | 'candiru'
  | 'predator'
  | 'finfisher'
  | 'hermit'
  | 'unknown';

/** Category of the indicator of compromise (IOC). */
export type SpywareIndicatorType =
  | 'network_ioc'
  | 'process_name'
  | 'file_artifact'
  | 'dns_query'
  | 'certificate'
  | 'behavioral'
  | 'memory_pattern';

/**
 * Overall detection severity level based on accumulated confidence:
 *   - suspected : confidence < 30
 *   - probable  : confidence 30–69
 *   - confirmed : confidence >= 70
 */
export type SpywareSeverity = 'suspected' | 'probable' | 'confirmed';

// ---------------------------------------------------------------------------
// Individual indicator
// ---------------------------------------------------------------------------

/**
 * A single matched indicator of compromise.
 */
export interface SpywareIndicator {
  /** Unique identifier for this indicator (UUID v4). */
  id: string;

  /** Which threat family this indicator belongs to. */
  family: SpywareFamily;

  /** The category of evidence this indicator represents. */
  type: SpywareIndicatorType;

  /**
   * The raw value that was matched (e.g., the domain name, process name,
   * file path, or IP address).
   */
  value: string;

  /** Human-readable description of what this indicator means. */
  description: string;

  /**
   * Confidence score for this individual indicator, from 0 (no confidence)
   * to 100 (certainty).  Weighted toward the final overall score.
   */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Scan result
// ---------------------------------------------------------------------------

/**
 * Full result returned by a single `SpywareScanner.scan()` call.
 */
export interface SpywareScanResult {
  /** Unique scan run identifier (UUID v4). */
  id: string;

  /** ISO-8601 timestamp of when the scan was initiated. */
  scannedAt: string;

  /** Operating-system platform detected at runtime (e.g., 'linux', 'darwin', 'win32'). */
  platform: string;

  /** All IOC matches found during this scan. Empty array means clean. */
  indicatorsFound: SpywareIndicator[];

  /**
   * Deduplicated list of spyware families that matched at least one indicator.
   */
  families: SpywareFamily[];

  /**
   * Weighted average confidence across all matched indicators.
   * 0 if no indicators were found.
   */
  overallConfidence: number;

  /**
   * Severity level derived from `overallConfidence`, or `null` when no
   * indicators were found (i.e., the device is clean).
   */
  severity: SpywareSeverity | null;

  /** True when no indicators were found and the scan completed successfully. */
  isClean: boolean;

  /** Wall-clock time taken by the scan, in milliseconds. */
  scanDurationMs: number;

  /**
   * Prioritised remediation steps tailored to the families detected.
   * Empty when isClean is true.
   */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Scan configuration
// ---------------------------------------------------------------------------

/**
 * Options accepted by the `SpywareScanner` constructor / `scan()` method.
 * All boolean flags default to `true` when omitted.
 */
export interface ScanOptions {
  /**
   * Check recently resolved DNS names and active network connections
   * against known C2 domain / IP lists.
   */
  enableNetworkScan: boolean;

  /**
   * Enumerate running processes and compare against known spyware process
   * name signatures.
   */
  enableProcessScan: boolean;

  /**
   * Inspect the filesystem for known spyware file artifacts and residues.
   */
  enableFileScan: boolean;

  /**
   * Specifically monitor DNS query logs if available (subset of network scan).
   */
  enableDnsScan: boolean;

  /**
   * Optional list of additional IOC strings (domains or IPs) supplied by the
   * caller — merged with the built-in lists before scanning.
   */
  customIocs?: string[];
}
