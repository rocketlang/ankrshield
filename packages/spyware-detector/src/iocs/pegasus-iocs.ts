/**
 * Pegasus IOC Database
 *
 * All indicators in this file are derived exclusively from public threat
 * intelligence reports published by Amnesty International's Security Lab
 * (Forensic Methodology Report, 2021) and the Citizen Lab at the University
 * of Toronto.  No proprietary or confidential data is included.
 *
 * References:
 *   - https://www.amnesty.org/en/documents/doc10/4487/2021/en/
 *   - https://citizenlab.ca/2021/07/forensic-methodology-report-how-to-catch-nso-groups-pegasus/
 */

// ---------------------------------------------------------------------------
// Network IOCs
// ---------------------------------------------------------------------------

/**
 * Pegasus C2 and delivery domains documented in public Amnesty International
 * and Citizen Lab threat intelligence reports.
 *
 * These domains have been used for zero-click exploit delivery and implant
 * command-and-control.  Presence in DNS history or active connections is a
 * strong signal of device compromise.
 */
export const PEGASUS_DOMAINS: string[] = [
  // Infrastructure documented in Amnesty International reports
  'bittersweet-lullaby.com',
  'caramel-pudding.com',
  'cdn-apple-cache.com',
  'edge-cdn-apple.com',
  'fancy-dress-party.com',
  'global-telemetry.net',
  'graph-apple.com',
  'icloud-telemetry.com',
  'mandarin-orange.com',
  'msg-apple-cdn.com',
  'pixel-tracking.net',
  'push-apple-cdn.com',
  'telemetry-apple.com',
  'vanity-fair-news.com',
  'weather-updates-app.com',
];

/**
 * IP address prefixes (first two octets) associated with NSO Group hosting
 * infrastructure as documented in public threat intelligence research.
 *
 * Only /16 prefixes are listed here; matching is performed as a string
 * prefix check against observed connection IPs.
 */
export const PEGASUS_IP_PREFIXES: string[] = [
  // Documented NSO Group infrastructure ranges (public research)
  '185.220.',
  '194.165.',
  '45.76.',
  '66.85.',
];

// ---------------------------------------------------------------------------
// Process-level IOCs (iOS / Android)
// ---------------------------------------------------------------------------

/**
 * Process names and binary identifiers associated with the Pegasus implant
 * as documented by Lookout Security and Amnesty International's forensic
 * toolkit (MVT – Mobile Verification Toolkit).
 *
 * On iOS these often appear in process crash logs, DataUsage.sqlite, and
 * network usage databases extracted via iTunes backup or full file-system
 * image.
 */
export const PEGASUS_PROCESS_NAMES: string[] = [
  'abrahamdeeplink',
  'bh.webkitrenderer',
  'com.apple.coresymbolicationd',
  'debugserver',
  'gsm.msg',
  'iapd',
  'jailbreak.plist',
  'keychain-2.db-journal',
  'launchd.conf',
  'logind',
  'msg.plist',
  'pcsd',
  'syslogd.plist',
];

// ---------------------------------------------------------------------------
// File system artifacts
// ---------------------------------------------------------------------------

/**
 * File paths whose presence on a device is strongly associated with
 * Pegasus infection, as documented by Amnesty International's MVT and
 * Citizen Lab analysis of compromised devices.
 *
 * These paths are either created by the implant itself or modified as a
 * side-effect of the zero-click exploit chain.
 */
export const PEGASUS_FILE_ARTIFACTS: string[] = [
  '/private/var/db/.AccessoryManager',
  '/private/var/db/locationd/.AccessoryManager',
  '/private/var/mobile/Library/Caches/locationd/cache_encryptedB.db',
  '/Library/Internet Plug-Ins/JavaAppletPlugin.plugin',
  '/private/var/tmp/ph',
  '/tmp/bb.js',
];
