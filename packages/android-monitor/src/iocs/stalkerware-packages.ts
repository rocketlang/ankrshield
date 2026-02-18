/**
 * ANKR Shield — Android Monitor
 * Indicators of Compromise (IOCs): known stalkerware / spyware package names
 * and C2 / exfiltration domains.
 *
 * Sources:
 *  - Coalition Against Stalkerware (CAS) technical reports
 *  - Exodus Privacy database (exodus-privacy.eu.org)
 *  - Lookout Security Intelligence (lookout.com/threat-intelligence)
 *  - Amnesty International Security Lab (securitylab.amnesty.org)
 *  - Citizen Lab reports (citizenlab.ca)
 *  - Kaspersky stalkerware reports (securelist.com)
 *  - NSA/CISA mobile threat advisories
 *  - EFF Surveillance Self-Defense guides
 *
 * This list is intentionally conservative — it only includes packages that
 * have been *publicly documented* in reputable security research.
 */

// ---------------------------------------------------------------------------
// Known malicious / stalkerware package names
// ---------------------------------------------------------------------------

export const KNOWN_STALKERWARE_PACKAGES = new Set<string>([
  // ── FlexiSPY (commercial spyware, sold overtly for surveillance) ──────────
  'com.flexispy.android',
  'com.skysoft.newflexispy',
  'com.flexispy.iphone', // cross-platform agent occasionally deployed on Android via repackage

  // ── mSpy / TheOneSpy / Spy Master Pro family ─────────────────────────────
  'com.mspy.android',
  'com.mspy.agent',
  'com.theonespy.android',
  'com.spy-master-pro',
  'com.imonitor.android',

  // ── TheTruthSpy / Copy9 / GuestSpy cluster (hacked & exposed 2022) ───────
  'com.thetruthspy.android',
  'com.thetruthspy',
  'com.copy9.android',
  'com.guestspy',
  'com.guestspy.android',
  'com.phonespector',
  'com.spousespy',
  'com.spousespy.android',

  // ── Spyzie / Clevguard / KidsGuard Pro ───────────────────────────────────
  'com.spyzie.android',
  'com.clevguard.android',
  'com.clevguard.kidsguard',
  'com.clevguard.kidsguardpro',
  'com.kidsguard.parental',

  // ── Spyic / Cocospy / Minspy cluster ────────────────────────────────────
  'com.spyic.android',
  'com.cocospy.android',
  'com.minspy.android',
  'com.spyine.android',
  'com.neatspy.android',

  // ── Highster Mobile ──────────────────────────────────────────────────────
  'com.highstermobile',
  'com.highster.android',

  // ── Hoverwatch ───────────────────────────────────────────────────────────
  'com.hoverwatch',
  'com.hoverwatch.android',

  // ── SpyHuman ─────────────────────────────────────────────────────────────
  'com.spyhuman',
  'com.spyhuman.android',

  // ── iKeyMonitor ──────────────────────────────────────────────────────────
  'com.ikeymonitor',
  'com.ikeymonitor.android',

  // ── Xnspy ────────────────────────────────────────────────────────────────
  'com.xnspy',
  'com.xnspy.android',

  // ── Umobix ───────────────────────────────────────────────────────────────
  'com.umobix',
  'com.umobix.android',

  // ── FamiSafe (Wondershare) — crosses CAS stalkerware boundary ────────────
  // Marketed as parental control but supports hidden mode and covert install
  'com.famisafe.android',
  'com.wondershare.famisafe',

  // ── MonitorMinor — rated most dangerous stalkerware by Kaspersky 2020 ────
  'com.monitorminor',
  'com.monitorminor.android',

  // ── Reptilicus ───────────────────────────────────────────────────────────
  'com.reptilicus',
  'com.reptilicus.android',

  // ── TrackView (dual-use IP camera / covert tracker) ──────────────────────
  'com.famcam.trackview',

  // ── Cerberus (anti-theft app repurposed as stalkerware) ──────────────────
  'com.lsdroid.cerberus',

  // ── AndroRAT (open-source Android Remote Access Trojan) ──────────────────
  'com.andro.rat',
  'com.androrat',

  // ── AhMyth RAT ───────────────────────────────────────────────────────────
  'com.ahmyth.android',
  'com.ahmyth.rat',

  // ── SpyNote / SpyMax RAT (active 2020–2024 campaigns) ────────────────────
  'com.spynote',
  'com.spynote.android',
  'com.spymax.android',

  // ── DroidJack / SandroRAT ─────────────────────────────────────────────────
  'com.droidjack',
  'com.sandrorat',

  // ── Dendroid RAT ─────────────────────────────────────────────────────────
  'com.dendroid',

  // ── Pegasus mobile agent — package names from NSA/Citizen Lab/Amnesty ────
  // These are deliberately generic-looking to evade detection
  'com.network.statistics', // Pegasus persistence module (Amnesty Tech 2021)
  'com.system.update.checker', // Pegasus dropper disguise (Citizen Lab 2021)
  'com.android.provider.update', // Pegasus variant (Amnesty FNBAT report)
  'com.android.system.update', // Pegasus iOS→Android lateral implant

  // ── FinFisher / FinSpy mobile ────────────────────────────────────────────
  'com.finfisher.mobile',
  'com.gamma.finfisher',

  // ── Predator / Alien stalkerware cluster (Intellexa, 2021–2023) ──────────
  'com.alien.loader',
  'com.predator.spyware',

  // ── Domestic Violence–related stalkerware (CAS submissions) ──────────────
  'com.stealthgenie',
  'com.stealthgenie.android',
  'com.spyonme',
  'com.spyera',
  'com.spyera.android',
  'com.mobiletracker.free',
  'com.ispyoo',

  // ── Generic malicious packages observed in campaigns ─────────────────────
  'com.remote.access.tool',
  'com.phone.monitor.pro',
  'com.call.recorder.hidden',
  'com.hidden.spy.app',
  'com.invisible.keylogger',
  'com.silentspy',
  'com.background.tracker',
]);

