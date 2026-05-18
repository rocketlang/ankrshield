/**
 * Linux Rootkit & Implant IOC Database
 *
 * File artifacts, process names, kernel module names, and filesystem paths
 * documented by public security research for known Linux rootkits and implants.
 *
 * Sources:
 *   PwC: "A New BPFdoor Malware Variant" (2023)
 *   Trend Micro: BPFDoor analysis (2022)
 *   BlackBerry/Intezer: "Symbiote: A New, Nearly-Impossible-to-Detect Linux Threat" (2022)
 *   Intezer: "OrBit: New Undetected Linux Threat" (2022)
 *   Intezer: "HiddenWasp Malware Stings Targeted Linux Systems" (2019)
 *   ESET: "Lightning Framework — New Undetected Linux Threat" (2022)
 *   Avast: Reptile rootkit documentation
 *   Multiple: Diamorphine (open-source rootkit, widely analyzed)
 *   Akamai: XorDDoS Linux botnet analysis
 */

// ---------------------------------------------------------------------------
// BPFDoor — APT41-linked Linux backdoor using BPF raw sockets
// Sources: PwC 2023 report, Trend Micro, CISA advisories
// ---------------------------------------------------------------------------

/**
 * File paths created by BPFDoor in various documented samples.
 * BPFDoor disguises itself as common Linux system daemons.
 */
export const BPFDOOR_FILE_ARTIFACTS: string[] = [
  '/var/run/initd.lock',
  '/dev/shm/kdmtmpflush',
  '/dev/shm/rpscheck',
  '/tmp/.shm',
  '/var/run/haldrund.pid',
  '/dev/shm/.init',
];

/**
 * Process names BPFDoor impersonates to hide from `ps` and monitoring.
 * These processes are legitimate on clean systems but suspicious in
 * combination with raw socket usage or BPF filter presence.
 */
export const BPFDOOR_MASQUERADE_NAMES: string[] = ['kdmtmpflush', 'rpscheck', 'haldrund'];

// ---------------------------------------------------------------------------
// Symbiote — Linux rootkit injected via LD_PRELOAD
// Sources: BlackBerry Threat Research / Intezer (June 2022)
// ---------------------------------------------------------------------------

/**
 * Library filenames used by Symbiote samples.
 * Symbiote injects via LD_PRELOAD or /etc/ld.so.preload to hook libc calls.
 */
export const SYMBIOTE_LIBRARY_NAMES: string[] = [
  'libgcc.so',
  'liblinux.so',
  'libprocesshider.so',
  'libsystemd.so', // impersonates systemd library
  'libns2.so', // documented in Intezer analysis
];

// ---------------------------------------------------------------------------
// Reptile — Loadable Kernel Module (LKM) rootkit
// Sources: Public GitHub documentation, multiple vendor analyses
// ---------------------------------------------------------------------------

/**
 * Filesystem paths created by the Reptile LKM rootkit.
 * Reptile creates a control directory under /proc/ and uses a magic keyword.
 */
export const REPTILE_FILE_ARTIFACTS: string[] = [
  '/proc/reptile',
  '/proc/reptile/cmd',
  '/proc/reptile/token',
];

/** Kernel module name as it appears in /proc/modules (may be hidden). */
export const REPTILE_MODULE_NAMES: string[] = ['reptile', 'reptile_shell'];

// ---------------------------------------------------------------------------
// Diamorphine — LKM rootkit (widely analyzed open-source rootkit)
// Sources: GitHub, SANS Institute, multiple AV vendor analyses
// ---------------------------------------------------------------------------

/**
 * Diamorphine kernel module name as it appears in /proc/modules.
 * The module hides itself but may appear briefly in dmesg during load.
 */
export const DIAMORPHINE_MODULE_NAMES: string[] = ['diamorphine'];

/**
 * Diamorphine leaves /proc/diamorphine in some variants.
 */
export const DIAMORPHINE_FILE_ARTIFACTS: string[] = ['/proc/diamorphine'];

