/**
 * YARA Detector — Binary pattern matching for Linux malware
 *
 * Uses the `yara` CLI binary (v4+) to match bundled YARA rules against:
 *   1. Staging directories: /tmp, /dev/shm, /var/tmp (recursive)
 *   2. Known IOC artifact paths from our rootkit IOC database
 *   3. Caller-supplied additional paths
 *
 * If the `yara` binary is not installed, the detector silently returns [].
 * Install: apt install yara  (Debian/Ubuntu)
 *          brew install yara (macOS)
 *
 * Rules derived from public security research — see yara-rules.ts for sources.
 */

import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import type { SpywareIndicator } from '../types.js';
import { BUNDLED_YARA_RULES, RULE_METADATA } from '../yara-rules.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Default scan targets
// ---------------------------------------------------------------------------

/** Writable staging directories commonly used by malware. Scanned recursively. */
const STAGING_DIRS = ['/tmp', '/dev/shm', '/var/tmp'];

/** Specific artifact paths known from rootkit IOC research. Scanned directly. */
const KNOWN_IOC_FILES = [
  // BPFDoor
  '/var/run/initd.lock',
  '/dev/shm/kdmtmpflush',
  '/dev/shm/rpscheck',
  '/dev/shm/.init',
  '/var/run/haldrund.pid',
  // Reptile
  '/proc/reptile',
  // OrBit
  '/lib/libr.so',
  '/lib/.liborbit.so',
  // HiddenWasp
  '/usr/bin/iptables2',
  '/usr/bin/systembpf',
  '/usr/bin/.sshd',
  // Lightning Framework
  '/dev/shm/f38',
  '/tmp/rsh',
  '/tmp/.plug',
  '/var/tmp/.lightning',
  // XorDDoS
  '/tmp/zbr',
  '/usr/bin/dpkgd',
  '/etc/cron.d/gcc.sh',
];

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface YaraMatch {
  rule: string;
  file: string;
}

// ---------------------------------------------------------------------------
// YaraDetector
// ---------------------------------------------------------------------------

export class YaraDetector {
  private yaraAvailable: boolean | null = null;
  private yaraCmd = 'yara';

  // ------------------------------------------------------------------
  // Binary availability check (cached after first call)
  // ------------------------------------------------------------------

  private async checkYaraAvailable(): Promise<boolean> {
    if (this.yaraAvailable !== null) return this.yaraAvailable;

    for (const candidate of ['yara', '/usr/bin/yara', '/usr/local/bin/yara']) {
      try {
        await execFileAsync(candidate, ['--version'], { timeout: 5_000 });
        this.yaraCmd = candidate;
        this.yaraAvailable = true;
        return true;
      } catch {
        /* try next */
      }
    }

    this.yaraAvailable = false;
    return false;
  }

  // ------------------------------------------------------------------
  // Low-level yara invocation helpers
  // ------------------------------------------------------------------

  private parseYaraOutput(stdout: string): YaraMatch[] {
    const matches: YaraMatch[] = [];
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx === -1) continue;
      matches.push({
        rule: trimmed.slice(0, spaceIdx),
        file: trimmed.slice(spaceIdx + 1),
      });
    }
    return matches;
  }

  /** Scan a single file with YARA rules. */
  private async scanFile(rulesFile: string, filePath: string): Promise<YaraMatch[]> {
    try {
      const { stdout } = await execFileAsync(this.yaraCmd, ['--no-warnings', rulesFile, filePath], {
        timeout: 15_000,
        maxBuffer: 512 * 1024,
      });
      return this.parseYaraOutput(stdout);
    } catch {
      return [];
    }
  }

  /** Scan a directory recursively with YARA rules. */
  private async scanDir(rulesFile: string, dir: string): Promise<YaraMatch[]> {
    try {
      const { stdout } = await execFileAsync(
        this.yaraCmd,
        ['--no-warnings', '--recursive', rulesFile, dir],
        { timeout: 45_000, maxBuffer: 1024 * 1024 }
      );
      return this.parseYaraOutput(stdout);
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------
  // Public scan method
  // ------------------------------------------------------------------

  /**
   * Run YARA rules against staging directories, known IOC paths, and any
   * caller-supplied extra paths.
   *
   * Returns [] immediately if:
   *   - Platform is not Linux
   *   - `yara` binary is not installed
   */
  async scan(extraPaths?: string[]): Promise<SpywareIndicator[]> {
    if (process.platform !== 'linux') return [];
    if (!(await this.checkYaraAvailable())) return [];

    const rulesFile = join(tmpdir(), `xshield-yara-${Date.now()}.yar`);
    const indicators: SpywareIndicator[] = [];
    const seen = new Set<string>();

    try {
      writeFileSync(rulesFile, BUNDLED_YARA_RULES, 'utf8');

      const allMatches: YaraMatch[] = [];

      // 1. Recursive scan of staging directories
      for (const dir of STAGING_DIRS) {
        if (!existsSync(dir)) continue;
        const matches = await this.scanDir(rulesFile, dir);
        allMatches.push(...matches);
      }

      // 2. Direct scan of specific IOC artifact paths
      const filePaths = [...KNOWN_IOC_FILES, ...(extraPaths ?? [])].filter((p) => {
        try {
          return existsSync(p) && statSync(p).isFile();
        } catch {
          return false;
        }
      });

      for (const file of filePaths) {
        const matches = await this.scanFile(rulesFile, file);
        allMatches.push(...matches);
      }

      // 3. Convert to SpywareIndicator, deduplicate
      for (const match of allMatches) {
        const key = `${match.rule}:${match.file}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const meta = RULE_METADATA[match.rule];
        if (!meta) continue; // unknown rule — skip

        indicators.push({
          id: randomUUID(),
          family: meta.family,
          type: 'yara_match',
          value: `YARA:${match.rule} @ ${match.file}`,
          description: `${meta.description} — YARA rule '${match.rule}' matched in '${match.file}'.`,
          confidence: meta.confidence,
        });
      }
    } finally {
      try {
        unlinkSync(rulesFile);
      } catch {
        /* temp file already gone — fine */
      }
    }

    return indicators;
  }

  /** Returns true if the yara binary is available on this system. */
  async isAvailable(): Promise<boolean> {
    return this.checkYaraAvailable();
  }
}
