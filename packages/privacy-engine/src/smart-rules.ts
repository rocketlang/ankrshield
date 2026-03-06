/**
 * SmartRules — Tier-aware policy generation
 *
 * Converts an app's trust tier into a concrete set of PolicyEngine rules.
 * This replaces the binary "VPN on/off" toggle with proportionate protection:
 *
 *   SYSTEM    → allow everything, log silently
 *   TRUSTED   → allow first-party + known CDN; block only CRITICAL trackers
 *   STANDARD  → block HIGH+ trackers; notify on MEDIUM (no popup, just badge)
 *   WATCHLIST → block MEDIUM+ trackers; persistent amber notification
 *   BLOCKED   → deny all outbound network; CRITICAL alert to user
 *
 * Rules are fed directly into @ankrshield/policy-engine's PolicyEngine.
 */

// Use a minimal local type mirror so this package doesn't depend on policy-engine
// (policy-engine can import privacy-engine but not vice versa to avoid circular deps)
export type SmartPolicyAction = 'allow' | 'block' | 'notify' | 'prompt';

export interface SmartPolicy {
  id: string;
  name: string;
  isEnabled: boolean;
  priority: number;
  conditions: {
    domains?: string[];
    categories?: string[];
  };
  action: SmartPolicyAction;
  notifyUser: boolean;
  logEvent: boolean;
}

import type { AppTrustTier } from './app-trust-engine';

// ─── Tracker categories considered HIGH risk ──────────────────────────────────

const HIGH_RISK_CATEGORIES = ['fingerprinting', 'cryptomining', 'malware', 'phishing'];
const MEDIUM_RISK_CATEGORIES = [
  'advertising',
  'fingerprinting',
  'cryptomining',
  'malware',
  'phishing',
];

// ─── Known benign CDN / performance domains (always allow) ───────────────────
// These serve fonts, images, scripts for legitimate apps — blocking them breaks UI

const ALWAYS_ALLOW_DOMAINS = [
  '*.cloudflare.com',
  '*.cloudfront.net',
  '*.fastly.net',
  '*.akamaiedge.net',
  '*.akamaized.net',
  '*.gstatic.com', // Google fonts, static assets
  '*.googleapis.com', // Google APIs — apps depend on these
  '*.firebase.google.com',
  '*.crashlytics.com', // Crash reporting (benign)
  '*.sentry.io', // Error monitoring (benign)
  '*.cdn77.com',
  '*.jsdelivr.net',
  '*.unpkg.com',
];

// ─── Known CRITICAL threat domains (always block regardless of tier) ──────────

const ALWAYS_BLOCK_DOMAINS = [
  '*.doubleclick.net', // Google fingerprinting network
  '*.fingerprint.com',
  '*.fingerprintjs.com',
  '*.coinhive.com', // Cryptomining
  '*.cryptoloot.com',
];

// ─── Policy generator ─────────────────────────────────────────────────────────

