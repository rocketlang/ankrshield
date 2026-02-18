/**
 * LinuxRootkitDetector
 *
 * Detects known Linux rootkits and implants via:
 *   1. File artifact checks  — known rootkit-specific file paths
 *   2. /etc/ld.so.preload    — LD_PRELOAD injection detection
 *   3. /proc/modules         — kernel module name matching
 *   4. /proc/net/packet      — raw socket listener detection (BPFDoor)
 *   5. Hidden process heuristic — PID discrepancy between /proc and ps
 *   6. Process environment   — per-process LD_PRELOAD env var
 *
 * This detector is Linux-only and returns an empty array on all other
 * platforms without throwing.
 *
 * Confidence scoring:
 *   Rootkit file artifact found     → 92
 *   Suspicious /etc/ld.so.preload   → 85 (file present + suspicious entry)
 *   Known rootkit kernel module     → 88
 *   Unexpected raw socket (BPFDoor) → 78
 *   Hidden process heuristic        → 70 (heuristic, verify manually)
 *   Process LD_PRELOAD anomaly      → 75
 */

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';

import {
  BPFDOOR_FILE_ARTIFACTS,
  BPFDOOR_MASQUERADE_NAMES,
  SYMBIOTE_LIBRARY_NAMES,
  REPTILE_FILE_ARTIFACTS,
  REPTILE_MODULE_NAMES,
  DIAMORPHINE_MODULE_NAMES,
  DIAMORPHINE_FILE_ARTIFACTS,
  ORBIT_FILE_ARTIFACTS,
  HIDDENWASP_FILE_ARTIFACTS,
  HIDDENWASP_PRELOAD_ENTRIES,
  LIGHTNING_FRAMEWORK_FILE_ARTIFACTS,
  XORDDOS_FILE_ARTIFACTS,
  XORDDOS_PROCESS_NAMES,
  SUSPICIOUS_PRELOAD_BASENAMES,
  KNOWN_ROOTKIT_MODULES,
} from '../iocs/linux-rootkit-iocs.js';
import type { SpywareIndicator, SpywareFamily } from '../types.js';

// ---------------------------------------------------------------------------
// File artifact table
// ---------------------------------------------------------------------------

interface RootkitFileEntry {
  path: string;
  family: SpywareFamily;
  description: string;
}

