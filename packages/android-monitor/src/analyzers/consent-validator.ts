/**
 * Consent Validator — Excess Scope Detector
 *
 * Philosophy: permissions user consciously granted = fine.
 * Flags only permissions that are UNEXPECTED for the app's stated purpose.
 * Never punishes apps for permissions that match their category.
 */

import type { AppPermissions } from '../types.js';

export type AppCategory =
  | 'messaging' // WhatsApp, Telegram, Signal
  | 'browser' // Chrome, Firefox, Opera
  | 'camera' // Camera apps, photo editors
  | 'maps' // Google Maps, OLA, Uber
  | 'banking' // PhonePe, HDFC, Paytm
  | 'fitness' // Health apps, step counters
  | 'social' // Instagram, Twitter/X, Facebook
  | 'games' // Games
  | 'productivity' // Office, notes, PDF viewers
  | 'system_tool' // Cleaners, boosters, system utilities
  | 'ecommerce' // Flipkart, Amazon, Meesho
  | 'streaming' // YouTube, Netflix, Hotstar
  | 'unknown';

export interface ExcessPermission {
  permission: string;
  reason: string; // Why it's excess for this app category
  severity: 'info' | 'warning' | 'critical';
}

export interface ConsentValidation {
  packageName: string;
  appName: string;
  detectedCategory: AppCategory;
  grantedPermissions: string[]; // All permissions user granted
  expectedPermissions: string[]; // Expected for this app category
  excessPermissions: ExcessPermission[]; // Granted but beyond purpose
  legitimatePermissions: string[]; // Granted AND expected — fully fine
  consentScore: number; // 0-100, higher = more trustworthy
  summary: string;
}

// ---------------------------------------------------------------------------
// Purpose-based permission allowlists per app category
// ---------------------------------------------------------------------------

export const APP_PURPOSE_PERMISSIONS: Record<AppCategory, string[]> = {
  messaging: [
    'READ_CONTACTS',
    'WRITE_CONTACTS',
    'RECORD_AUDIO',
    'CAMERA',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
    'ACCESS_FINE_LOCATION',
    'ACCESS_COARSE_LOCATION',
    'RECEIVE_BOOT_COMPLETED',
    'FOREGROUND_SERVICE',
    'READ_MEDIA_IMAGES',
    'READ_MEDIA_VIDEO',
  ],
  browser: [
    'ACCESS_FINE_LOCATION',
    'ACCESS_COARSE_LOCATION',
    'CAMERA',
    'RECORD_AUDIO',
    'WRITE_EXTERNAL_STORAGE',
    'READ_EXTERNAL_STORAGE',
  ],
  camera: [
    'CAMERA',
    'RECORD_AUDIO',
    'WRITE_EXTERNAL_STORAGE',
    'READ_EXTERNAL_STORAGE',
    'ACCESS_FINE_LOCATION',
  ],
  maps: [
    'ACCESS_FINE_LOCATION',
    'ACCESS_COARSE_LOCATION',
    'ACCESS_BACKGROUND_LOCATION',
    'RECORD_AUDIO',
    'CAMERA',
    'READ_CONTACTS',
  ],
  banking: [
    'CAMERA',
    'READ_PHONE_STATE',
    'RECEIVE_SMS',
    'READ_SMS',
    'ACCESS_FINE_LOCATION',
    'RECORD_AUDIO',
    'USE_BIOMETRIC',
    'USE_FINGERPRINT',
  ],
  fitness: [
    'ACCESS_FINE_LOCATION',
    'ACCESS_COARSE_LOCATION',
    'ACCESS_BACKGROUND_LOCATION',
    'RECORD_AUDIO',
    'CAMERA',
    'BODY_SENSORS',
    'ACTIVITY_RECOGNITION',
  ],
  social: [
    'CAMERA',
    'RECORD_AUDIO',
    'READ_CONTACTS',
    'WRITE_CONTACTS',
    'ACCESS_FINE_LOCATION',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
    'READ_MEDIA_IMAGES',
    'READ_MEDIA_VIDEO',
  ],
  games: ['WRITE_EXTERNAL_STORAGE', 'READ_EXTERNAL_STORAGE', 'RECORD_AUDIO'],
  productivity: [
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
    'CAMERA',
    'RECORD_AUDIO',
    'READ_CONTACTS',
  ],
  // Cleaners/boosters legitimately need almost nothing sensitive
  system_tool: [],
  ecommerce: [
    'CAMERA',
    'ACCESS_FINE_LOCATION',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
    'READ_CONTACTS',
  ],
  streaming: ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'RECORD_AUDIO'],
  // Unknown category — all sensitive perms flagged as info
  unknown: [],
};

// ---------------------------------------------------------------------------
// Explanations for why a permission is excess in contexts outside its allowlist
// ---------------------------------------------------------------------------

