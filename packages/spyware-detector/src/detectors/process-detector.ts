/**
 * ProcessDetector
 *
 * Enumerates running processes using platform-native CLI tools and checks
 * the process list against known spyware process name signatures.
 *
 * Platform commands used:
 *   macOS / Linux : `ps aux`
 *   Windows       : `tasklist /fo csv`
 *
 * Confidence scoring:
 *   Exact process name match → 85
 *   Substring match          → 60
 *
 * All subprocess calls are wrapped in try/catch; a failure to list processes
 * (e.g., due to permission constraints) results in an empty indicator array
 * rather than an error propagating upward.
 */

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { SpywareIndicator } from '../types.js';
import { PEGASUS_PROCESS_NAMES } from '../iocs/pegasus-iocs.js';
import {
  FINFISHER_PROCESS_NAMES,
  HERMIT_PACKAGE_NAMES,
} from '../iocs/other-spyware-iocs.js';

// ---------------------------------------------------------------------------
// Internal signature table
// ---------------------------------------------------------------------------

interface ProcessSignature {
  name: string;
  family: 'pegasus' | 'finfisher' | 'hermit';
  description: string;
}

const PROCESS_SIGNATURES: ProcessSignature[] = [
  ...PEGASUS_PROCESS_NAMES.map((name) => ({
    name,
    family: 'pegasus' as const,
    description: `Process name associated with the Pegasus spyware implant (Amnesty International / Lookout research)`,
  })),
  ...FINFISHER_PROCESS_NAMES.map((name) => ({
    name,
    family: 'finfisher' as const,
    description: `Process name associated with FinFisher/FinSpy (Citizen Lab / ESET research)`,
  })),
  ...HERMIT_PACKAGE_NAMES.map((name) => ({
    name,
    family: 'hermit' as const,
    description: `Android package/process name associated with the Hermit spyware (Google TAG / Lookout research)`,
  })),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retrieve the raw process list string for the current platform. */
function getRawProcessList(platform: string): string {
  if (platform === 'win32') {
    return execSync('tasklist /fo csv', { timeout: 10_000 }).toString('utf8');
  }
  // macOS + Linux
  return execSync('ps aux', { timeout: 10_000 }).toString('utf8');
}

/**
 * Parse a process listing into an array of individual command-line tokens.
 * We flatten everything to lower-case for case-insensitive matching.
 */
function parseProcessTokens(raw: string): string[] {
  return raw
    .split('\n')
    .flatMap((line) => line.split(/\s+/))
    .map((tok) => tok.toLowerCase().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Detector class
// ---------------------------------------------------------------------------

export class ProcessDetector {
  private readonly platform: string;

  constructor(platform: string = process.platform) {
    this.platform = platform;
  }

  /**
   * Enumerate running processes and match against spyware signatures.
   *
   * @returns  Array of matched SpywareIndicator objects.  Empty array if the
   *           process list cannot be obtained or no matches are found.
   */
  scan(): SpywareIndicator[] {
    let rawList: string;

    try {
      rawList = getRawProcessList(this.platform);
    } catch {
      // Insufficient permissions, container sandbox, or unsupported platform.
      return [];
    }

    const tokens = parseProcessTokens(rawList);
    const indicators: SpywareIndicator[] = [];
    const seen = new Set<string>(); // avoid duplicate indicators per signature

    for (const sig of PROCESS_SIGNATURES) {
      if (seen.has(sig.name)) continue;

      const sigLower = sig.name.toLowerCase();

      // Check for exact token match first (highest confidence)
      const exactMatch = tokens.includes(sigLower);
      if (exactMatch) {
        indicators.push({
          id: randomUUID(),
          family: sig.family,
          type: 'process_name',
          value: sig.name,
          description: sig.description,
          confidence: 85,
        });
        seen.add(sig.name);
        continue;
      }

      // Fallback: substring match anywhere in the raw output
      const substringMatch = rawList.toLowerCase().includes(sigLower);
      if (substringMatch) {
        indicators.push({
          id: randomUUID(),
          family: sig.family,
          type: 'process_name',
          value: sig.name,
          description: `${sig.description} (substring match — verify manually)`,
          confidence: 60,
        });
        seen.add(sig.name);
      }
    }

    return indicators;
  }

  /**
   * Attempt to read /proc/*/cmdline on Linux for a deeper process scan.
   * Returns an empty array on any error (not all systems expose /proc).
   */
  scanProcFs(): SpywareIndicator[] {
    if (this.platform !== 'linux') return [];

    let procOutput = '';
    try {
      // Read all cmdline files under /proc — silently skip unreadable entries
      procOutput = execSync(
        "find /proc -maxdepth 2 -name cmdline 2>/dev/null | xargs -r strings 2>/dev/null | tr '\\0' ' '",
        { timeout: 15_000 }
      ).toString('utf8');
    } catch {
      return [];
    }

    const indicators: SpywareIndicator[] = [];
    const seen = new Set<string>();

    for (const sig of PROCESS_SIGNATURES) {
      if (seen.has(sig.name)) continue;
      if (procOutput.toLowerCase().includes(sig.name.toLowerCase())) {
        indicators.push({
          id: randomUUID(),
          family: sig.family,
          type: 'process_name',
          value: sig.name,
          description: `${sig.description} (detected via /proc/cmdline)`,
          confidence: 80,
        });
        seen.add(sig.name);
      }
    }

    return indicators;
  }
}
