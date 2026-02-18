/**
 * SpywareScanner — main orchestrator
 *
 * Runs all enabled sub-detectors in parallel and aggregates their results
 * into a single SpywareScanResult.  Emits a 'scan-complete' event via
 * Node's EventEmitter when the scan finishes.
 *
 * Severity thresholds:
 *   overallConfidence < 30  → 'suspected'
 *   overallConfidence < 70  → 'probable'
 *   overallConfidence >= 70 → 'confirmed'
 *
 * Detectors:
 *   NetworkIOCDetector      — Pegasus, Candiru, Predator, FinFisher C2 domains/IPs
 *   AptC2Detector           — Lazarus, APT41, Sandworm, Turla, APT28, APT33, Kimsuky
 *   ProcessDetector         — spyware process name signatures
 *   FileArtifactDetector    — spyware + rootkit file artifacts
 *   LinuxRootkitDetector    — LD_PRELOAD, kernel modules, raw sockets, hidden procs
 *   CveDetector             — XZ Utils, DirtyPipe, PwnKit, DirtyCOW
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { AptC2Detector } from './detectors/apt-detector.js';
import { CveDetector } from './detectors/cve-detector.js';
import { FileArtifactDetector } from './detectors/file-detector.js';
import { LinuxRootkitDetector } from './detectors/linux-rootkit-detector.js';
import { NetworkIOCDetector } from './detectors/network-detector.js';
import { ProcessDetector } from './detectors/process-detector.js';
import { LiveIocDetector } from './live-ioc-feed.js';
import type {
  ScanOptions,
  SpywareFamily,
  SpywareIndicator,
  SpywareScanResult,
  SpywareSeverity,
} from './types.js';

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: ScanOptions = {
  enableNetworkScan: true,
  enableProcessScan: true,
  enableFileScan: true,
  enableDnsScan: true,
  enableLinuxRootkitScan: true,
  enableCveScan: true,
  customIocs: [],
};

// ---------------------------------------------------------------------------
// Recommendation database keyed by family
// ---------------------------------------------------------------------------

const FAMILY_RECOMMENDATIONS: Record<SpywareFamily, string[]> = {
  // ── Commercial spyware ───────────────────────────────────────────────────
  pegasus: [
    'Factory reset the device and restore from a clean, pre-compromise backup.',
    'Run Amnesty International MVT (Mobile Verification Toolkit): https://github.com/mvt-project/mvt',
    'Contact Access Now Digital Security Helpline: https://www.accessnow.org/help/',
    'Enable Lockdown Mode on iOS 16+ immediately while investigating.',
    'Rotate all credentials from a separate, clean device.',
    'Report to Citizen Lab: https://citizenlab.ca/spyware-voluntary-disclosure/',
  ],
  candiru: [
    'Isolate the Windows device from all networks immediately.',
    'Run Microsoft Safety Scanner and the MSRT tool.',
    'Contact Citizen Lab or Access Now for forensic assistance.',
    'Rotate all credentials from a separate, clean device.',
    'Apply all pending Windows security updates before reconnecting.',
  ],
  predator: [
    'Factory reset the device and do not restore from backup.',
    'Contact Access Now Digital Security Helpline for assisted analysis.',
    'Review and revoke OAuth tokens for all connected apps from a clean device.',
    'Monitor for recurrence using Amnesty International MVT.',
  ],
  finfisher: [
    'Disconnect from all networks and perform a full antivirus scan.',
    'Run ESET Online Scanner — ESET has published FinFisher detection signatures.',
    'Reinstall the operating system from clean media if infection is confirmed.',
    'File a report with your national CERT or law enforcement cybercrime unit.',
  ],
  hermit: [
    'Factory reset the Android device immediately.',
    'Run Lookout Security scanner (Lookout published Hermit signatures).',
    'Contact Access Now or Amnesty International for mobile forensics support.',
  ],
  // ── Nation-state APT groups ───────────────────────────────────────────────
  lazarus: [
    'URGENT: Isolate all affected systems from the network immediately.',
    'Lazarus Group (DPRK) targets cryptocurrency, financial systems, and defence. Assume lateral movement has occurred.',
    'Take memory forensics image before rebooting: sudo avml /tmp/memory.lime',
    'Report to CISA (US): https://www.cisa.gov/report or your national CERT.',
    'Review CISA Advisory AA22-108A for Lazarus TTPs and IOCs.',
    'Rotate all service credentials, SSH keys, and API tokens from a clean host.',
    'Engage a professional incident response firm for full forensic investigation.',
  ],
  apt41: [
    'URGENT: APT41 (Double Dragon, China/MSS) is known for supply chain attacks and dual espionage/criminal activity.',
    'Isolate affected systems and preserve memory and disk images before remediation.',
    'Audit all third-party software and update chains — APT41 frequently compromises upstream vendors.',
    'Review CISA advisory on APT41 and DOJ 2020 indictment for full TTP list.',
    'Rotate all credentials and review administrative access logs.',
    'Report to FBI Cyber Division (US) or your national law enforcement.',
  ],
  sandworm: [
    'CRITICAL: Sandworm (GRU Unit 74455, Russia) is responsible for NotPetya and Industroyer2. Destructive attacks are possible.',
    'Isolate affected OT/ICS systems immediately if present — Sandworm targets energy and industrial control systems.',
    'Review CISA Advisory AA22-110A (Cyclops Blink) for full indicators.',
    'Take offline backups of critical systems to air-gapped storage immediately.',
    'Report to CISA Emergency: (888) 282-0870 or cisa.gov/forms/report',
    'Engage CrowdStrike or Mandiant for incident response — both have deep Sandworm expertise.',
  ],
  turla: [
    'URGENT: Turla (FSB, Russia) conducts long-term espionage with exceptional persistence and OPSEC.',
    'Turla is known to implant secondary backdoors — finding one artifact does not mean the system is clean.',
    'Full OS reinstall from clean media is strongly recommended.',
    'Review ESET Turla research papers for full IOC and TTP list.',
    'Rotate all credentials, SSH keys, GPG keys, and TLS certificates.',
    'Report to your national intelligence/security service (CISA, NCSC, BfV etc.).',
  ],
  apt28: [
    'URGENT: APT28 (Fancy Bear / Sofacy, GRU Unit 26165) is responsible for DNC hack and numerous election interference operations.',
    'Assume all credentials on the compromised system have been exfiltrated.',
    'Review Microsoft DCU threat intelligence on APT28 X-Agent malware.',
    'Rotate all credentials, enable MFA on all accounts.',
    'Report to FBI Cyber Division or your national cybersecurity agency.',
    'Review CISA advisory on APT28 for full TTP and IOC list.',
  ],
  apt33: [
    'URGENT: APT33 (Elfin, Iran/IRGC) has deployed destructive SHAMOON wiper malware. Immediate isolation required.',
    'Isolate all systems and take offline backups before any remediation.',
    'APT33 frequently targets petrochemical and aerospace sectors — notify sector-specific ISAC.',
    'Review Mandiant APT33 public report for full TTP list.',
    'Report to CISA or FBI Cyber Division.',
  ],
  kimsuky: [
    'URGENT: Kimsuky (DPRK/RGB) specialises in intelligence collection against think tanks, policy researchers, and journalists.',
    'Assume all documents and emails on the compromised system have been exfiltrated.',
    'Review US-CERT Advisory AA20-301A for full Kimsuky IOC list.',
    'Rotate all email account credentials and enable MFA.',
    'Report to FBI Cyber Division or your national CERT.',
  ],
  // ── Linux rootkits ────────────────────────────────────────────────────────
  bpfdoor: [
    'CRITICAL: BPFDoor uses kernel BPF raw sockets — it is nearly invisible to standard monitoring tools.',
    'Do NOT rely on netstat, ss, or ps to assess infection scope — they will show a clean system.',
    'Boot from trusted live media (e.g., Tails, SecurityOnion live ISO) to scan the filesystem from outside the OS.',
    'Take a memory forensics image: sudo avml /external/memory.lime and analyse with Volatility.',
    'Reimage the server from a known-good base image after forensic capture.',
    'Review PwC "A New BPFdoor Malware Variant" (2023) for full detection guidance.',
  ],
  symbiote: [
    'CRITICAL: Symbiote injects into ALL running processes via LD_PRELOAD — standard tools cannot be trusted.',
    'Boot from trusted live media to perform forensic analysis.',
    'Check /etc/ld.so.preload from the live media environment for injected library paths.',
    'Take memory forensics image before reboot: all process injections are visible in memory.',
    'Full OS reinstall required — Symbiote persistence survives normal cleanup.',
    'Review BlackBerry/Intezer "Symbiote" research paper for full IOC list.',
  ],
  reptile: [
    'Reptile is an LKM rootkit — kernel module hooks cannot be trusted once it is loaded.',
    'Boot from trusted live media. Check /proc/reptile from outside the infected OS.',
    'Run lsmod from live media — the module may be visible from outside the infected kernel.',
    'Full OS reinstall and kernel replacement required.',
    'Consider hardware-level memory forensics if sensitive data was present.',
  ],
  diamorphine: [
    'Diamorphine is an LKM rootkit — do not trust the running kernel for forensics.',
    'Boot from trusted live media. Check /proc/modules and /proc/diamorphine.',
    'Check running processes from outside the OS — Diamorphine hides processes by PID.',
    'Full OS reinstall required.',
  ],
  orbit: [
    'OrBit hooks libc at LD_PRELOAD level — all processes on the system are compromised.',
    'Boot from trusted live media. Check /etc/ld.so.preload and /lib for unexpected .so files.',
    'Do not run forensics tools from within the infected OS — results cannot be trusted.',
    'Full OS reinstall required. Review Intezer "OrBit" research for full IOC list.',
  ],
  hiddenwasp: [
    'HiddenWasp uses /etc/ld.so.preload injection and places binaries in /usr/bin.',
    'Check /etc/ld.so.preload, /usr/bin/.sshd, /usr/bin/iptables2 from trusted live media.',
    'Network traffic from this host may be tunneled — audit all outbound connections.',
    'Full OS reinstall required. Review Intezer "HiddenWasp" research paper.',
  ],
  xorddos: [
    'XorDDoS establishes persistent SSH backdoor and uses the system for DDoS attacks.',
    'Change all SSH credentials and disable password-based SSH authentication immediately.',
    'Check /etc/cron.d/ and all user crontabs for persistence mechanisms.',
    'Check /tmp/, /lib/, and /usr/bin/ for unexpected executables.',
    'Review firewall logs — the system is likely generating significant outbound attack traffic.',
  ],
  lightningframework: [
    'Lightning Framework installs a persistent SSH backdoor and rootkit plugin.',
    'Check /dev/shm/, /tmp/, and /var/tmp/ for implant files from trusted live media.',
    'Rotate all SSH keys and regenerate host keys after reimaging.',
    'Review ESET "Lightning Framework" research paper for full IOC list.',
  ],
  // ── CVE vulnerabilities ────────────────────────────────────────────────────
  cve: [
    'Apply the relevant security patch from your Linux distribution vendor immediately.',
    'Review https://www.cisa.gov/known-exploited-vulnerabilities-catalog for exploit status.',
    'Check if your distribution has backported the fix — run: apt-get changelog <package> | head -50',
    'If patching is not immediately possible, consider compensating controls (restrict local access, disable affected service).',
  ],
  // ── Fallback ──────────────────────────────────────────────────────────────
  unknown: [
    'Do not dismiss unknown indicators — escalate to a digital security professional.',
    'Contact Access Now Digital Security Helpline: https://www.accessnow.org/help/',
    'Run Amnesty International MVT on a clean analysis machine.',
  ],
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function computeOverallConfidence(indicators: SpywareIndicator[]): number {
  if (indicators.length === 0) return 0;
  const total = indicators.reduce((sum, ind) => sum + ind.confidence, 0);
  return Math.round(total / indicators.length);
}

function confidenceToSeverity(confidence: number): SpywareSeverity {
  if (confidence >= 70) return 'confirmed';
  if (confidence >= 30) return 'probable';
  return 'suspected';
}

function uniqueFamilies(indicators: SpywareIndicator[]): SpywareFamily[] {
  const seen = new Set<SpywareFamily>();
  const result: SpywareFamily[] = [];
  for (const ind of indicators) {
    if (!seen.has(ind.family)) {
      seen.add(ind.family);
      result.push(ind.family);
    }
  }
  return result;
}

function buildRecommendations(families: SpywareFamily[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  if (families.length > 0) {
    const urgent =
      'URGENT: Stop using the potentially compromised device/server for sensitive operations immediately.';
    out.push(urgent);
    seen.add(urgent);
  }

  for (const family of families) {
    const recs = FAMILY_RECOMMENDATIONS[family] ?? FAMILY_RECOMMENDATIONS.unknown;
    for (const rec of recs) {
      if (!seen.has(rec)) {
        seen.add(rec);
        out.push(rec);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// SpywareScanner class
// ---------------------------------------------------------------------------

export class SpywareScanner extends EventEmitter {
  private readonly options: ScanOptions;

  constructor(options: Partial<ScanOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Run all enabled detectors and return a consolidated SpywareScanResult.
   *
   * @param recentDomains  Optional list of recently resolved/connected hostnames.
   * @param recentIPs      Optional list of recently used outbound IP addresses.
   */
  async scan(recentDomains: string[] = [], recentIPs: string[] = []): Promise<SpywareScanResult> {
    const startTime = Date.now();
    const scanId = randomUUID();
    const scannedAt = new Date().toISOString();

    const tasks: Promise<SpywareIndicator[]>[] = [];

    // ── Commercial spyware C2 network IOCs ──
    if (this.options.enableNetworkScan || this.options.enableDnsScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new NetworkIOCDetector(this.options.customIocs ?? []);
          return detector.scan(recentDomains, recentIPs);
        })
      );
    }

    // ── APT group C2 network IOCs ──
    if (this.options.enableNetworkScan || this.options.enableDnsScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new AptC2Detector();
          return detector.scan(recentDomains, recentIPs);
        })
      );
    }

    // ── Process name signatures ──
    if (this.options.enableProcessScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new ProcessDetector();
          const results = detector.scan();
          if (process.platform === 'linux') {
            return [...results, ...detector.scanProcFs()];
          }
          return results;
        })
      );
    }

    // ── File artifact checks (spyware + rootkits) ──
    if (this.options.enableFileScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new FileArtifactDetector();
          return detector.scan();
        })
      );
    }

    // ── Linux rootkit detection ──
    if (this.options.enableLinuxRootkitScan) {
      tasks.push(
        Promise.resolve().then(() => {
          const detector = new LinuxRootkitDetector();
          return detector.scan();
        })
      );
    }

    // ── CVE vulnerability checks ──
    if (this.options.enableCveScan) {
      tasks.push(
        Promise.resolve().then(async () => {
          const detector = new CveDetector();
          return detector.scan();
        })
      );
    }

    // ── Live threat feeds (ThreatFox, Feodo Tracker — real-time APT IOCs) ──
    if (this.options.enableNetworkScan && recentDomains.length + recentIPs.length > 0) {
      tasks.push(
        Promise.resolve().then(async () => {
          const detector = new LiveIocDetector();
          return detector.scan(recentDomains, recentIPs);
        })
      );
    }

    // Settle all — tolerate individual detector failures
    const settled = await Promise.allSettled(tasks);
    const allIndicators: SpywareIndicator[] = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        allIndicators.push(...result.value);
      }
    }

    const overallConfidence = computeOverallConfidence(allIndicators);
    const families = uniqueFamilies(allIndicators);
    const isClean = allIndicators.length === 0;
    const severity: SpywareSeverity | null = isClean
      ? null
      : confidenceToSeverity(overallConfidence);
    const recommendations = isClean ? [] : buildRecommendations(families);
    const scanDurationMs = Date.now() - startTime;

    const scanResult: SpywareScanResult = {
      id: scanId,
      scannedAt,
      platform: process.platform,
      indicatorsFound: allIndicators,
      families,
      overallConfidence,
      severity,
      isClean,
      scanDurationMs,
      recommendations,
    };

    this.emit('scan-complete', scanResult);
    return scanResult;
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _defaultScanner: SpywareScanner | null = null;

export function getDefaultScanner(forceNew = false): SpywareScanner {
  if (!_defaultScanner || forceNew) {
    _defaultScanner = new SpywareScanner();
  }
  return _defaultScanner;
}
