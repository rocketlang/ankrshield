/**
 * AppTrustEngine — Smart Discretion System
 *
 * Classifies every installed app into a trust tier so AnkrShield can apply
 * proportionate protection — showing consented tracking quietly and only
 * hard-blocking apps that act far outside normal behaviour.
 *
 * Tiers (lowest → highest concern):
 *   SYSTEM    — Android OS, Google Play Services, OEM system apps
 *               → monitor silently, never block
 *   TRUSTED   — Browsers, Gmail, WhatsApp, user-explicitly-approved apps
 *               → block only CRITICAL threats, show weekly digest only
 *   STANDARD  — Mainstream apps (Spotify, Instagram, Swiggy, etc.)
 *               → block HIGH+, notify on MEDIUM
 *   WATCHLIST — Apps showing elevated tracking beyond normal range
 *               → block MEDIUM+, amber badge, user prompted to review
 *   BLOCKED   — Confirmed stalkerware, C2, SMS harvesters, data exfil
 *               → cut all network access, CRITICAL alert
 */

// ─── Storage interface (injected by consumer — e.g. MdmStorage in the app) ───

export interface TrustStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

// No-op fallback (in-memory, single session)
const _mem = new Map<string, string>();
const noopStorage: TrustStorage = {
  async getItem(key) {
    return _mem.get(key) ?? null;
  },
  async setItem(key, value) {
    _mem.set(key, value);
  },
};

// ─── Tier Enum ────────────────────────────────────────────────────────────────

export type AppTrustTier = 'SYSTEM' | 'TRUSTED' | 'STANDARD' | 'WATCHLIST' | 'BLOCKED';

export const TIER_RANK: Record<AppTrustTier, number> = {
  SYSTEM: 0,
  TRUSTED: 1,
  STANDARD: 2,
  WATCHLIST: 3,
  BLOCKED: 4,
};

export const TIER_LABEL: Record<AppTrustTier, string> = {
  SYSTEM: 'System',
  TRUSTED: 'Trusted',
  STANDARD: 'Standard',
  WATCHLIST: 'Being Watched',
  BLOCKED: 'Blocked',
};

export const TIER_COLOR: Record<AppTrustTier, string> = {
  SYSTEM: '#9E9E9E', // grey
  TRUSTED: '#4CAF50', // green
  STANDARD: '#2196F3', // blue
  WATCHLIST: '#FF9800', // amber
  BLOCKED: '#F44336', // red
};

// ─── App trust record ─────────────────────────────────────────────────────────

export interface AppTrustRecord {
  packageName: string;
  displayName: string;
  autoTier: AppTrustTier; // system-assigned
  userTier?: AppTrustTier; // user override (undefined = no override)
  effectiveTier: AppTrustTier; // userTier ?? autoTier
  firstPartyDomains: string[]; // domains this app legitimately owns
  isSystemApp: boolean;
}

// ─── Known App Database ───────────────────────────────────────────────────────
//
// packageName prefix → { tier, displayName, firstPartyDomains }
//
// Rules: longest prefix wins. "com.google.android.gms" beats "com.google".

interface KnownAppEntry {
  tier: AppTrustTier;
  name: string;
  firstParty: string[];
}