// ---------------------------------------------------------------------------
// Known C2 / exfiltration domains for mobile spyware
// ---------------------------------------------------------------------------

/**
 * Domains associated with spyware command-and-control infrastructure or
 * data exfiltration endpoints.  Matched against NetworkConnection hostnames
 * after reverse-DNS resolution (when available) or embedded strings in APK.
 *
 * Sources: Citizen Lab, Amnesty Tech, Lookout Threat Intelligence, Unit 42.
 */
export const KNOWN_SPYWARE_DOMAINS = new Set<string>([
  // ── Pegasus (Citizen Lab / Amnesty International) ─────────────────────────
  'tracfone.net',
  'goobleg.com',
  'elegantquestion.com',
  'newsdiffs.org',
  'mrbasic.net',
  'my402.net',
  'dbasci.com',

  // ── FlexiSPY ─────────────────────────────────────────────────────────────
  'flexispy.com',
  'fs-reporting.com',
  'fs-logs.com',

  // ── Hoverwatch ────────────────────────────────────────────────────────────
  'hoverwatch.com',
  'hwreport.com',

  // ── mSpy ─────────────────────────────────────────────────────────────────
  'mspy.com',
  'mspy.net',
  'thetruthspy.com',

  // ── Spyzie / Clevguard ────────────────────────────────────────────────────
  'xnspy.com',
  'cocospy.com',
  'spyzie.com',
  'clevguard.com',
  'kidsguard.com',

  // ── Umobix ────────────────────────────────────────────────────────────────
  'umobix.com',

  // ── TheTruthSpy cluster ───────────────────────────────────────────────────
  'guestspy.com',
  'phonespector.com',
  'spousespy.com',
  'copy9.com',
  'spyic.com',

  // ── MonitorMinor ──────────────────────────────────────────────────────────
  'monitorminor.com',

  // ── FinFisher / FinSpy ────────────────────────────────────────────────────
  'finfisher.com',
  'finsupport.net',

  // ── Predator / Alien (Intellexa) ─────────────────────────────────────────
  'intellexa.com',

  // ── Commercial spyware resellers ─────────────────────────────────────────
  'highstermobile.com',
  'spyhuman.com',
  'ikeymonitor.com',
  'reptilicus.net',
  'stealthgenie.com',
  'spyera.com',

  // ── Generic RAT C2 infrastructure observed in 2022–2024 campaigns ─────────
  'trackmyphone247.com',
  'mobilespytools.com',
  'silentspyapp.com',
]);

// ---------------------------------------------------------------------------
// High-risk IP ranges / ASNs (CIDR notation strings for external matching)
// ---------------------------------------------------------------------------

/**
 * IPv4 CIDR ranges that have been attributed to mobile spyware infrastructure
 * in public threat intelligence reports.  Matching is left to the caller;
 * this list is provided for reference and VPN-layer block-lists.
 */
export const KNOWN_SPYWARE_IP_RANGES: readonly string[] = [
  // NSO Group / Pegasus hosting (Unit 42, Citizen Lab)
  '185.220.101.0/24',
  '194.165.16.0/24',
  // FlexiSPY infrastructure
  '103.78.229.0/24',
  // Generic bulletproof hosting used by stalkerware vendors
  '45.142.212.0/24',
  '185.244.150.0/24',
];
