/**
 * Canary File Detector
 *
 * Places or monitors "sentinel" files (canary files) in strategic directories.
 * Ransomware encrypts or deletes files indiscriminately — canary files are
 * designed to be touched first (alphabetically first, or in frequently-targeted
 * locations) so we detect encryption within milliseconds.
 *
 * Detection modes:
 *   1. POLL mode  — stat() comparison, works on any filesystem/OS, no root required
 *   2. WATCH mode — Node.js fs.watch() (inotify on Linux), < 100ms response
 *
 * Canary file characteristics:
 *   - Named to sort early alphabetically: "!ankr_canary_XXXX.doc"
 *   - Placed in commonly-targeted directories (Desktop, Documents, shared drives)
 *   - Content has a known hash — modification detected immediately
 *   - Deletion also detected (file gone = encryption-in-progress)
 *
 * On modification: score 98/100 — treat as ransomware confirmed.
 */

import { createHash, randomBytes } from 'crypto';
import { writeFileSync, statSync, readFileSync, existsSync, mkdirSync, watch, FSWatcher } from 'fs';
import { join } from 'path';

import type { RiskFactor } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanaryFile {
  /** Absolute path to the canary file */
  path: string;
  /** SHA-256 of the original content — modification detected if changed */
  hash: string;
  /** File size in bytes at creation */
  sizeBytes: number;
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
}

export interface CanaryEvent {
  /** Which canary file triggered */
  path: string;
  /** What happened */
  event: 'modified' | 'deleted' | 'hash_mismatch';
  /** When the event was detected (ms since epoch) */
  detectedAt: number;
  /** Time since canary was last verified clean (ms) */
  elapsedSinceCleanMs: number;
}

export interface CanaryResult {
  /** All registered canary files */
  canaries: CanaryFile[];
  /** Events triggered since last check */
  events: CanaryEvent[];
  /** True if any canary was touched */
  triggered: boolean;
}

// ---------------------------------------------------------------------------
// Canary file content
// ---------------------------------------------------------------------------

const CANARY_MARKER = 'ANKR-XSHIELD-CANARY-v1';

function generateCanaryContent(): { content: string; hash: string } {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = new Date().toISOString();
  const content = `${CANARY_MARKER}\nCreated: ${timestamp}\nID: ${nonce}\nThis file is a security sentinel. Do not modify or delete.\n`;
  const hash = createHash('sha256').update(content).digest('hex');
  return { content, hash };
}

function hashFile(path: string): string | null {
  try {
    const content = readFileSync(path);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null; // file deleted or unreadable
  }
}

// ---------------------------------------------------------------------------
// Canary manager
// ---------------------------------------------------------------------------

export class CanaryManager {
  private canaries: Map<string, CanaryFile> = new Map();
  private watchers: Map<string, FSWatcher> = new Map();
  private events: CanaryEvent[] = [];
  private lastCheckMs = Date.now();

  /**
   * Plant a canary file at the given path.
   * Creates the file if it doesn't exist; validates content if it does.
   */
  plant(filePath: string): CanaryFile {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const { content, hash } = generateCanaryContent();
    writeFileSync(filePath, content, 'utf-8');
    const stat = statSync(filePath);

    const canary: CanaryFile = {
      path: filePath,
      hash,
      sizeBytes: stat.size,
      createdAt: Date.now(),
    };

    this.canaries.set(filePath, canary);
    return canary;
  }

  /**
   * Register an existing file as a canary (records its current hash).
   */
  register(filePath: string): CanaryFile | null {
    if (!existsSync(filePath)) return null;
    const hash = hashFile(filePath);
    if (!hash) return null;
    const stat = statSync(filePath);
    const canary: CanaryFile = {
      path: filePath,
      hash,
      sizeBytes: stat.size,
      createdAt: Date.now(),
    };
    this.canaries.set(filePath, canary);
    return canary;
  }

  /**
   * Start fs.watch() on all registered canaries.
   * Callback fired immediately on any event.
   */
  watch(onTrigger: (event: CanaryEvent) => void): void {
    for (const [filePath, canary] of this.canaries) {
      if (this.watchers.has(filePath)) continue;

      // Watch the directory (more reliable than watching the file itself)
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      const filename = filePath.substring(filePath.lastIndexOf('/') + 1);

      try {
        const watcher = watch(dir, { persistent: false }, (_eventType, changedFile) => {
          if (changedFile !== filename) return;

          const now = Date.now();
          const currentHash = hashFile(filePath);

          let event: CanaryEvent['event'];
          if (!existsSync(filePath) || currentHash === null) {
            event = 'deleted';
          } else if (currentHash !== canary.hash) {
            event = 'hash_mismatch';
          } else {
            event = 'modified'; // stat changed but content same (timestamp touch)
          }

          const canaryEvent: CanaryEvent = {
            path: filePath,
            event,
            detectedAt: now,
            elapsedSinceCleanMs: now - this.lastCheckMs,
          };

          this.events.push(canaryEvent);
          onTrigger(canaryEvent);
        });

        this.watchers.set(filePath, watcher);
      } catch {
        // Directory doesn't exist or no permission — skip
      }
    }
  }

  /** Stop all watchers */
  unwatch(): void {
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }

  /**
   * Poll mode: check all canary files now.
   * Use when fs.watch is not available or for periodic verification.
   */
  poll(): CanaryResult {
    const events: CanaryEvent[] = [];
    const now = Date.now();

    for (const [filePath, canary] of this.canaries) {
      if (!existsSync(filePath)) {
        events.push({
          path: filePath,
          event: 'deleted',
          detectedAt: now,
          elapsedSinceCleanMs: now - this.lastCheckMs,
        });
        continue;
      }

      const currentHash = hashFile(filePath);
      if (currentHash === null || currentHash !== canary.hash) {
        events.push({
          path: filePath,
          event: currentHash === null ? 'deleted' : 'hash_mismatch',
          detectedAt: now,
          elapsedSinceCleanMs: now - this.lastCheckMs,
        });
      }
    }

    this.lastCheckMs = now;

    return {
      canaries: [...this.canaries.values()],
      events,
      triggered: events.length > 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Static check function (for one-shot use in risk engine)
// ---------------------------------------------------------------------------

/**
 * Default canary paths to check — covers commonly-targeted directories.
 * These files should be pre-planted by the Warrior agent on installation.
 */
export const DEFAULT_CANARY_PATHS = [
  join(process.env['HOME'] ?? '/root', '!ankr_canary_001.docx'),
  join(process.env['HOME'] ?? '/root', 'Documents', '!ankr_canary_002.xlsx'),
  '/tmp/.ankr_canary_003',
  '/var/ankr/.ankr_canary_004',
];

export async function checkCanaryFiles(
  paths: string[] = DEFAULT_CANARY_PATHS
): Promise<CanaryResult> {
  const manager = new CanaryManager();
  const registeredCanaries: CanaryFile[] = [];

  for (const path of paths) {
    const canary = manager.register(path);
    if (canary) registeredCanaries.push(canary);
  }

  const result = manager.poll();
  return result;
}

// ---------------------------------------------------------------------------
// Risk factor conversion
// ---------------------------------------------------------------------------

export function canaryToFactors(result: CanaryResult): RiskFactor[] {
  if (!result.triggered) return [];

  return result.events.map((event) => ({
    category: 'canary_modified' as const,
    summary: `Canary file ${event.event}: ${event.path}`,
    score: 98,
    source: 'internal' as const,
    detail: `Event: ${event.event} | Detected at: ${new Date(event.detectedAt).toISOString()} | Elapsed since clean: ${event.elapsedSinceCleanMs}ms`,
  }));
}