const FILE_ENTRIES: RootkitFileEntry[] = [
  ...BPFDOOR_FILE_ARTIFACTS.map((p) => ({
    path: p,
    family: 'bpfdoor' as const,
    description: `BPFDoor implant file artifact — PwC/Trend Micro research. BPFDoor uses BPF raw sockets to receive C2 commands invisibly.`,
  })),
  ...REPTILE_FILE_ARTIFACTS.map((p) => ({
    path: p,
    family: 'reptile' as const,
    description: `Reptile LKM rootkit control path. Reptile creates /proc/reptile/ for issuing commands to the kernel module.`,
  })),
  ...DIAMORPHINE_FILE_ARTIFACTS.map((p) => ({
    path: p,
    family: 'diamorphine' as const,
    description: `Diamorphine LKM rootkit artifact. Hides processes by PID and grants root via signal 64.`,
  })),
  ...ORBIT_FILE_ARTIFACTS.map((p) => ({
    path: p,
    family: 'orbit' as const,
    description: `OrBit rootkit file artifact — Intezer research (April 2022). Hooks libc read/write/getdents to hide files and processes.`,
  })),
  ...HIDDENWASP_FILE_ARTIFACTS.map((p) => ({
    path: p,
    family: 'hiddenwasp' as const,
    description: `HiddenWasp Linux implant file artifact — Intezer research (May 2019).`,
  })),
  ...LIGHTNING_FRAMEWORK_FILE_ARTIFACTS.map((p) => ({
    path: p,
    family: 'lightningframework' as const,
    description: `Lightning Framework modular backdoor artifact — ESET research (July 2022). Installs SSH backdoor and rootkit plugin.`,
  })),
  ...XORDDOS_FILE_ARTIFACTS.map((p) => ({
    path: p,
    family: 'xorddos' as const,
    description: `XorDDoS Linux botnet implant artifact. Uses XOR-encrypted C2 and persists via cron.`,
  })),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeRead(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function safeExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function safeListDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function safeExec(cmd: string, timeoutMs = 8000): string {
  try {
    return execSync(cmd, { timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] }).toString(
      'utf8'
    );
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Detector class
// ---------------------------------------------------------------------------

export class LinuxRootkitDetector {
  private readonly platform: string;

  constructor(platform: string = process.platform) {
    this.platform = platform;
  }

  /**
   * Run all Linux rootkit detection checks.
   * Returns empty array immediately on non-Linux platforms.
   */
  scan(): SpywareIndicator[] {
    if (this.platform !== 'linux') return [];

    const indicators: SpywareIndicator[] = [];

    indicators.push(
      ...this.checkFileArtifacts(),
      ...this.checkLdSoPreload(),
      ...this.checkKernelModules(),
      ...this.checkRawSockets(),
      ...this.checkHiddenProcesses(),
      ...this.checkProcessEnvironments()
    );

    return indicators;
  }

  // ── 1. File artifact checks ────────────────────────────────────────────────

  private checkFileArtifacts(): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];

    for (const entry of FILE_ENTRIES) {
      if (safeExists(entry.path)) {
        indicators.push({
          id: randomUUID(),
          family: entry.family,
          type: 'file_artifact',
          value: entry.path,
          description: entry.description,
          confidence: 92,
        });
      }
    }

    return indicators;
  }

  // ── 2. /etc/ld.so.preload inspection ──────────────────────────────────────

  private checkLdSoPreload(): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];
    const preloadPath = '/etc/ld.so.preload';

    if (!safeExists(preloadPath)) return [];

    const content = safeRead(preloadPath);
    if (!content.trim()) return [];

    // Any non-empty ld.so.preload is suspicious on a production server
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    for (const line of lines) {
      const libBasename = line.split('/').pop() ?? line;
      const lower = libBasename.toLowerCase();

      // Check against known rootkit library names
      const knownRootkit = SUSPICIOUS_PRELOAD_BASENAMES.some((s) => lower.includes(s));
      const hiddenWasp = HIDDENWASP_PRELOAD_ENTRIES.some((s) => lower.includes(s));
      const symbiote = SYMBIOTE_LIBRARY_NAMES.some((s) => lower === s);

      if (hiddenWasp) {
        indicators.push({
          id: randomUUID(),
          family: 'hiddenwasp',
          type: 'ld_preload',
          value: line,
          description: `HiddenWasp rootkit LD_PRELOAD injection detected in /etc/ld.so.preload — Intezer research`,
          confidence: 90,
        });
      } else if (symbiote) {
        indicators.push({
          id: randomUUID(),
          family: 'symbiote',
          type: 'ld_preload',
          value: line,
          description: `Symbiote rootkit library detected in /etc/ld.so.preload. Symbiote injects into all running processes to hide C2 traffic. — BlackBerry/Intezer research`,
          confidence: 88,
        });
      } else if (knownRootkit) {
        indicators.push({
          id: randomUUID(),
          family: 'unknown',
          type: 'ld_preload',
          value: line,
          description: `Suspicious library in /etc/ld.so.preload matching known rootkit library names. LD_PRELOAD injection is a primary technique of Symbiote, OrBit, HiddenWasp, and XorDDoS.`,
          confidence: 85,
        });
      } else {
        // Any unexplained ld.so.preload entry is worth flagging at lower confidence
        indicators.push({
          id: randomUUID(),
          family: 'unknown',
          type: 'ld_preload',
          value: line,
          description: `/etc/ld.so.preload contains an entry not matching known system libraries. File is rarely used on production servers; presence of any entry warrants investigation.`,
          confidence: 72,
        });
      }
    }

    return indicators;
  }

  // ── 3. Kernel module checks ────────────────────────────────────────────────

  private checkKernelModules(): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];
    const modulesContent = safeRead('/proc/modules');
    if (!modulesContent) return [];

    const loadedModules = modulesContent
      .split('\n')
      .map((line) => line.split(' ')[0]?.toLowerCase() ?? '');

    // Check Reptile-specific module names
    for (const mod of REPTILE_MODULE_NAMES) {
      if (loadedModules.includes(mod.toLowerCase())) {
        indicators.push({
          id: randomUUID(),
          family: 'reptile',
          type: 'kernel_module',
          value: mod,
          description: `Reptile LKM rootkit kernel module detected in /proc/modules. Reptile hides files, processes, and opens a reverse shell.`,
          confidence: 95,
        });
      }
    }

    // Check Diamorphine
    for (const mod of DIAMORPHINE_MODULE_NAMES) {
      if (loadedModules.includes(mod.toLowerCase())) {
        indicators.push({
          id: randomUUID(),
          family: 'diamorphine',
          type: 'kernel_module',
          value: mod,
          description: `Diamorphine LKM rootkit kernel module detected. Can hide processes by PID and grant root privileges via kill signal 64.`,
          confidence: 95,
        });
      }
    }

    // Check all known rootkit module names
    for (const mod of KNOWN_ROOTKIT_MODULES) {
      const modLower = mod.toLowerCase();
      // Skip modules already matched above
      if (
        REPTILE_MODULE_NAMES.map((m) => m.toLowerCase()).includes(modLower) ||
        DIAMORPHINE_MODULE_NAMES.map((m) => m.toLowerCase()).includes(modLower)
      ) {
        continue;
      }
      if (loadedModules.includes(modLower)) {
        indicators.push({
          id: randomUUID(),
          family: 'unknown',
          type: 'kernel_module',
          value: mod,
          description: `Known rootkit kernel module name '${mod}' found in /proc/modules.`,
          confidence: 88,
        });
      }
    }

    return indicators;
  }

  // ── 4. Raw socket detection (BPFDoor) ─────────────────────────────────────

  private checkRawSockets(): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];

    // BPFDoor uses a raw PACKET socket — visible in /proc/net/packet
    const packetContent = safeRead('/proc/net/packet');
    if (!packetContent) return [];

    const lines = packetContent.split('\n').filter((l) => l.trim() && !l.startsWith('sk'));

    if (lines.length === 0) return [];

    // Get list of legitimate processes that use raw sockets (tcpdump, dhclient, etc.)
    const psOutput = safeExec('ps aux');
    const legitimateRawSocketUsers = ['tcpdump', 'dhclient', 'dhcpd', 'wireshark', 'ping'];

    // Parse each raw socket entry from /proc/net/packet
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      // /proc/net/packet columns: sk, RefCnt, Type, Proto, Iface, R, rmem, User, Inode
      const proto = cols[2];
      const iface = cols[4];

      // Type=3 is SOCK_RAW; most legitimate ones are on a named interface
      // BPFDoor-style: raw socket with no named interface (bound to 0/any)
      if (proto === '3' && (iface === '0' || iface === undefined)) {
        // Check if any legitimate program is responsible
        const hasLegitUser = legitimateRawSocketUsers.some((prog) =>
          psOutput.toLowerCase().includes(prog)
        );

        if (!hasLegitUser) {
          indicators.push({
            id: randomUUID(),
            family: 'bpfdoor',
            type: 'behavioral',
            value: `/proc/net/packet: ${line.trim()}`,
            description: `Raw PACKET socket (SOCK_RAW) bound to all interfaces with no identifiable legitimate owner. BPFDoor uses this technique to receive magic-packet C2 commands invisibly — PwC/Trend Micro research.`,
            confidence: 78,
          });
        }
      }
    }

    // Also check for BPFDoor masquerade process names
    if (psOutput) {
      for (const name of BPFDOOR_MASQUERADE_NAMES) {
        if (psOutput.toLowerCase().includes(name.toLowerCase())) {
          indicators.push({
            id: randomUUID(),
            family: 'bpfdoor',
            type: 'process_name',
            value: name,
            description: `Process name '${name}' associated with BPFDoor masquerade. BPFDoor renames itself to common system daemon names.`,
            confidence: 75,
          });
        }
      }
    }

    return indicators;
  }

  // ── 5. Hidden process heuristic ───────────────────────────────────────────

  private checkHiddenProcesses(): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];

    // Get PIDs visible in /proc
    const procPids = safeListDir('/proc')
      .filter((entry) => /^\d+$/.test(entry))
      .map(Number);

    if (procPids.length === 0) return [];

    // Get PIDs visible to ps
    const psOutput = safeExec('ps -eo pid --no-headers');
    const psPids = psOutput
      .split('\n')
      .map((l) => parseInt(l.trim(), 10))
      .filter((n) => !isNaN(n));

    if (psPids.length === 0) return [];

    // PIDs in /proc but NOT in ps output — could be hidden by rootkit
    // Note: there are always a few transient PIDs, so we look for
    // persistent discrepancies (more than 3 hidden PIDs is suspicious)
    const hiddenPids = procPids.filter((pid) => !psPids.includes(pid) && pid > 1);

    if (hiddenPids.length > 3) {
      indicators.push({
        id: randomUUID(),
        family: 'unknown',
        type: 'behavioral',
        value: `${hiddenPids.length} hidden PIDs: ${hiddenPids.slice(0, 5).join(', ')}${hiddenPids.length > 5 ? '...' : ''}`,
        description: `${hiddenPids.length} process IDs visible in /proc/ are hidden from ps output. This discrepancy is a classic rootkit signature — rootkits like Reptile and Diamorphine hook getdents to hide processes from ps but cannot remove /proc entries completely without kernel patching.`,
        confidence: 70,
      });
    }

    return indicators;
  }

  // ── 6. Per-process LD_PRELOAD environment check ───────────────────────────

  private checkProcessEnvironments(): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];
    const seen = new Set<string>();

    // Sample up to 200 PIDs from /proc to avoid excessive overhead
    const pids = safeListDir('/proc')
      .filter((e) => /^\d+$/.test(e))
      .slice(0, 200);

    for (const pid of pids) {
      const environ = safeRead(`/proc/${pid}/environ`);
      if (!environ) continue;

      // environ uses null bytes as separators
      const vars = environ.split('\0');
      for (const v of vars) {
        if (!v.startsWith('LD_PRELOAD=')) continue;

        const value = v.slice('LD_PRELOAD='.length);
        if (seen.has(value)) continue;
        seen.add(value);

        const libBasenames = value.split(':').map((p) => p.split('/').pop()?.toLowerCase() ?? '');

        const isSuspicious = libBasenames.some((b) =>
          SUSPICIOUS_PRELOAD_BASENAMES.some((s) => b.includes(s))
        );

        if (isSuspicious) {
          indicators.push({
            id: randomUUID(),
            family: 'symbiote',
            type: 'ld_preload',
            value: `PID ${pid}: LD_PRELOAD=${value}`,
            description: `Suspicious LD_PRELOAD value found in process ${pid} environment. Library name matches known rootkit patterns (Symbiote, OrBit). Rootkits use LD_PRELOAD to intercept libc calls and hide their presence.`,
            confidence: 75,
          });
        }
      }
    }

    // Also check XorDDoS process names in ps
    const psOutput = safeExec('ps aux');
    if (psOutput) {
      for (const name of XORDDOS_PROCESS_NAMES) {
        if (psOutput.toLowerCase().includes(name.toLowerCase())) {
          indicators.push({
            id: randomUUID(),
            family: 'xorddos',
            type: 'process_name',
            value: name,
            description: `XorDDoS Linux botnet process name '${name}' detected. XorDDoS uses SSH brute force for initial access then deploys XOR-encrypted C2.`,
            confidence: 80,
          });
        }
      }
    }

    return indicators;
  }
}
