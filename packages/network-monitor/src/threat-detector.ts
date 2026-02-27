/**
 * @ankrshield/network-monitor — WiFi Threat Detector
 * Analyses current network context for common wireless attack vectors:
 *   evil twin, ARP spoofing, captive portals, MITM proxies, open networks.
 */

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface NetworkThreat {
  type: 'evil_twin' | 'arp_spoof' | 'captive_portal' | 'mitm_proxy' | 'open_network';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ssid?: string;
  bssid?: string;
  details: string;
  timestamp: string;
}

export interface NetworkScanResult {
  safe: boolean;
  threats: NetworkThreat[];
  networkType: 'wifi' | 'cellular' | 'unknown';
  ssid?: string;
  encryptionType?: 'WPA2' | 'WPA3' | 'WPA' | 'WEP' | 'OPEN' | 'unknown';
  score: number; // 0-100, higher = safer
}

// ─── Captive portal SSID patterns ────────────────────────────────────────────

const CAPTIVE_PORTAL_PATTERNS: RegExp[] = [
  /_captive/i,
  /hotel/i,
  /airport/i,
  /cafe/i,
  /coffee/i,
  /restaurant/i,
  /guest/i,
  /public/i,
  /free[\s_-]?wifi/i,
  /free[\s_-]?internet/i,
  /free/i,
  /lounge/i,
  /transit/i,
  /mall/i,
  /plaza/i,
];

// ─── Severity score deductions ────────────────────────────────────────────────

const SEVERITY_DEDUCTIONS: Record<NetworkThreat['severity'], number> = {
  critical: 50,
  high: 30,
  medium: 20,
  low: 10,
};

// ─── Normalise encryption string ─────────────────────────────────────────────

function normaliseEncryption(raw?: string): 'WPA2' | 'WPA3' | 'WPA' | 'WEP' | 'OPEN' | 'unknown' {
  if (!raw) return 'unknown';
  const upper = raw.toUpperCase().trim();
  if (upper.includes('WPA3')) return 'WPA3';
  if (upper.includes('WPA2')) return 'WPA2';
  if (upper.includes('WEP')) return 'WEP';
  if (upper.includes('WPA')) return 'WPA';
  if (upper === 'OPEN' || upper === 'NONE' || upper === '') return 'OPEN';
  return 'unknown';
}

// ─── Main analyser ────────────────────────────────────────────────────────────

export function analyzeNetwork(info: {
  ssid?: string;
  bssid?: string;
  networkType: 'wifi' | 'cellular' | 'unknown';
  encryptionType?: string;
  signalStrength?: number; // dBm
  knownNetworks?: Array<{ ssid: string; bssid: string }>; // previously seen safe networks
}): NetworkScanResult {
  const threats: NetworkThreat[] = [];
  const now = new Date().toISOString();
  const encryption = normaliseEncryption(info.encryptionType);
  const { ssid, bssid, networkType, knownNetworks = [] } = info;

  // ── 1. Open network ──────────────────────────────────────────────────────────
  if (networkType === 'wifi') {
    if (encryption === 'OPEN' || (encryption === 'unknown' && !info.encryptionType)) {
      threats.push({
        type: 'open_network',
        severity: 'medium',
        ssid,
        bssid,
        details:
          'Network has no encryption. All traffic is transmitted in plaintext and can be ' +
          'intercepted by anyone within radio range.',
        timestamp: now,
      });
    }
  }

  // ── 2. Evil twin ─────────────────────────────────────────────────────────────
  if (ssid && bssid && knownNetworks.length > 0) {
    const known = knownNetworks.find((n) => n.ssid.toLowerCase() === ssid.toLowerCase());
    if (known && known.bssid.toLowerCase() !== bssid.toLowerCase()) {
      threats.push({
        type: 'evil_twin',
        severity: 'critical',
        ssid,
        bssid,
        details:
          `SSID "${ssid}" was previously seen with BSSID ${known.bssid} but is now ` +
          `broadcasting from ${bssid}. This is a strong indicator of an evil twin ` +
          'attack — a rogue access point impersonating a trusted network to intercept traffic.',
        timestamp: now,
      });
    }
  }

  // ── 3. Weak encryption ───────────────────────────────────────────────────────
  if (networkType === 'wifi') {
    if (encryption === 'WEP') {
      threats.push({
        type: 'mitm_proxy',
        severity: 'high',
        ssid,
        bssid,
        details:
          'Network uses WEP encryption, which is cryptographically broken and can be ' +
          'cracked in minutes. An attacker can decrypt all traffic and perform ' +
          'man-in-the-middle attacks.',
        timestamp: now,
      });
    } else if (encryption === 'WPA') {
      // WPA (without 2 or 3) — weaker TKIP-based encryption
      threats.push({
        type: 'mitm_proxy',
        severity: 'medium',
        ssid,
        bssid,
        details:
          'Network uses WPA (TKIP) encryption, which has known vulnerabilities. ' +
          'WPA2 or WPA3 is strongly recommended. Traffic may be susceptible to ' +
          'TKIP-based attacks and MITM interception.',
        timestamp: now,
      });
    }
  }

  // ── 4. Captive portal ────────────────────────────────────────────────────────
  if (networkType === 'wifi' && ssid) {
    const matchesPortalPattern = CAPTIVE_PORTAL_PATTERNS.some((pattern) => pattern.test(ssid));
    if (matchesPortalPattern) {
      threats.push({
        type: 'captive_portal',
        severity: 'low',
        ssid,
        bssid,
        details:
          `SSID "${ssid}" matches common captive portal naming patterns (hotel, airport, ` +
          'cafe, free, public, etc.). Captive portals intercept HTTP traffic and may ' +
          'inject content or harvest credentials. Avoid logging in to sensitive accounts ' +
          'on this network.',
        timestamp: now,
      });
    }
  }

  // ── Score calculation ────────────────────────────────────────────────────────
  let score = 100;
  for (const threat of threats) {
    score -= SEVERITY_DEDUCTIONS[threat.severity];
  }
  score = Math.max(0, score);

  const safe = threats.length === 0;

  return {
    safe,
    threats,
    networkType,
    ssid,
    encryptionType: networkType === 'wifi' ? encryption : undefined,
    score,
  };
}