// ---------------------------------------------------------------------------
// OrBit — Linux rootkit hooking libc functions
// Sources: Intezer "OrBit: New Undetected Linux Threat" (April 2022)
// ---------------------------------------------------------------------------

/**
 * File paths documented in the Intezer OrBit analysis.
 * OrBit hooks libc read/write/getdents at LD_PRELOAD level.
 */
export const ORBIT_FILE_ARTIFACTS: string[] = [
  '/lib/libr.so',
  '/lib/.liborbit.so',
  '/lib/libdl.so', // overwrites/alongside real libdl
];

// ---------------------------------------------------------------------------
// HiddenWasp — Linux implant with rootkit component
// Sources: Intezer "HiddenWasp" research (May 2019)
// ---------------------------------------------------------------------------

/**
 * File paths documented in Intezer's HiddenWasp analysis.
 */
export const HIDDENWASP_FILE_ARTIFACTS: string[] = [
  '/usr/bin/iptables2',
  '/usr/bin/systembpf',
  '/usr/bin/.sshd',
  '/etc/rc3.d/.sshd',
  '/usr/local/bin/.bpf',
];

/**
 * HiddenWasp uses /etc/ld.so.preload with libselinux.so as the injected library.
 */
export const HIDDENWASP_PRELOAD_ENTRIES: string[] = ['libselinux.so'];

// ---------------------------------------------------------------------------
// Lightning Framework — Modular Linux backdoor
// Sources: ESET "Lightning Framework: New Undetected Linux Threat" (July 2022)
// ---------------------------------------------------------------------------

/**
 * File paths associated with Lightning Framework (ESET research).
 * Lightning Framework installs an SSH backdoor and a rootkit plugin.
 */
export const LIGHTNING_FRAMEWORK_FILE_ARTIFACTS: string[] = [
  '/dev/shm/f38',
  '/tmp/rsh',
  '/tmp/.plug',
  '/var/tmp/.lightning',
];

// ---------------------------------------------------------------------------
// XorDDoS — Linux botnet / DDoS implant
// Sources: Akamai, Microsoft security blog, CrowdStrike
// ---------------------------------------------------------------------------

/**
 * File artifacts created by XorDDoS samples on compromised Linux servers.
 */
export const XORDDOS_FILE_ARTIFACTS: string[] = [
  '/tmp/zbr',
  '/tmp/small.exe', // mislabeled Linux ELF
  '/lib/libgcc.so', // malicious version replacing the system library
  '/usr/bin/dpkgd', // persistence under Debian-like paths
  '/etc/cron.d/gcc.sh', // cron persistence
];

/** XorDDoS process names (masquerades as kernel threads). */
export const XORDDOS_PROCESS_NAMES: string[] = ['gcc.sh', 'dpkgd'];

// ---------------------------------------------------------------------------
// Suspicious LD_PRELOAD library basenames (cross-rootkit)
// ---------------------------------------------------------------------------

/**
 * Library basenames that, if found in /etc/ld.so.preload, are strong
 * indicators of rootkit presence.  A clean system rarely uses ld.so.preload.
 */
export const SUSPICIOUS_PRELOAD_BASENAMES: string[] = [
  'libgcc.so',
  'liblinux.so',
  'libprocesshider.so',
  'libsystemd.so',
  'libns2.so',
  'libr.so',
  'liborbit.so',
  'libdl.so', // replacing the real libdl
  'libselinux.so', // HiddenWasp
];

// ---------------------------------------------------------------------------
// Known rootkit kernel module names
// ---------------------------------------------------------------------------

/**
 * Module names to check in /proc/modules.
 * Most rootkits hide themselves, but the name may appear briefly during insmod
 * or in dmesg, and some variants don't fully hide from /proc/modules.
 */
export const KNOWN_ROOTKIT_MODULES: string[] = [
  'reptile',
  'reptile_shell',
  'diamorphine',
  'azazel',
  'beurk',
  'vlany',
  'enyelkm',
  'suckit',
  'adore',
  'rkit',
];
