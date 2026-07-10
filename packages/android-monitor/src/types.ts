/**
 * ANKR Shield — Android Monitor
 * Type definitions for spyware/stalkerware detection on Android.
 *
 * Modelled after Lookout, Malwarebytes and iVerify mobile threat detection.
 */

/** Severity level assigned to a scanned app or an entire scan result. */
// 'data_harvester' = known commercial data collection (legitimate apps the user
// chose to install, e.g. PhonePe/WhatsApp). NOT a malware verdict — informational,
// amber. 'suspicious' is reserved for unknown/unverified behaviour. This keeps the
// scanner honest and avoids berating apps the user knowingly installed (FP-019).
export type SpyRiskLevel = 'clean' | 'data_harvester' | 'suspicious' | 'high' | 'critical';

/**
 * Behavioural/capability category describing *why* an app is dangerous.
 * Categories are not mutually exclusive — an app may belong to several.
 */
export type SpyCategory =
  | 'stalkerware' // Apps designed for covert monitoring of a specific person
  | 'adware' // Aggressive ad-network tracking / bulk data harvest
  | 'data_harvester' // Covert upload of contacts, SMS, call logs, location
  | 'keylogger' // Keyboard monitoring via accessibility service abuse
  | 'call_recorder' // Covert call recording
  | 'location_tracker' // Persistent background GPS / cell-tower tracking
  | 'mic_spy' // Microphone access without visible user awareness
  | 'cam_spy' // Camera access without visible user awareness
  | 'sms_spy' // SMS reading / interception / exfiltration
  | 'financial_trojan' // Banking / financial credential theft
  | 'commercial_spyware'; // Commercial surveillance tooling (Pegasus-class)

/**
 * A single app that has been flagged by the detector.
 */
export interface SuspiciousApp {
  /** Android package name, e.g. "com.example.app" */
  packageName: string;
  /** Human-readable app label returned by PackageManager */
  appName: string;
  /** Overall risk classification for this app */
  riskLevel: SpyRiskLevel;
  /** One or more behavioural categories that apply */
  categories: SpyCategory[];
  /** Human-readable explanations of each flag */
  reasons: string[];
  /** List of Android permission names that contributed to the finding */
  dangerousPermissions: string[];
  /** True if the package name is in the known-malicious IOC database */
  knownMalicious: boolean;
  /** Detection confidence 0–100 */
  confidence: number;
}

/**
 * Top-level result returned by a full device scan.
 */
export interface AndroidScanResult {
  /** UUID for the scan session */
  id: string;
  /** Wall-clock timestamp of when the scan ran */
  scannedAt: Date;
  /** Total number of installed apps that were evaluated */
  totalAppsChecked: number;
  /** Apps that were flagged as suspicious or worse */
  suspiciousApps: SuspiciousApp[];
  /** Highest risk level found across all apps; 'clean' if nothing found */
  overallRiskLevel: SpyRiskLevel;
  /** One-sentence human-readable summary */
  summary: string;
  /** Ordered list of action recommendations for the user */
  recommendations: string[];
}

/**
 * Per-app data supplied by the React Native / native bridge layer.
 * This is read from Android's PackageManager on the device.
 */
export interface AppPermissions {
  /** Android package name */
  packageName: string;
  /** Human-readable app label */
  appName: string;
  /**
   * All permissions declared in the app's manifest
   * (already granted by system / user).
   * Use bare names without "android.permission." prefix, e.g. "READ_SMS".
   */
  permissions: string[];
  /** Whether the app is a system/pre-installed app */
  isSystemApp: boolean;
  /**
   * Where the APK was installed from.
   * Sideloaded / unknown-source apps carry significantly higher risk.
   */
  installSource: 'play_store' | 'unknown' | 'adb' | 'file_manager';
}

/**
 * An observed live network connection from the device's /proc/net or
 * VPN layer, attributed to a specific app via uid mapping.
 */
export interface NetworkConnection {
  /** Package name of the app that owns the socket */
  packageName: string;
  /** Human-readable app label */
  appName: string;
  /** Remote IP address (IPv4 or IPv6) */
  remoteAddress: string;
  /** Remote TCP/UDP port */
  remotePort: number;
  /** Socket state */
  state: 'ESTABLISHED' | 'LISTEN' | 'TIME_WAIT';
  /** True if the remote endpoint matches a known spyware C2 or exfil domain/IP */
  suspiciousDestination: boolean;
  /** Explanation of why the destination is flagged, if applicable */
  reason?: string;
}
