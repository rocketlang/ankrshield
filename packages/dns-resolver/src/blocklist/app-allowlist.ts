/**
 * Per-app DNS allowlist — domains that should NEVER be blocked for specific apps.
 * Even if a domain appears in the IOC blocklist, it is allowed if:
 *   1. The requesting app is in APP_DOMAIN_ALLOWLIST, AND
 *   2. The domain matches an entry in that app's allowlist
 *
 * This implements consent-aware, surgical inhibition:
 * user installed WhatsApp and granted it permissions → don't block *.whatsapp.net
 * even if that domain appears in a tracker list.
 *
 * The VPN layer passes the querying app's package name with each DNS query.
 * We check the allowlist before applying blocklist rules.
 */

export const APP_DOMAIN_ALLOWLIST: Record<string, string[]> = {
  'com.whatsapp': [
    '*.whatsapp.net',
    '*.whatsapp.com',
    '*.facebook.com',
    '*.fbcdn.net',
    '*.instagram.com',
    'graph.facebook.com',
    'facebook.net',
  ],
  'com.google.android.gms': ['*.google.com', '*.googleapis.com', '*.gstatic.com'],
  'com.android.chrome': [
    '*.google.com',
    '*.googleapis.com',
    '*.gstatic.com',
    '*.chromium.org',
    '*.googleusercontent.com',
  ],
  'com.microsoft.teams': [
    '*.microsoft.com',
    '*.microsoftonline.com',
    '*.office.com',
    '*.skype.com',
  ],
  'com.slack': ['*.slack.com', '*.slackb.com'],
  'com.spotify.music': ['*.spotify.com', '*.scdn.co', '*.spotifycdn.com'],
  'com.netflix.mediaclient': [
    '*.netflix.com',
    '*.nflxvideo.net',
    '*.nflximg.net',
    '*.nflximg.com',
    '*.nflxso.net',
    '*.nflxext.com',
  ],
  'com.google.android.youtube': ['*.youtube.com', '*.googlevideo.com', '*.ytimg.com', 'youtu.be'],
  'com.instagram.android': [
    '*.instagram.com',
    '*.cdninstagram.com',
    '*.facebook.com',
    '*.fbcdn.net',
  ],
  'com.google.android.apps.maps': ['*.google.com', '*.googleapis.com', '*.gstatic.com'],
  'com.telegram.messenger': ['*.telegram.org', 't.me', '*.telegram.me'],
  'com.twitter.android': ['*.twitter.com', '*.twimg.com', 't.co'],
  // Indian fintech apps
  'com.phonepe.app': ['*.phonepe.com', '*.phonepe.in'],
  'net.one97.paytm': ['*.paytm.com', '*.paytm.in', '*.paytmbank.com'],
  'com.paytm.android': ['*.paytm.com', '*.paytm.in'],
  'com.google.android.apps.nbu.paisa.user': ['*.gpay.app', '*.google.com', '*.googleapis.com'],
  'in.org.npci.upiapp': ['*.npci.org.in', '*.bhimupi.org.in'],
  'com.hdfc.mobilebanking': ['*.hdfcbank.com'],
  // E-commerce
  'com.amazon.mShop.android.shopping': [
    '*.amazon.in',
    '*.amazon.com',
    '*.ssl-images-amazon.com',
    '*.media-amazon.com',
  ],
  'com.flipkart.android': ['*.flipkart.com', '*.fkcdn.com', '*.flixcart.com'],
};

/**
 * Check if a domain is allowlisted for a specific app.
 * Supports wildcard matching: *.whatsapp.net matches sub.whatsapp.net
 */
export function isAllowlistedForApp(packageName: string, domain: string): boolean {
  const allowlist = APP_DOMAIN_ALLOWLIST[packageName];
  if (!allowlist) return false;

  const domainLower = domain.toLowerCase();
  return allowlist.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // '.whatsapp.net'
      return domainLower.endsWith(suffix) || domainLower === pattern.slice(2);
    }
    return domainLower === pattern;
  });
}

/**
 * Add a custom allowlist entry for a user-granted app.
 * Called when user explicitly grants an app permission to a domain.
 */
export function addAppAllowlistEntry(packageName: string, domain: string): void {
  if (!APP_DOMAIN_ALLOWLIST[packageName]) {
    APP_DOMAIN_ALLOWLIST[packageName] = [];
  }
  if (!APP_DOMAIN_ALLOWLIST[packageName].includes(domain)) {
    APP_DOMAIN_ALLOWLIST[packageName].push(domain);
  }
}

/**
 * isAllowedForApp — consent-aware allowlist check.
 * Check if a domain query from a specific app should bypass the blocklist.
 * Uses suffix matching — e.g., 'whatsapp.net' matches 'e2.whatsapp.net'.
 * Delegates to isAllowlistedForApp (which supports both exact and wildcard patterns).
 */
export function isAllowedForApp(packageName: string, domain: string): boolean {
  return isAllowlistedForApp(packageName, domain);
}

/**
 * allowAppDomain — add a custom app allowlist entry at runtime.
 * Use this from MDM policy or when the user explicitly consents to a domain.
 */
export function allowAppDomain(packageName: string, domain: string): void {
  addAppAllowlistEntry(packageName, domain);
}
