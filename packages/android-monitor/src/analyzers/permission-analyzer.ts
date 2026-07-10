/**
 * ANKR Shield — Android Monitor
 * Permission-based heuristic analyzer.
 *
 * Evaluates Android permission sets against:
 *  1. A list of individually dangerous permissions
 *  2. A set of high-risk *combinations* that are characteristic of spyware
 *
 * This mirrors the static-analysis layer used by Exodus Privacy and
 * the Lookout permission scoring engine.
 */

import type { AppPermissions, SpyCategory, SpyRiskLevel } from '../types.js';

// ---------------------------------------------------------------------------
// Dangerous individual permissions
// ---------------------------------------------------------------------------

/**
 * Android permissions that individually warrant attention.
 * Bare name form — without the "android.permission." prefix.
 */
export const DANGEROUS_PERMISSIONS: readonly string[] = [
  'READ_SMS',
  'RECEIVE_SMS',
  'SEND_SMS',
  'READ_CALL_LOG',
  'WRITE_CALL_LOG',
  'PROCESS_OUTGOING_CALLS',
  'RECORD_AUDIO',
  'CAMERA',
  'READ_CONTACTS',
  'WRITE_CONTACTS',
  'GET_ACCOUNTS',
  'USE_CREDENTIALS',
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'ACCESS_BACKGROUND_LOCATION',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'MANAGE_EXTERNAL_STORAGE',
  'BIND_ACCESSIBILITY_SERVICE', // Abused by keyloggers for screen reading
  'RECEIVE_BOOT_COMPLETED', // Persistence — survives reboots
  'FOREGROUND_SERVICE',
  'REQUEST_INSTALL_PACKAGES', // Can silently deploy additional APKs
  'SYSTEM_ALERT_WINDOW', // Draw overlay over other apps (UI phishing)
  'READ_PHONE_STATE',
  'READ_PHONE_NUMBERS',
  'ANSWER_PHONE_CALLS',
  'CHANGE_NETWORK_STATE',
  'CHANGE_WIFI_STATE',
  'PACKAGE_USAGE_STATS', // Can fingerprint all apps the user opens
  'BIND_DEVICE_ADMIN', // Device admin — can prevent uninstall
  'MASTER_CLEAR', // Factory reset (wipe evidence)
];

// ---------------------------------------------------------------------------
// High-risk permission combinations
// ---------------------------------------------------------------------------

/**
 * A combination of permissions that — when held *together* — strongly
 * indicate a particular spyware behaviour category.
 */
export interface HighRiskCombo {
  /** Permissions that must ALL be present to trigger this rule */
  permissions: string[];
  /** Human-readable explanation surfaced to the user */
  reason: string;
  /** Behaviour category to assign */
  category: SpyCategory;
  /** Base confidence score (0–100) contributed by this combo alone */
  baseConfidence: number;
}