const KNOWN_APPS: Record<string, KnownAppEntry> = {
  // ── Android OS & Google System ──────────────────────────────────────────
  'com.android': {
    tier: 'SYSTEM',
    name: 'Android System',
    firstParty: ['android.com', 'googleapis.com'],
  },
  'com.google.android.gms': {
    tier: 'SYSTEM',
    name: 'Google Play Services',
    firstParty: ['googleapis.com', 'google.com'],
  },
  'com.google.android.gsf': {
    tier: 'SYSTEM',
    name: 'Google Services',
    firstParty: ['googleapis.com'],
  },
  android: { tier: 'SYSTEM', name: 'Android OS', firstParty: [] },

  // ── Samsung OEM ─────────────────────────────────────────────────────────
  'com.samsung.android': { tier: 'SYSTEM', name: 'Samsung System', firstParty: ['samsung.com'] },
  'com.sec.android': { tier: 'SYSTEM', name: 'Samsung System', firstParty: ['samsung.com'] },

  // ── Other OEM system ────────────────────────────────────────────────────
  'com.oneplus': { tier: 'SYSTEM', name: 'OnePlus System', firstParty: ['oneplus.com'] },
  'com.miui': { tier: 'SYSTEM', name: 'MIUI System', firstParty: ['miui.com', 'mi.com'] },
  'com.coloros': { tier: 'SYSTEM', name: 'ColorOS System', firstParty: ['oppo.com'] },
  'com.realme': { tier: 'SYSTEM', name: 'Realme System', firstParty: ['realme.com'] },
  'com.vivo': { tier: 'SYSTEM', name: 'Vivo System', firstParty: ['vivo.com'] },

  // ── Trusted: Browsers ───────────────────────────────────────────────────
  'com.android.chrome': {
    tier: 'TRUSTED',
    name: 'Chrome',
    firstParty: ['google.com', 'googleapis.com', 'gstatic.com'],
  },
  'org.chromium.chrome': { tier: 'TRUSTED', name: 'Chromium', firstParty: [] },
  'com.google.android.apps.chrome': { tier: 'TRUSTED', name: 'Chrome', firstParty: ['google.com'] },
  'org.mozilla.firefox': {
    tier: 'TRUSTED',
    name: 'Firefox',
    firstParty: ['mozilla.org', 'firefox.com'],
  },
  'org.mozilla.focus': { tier: 'TRUSTED', name: 'Firefox Focus', firstParty: ['mozilla.org'] },
  'com.brave.browser': { tier: 'TRUSTED', name: 'Brave Browser', firstParty: ['brave.com'] },
  'com.microsoft.emmx': {
    tier: 'TRUSTED',
    name: 'Microsoft Edge',
    firstParty: ['microsoft.com', 'bing.com'],
  },
  'com.opera.browser': { tier: 'TRUSTED', name: 'Opera', firstParty: ['opera.com'] },
  'com.samsung.android.app.sbrowser': {
    tier: 'TRUSTED',
    name: 'Samsung Browser',
    firstParty: ['samsung.com'],
  },
  'com.duckduckgo.mobile.android': {
    tier: 'TRUSTED',
    name: 'DuckDuckGo',
    firstParty: ['duckduckgo.com'],
  },

  // ── Trusted: Google Apps ─────────────────────────────────────────────────
  'com.google.android.youtube': {
    tier: 'TRUSTED',
    name: 'YouTube',
    firstParty: ['youtube.com', 'googlevideo.com', 'ytimg.com'],
  },
  'com.google.android.gm': {
    tier: 'TRUSTED',
    name: 'Gmail',
    firstParty: ['gmail.com', 'google.com', 'googleapis.com'],
  },
  'com.google.android.apps.maps': {
    tier: 'TRUSTED',
    name: 'Google Maps',
    firstParty: ['google.com', 'googleapis.com', 'gstatic.com'],
  },
  'com.google.android.apps.photos': {
    tier: 'TRUSTED',
    name: 'Google Photos',
    firstParty: ['google.com', 'googleapis.com'],
  },
  'com.google.android.apps.docs': {
    tier: 'TRUSTED',
    name: 'Google Docs',
    firstParty: ['google.com', 'googleapis.com'],
  },
  'com.google.android.apps.drive': {
    tier: 'TRUSTED',
    name: 'Google Drive',
    firstParty: ['google.com', 'googleapis.com'],
  },
  'com.google.android.apps.youtube': {
    tier: 'TRUSTED',
    name: 'YouTube Music',
    firstParty: ['youtube.com', 'googleapis.com'],
  },
  'com.google.android': {
    tier: 'TRUSTED',
    name: 'Google App',
    firstParty: ['google.com', 'googleapis.com', 'gstatic.com'],
  },

  // ── Trusted: Messaging ───────────────────────────────────────────────────
  'com.whatsapp': {
    tier: 'TRUSTED',
    name: 'WhatsApp',
    firstParty: ['whatsapp.com', 'whatsapp.net', 'fbcdn.net'],
  },
  'com.whatsapp.w4b': {
    tier: 'TRUSTED',
    name: 'WhatsApp Business',
    firstParty: ['whatsapp.com', 'whatsapp.net'],
  },
  'org.telegram.messenger': {
    tier: 'TRUSTED',
    name: 'Telegram',
    firstParty: ['telegram.org', 't.me'],
  },
  'com.google.android.apps.messaging': {
    tier: 'TRUSTED',
    name: 'Google Messages',
    firstParty: ['google.com', 'googleapis.com'],
  },
  'com.microsoft.teams': {
    tier: 'TRUSTED',
    name: 'Microsoft Teams',
    firstParty: ['microsoft.com', 'microsoftonline.com', 'office.com'],
  },
  'us.zoom.videomeetings': {
    tier: 'TRUSTED',
    name: 'Zoom',
    firstParty: ['zoom.us', 'zoomgov.com'],
  },

  // ── Trusted: Banking & Payments (India) ──────────────────────────────────
  'com.phonepe.app': { tier: 'TRUSTED', name: 'PhonePe', firstParty: ['phonepe.com'] },
  'net.one97.paytm': { tier: 'TRUSTED', name: 'Paytm', firstParty: ['paytm.com', 'paytmbank.com'] },
  'com.google.android.apps.nbu.paisa.user': {
    tier: 'TRUSTED',
    name: 'Google Pay',
    firstParty: ['google.com', 'gpay.app'],
  },
  'in.amazon.mShop.android.shopping': {
    tier: 'TRUSTED',
    name: 'Amazon',
    firstParty: ['amazon.in', 'amazon.com', 'amazonaws.com'],
  },
  'com.amazon.mShop.android.shopping': {
    tier: 'TRUSTED',
    name: 'Amazon',
    firstParty: ['amazon.in', 'amazon.com', 'amazonaws.com'],
  },

  // ── Standard: Social Media ───────────────────────────────────────────────
  'com.instagram.android': {
    tier: 'STANDARD',
    name: 'Instagram',
    firstParty: ['instagram.com', 'cdninstagram.com', 'fbcdn.net'],
  },
  'com.facebook.katana': {
    tier: 'STANDARD',
    name: 'Facebook',
    firstParty: ['facebook.com', 'fbcdn.net', 'fb.com'],
  },
  'com.twitter.android': {
    tier: 'STANDARD',
    name: 'Twitter/X',
    firstParty: ['twitter.com', 'twimg.com', 'x.com', 't.co'],
  },
  'com.linkedin.android': {
    tier: 'STANDARD',
    name: 'LinkedIn',
    firstParty: ['linkedin.com', 'licdn.com'],
  },
  'com.snapchat.android': {
    tier: 'STANDARD',
    name: 'Snapchat',
    firstParty: ['snapchat.com', 'snap.com'],
  },
  'com.zhiliaoapp.musically': {
    tier: 'STANDARD',
    name: 'TikTok',
    firstParty: ['tiktok.com', 'tiktokcdn.com'],
  },
  'com.ss.android.ugc.trill': { tier: 'STANDARD', name: 'TikTok', firstParty: ['tiktok.com'] },
  'com.pinterest': {
    tier: 'STANDARD',
    name: 'Pinterest',
    firstParty: ['pinterest.com', 'pinimg.com'],
  },
  'com.reddit.frontpage': {
    tier: 'STANDARD',
    name: 'Reddit',
    firstParty: ['reddit.com', 'redd.it', 'redditmedia.com'],
  },

  // ── Standard: Entertainment ──────────────────────────────────────────────
  'com.spotify.music': {
    tier: 'STANDARD',
    name: 'Spotify',
    firstParty: ['spotify.com', 'spotifycdn.com', 'scdn.co'],
  },
  'com.netflix.mediaclient': {
    tier: 'STANDARD',
    name: 'Netflix',
    firstParty: ['netflix.com', 'nflxvideo.net', 'nflximg.net'],
  },
  'com.hotstar': { tier: 'STANDARD', name: 'Hotstar', firstParty: ['hotstar.com', 'starplus.com'] },
  'com.jio.media': { tier: 'STANDARD', name: 'JioTV', firstParty: ['jio.com', 'jiotv.com'] },
  'com.primevideo': {
    tier: 'STANDARD',
    name: 'Prime Video',
    firstParty: ['amazon.com', 'amazonaws.com', 'primevideo.com'],
  },
  'com.mxtech.videoplayer.ad': { tier: 'STANDARD', name: 'MX Player', firstParty: ['mxplayer.in'] },

  // ── Standard: Food & Delivery (India) ────────────────────────────────────
  'com.application.zomato': { tier: 'STANDARD', name: 'Zomato', firstParty: ['zomato.com'] },
  'in.swiggy.android': {
    tier: 'STANDARD',
    name: 'Swiggy',
    firstParty: ['swiggy.com', 'swiggycdn.com'],
  },
  'com.blinkit.consumer': {
    tier: 'STANDARD',
    name: 'Blinkit',
    firstParty: ['blinkit.com', 'grofers.com'],
  },
  'com.bigbasket.app': { tier: 'STANDARD', name: 'BigBasket', firstParty: ['bigbasket.com'] },

  // ── Standard: Ride & Maps ─────────────────────────────────────────────────
  'com.olacabs.customer': { tier: 'STANDARD', name: 'Ola', firstParty: ['olacabs.com', 'ola.com'] },
  'com.ubercab': { tier: 'STANDARD', name: 'Uber', firstParty: ['uber.com', 'ubercdn.com'] },
  'com.rapido.passenger': { tier: 'STANDARD', name: 'Rapido', firstParty: ['rapido.bike'] },

  // ── Standard: Shopping ───────────────────────────────────────────────────
  'com.flipkart.android': {
    tier: 'STANDARD',
    name: 'Flipkart',
    firstParty: ['flipkart.com', 'fkcdn.com', 'flixcart.com'],
  },
  'com.meesho.supply': {
    tier: 'STANDARD',
    name: 'Meesho',
    firstParty: ['meesho.com', 'meesho.io'],
  },
  'com.myntra.android': { tier: 'STANDARD', name: 'Myntra', firstParty: ['myntra.com'] },
  'com.ajio.shopping': { tier: 'STANDARD', name: 'AJIO', firstParty: ['ajio.com'] },

  // ── Standard: Productivity ───────────────────────────────────────────────
  'com.microsoft.office': {
    tier: 'STANDARD',
    name: 'Microsoft Office',
    firstParty: ['microsoft.com', 'office.com', 'microsoftonline.com'],
  },
  'com.adobe.reader': {
    tier: 'STANDARD',
    name: 'Adobe Acrobat',
    firstParty: ['adobe.com', 'adobecc.com', 'typekit.com'],
  },
  'com.dropbox.android': {
    tier: 'STANDARD',
    name: 'Dropbox',
    firstParty: ['dropbox.com', 'dropboxstatic.com'],
  },
};

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@ankrshield/app-trust-tiers';

