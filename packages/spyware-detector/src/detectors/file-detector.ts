/**
 * FileArtifactDetector
 *
 * Checks for the presence of known spyware file artifacts on the local
 * filesystem using `fs.existsSync`.  Only paths that are statically known
 * from public threat intelligence reports are checked — no directory
 * traversal or recursive searching is performed.
 *
 * Platform handling:
 *   macOS / iOS backup paths : checked on 'darwin'
 *   Linux                    : checked on 'linux'
 *   Windows                  : Candiru artifacts checked using %TEMP% / %APPDATA%
 *                              equivalents resolved at runtime
 *
 * Confidence scoring:
 *   Exact path exists → 95 (extremely strong signal when combined with others)
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { SpywareIndicator } from '../types.js';
import { PEGASUS_FILE_ARTIFACTS } from '../iocs/pegasus-iocs.js';
import { CANDIRU_FILE_ARTIFACTS } from '../iocs/other-spyware-iocs.js';

// ---------------------------------------------------------------------------
// Internal artifact descriptor
// ---------------------------------------------------------------------------

interface FileArtifactEntry {
  /** Absolute path or basename to check. */
  path: string;
  family: 'pegasus' | 'candiru';
  description: string;
  /** Which platforms this path is relevant for. */
  platforms: Array<'darwin' | 'linux' | 'win32'>;
  /** When true, only the basename is significant — check in common temp dirs. */
  basenameOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Build the full artifact list
// ---------------------------------------------------------------------------

function buildArtifactEntries(): FileArtifactEntry[] {
  const entries: FileArtifactEntry[] = [];

  // Pegasus — all documented paths are iOS-style; on macOS we check for
  // iTunes backup residues under ~/Library and /private/var mounts.
  for (const p of PEGASUS_FILE_ARTIFACTS) {
    entries.push({
      path: p,
      family: 'pegasus',
      description: `Pegasus implant file artifact documented by Amnesty International MVT: ${p}`,
      platforms: ['darwin', 'linux'],
    });
  }

  // Candiru — Windows-centric artifacts; on non-Windows we look in temp dirs.
  for (const artifact of CANDIRU_FILE_ARTIFACTS) {
    entries.push({
      path: artifact,
      family: 'candiru',
      description: `Candiru/DevilsTongue Windows implant artifact documented by Citizen Lab: ${artifact}`,
      platforms: ['win32', 'linux', 'darwin'],
      basenameOnly: true,
    });
  }

  return entries;
}

const ARTIFACT_ENTRIES: FileArtifactEntry[] = buildArtifactEntries();

// ---------------------------------------------------------------------------
// Platform-specific search root directories
// ---------------------------------------------------------------------------

function getSearchRoots(platform: string): string[] {
  switch (platform) {
    case 'win32':
      return [
        process.env['TEMP'] ?? 'C:\\Windows\\Temp',
        process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'),
        process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'),
        'C:\\Windows\\System32',
      ];
    case 'darwin':
      return [
        tmpdir(),
        '/tmp',
        join(homedir(), 'Library', 'Caches'),
        join(homedir(), 'Library', 'Application Support'),
        '/private/var/tmp',
        '/private/var/db',
        '/private/var/mobile/Library/Caches',
      ];
    default: // linux
      return [tmpdir(), '/tmp', '/var/tmp', join(homedir(), '.cache')];
  }
}

// ---------------------------------------------------------------------------
// Detector class
// ---------------------------------------------------------------------------

export class FileArtifactDetector {
  private readonly platform: string;

  constructor(platform: string = process.platform) {
    this.platform = platform;
  }

  /**
   * Check for the existence of known spyware file artifacts.
   *
   * @returns  Array of SpywareIndicator objects for each artifact found.
   */
  scan(): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];
    const checked = new Set<string>(); // avoid duplicate indicators
    const searchRoots = getSearchRoots(this.platform);

    for (const entry of ARTIFACT_ENTRIES) {
      // Skip entries not relevant to the current platform
      if (!entry.platforms.includes(this.platform as 'darwin' | 'linux' | 'win32')) {
        continue;
      }

      if (entry.basenameOnly) {
        // Search in common temp/app directories for the basename
        for (const root of searchRoots) {
          const fullPath = join(root, entry.path);
          if (checked.has(fullPath)) continue;
          checked.add(fullPath);

          try {
            if (existsSync(fullPath)) {
              indicators.push(this.makeIndicator(entry, fullPath));
            }
          } catch {
            // Permission denied — skip silently
          }
        }
      } else {
        // Absolute path check
        if (checked.has(entry.path)) continue;
        checked.add(entry.path);

        try {
          if (existsSync(entry.path)) {
            indicators.push(this.makeIndicator(entry, entry.path));
          }
        } catch {
          // Permission denied — skip silently
        }
      }
    }

    return indicators;
  }

  private makeIndicator(
    entry: FileArtifactEntry,
    resolvedPath: string
  ): SpywareIndicator {
    return {
      id: randomUUID(),
      family: entry.family,
      type: 'file_artifact',
      value: resolvedPath,
      description: entry.description,
      confidence: 95,
    };
  }
}