export const HIGH_RISK_COMBOS: readonly HighRiskCombo[] = [
  // ── Stalkerware trifecta ──────────────────────────────────────────────────
  {
    permissions: ['READ_SMS', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION'],
    reason: 'Can read SMS, contacts and track precise location — classic stalkerware profile',
    category: 'stalkerware',
    baseConfidence: 75,
  },
  {
    permissions: ['READ_SMS', 'READ_CALL_LOG', 'ACCESS_FINE_LOCATION', 'RECORD_AUDIO'],
    reason:
      'Full communication intercept + location + audio — comprehensive stalkerware capability',
    category: 'stalkerware',
    baseConfidence: 90,
  },

  // ── Microphone spy ────────────────────────────────────────────────────────
  {
    permissions: ['RECORD_AUDIO', 'ACCESS_BACKGROUND_LOCATION', 'READ_CONTACTS'],
    reason: 'Background microphone + persistent location + contacts = likely spy app',
    category: 'mic_spy',
    baseConfidence: 80,
  },
  {
    permissions: ['RECORD_AUDIO', 'RECEIVE_BOOT_COMPLETED', 'FOREGROUND_SERVICE'],
    reason: 'Persistent background audio recording that survives device reboot',
    category: 'mic_spy',
    baseConfidence: 70,
  },

  // ── Camera spy ────────────────────────────────────────────────────────────
  {
    permissions: ['RECORD_AUDIO', 'CAMERA', 'ACCESS_FINE_LOCATION'],
    reason: 'Camera + microphone + location with no obvious foreground user activity',
    category: 'cam_spy',
    baseConfidence: 78,
  },
  {
    permissions: ['CAMERA', 'RECEIVE_BOOT_COMPLETED', 'FOREGROUND_SERVICE'],
    reason: 'Camera access that auto-starts on boot — covert recording indicator',
    category: 'cam_spy',
    baseConfidence: 65,
  },

  // ── Keylogger / screen reader ─────────────────────────────────────────────
  {
    permissions: ['BIND_ACCESSIBILITY_SERVICE', 'READ_SMS', 'RECORD_AUDIO'],
    reason:
      'Accessibility service abuse for keylogging / screen reading combined with audio capture',
    category: 'keylogger',
    baseConfidence: 85,
  },
  {
    permissions: ['BIND_ACCESSIBILITY_SERVICE', 'PACKAGE_USAGE_STATS', 'INTERNET'],
    reason: 'Accessibility service + app usage stats = can log what apps and content user views',
    category: 'keylogger',
    baseConfidence: 68,
  },

  // ── Call recorder ─────────────────────────────────────────────────────────
  {
    permissions: ['READ_CALL_LOG', 'PROCESS_OUTGOING_CALLS', 'RECORD_AUDIO'],
    reason: 'Can intercept, log and record all inbound and outbound calls',
    category: 'call_recorder',
    baseConfidence: 85,
  },
  {
    permissions: ['ANSWER_PHONE_CALLS', 'RECORD_AUDIO', 'WRITE_EXTERNAL_STORAGE'],
    reason: 'Can silently answer calls and write audio to device storage',
    category: 'call_recorder',
    baseConfidence: 72,
  },

  // ── Location tracker ──────────────────────────────────────────────────────
  {
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'RECEIVE_BOOT_COMPLETED'],
    reason: 'Persistent precise background location tracking that survives reboots',
    category: 'location_tracker',
    baseConfidence: 80,
  },

  // ── Data harvester ────────────────────────────────────────────────────────
  {
    permissions: ['REQUEST_INSTALL_PACKAGES', 'READ_SMS', 'ACCESS_FINE_LOCATION'],
    reason: 'Can silently install additional APKs while harvesting SMS and location data',
    category: 'data_harvester',
    baseConfidence: 82,
  },
  {
    permissions: ['READ_CONTACTS', 'READ_CALL_LOG', 'READ_SMS', 'GET_ACCOUNTS'],
    reason:
      'Bulk access to contacts, call history, SMS and all device accounts — data broker/harvester profile',
    category: 'data_harvester',
    baseConfidence: 75,
  },
  {
    permissions: ['MANAGE_EXTERNAL_STORAGE', 'READ_CONTACTS', 'GET_ACCOUNTS'],
    reason: 'Full filesystem access combined with account and contact enumeration',
    category: 'data_harvester',
    baseConfidence: 68,
  },

  // ── SMS spy ───────────────────────────────────────────────────────────────
  {
    permissions: ['READ_SMS', 'RECEIVE_SMS', 'SEND_SMS'],
    reason: 'Complete SMS interception and forwarding capability',
    category: 'sms_spy',
    baseConfidence: 72,
  },

  // ── Financial trojan ──────────────────────────────────────────────────────
  {
    permissions: ['SYSTEM_ALERT_WINDOW', 'BIND_ACCESSIBILITY_SERVICE', 'GET_ACCOUNTS'],
    reason:
      'UI overlay phishing + accessibility keystroke capture + account enumeration = banking trojan profile',
    category: 'financial_trojan',
    baseConfidence: 85,
  },
  {
    permissions: ['SYSTEM_ALERT_WINDOW', 'BIND_ACCESSIBILITY_SERVICE', 'READ_SMS'],
    reason: 'Overlay attack + accessibility abuse + SMS interception for OTP theft',
    category: 'financial_trojan',
    baseConfidence: 88,
  },

  // ── Device control / prevent removal ────────────────────────────────────
  {
    permissions: ['BIND_DEVICE_ADMIN', 'RECEIVE_BOOT_COMPLETED', 'REQUEST_INSTALL_PACKAGES'],
    reason:
      'Device admin rights + boot persistence + self-update capability — designed to resist removal',
    category: 'commercial_spyware',
    baseConfidence: 90,
  },
];