// ─── AppTrustEngine ───────────────────────────────────────────────────────────

export class AppTrustEngine {
  private userOverrides: Map<string, AppTrustTier> = new Map();
  private loaded = false;
  private storage: TrustStorage;

  constructor(storage: TrustStorage = noopStorage) {
    this.storage = storage;
  }

  // ── Initialise — load persisted overrides ──────────────────────────────────

  async init(): Promise<void> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, AppTrustTier>;
        this.userOverrides = new Map(Object.entries(saved));
      }
    } catch {
      // Storage unavailable — start with empty overrides
    }
    this.loaded = true;
  }

  // ── Auto-classify a package ───────────────────────────────────────────────

  classifyApp(packageName: string): AppTrustRecord {
    const entry = this._lookupKnown(packageName);

    const autoTier = entry?.tier ?? this._heuristicTier(packageName);
    const userTier = this.userOverrides.get(packageName);
    const effectiveTier = userTier ?? autoTier;

    return {
      packageName,
      displayName: entry?.name ?? this._humanName(packageName),
      autoTier,
      userTier,
      effectiveTier,
      firstPartyDomains: entry?.firstParty ?? [],
      isSystemApp: autoTier === 'SYSTEM',
    };
  }

  // ── Get / set user tier override ──────────────────────────────────────────

  async setUserTier(packageName: string, tier: AppTrustTier): Promise<void> {
    this.userOverrides.set(packageName, tier);
    await this._persist();
  }

  async clearUserTier(packageName: string): Promise<void> {
    this.userOverrides.delete(packageName);
    await this._persist();
  }

  getEffectiveTier(packageName: string): AppTrustTier {
    return this.userOverrides.get(packageName) ?? this._heuristicTier(packageName);
  }

  // ── Classify a list of installed apps ────────────────────────────────────

  classifyAll(packageNames: string[]): AppTrustRecord[] {
    return packageNames.map((pkg) => this.classifyApp(pkg));
  }

  // ── First-party domain check ──────────────────────────────────────────────
  // Returns true when `domain` is owned by `packageName` (so tracking is consented)

  isFirstParty(domain: string, packageName: string): boolean {
    const entry = this._lookupKnown(packageName);
    if (!entry) return false;
    return entry.firstParty.some((fp) => domain === fp || domain.endsWith(`.${fp}`));
  }

  // ── Private: lookup known app by longest prefix ───────────────────────────

  private _lookupKnown(packageName: string): KnownAppEntry | null {
    // Try exact match first
    if (KNOWN_APPS[packageName]) return KNOWN_APPS[packageName]!;

    // Progressively strip last segment for prefix match
    let candidate = packageName;
    while (candidate.includes('.')) {
      candidate = candidate.slice(0, candidate.lastIndexOf('.'));
      if (KNOWN_APPS[candidate]) return KNOWN_APPS[candidate]!;
    }

    return null;
  }

  // ── Private: heuristic tier for unknown apps ──────────────────────────────

  private _heuristicTier(packageName: string): AppTrustTier {
    const pkg = packageName.toLowerCase();

    // Android system patterns
    if (pkg.startsWith('com.android.') || pkg.startsWith('android.') || pkg === 'android')
      return 'SYSTEM';

    // Known Indian government / banking prefixes
    if (
      pkg.startsWith('in.gov.') ||
      pkg.startsWith('com.npci.') || // NPCI (UPI authority)
      pkg.startsWith('com.rbi.') // RBI apps
    )
      return 'TRUSTED';

    // Everything else is STANDARD until behaviour-promoted to WATCHLIST
    return 'STANDARD';
  }

  // ── Private: human-readable name from package ─────────────────────────────

  private _humanName(packageName: string): string {
    const parts = packageName.split('.');
    // Take last meaningful segment, capitalise
    const last = parts[parts.length - 1] ?? packageName;
    return last.charAt(0).toUpperCase() + last.slice(1);
  }

  // ── Private: persist overrides ────────────────────────────────────────────

  private async _persist(): Promise<void> {
    try {
      const obj: Record<string, AppTrustTier> = {};
      this.userOverrides.forEach((tier, pkg) => {
        obj[pkg] = tier;
      });
      await this.storage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Storage unavailable
    }
  }
}

// ─── Singleton factory (call from app with real storage) ─────────────────────
// Usage in mobile app:
//   import { MdmStorage } from '../mdm/storage';
//   import { createAppTrustEngine } from '@ankrshield/privacy-engine';
//   export const appTrustEngine = createAppTrustEngine(MdmStorage);

export function createAppTrustEngine(storage?: TrustStorage): AppTrustEngine {
  return new AppTrustEngine(storage);
}
