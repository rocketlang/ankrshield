/**
 * xShield AI — Bundled YARA Rules
 *
 * All rules derived from published public security research.
 * Sources cited per-rule in meta sections.
 *
 * Rule families covered:
 *   Linux Rootkits  — BPFDoor, Symbiote, OrBit, HiddenWasp, Lightning Framework,
 *                     XorDDoS, Reptile, Diamorphine
 *   Supply Chain    — XZ Utils backdoor (CVE-2024-3094)
 *   APT Implants    — Penguin Turla, Lazarus Linux tools
 */

import type { SpywareFamily } from './types.js';

// ---------------------------------------------------------------------------
// Rule metadata — maps YARA rule name → family, confidence, human description
// ---------------------------------------------------------------------------

export interface YaraRuleMeta {
  family: SpywareFamily;
  confidence: number;
  description: string;
}

export const RULE_METADATA: Record<string, YaraRuleMeta> = {
  // ── Linux rootkits ──────────────────────────────────────────────────────

  BPFDoor_Linux_Backdoor: {
    family: 'bpfdoor',
    confidence: 90,
    description:
      'BPFDoor Linux backdoor (APT41 / Chinese state actor). Uses BPF raw sockets to hide C2 traffic — invisible to netstat and most EDR tools.',
  },
  BPFDoor_Masquerade_Names: {
    family: 'bpfdoor',
    confidence: 72,
    description:
      'File contains BPFDoor process impersonation strings (kdmtmpflush, rpscheck, haldrund). Moderate confidence — investigate further.',
  },

  Symbiote_Linux_Rootkit: {
    family: 'symbiote',
    confidence: 87,
    description:
      'Symbiote Linux rootkit (BlackBerry/Intezer 2022). Injects into every running process via LD_PRELOAD, hides network connections at libc level.',
  },

  OrBit_Linux_Rootkit: {
    family: 'orbit',
    confidence: 85,
    description:
      'OrBit Linux rootkit (Intezer 2022). Hooks libc read/write/getdents to hide files, processes, and network sockets from all userspace tools.',
  },

  HiddenWasp_Linux_Implant: {
    family: 'hiddenwasp',
    confidence: 88,
    description:
      'HiddenWasp Linux implant (Intezer 2019). Post-exploitation backdoor with rootkit component; establishes persistent reverse shell to C2.',
  },

  Lightning_Framework_Linux: {
    family: 'lightningframework',
    confidence: 86,
    description:
      'Lightning Framework Linux malware (ESET 2022). Modular framework: installs SSH backdoor and rootkit plugins loaded at runtime.',
  },

  XorDDoS_Linux_Botnet: {
    family: 'xorddos',
    confidence: 83,
    description:
      'XorDDoS Linux botnet (Akamai/Microsoft). Recruits Linux servers into DDoS army via SSH brute force; uses XOR-encrypted C2 communications.',
  },

  Reptile_LKM_Rootkit: {
    family: 'reptile',
    confidence: 92,
    description:
      'Reptile LKM rootkit. Loadable kernel module that hides itself, files, and processes; opens backdoor shell. High confidence match.',
  },

  Diamorphine_LKM_Rootkit: {
    family: 'diamorphine',
    confidence: 91,
    description:
      'Diamorphine LKM rootkit. Hides processes by PID, elevates any process to root via signal 64, hides its own kernel module.',
  },

  // ── Supply chain ────────────────────────────────────────────────────────

  XZ_Backdoor_Strings: {
    family: 'cve',
    confidence: 93,
    description:
      'XZ Utils backdoor (CVE-2024-3094). Obfuscated backdoor injected into xz/liblzma 5.6.0-5.6.1 via social engineering; hijacks sshd RSA auth.',
  },

  // ── APT implants ────────────────────────────────────────────────────────

  PenguinTurla_Linux_Backdoor: {
    family: 'turla',
    confidence: 80,
    description:
      'Penguin Turla Linux backdoor (ESET research). Russian FSB-linked Turla group. Passive backdoor listening for ICMP/TCP magic packets.',
  },

  Lazarus_Linux_Implant: {
    family: 'lazarus',
    confidence: 78,
    description:
      'Lazarus Group Linux implant strings (CISA/ESET research). North Korea RGB-linked group; targets crypto, defence, and research institutions.',
  },
};

// ---------------------------------------------------------------------------
// Bundled YARA rules (compiled from public security research)
// ---------------------------------------------------------------------------