// ---------------------------------------------------------------------------
// Analyzer result type
// ---------------------------------------------------------------------------

export interface PermissionAnalysisResult {
  riskLevel: SpyRiskLevel;
  categories: SpyCategory[];
  reasons: string[];
  dangerousPerms: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Normalise a permission string to the bare form used throughout this
 * module (strips "android.permission." prefix if present).
 */
function normalise(permission: string): string {
  return permission.replace(/^android\.permission\./i, '').toUpperCase();
}

/**
 * Return the permissions from `appPerms` that appear in DANGEROUS_PERMISSIONS.
 */
function findDangerousPermissions(appPerms: readonly string[]): string[] {
  const normalised = appPerms.map(normalise);
  const dangerousSet = new Set(DANGEROUS_PERMISSIONS);
  return normalised.filter((p) => dangerousSet.has(p));
}

/**
 * Check which HIGH_RISK_COMBOS are triggered by the given permission set.
 */
function findTriggeredCombos(appPerms: readonly string[]): HighRiskCombo[] {
  const normSet = new Set(appPerms.map(normalise));
  return HIGH_RISK_COMBOS.filter((combo) => combo.permissions.every((p) => normSet.has(p)));
}

/**
 * Map a confidence score (0–100) and a count of dangerous permissions
 * to a SpyRiskLevel bucket.
 *
 * Thresholds are calibrated against real-device scans:
 *   - Many legitimate apps (WhatsApp, Chrome, Gmail) hold 3–6 dangerous perms
 *   - Only a combination of permissions + sideload source should raise 'suspicious'
 *   - System apps are excluded upstream before this function is reached
 */
function deriveRiskLevel(
  confidence: number,
  dangerousPermCount: number,
  knownMalicious: boolean
): SpyRiskLevel {
  if (knownMalicious) return 'critical';
  if (confidence >= 85 || dangerousPermCount >= 12) return 'critical';
  if (confidence >= 65 || dangerousPermCount >= 9) return 'high';
  if (confidence >= 48 || dangerousPermCount >= 7) return 'suspicious';
  return 'clean';
}

// ---------------------------------------------------------------------------
// Main exported analyzer function
// ---------------------------------------------------------------------------

/**
 * Analyse a single app's declared permissions and return a structured
 * finding with risk level, categories and explanations.
 *
 * @param app - App permissions as reported by the device's PackageManager
 * @param knownMalicious - Whether the package name is in the IOC database
 */
/**
 * Well-known, user-installed commercial apps. Their broad data collection is a
 * disclosed business model, not malware. They must NEVER be labelled 'suspicious'
 * (that implies a threat) — at most 'data_harvester' (informational, amber).
 * Berating an app the user knowingly installed breaks trust (FP-019).
 */
const KNOWN_COMMERCIAL_APPS = new Set<string>([
  'com.truecaller',
  'com.phonepe.app',
  'net.one97.paytm',
  'com.myairtelapp',
  'com.whatsapp',
  'com.whatsapp.w4b',
  'com.instagram.android',
  'com.facebook.katana',
  'com.facebook.orca',
  'com.axis.mobile',
  'com.google.android.apps.nbu.paisa.user',
  'in.amazon.mShop.android.shopping',
  'com.amazon.mShop.android.shopping',
  'com.flipkart.android',
  'in.swiggy.android',
  'com.application.zomato',
  'com.google.android.youtube',
  'com.google.android.gm',
  'com.snapchat.android',
  'com.linkedin.android',
  'com.twitter.android',
  'com.ubercab',
  'com.olacabs.customer',
  'com.dreamplug.androidapp',
  'com.mobikwik_new',
  'com.freecharge.android',
  'in.org.npci.upiapp',
  'com.sbi.lotusintouch',
  'com.snapwork.hdfc',
  'com.csam.icici.bank.imobile',
  'com.msf.kbank.mobile',
  'com.spotify.music',
  'com.netflix.mediaclient',
  'com.microsoft.office.outlook',
  'com.zoho.mail',
]);

const HARVESTER_EDU =
  'This app collects data by design — a disclosed part of its business model, not malware. Your choice to keep or remove it.';

export function analyzePermissions(
  app: AppPermissions,
  knownMalicious = false
): PermissionAnalysisResult {
  const dangerousPerms = findDangerousPermissions(app.permissions);

  // IOC match — always critical, regardless of source (a known-commercial name
  // does NOT override a real IOC hit).
  if (knownMalicious) {
    return {
      riskLevel: 'critical',
      categories: ['stalkerware'],
      reasons: ['Package name matches a known stalkerware/spyware IOC database entry'],
      dangerousPerms,
      confidence: 100,
    };
  }

  // ── Store / unknown-source apps ───────────────────────────────────────────
  // Real stalkerware is virtually never on Google Play (or installed through
  // a known package manager). Legitimate apps (Chrome, WhatsApp, Maps, Gmail)
  // share the same permission combos for entirely benign reasons.
  //
  // We only run full combo analysis when the install source is CONFIRMED as
  // a manual sideload (file_manager = APK from browser/Files, adb = Dev).
  // For 'play_store', 'other', and 'unknown' (API gap on Android 12+) we give
  // the benefit of the doubt and only flag extreme outliers (12+ perms).
  const isSideloaded = app.installSource === 'file_manager' || app.installSource === 'adb';
  const isKnownCommercial = KNOWN_COMMERCIAL_APPS.has(app.packageName);

  // Known-commercial apps: broad data access is disclosed, not malware. Surface
  // as 'data_harvester' (amber, informational) if they hold notable data perms,
  // else clean. Never 'suspicious'.
  if (isKnownCommercial && !isSideloaded) {
    if (dangerousPerms.length >= 5) {
      return {
        riskLevel: 'data_harvester',
        categories: ['data_harvester'],
        reasons: [
          HARVESTER_EDU,
          `Holds ${dangerousPerms.length} data permissions (${dangerousPerms.slice(0, 4).join(', ')}…).`,
        ],
        dangerousPerms,
        confidence: Math.min(60, dangerousPerms.length * 5),
      };
    }
    return { riskLevel: 'clean', categories: [], reasons: [], dangerousPerms, confidence: 0 };
  }

  if (!isSideloaded) {
    // A Play-Store / unknown-source app with unusually broad permissions is a
    // data harvester (informational amber), NOT 'suspicious' (which implies a
    // threat). Genuine malware is virtually never on the Play Store.
    if (dangerousPerms.length >= 12) {
      return {
        riskLevel: 'data_harvester',
        categories: ['data_harvester'],
        reasons: [
          HARVESTER_EDU,
          `Holds ${dangerousPerms.length} sensitive permissions — unusually broad for its function.`,
        ],
        dangerousPerms,
        confidence: Math.min(55, dangerousPerms.length * 4),
      };
    }
    return { riskLevel: 'clean', categories: [], reasons: [], dangerousPerms, confidence: 0 };
  }

  // ── Confirmed sideloaded apps — full combo analysis ───────────────────────
  const triggeredCombos = findTriggeredCombos(app.permissions);
  const categorySet = new Set<SpyCategory>();
  const reasons: string[] = [];

  for (const combo of triggeredCombos) {
    categorySet.add(combo.category);
    reasons.push(combo.reason);
  }

  if (triggeredCombos.length === 0 && dangerousPerms.length >= 8) {
    categorySet.add('data_harvester');
    reasons.push(
      `Holds ${dangerousPerms.length} sensitive permissions (${dangerousPerms.slice(0, 4).join(', ')}…) — unusually broad for a sideloaded app`
    );
  }

  let confidence = 0;
  if (triggeredCombos.length > 0) {
    confidence = Math.max(...triggeredCombos.map((c) => c.baseConfidence));
    confidence = Math.min(100, confidence + (triggeredCombos.length - 1) * 5);
  } else if (dangerousPerms.length >= 8) {
    confidence = Math.min(55, dangerousPerms.length * 6);
  }

  if (app.installSource === 'adb' || app.installSource === 'file_manager') {
    if (triggeredCombos.length > 0 || dangerousPerms.length >= 4) {
      confidence = Math.min(100, confidence + 15);
      reasons.push(`Sideloaded (${app.installSource}) — bypasses Google Play Protect`);
    }
  }

  const riskLevel = deriveRiskLevel(confidence, dangerousPerms.length, false);

  return {
    riskLevel,
    categories: Array.from(categorySet),
    reasons,
    dangerousPerms,
    confidence,
  };
}