export function generatePoliciesForApp(
  packageName: string,
  tier: AppTrustTier,
  firstPartyDomains: string[] = []
): SmartPolicy[] {
  const policies: SmartPolicy[] = [];
  const base = `ankrshield.${packageName.replace(/\./g, '_')}`;

  // Rule 0 — Always allow first-party domains for this app (highest priority)
  if (firstPartyDomains.length > 0) {
    policies.push({
      id: `${base}.firstparty`,
      name: `${packageName} — first-party traffic`,
      isEnabled: true,
      priority: 1000,
      conditions: { domains: firstPartyDomains },
      action: 'allow',
      notifyUser: false,
      logEvent: false,
    });
  }

  // Rule 1 — Always allow benign CDN regardless of tier
  policies.push({
    id: `${base}.cdn_allow`,
    name: `${packageName} — CDN allow`,
    isEnabled: true,
    priority: 900,
    conditions: { domains: ALWAYS_ALLOW_DOMAINS },
    action: 'allow',
    notifyUser: false,
    logEvent: false,
  });

  // Rule 2 — Always block known critical threat domains regardless of tier
  // Exception: SYSTEM apps (we never break system processes)
  if (tier !== 'SYSTEM') {
    policies.push({
      id: `${base}.critical_block`,
      name: `${packageName} — critical threat domains`,
      isEnabled: true,
      priority: 850,
      conditions: { domains: ALWAYS_BLOCK_DOMAINS },
      action: 'block',
      notifyUser: tier !== 'TRUSTED', // TRUSTED apps get silent block
      logEvent: true,
    });
  }

  // ── Tier-specific rules ────────────────────────────────────────────────────

  switch (tier) {
    case 'SYSTEM':
      // System apps: allow everything, log nothing. Never interfere.
      policies.push({
        id: `${base}.system_allow`,
        name: `${packageName} — system allow all`,
        isEnabled: true,
        priority: 800,
        conditions: {}, // wildcard — matches everything
        action: 'allow',
        notifyUser: false,
        logEvent: false,
      });
      break;

    case 'TRUSTED':
      // Trusted apps: block only fingerprinting/malware/phishing (truly dangerous).
      // Analytics, advertising — silently logged but not blocked.
      policies.push({
        id: `${base}.trusted_block_critical`,
        name: `${packageName} — block critical trackers`,
        isEnabled: true,
        priority: 700,
        conditions: { categories: HIGH_RISK_CATEGORIES },
        action: 'block',
        notifyUser: false, // silent block — don't alarm the user
        logEvent: true,
      });
      // Allow everything else (analytics etc.) — show in weekly digest only
      policies.push({
        id: `${base}.trusted_allow_rest`,
        name: `${packageName} — allow standard trackers`,
        isEnabled: true,
        priority: 600,
        conditions: {},
        action: 'allow',
        notifyUser: false,
        logEvent: true,
      });
      break;

    case 'STANDARD':
      // Standard apps: block HIGH+ (fingerprinting, malware, crypto).
      // Notify (amber badge) on MEDIUM (advertising).
      // Allow analytics/CDN.
      policies.push({
        id: `${base}.standard_block_high`,
        name: `${packageName} — block high-risk trackers`,
        isEnabled: true,
        priority: 700,
        conditions: { categories: HIGH_RISK_CATEGORIES },
        action: 'block',
        notifyUser: true,
        logEvent: true,
      });
      policies.push({
        id: `${base}.standard_notify_medium`,
        name: `${packageName} — flag advertising`,
        isEnabled: true,
        priority: 650,
        conditions: { categories: ['advertising'] },
        action: 'notify', // don't block — just badge
        notifyUser: true,
        logEvent: true,
      });
      policies.push({
        id: `${base}.standard_allow_rest`,
        name: `${packageName} — allow analytics/CDN`,
        isEnabled: true,
        priority: 600,
        conditions: {},
        action: 'allow',
        notifyUser: false,
        logEvent: true,
      });
      break;

    case 'WATCHLIST':
      // Watchlist apps: block MEDIUM+ (advertising + all higher risk).
      // Persistent amber notification.
      policies.push({
        id: `${base}.watchlist_block_medium`,
        name: `${packageName} — block medium+ trackers`,
        isEnabled: true,
        priority: 700,
        conditions: { categories: MEDIUM_RISK_CATEGORIES },
        action: 'block',
        notifyUser: true,
        logEvent: true,
      });
      // Allow telemetry/analytics/CDN — crash reporting is legitimate
      policies.push({
        id: `${base}.watchlist_allow_telemetry`,
        name: `${packageName} — allow telemetry`,
        isEnabled: true,
        priority: 600,
        conditions: { categories: ['analytics', 'telemetry', 'cdn', 'other'] },
        action: 'allow',
        notifyUser: false,
        logEvent: true,
      });
      // Block anything unknown (not explicitly allowed)
      policies.push({
        id: `${base}.watchlist_block_unknown`,
        name: `${packageName} — block unknown`,
        isEnabled: true,
        priority: 500,
        conditions: {},
        action: 'block',
        notifyUser: true,
        logEvent: true,
      });
      break;

    case 'BLOCKED':
      // Blocked apps: deny everything. User made this decision explicitly.
      // (Or AnkrShield auto-promoted after confirmed stalkerware detection.)
      policies.push({
        id: `${base}.blocked_deny_all`,
        name: `${packageName} — BLOCKED: all network denied`,
        isEnabled: true,
        priority: 800,
        conditions: {},
        action: 'block',
        notifyUser: true,
        logEvent: true,
      });
      break;
  }

  return policies;
}

// ─── Flatten all rules for a list of apps ────────────────────────────────────
// Use this result with PolicyEngine.addPolicy() in the app layer:
//   const rules = flattenSmartRules(apps);
//   for (const rule of rules) policyEngine.addPolicy(rule);

export function flattenSmartRules(
  apps: Array<{ packageName: string; tier: AppTrustTier; firstPartyDomains?: string[] }>
): SmartPolicy[] {
  return apps.flatMap((app) =>
    generatePoliciesForApp(app.packageName, app.tier, app.firstPartyDomains ?? [])
  );
}

// ─── Protection Mode — user-level override ───────────────────────────────────
//
// Strict  → upgrade all TRUSTED rules to STANDARD behaviour
// Smart   → default tier-based behaviour (recommended)
// Monitor → downgrade all rules to 'notify' only (never block)

export type ProtectionMode = 'strict' | 'smart' | 'monitor';

export function applyProtectionMode(policies: SmartPolicy[], mode: ProtectionMode): SmartPolicy[] {
  if (mode === 'smart') return policies;

  return policies.map((p) => {
    if (mode === 'monitor') {
      // Never block — convert all block/notify to allow or notify
      return {
        ...p,
        action: p.action === 'block' ? ('notify' as SmartPolicyAction) : p.action,
        notifyUser: p.action === 'block' ? true : p.notifyUser,
      };
    }
    if (mode === 'strict') {
      // Upgrade: convert all 'allow' for non-first-party rules to 'notify',
      // and convert 'notify' to 'block'
      if (p.id.endsWith('.trusted_allow_rest') || p.id.endsWith('.standard_allow_rest')) {
        return { ...p, action: 'notify' as SmartPolicyAction, notifyUser: true };
      }
      if (p.action === 'notify') {
        return { ...p, action: 'block' as SmartPolicyAction };
      }
    }
    return p;
  });
}
