/**
 * AnkrShield White-Label Brand Configuration
 *
 * This file is the single source of truth for brand identity across the app.
 * Telecom / BFSI OEM partners override this file via scripts/build-whitelabel.sh
 * which injects partner values before the Gradle/Metro build.
 *
 * Convention: all strings are English; the i18n layer translates UI copy.
 */

export interface BrandConfig {
  /** Display name shown in app header and splash screen */
  appName: string;
  /** Short tagline (≤ 60 chars) shown on home screen */
  tagline: string;
  /** Android package ID (must match build.gradle applicationId) */
  packageId: string;
  /** Primary accent colour (hex) */
  primaryColor: string;
  /** Secondary / card colour (hex) */
  secondaryColor: string;
  /** API base URL — all REST calls go here */
  apiBaseUrl: string;
  /** GraphQL endpoint */
  graphqlUrl: string;
  /** Support email shown in Settings → Help */
  supportEmail: string;
  /** Support phone (optional) */
  supportPhone?: string;
  /** Privacy policy URL */
  privacyUrl: string;
  /** Terms of service URL */
  tosUrl: string;
  /** Show/hide individual feature tiles on HomeScreen */
  features: {
    upiGuard: boolean;
    smsShield: boolean;
    callGuard: boolean;
    whatsAppGuard: boolean;
    safeBrowse: boolean;
    dpdpScanner: boolean;
    linkScanner: boolean;
    avScanner: boolean;
    antiTheft: boolean;
    ransomwareWatcher: boolean;
    stalkerwareDetector: boolean;
    appScanner: boolean;
    permissionWatcher: boolean;
    deviceHealth: boolean;
    dnsVpn: boolean;
    mdm: boolean;
  };
  /** Partner logo asset path (relative to assets/) — null = use default shield icon */
  logoAsset: string | null;
  /** Splash background colour (hex) — applied to SplashScreen.backgroundColor */
  splashColor: string;
  /** Hide Powered-by-AnkrShield footer when true (requires written agreement) */
  hidePoweredBy: boolean;
}

// ─── Default (AnkrShield vanilla) brand ──────────────────────────────────────

const DEFAULT_BRAND: BrandConfig = {
  appName: 'AnkrShield',
  tagline: "India's Privacy OS — Real Protection, Not Theatre",
  packageId: 'com.ankr.shield',
  primaryColor: '#00C2A8',
  secondaryColor: '#1E293B',
  apiBaseUrl: 'https://xshieldai.com/api',
  graphqlUrl: 'https://xshieldai.com/api/graphql',
  supportEmail: 'support@ankr.in',
  supportPhone: '+91-124-XXXX',
  privacyUrl: 'https://xshieldai.com/privacy',
  tosUrl: 'https://xshieldai.com/terms',
  features: {
    upiGuard: true,
    smsShield: true,
    callGuard: true,
    whatsAppGuard: true,
    safeBrowse: true,
    dpdpScanner: true,
    linkScanner: true,
    avScanner: true,
    antiTheft: true,
    ransomwareWatcher: true,
    stalkerwareDetector: true,
    appScanner: true,
    permissionWatcher: true,
    deviceHealth: true,
    dnsVpn: true,
    mdm: false, // MDM off by default in consumer build
  },
  logoAsset: null,
  splashColor: '#0F172A',
  hidePoweredBy: false,
};

// ─── Partner overrides ────────────────────────────────────────────────────────
// build-whitelabel.sh injects BRAND_PARTNER env before Metro bundling.
// Each partner entry is a deep-partial override merged onto DEFAULT_BRAND.

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const PARTNER_OVERRIDES: Record<string, DeepPartial<BrandConfig>> = {
  // ── BSNL SecureConnect ──────────────────────────────────────────────────
  bsnl: {
    appName: 'BSNL SecureConnect',
    tagline: 'BSNL — Trusted Network, Trusted Device',
    packageId: 'in.bsnl.secureconnect',
    primaryColor: '#FF6600',
    secondaryColor: '#003366',
    apiBaseUrl: 'https://secureconnect.bsnl.in/api',
    graphqlUrl: 'https://secureconnect.bsnl.in/api/graphql',
    supportEmail: 'support@bsnl.in',
    supportPhone: '1800-180-1234',
    privacyUrl: 'https://bsnl.in/privacy',
    tosUrl: 'https://bsnl.in/terms',
    logoAsset: 'bsnl-logo.png',
    splashColor: '#003366',
    hidePoweredBy: false,
    features: { mdm: true, antiTheft: false }, // BSNL: MDM on, AntiTheft off
  },

  // ── Airtel SafeNet ──────────────────────────────────────────────────────
  airtel: {
    appName: 'Airtel SafeNet',
    tagline: 'Protected by Airtel — Always On, Always Safe',
    packageId: 'com.airtel.safenet',
    primaryColor: '#E40000',
    secondaryColor: '#1A1A1A',
    apiBaseUrl: 'https://safenet.airtel.in/api',
    graphqlUrl: 'https://safenet.airtel.in/api/graphql',
    supportEmail: 'safenet@airtel.com',
    supportPhone: '98-AIRTEL',
    privacyUrl: 'https://airtel.in/privacy',
    tosUrl: 'https://airtel.in/terms',
    logoAsset: 'airtel-logo.png',
    splashColor: '#E40000',
    hidePoweredBy: false,
    features: { mdm: true, dpdpScanner: true },
  },

  // ── SBI Shield (BFSI pilot) ─────────────────────────────────────────────
  sbi: {
    appName: 'SBI Shield',
    tagline: 'SBI — Securing Every Transaction',
    packageId: 'in.sbi.shield',
    primaryColor: '#1A3D7C',
    secondaryColor: '#F4A31A',
    apiBaseUrl: 'https://shield.sbi.co.in/api',
    graphqlUrl: 'https://shield.sbi.co.in/api/graphql',
    supportEmail: 'shield@sbi.co.in',
    supportPhone: '1800-11-2211',
    privacyUrl: 'https://sbi.co.in/shield-privacy',
    tosUrl: 'https://sbi.co.in/shield-terms',
    logoAsset: 'sbi-logo.png',
    splashColor: '#1A3D7C',
    hidePoweredBy: true,
    features: {
      upiGuard: true,
      smsShield: true,
      callGuard: true,
      whatsAppGuard: false, // SBI: WA guard off (policy)
      safeBrowse: true,
      dpdpScanner: true,
      linkScanner: true,
      avScanner: true,
      antiTheft: false, // No remote wipe for banking app
      ransomwareWatcher: false,
      stalkerwareDetector: false,
      appScanner: true,
      permissionWatcher: true,
      deviceHealth: true,
      dnsVpn: true,
      mdm: true,
    },
  },
};

// ─── Active brand resolution ──────────────────────────────────────────────────

function resolveBrand(): BrandConfig {
  const partner = (typeof process !== 'undefined' && process.env?.BRAND_PARTNER) || '';

  if (!partner || !(partner in PARTNER_OVERRIDES)) {
    return DEFAULT_BRAND;
  }

  const override = PARTNER_OVERRIDES[partner];
  return {
    ...DEFAULT_BRAND,
    ...override,
    features: {
      ...DEFAULT_BRAND.features,
      ...(override.features ?? {}),
    },
  } as BrandConfig;
}

export const BRAND: BrandConfig = resolveBrand();

// Re-export convenience constants used across the codebase
export const APP_NAME = BRAND.appName;
export const API_BASE = BRAND.apiBaseUrl;
export const GRAPHQL_URL = BRAND.graphqlUrl;
export const PRIMARY_COLOR = BRAND.primaryColor;