const EXCESS_EXPLANATIONS: Partial<Record<string, string>> = {
  READ_SMS: 'Can read all your SMS messages including OTPs and bank alerts',
  BIND_ACCESSIBILITY_SERVICE: 'Can read content of all apps including banking and messaging',
  READ_CALL_LOG: 'Can see who you called and when',
  PROCESS_OUTGOING_CALLS: 'Can intercept and redirect your phone calls',
  RECORD_AUDIO: 'Can record audio at any time',
  ACCESS_BACKGROUND_LOCATION: 'Can track your location even when app is closed',
  REQUEST_INSTALL_PACKAGES: 'Can silently install additional apps on your device',
  SYSTEM_ALERT_WINDOW: 'Can draw overlays over other apps including your banking apps',
  BIND_DEVICE_ADMIN: 'Can prevent its own uninstall and factory reset the device',
  GET_ACCOUNTS: 'Can enumerate all accounts (Google, bank, etc.) on this device',
};

// Permissions that are always critical when excess
const CRITICAL_EXCESS = new Set([
  'BIND_ACCESSIBILITY_SERVICE',
  'BIND_DEVICE_ADMIN',
  'REQUEST_INSTALL_PACKAGES',
]);

// Permissions that are warning-level when excess
const WARNING_EXCESS = new Set([
  'READ_SMS',
  'PROCESS_OUTGOING_CALLS',
  'READ_CALL_LOG',
  'SYSTEM_ALERT_WINDOW',
]);

// ---------------------------------------------------------------------------
// Category detection heuristic
// ---------------------------------------------------------------------------

/**
 * Infer an app's purpose category from its package name and display name.
 * Uses simple substring matching — imperfect but fast and offline.
 */
export function detectCategory(packageName: string, appName: string): AppCategory {
  const combined = `${packageName} ${appName}`.toLowerCase();

  if (/whatsapp|telegram|signal|viber|skype/.test(combined)) return 'messaging';
  if (/chrome|firefox|opera|brave|browser/.test(combined)) return 'browser';
  if (/camera|photo|gallery|snapseed|lightroom/.test(combined)) return 'camera';
  if (/maps|uber|ola|rapido|zomato|swiggy/.test(combined)) return 'maps';
  if (/paytm|phonpe|gpay|googlepay|icici|hdfc|sbi|axis|kotak|neft/.test(combined)) return 'banking';
  if (/fitness|health|steps|strava|cult|cure/.test(combined)) return 'fitness';
  if (/instagram|facebook|twitter|snapchat|koo|sharechat|moj/.test(combined)) return 'social';
  if (/game|gaming|pubg|bgmi|freefire|cricket|chess|candy/.test(combined)) return 'games';
  if (/flipkart|amazon|meesho|myntra|nykaa|shop/.test(combined)) return 'ecommerce';
  if (/netflix|youtube|hotstar|jiocinema|sonyliv|voot/.test(combined)) return 'streaming';
  if (/clean|booster|optimizer|battery|ram|speed|antivirus|cleaner/.test(combined))
    return 'system_tool';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Severity classifier for a single excess permission
// ---------------------------------------------------------------------------

function excessSeverity(permission: string): 'info' | 'warning' | 'critical' {
  if (CRITICAL_EXCESS.has(permission)) return 'critical';
  if (WARNING_EXCESS.has(permission)) return 'warning';
  return 'info';
}

// ---------------------------------------------------------------------------
// Main exported validator
// ---------------------------------------------------------------------------

/**
 * Validate whether an app's granted permissions exceed its stated purpose.
 *
 * @param app - App permissions record from the native PackageManager bridge
 * @returns A ConsentValidation describing legitimate vs excess scope
 */
export function validateConsent(app: AppPermissions): ConsentValidation {
  const category = detectCategory(app.packageName, app.appName);
  const expectedSet = new Set(APP_PURPOSE_PERMISSIONS[category]);

  const legitimatePermissions: string[] = [];
  const excessPermissions: ExcessPermission[] = [];

  for (const perm of app.permissions) {
    if (expectedSet.has(perm)) {
      legitimatePermissions.push(perm);
    } else {
      const reason =
        EXCESS_EXPLANATIONS[perm] ?? `This permission is not expected for a ${category} app`;
      excessPermissions.push({
        permission: perm,
        reason,
        severity: excessSeverity(perm),
      });
    }
  }

  // Score: start at 100, deduct per excess permission severity
  let consentScore = 100;
  for (const ep of excessPermissions) {
    if (ep.severity === 'critical') consentScore -= 30;
    else if (ep.severity === 'warning') consentScore -= 15;
    else consentScore -= 5;
  }
  consentScore = Math.max(0, consentScore);

  // Build human-readable summary
  const appLabel = app.appName;
  const categoryLabel = category.replace('_', ' ');
  let summary: string;

  if (excessPermissions.length === 0) {
    summary =
      `${appLabel} uses ${legitimatePermissions.length} permission${legitimatePermissions.length !== 1 ? 's' : ''} ` +
      `as expected for a ${categoryLabel} app. No excess scope detected.`;
  } else {
    summary =
      `This ${categoryLabel} app claims ${excessPermissions.length} permission${excessPermissions.length !== 1 ? 's' : ''} ` +
      `beyond its purpose. Consider reviewing.`;
  }

  return {
    packageName: app.packageName,
    appName: app.appName,
    detectedCategory: category,
    grantedPermissions: [...app.permissions],
    expectedPermissions: APP_PURPOSE_PERMISSIONS[category],
    excessPermissions,
    legitimatePermissions,
    consentScore,
    summary,
  };
}