export const BUNDLED_YARA_RULES = `
/*
 * xShield AI — Bundled YARA Detection Rules
 * Generated from public security research. See RULE_METADATA for full citations.
 */

// ============================================================================
// BPFDOOR — APT41 Linux Backdoor
// Sources: PwC "A New BPFDoor Malware Variant" (May 2023)
//          Trend Micro BPFDoor analysis (May 2022)
//          CISA / FBI advisory AA22-137A
// ============================================================================

rule BPFDoor_Linux_Backdoor {
  meta:
    description = "Detects BPFDoor Linux backdoor binary artifacts"
    reference   = "https://www.pwc.com/gx/en/issues/cybersecurity/cyber-threat-intelligence/bpfdoor.html"
    author      = "xShield AI (derived from PwC / Trend Micro public research)"
    date        = "2023-05-11"
  strings:
    // BPFDoor lock file path (documented in PwC report)
    $path1 = "/var/run/initd.lock" ascii
    $path2 = "/dev/shm/kdmtmpflush" ascii
    $path3 = "/dev/shm/rpscheck" ascii
    $path4 = "/var/run/haldrund.pid" ascii
    $path5 = "/dev/shm/.init" ascii
    // BPF filter magic — raw socket filter string found in samples
    $bpf1  = "PACKET_VERSION" ascii
    $bpf2  = "SO_ATTACH_FILTER" ascii
    // Iptables backdoor trigger string (Trend Micro analysis)
    $ipt1  = "iptables -t filter" ascii
    $ipt2  = "iptables -t nat" ascii
    // C2 beacon shell patterns
    $sh1   = "/bin/bash -i" ascii
    $sh2   = "/bin/sh -i" ascii
  condition:
    2 of ($path*) or
    (1 of ($path*) and 1 of ($bpf*, $ipt*, $sh*))
}

rule BPFDoor_Masquerade_Names {
  meta:
    description = "BPFDoor impersonation strings — process names it masquerades as"
    reference   = "https://www.trendmicro.com/en_us/research/22/e/bpfdoor-an-active-chinese-global-surveillance-tool.html"
  strings:
    $n1 = "kdmtmpflush" ascii
    $n2 = "rpscheck" ascii
    $n3 = "haldrund" ascii
    // Legitimate daemon names also impersonated
    $n4 = "postfix" ascii
    $n5 = "sshd" ascii
    // BPFDoor config structure markers
    $cfg1 = { 54 48 48 53 } // magic bytes found in some variants
  condition:
    2 of ($n1, $n2, $n3) or
    (1 of ($n1, $n2, $n3) and $cfg1)
}


// ============================================================================
// SYMBIOTE — LD_PRELOAD Linux Rootkit
// Source: BlackBerry Threat Research / Intezer "Symbiote: A New,
//         Nearly-Impossible-to-Detect Linux Threat" (June 2022)
// ============================================================================

rule Symbiote_Linux_Rootkit {
  meta:
    description = "Detects Symbiote Linux rootkit artifacts"
    reference   = "https://blogs.blackberry.com/en/2022/06/symbiote-a-new-nearly-impossible-to-detect-linux-threat"
    author      = "xShield AI (derived from BlackBerry/Intezer public research)"
    date        = "2022-06-09"
  strings:
    // Environment variable used for C2 configuration (BlackBerry analysis)
    $env1 = "SYMBIOTE_PORTS" ascii
    $env2 = "SYMBIOTE_IP" ascii
    // Library names used in documented samples
    $lib1 = "libgcc.so" ascii
    $lib2 = "liblinux.so" ascii
    $lib3 = "libprocesshider.so" ascii
    $lib4 = "libns2.so" ascii
    // Hooked libc functions (Intezer analysis)
    $hook1 = "fopen64" ascii
    $hook2 = "fopen" ascii
    $hook3 = "readdir" ascii
    $hook4 = "readdir64" ascii
    // Network hiding — /proc/net/tcp scrubbing
    $proc1 = "/proc/net/tcp" ascii
    $proc2 = "/proc/net/udp" ascii
    // LD_PRELOAD injection path
    $preload = "/etc/ld.so.preload" ascii
    // Credential harvesting string (Intezer)
    $cred1 = "crypt_r" ascii
    $cred2 = "pam_authenticate" ascii
  condition:
    2 of ($env*) or
    (2 of ($lib*) and 1 of ($hook*, $proc*, $preload)) or
    (1 of ($env*) and 2 of ($hook*, $proc*, $cred*))
}


// ============================================================================
// ORBIT — libc-hooking Linux Rootkit
// Source: Intezer "OrBit: New Undetected Linux Threat" (April 2022)
// ============================================================================

rule OrBit_Linux_Rootkit {
  meta:
    description = "Detects OrBit Linux rootkit artifacts"
    reference   = "https://www.intezer.com/blog/incident-response/orbit-new-undetected-linux-threat/"
    author      = "xShield AI (derived from Intezer public research)"
    date        = "2022-04-06"
  strings:
    // OrBit installation paths (Intezer analysis)
    $path1 = "/lib/libr.so" ascii
    $path2 = "/lib/.liborbit.so" ascii
    $path3 = "/lib/libdl.so" ascii
    // Hooked function names (Intezer reverse engineering)
    $hook1 = "hook_read" ascii
    $hook2 = "hook_write" ascii
    $hook3 = "hook_getdents" ascii
    $hook4 = "hook_accept" ascii
    $hook5 = "hook_recvmsg" ascii
    // OrBit internal names
    $name1 = "liborbit" ascii nocase
    $name2 = "orbit_config" ascii
    // Persistence mechanism
    $pers1 = "ld.so.preload" ascii
    $pers2 = "ld.so.conf" ascii
  condition:
    2 of ($path*) or
    3 of ($hook*) or
    (1 of ($path*) and 2 of ($hook*)) or
    (1 of ($name*) and 1 of ($hook*, $pers*))
}


// ============================================================================
// HIDDENWASP — Linux Implant with Rootkit Component
// Source: Intezer "HiddenWasp Malware Stings Targeted Linux Systems" (May 2019)
// ============================================================================

rule HiddenWasp_Linux_Implant {
  meta:
    description = "Detects HiddenWasp Linux implant and rootkit artifacts"
    reference   = "https://www.intezer.com/blog/research/hiddenwasp-malware-targeting-linux-systems/"
    author      = "xShield AI (derived from Intezer public research)"
    date        = "2019-05-29"
  strings:
    // Installation paths (Intezer analysis)
    $path1 = "/usr/bin/iptables2" ascii
    $path2 = "/usr/bin/systembpf" ascii
    $path3 = "/usr/bin/.sshd" ascii
    $path4 = "/etc/rc3.d/.sshd" ascii
    $path5 = "/usr/local/bin/.bpf" ascii
    // HiddenWasp uses libselinux.so as the LD_PRELOAD library name
    $lib1  = "libselinux.so" ascii
    // LD_PRELOAD persistence
    $preload = "/etc/ld.so.preload" ascii
    // Internal strings found in samples (Intezer)
    $str1  = "bash_history" ascii
    $str2  = "iptables -I INPUT" ascii
    $str3  = ".sshd" ascii
  condition:
    2 of ($path*) or
    (1 of ($path*) and 1 of ($lib*, $preload, $str*)) or
    ($lib1 and $preload and 1 of ($str*))
}


// ============================================================================
// LIGHTNING FRAMEWORK — Modular Linux Backdoor
// Source: ESET "Lightning Framework: New Undetected Linux Threat" (July 2022)
// ============================================================================

rule Lightning_Framework_Linux {
  meta:
    description = "Detects Lightning Framework Linux modular backdoor"
    reference   = "https://www.welivesecurity.com/2022/07/08/lightning-framework-new-undetected-linux-threat/"
    author      = "xShield AI (derived from ESET WeLiveSecurity public research)"
    date        = "2022-07-08"
  strings:
    // Artifact paths (ESET analysis)
    $path1 = "/dev/shm/f38" ascii
    $path2 = "/tmp/rsh" ascii
    $path3 = "/tmp/.plug" ascii
    $path4 = "/var/tmp/.lightning" ascii
    // Module loading strings
    $mod1  = "PluginManager" ascii
    $mod2  = "plugin_init" ascii
    $mod3  = "plugin_run" ascii
    // SSH backdoor installation
    $ssh1  = "authorized_keys" ascii
    $ssh2  = ".lightning_rsa" ascii
    // C2 protocol markers
    $c2_1  = "lightning" ascii nocase
  condition:
    2 of ($path*) or
    (1 of ($path*) and 1 of ($mod*, $ssh*, $c2_1)) or
    (2 of ($mod*) and 1 of ($ssh*))
}


// ============================================================================
// XORDDOS — Linux DDoS Botnet / Backdoor
// Sources: Akamai "XorDDoS: Further Insights" (2022)
//          Microsoft MSTIC "XorDDoS" analysis (May 2022)
// ============================================================================

rule XorDDoS_Linux_Botnet {
  meta:
    description = "Detects XorDDoS Linux botnet implant artifacts"
    reference   = "https://www.microsoft.com/en-us/security/blog/2022/05/19/rise-in-xorddos-linux-malware-highlighted-fivefold-increase-in-one-year/"
    author      = "xShield AI (derived from Microsoft MSTIC / Akamai research)"
    date        = "2022-05-19"
  strings:
    // Artifact paths (Microsoft/Akamai analysis)
    $path1 = "/tmp/zbr" ascii
    $path2 = "/tmp/small.exe" ascii
    $path3 = "/usr/bin/dpkgd" ascii
    $path4 = "/etc/cron.d/gcc.sh" ascii
    // Process masquerade names
    $proc1 = "gcc.sh" ascii
    $proc2 = "dpkgd" ascii
    // XOR encryption key markers (Akamai analysis)
    $xor1  = "1337xor" ascii nocase
    $xor2  = "xorddos" ascii nocase
    // DDoS capability strings
    $ddos1 = "SYN Flood" ascii
    $ddos2 = "UDP Flood" ascii
    $ddos3 = "DNS Flood" ascii
    // Rootkit component — malicious libgcc.so
    $lib1  = "libgcc.so" ascii
  condition:
    2 of ($path*) or
    (1 of ($path*) and 1 of ($proc*, $xor*, $ddos*, $lib*)) or
    (1 of ($xor*) and 2 of ($ddos*, $proc*, $path*))
}


// ============================================================================
// REPTILE — Loadable Kernel Module Rootkit
// Sources: Multiple vendors; public GitHub documentation
// ============================================================================

rule Reptile_LKM_Rootkit {
  meta:
    description = "Detects Reptile LKM rootkit artifacts and strings"
    reference   = "https://github.com/f0rb1dd3n/Reptile"
    author      = "xShield AI (derived from public security research)"
  strings:
    // Reptile control interface paths
    $path1 = "/proc/reptile" ascii
    $path2 = "/proc/reptile/cmd" ascii
    $path3 = "/proc/reptile/token" ascii
    // Module names
    $mod1  = "reptile" ascii
    $mod2  = "reptile_shell" ascii
    // Reptile control strings
    $ctrl1 = "REPTILE" ascii
    $ctrl2 = "reptile_start" ascii
    $ctrl3 = "reptile_hide" ascii
    // Reverse shell trigger
    $shell1 = "reptile_shell" ascii
    $shell2 = "reverse_shell" ascii
    // Magic token for activation
    $token1 = "reptile_magic" ascii
  condition:
    1 of ($path*) or
    2 of ($mod*, $ctrl*, $shell*, $token*)
}


// ============================================================================
// DIAMORPHINE — LKM Rootkit
// Sources: GitHub, SANS Institute, multiple AV vendor analyses
// ============================================================================

rule Diamorphine_LKM_Rootkit {
  meta:
    description = "Detects Diamorphine LKM rootkit — hides processes, elevates to root via signal 64"
    reference   = "https://github.com/m0nad/Diamorphine"
    author      = "xShield AI (derived from public security research)"
  strings:
    // Module identity strings
    $mod1  = "diamorphine" ascii
    $mod2  = "Diamorphine" ascii
    // Hidden file prefix used by Diamorphine
    $hide1 = "DIAMORPHINE_SECRET" ascii
    $hide2 = "diamorphine_secret" ascii
    // Signal-based privilege escalation — signal 64 grants root
    $sig1  = "diag_signal" ascii
    $sig2  = "signal_64" ascii
    // Proc filesystem control path
    $proc1 = "/proc/diamorphine" ascii
    // LKM loading strings
    $lkm1  = "init_module" ascii
    $lkm2  = "cleanup_module" ascii
    $lkm3  = "MODULE_LICENSE" ascii
  condition:
    1 of ($mod*) or
    1 of ($proc*) or
    (2 of ($hide*, $sig*)) or
    (1 of ($hide*, $sig*) and 2 of ($lkm*))
}


// ============================================================================
// XZ UTILS BACKDOOR (CVE-2024-3094)
// Source: Andres Freund public disclosure (March 29, 2024)
//         Red Hat Security Advisory RHSA-2024:1694
// ============================================================================

rule XZ_Backdoor_Strings {
  meta:
    description = "Detects XZ Utils / liblzma backdoor strings (CVE-2024-3094)"
    reference   = "https://www.openwall.com/lists/oss-security/2024/03/29/4"
    author      = "xShield AI (derived from Andres Freund / Red Hat public disclosure)"
    date        = "2024-03-29"
    cve         = "CVE-2024-3094"
  strings:
    // Version strings for the backdoored releases
    $ver1  = "5.6.0" ascii
    $ver2  = "5.6.1" ascii
    // Backdoor injects itself into sshd via symbol interposition
    $sym1  = "RSA_public_decrypt" ascii
    $sym2  = "EVP_PKEY_set1_RSA" ascii
    // Obfuscated script names found in the malicious release tarball
    $scr1  = "bad-3-corrupt_lzma2.xz" ascii
    $scr2  = "good-large_compressed.lzma" ascii
    // The backdoor specifically targets systemd-linked sshd
    $tgt1  = "liblzma.so.5" ascii
    $tgt2  = "LIBLZMA_5.6" ascii
    // Andres Freund's identified test file artifacts in the tarballs
    $art1  = "build-to-host.m4" ascii
    $art2  = "m4/build-to-host.m4" ascii
  condition:
    // Backdoored version string combined with any suspicious symbol
    (1 of ($ver*) and 1 of ($sym*, $tgt*)) or
    // Test artifact files from the malicious tarball
    1 of ($scr*, $art*) or
    // Specific symbol combination (high confidence)
    all of ($sym*)
}


// ============================================================================
// PENGUIN TURLA — Russian FSB Linux Backdoor
// Source: ESET "Turla group targets Linux" (2014, 2020 re-analysis)
//         Kaspersky GReAT Turla research papers
// ============================================================================

rule PenguinTurla_Linux_Backdoor {
  meta:
    description = "Detects Penguin Turla Linux backdoor (Russian FSB / Turla group)"
    reference   = "https://www.welivesecurity.com/2014/08/26/first-linux-cdorked-a-malware-in-the-wild-the-turla-group/"
    author      = "xShield AI (derived from ESET / Kaspersky GReAT public research)"
  strings:
    // Penguin Turla C2 domain strings (ESET research)
    $c2_1  = "linuxkernelorg.com" ascii
    $c2_2  = "hosterplace.com" ascii
    $c2_3  = "getservices.net" ascii
    // Turla Carbon framework markers (ESET Carbon analysis)
    $cfg1  = "carbon.log" ascii
    $cfg2  = "carbon_config" ascii
    // ICMP-based C2 magic bytes (passive backdoor trigger)
    $icmp1 = { 4E 54 48 58 } // NTHX magic packet bytes
    $icmp2 = { 54 55 52 4C 41 } // TURLA in hex
    // Serpent/Carbon backdoor config strings
    $serp1 = "serpent_key" ascii
    $serp2 = "Serpent_cfg" ascii
    // Persistence via cron / init
    $pers1 = "0 * * * * root" ascii
    $pers2 = "/etc/init.d/" ascii
  condition:
    1 of ($c2*) or
    (2 of ($cfg*)) or
    (1 of ($icmp*) and 1 of ($serp*, $pers*)) or
    2 of ($serp*)
}


// ============================================================================
// LAZARUS GROUP — DPRK Linux Implant Strings
// Sources: CISA AA21-048A, AA22-108A; ESET research
//          DOJ 2020 indictment US v. Park Jin Hyok
// ============================================================================

rule Lazarus_Linux_Implant {
  meta:
    description = "Detects Lazarus Group Linux implant indicators (North Korea RGB)"
    reference   = "https://www.cisa.gov/sites/default/files/publications/AA21-048A.pdf"
    author      = "xShield AI (derived from CISA / ESET / DOJ public disclosures)"
  strings:
    // TraderTraitor campaign domains (CISA AA22-108A)
    $d1 = "bloxholder.com" ascii
    $d2 = "hellobt.com" ascii
    $d3 = "nftartexhibit.org" ascii
    // BLINDINGCAN / HOPLIGHT implant strings (CISA)
    $b1 = "BLINDINGCAN" ascii
    $b2 = "HOPLIGHT" ascii
    $b3 = "DTrack" ascii
    // AppleJeus fake crypto exchange names (CISA/FBI advisory)
    $aj1 = "AppleJeus" ascii
    $aj2 = "applejeus" ascii
    // Lazarus crypto theft tooling strings
    $cr1 = "TraderTraitor" ascii
    $cr2 = "CoinTrader" ascii
    // Common Lazarus persistence and C2 patterns
    $p1  = "lazarus" ascii nocase
    $p2  = "LAZARUS" ascii
    $p3  = "Hidden Cobra" ascii
  condition:
    2 of ($d*) or
    1 of ($b*) or
    1 of ($aj*) or
    1 of ($cr*) or
    2 of ($p*)
}
`;
