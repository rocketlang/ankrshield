// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — key-on-disk scanner (ASD-T-036 / INF-ASD-002)
//
// Implements the LOGICS-declared INF-ASD-002 inference: "If API key found
// on disk, then migrate to keychain." Spec verbatim:
//
//   IF startup_scan finds (env file | electron-store | any user-writable path)
//      containing a string matching /^(sk-ant-|sk-)[A-Za-z0-9_-]{20,}/
//   THEN show migration dialog
//   AND on user-confirm: move secret to OS keychain, zero the source file
//   AND log.warn('ASD-003: migrated plaintext key from ' + path)
//   RESULT: no plaintext keys persist; user sees what moved and from where
//
// This module is the SCAN half. The MIGRATE half lives in
// key-on-disk-migrator.ts (per-finding atomic backup → keychain write →
// source rewrite). Splitting keeps the read path pure and per-finding
// migration explicit + user-confirmed.
//
// Safety stance:
//   - We never auto-migrate. Findings are surfaced; the user must
//     consent per-key via ConsentDialog.
//   - We touch only WELL-KNOWN HOST paths (env / shell rc / AWS creds /
//     electron-store), never arbitrary user files.
//   - Findings carry filename + line number + the FIRST 8 CHARS of the
//     matched key (never the full secret) so the renderer can show
//     "sk-ant-abc…" without re-leaking what we're trying to protect.
//   - File reads are best-effort: permission denied / not-exist → skip
//     silently. We must never crash the proxy because we couldn't read
//     someone's home directory.
//
// @rule:INF-ASD-002 — startup scan + migration prompt for plaintext keys.
// @rule:ASD-003 — keys belong in the OS keychain, not on disk.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Anchored to start-of-token to avoid matching IDs that happen to contain "sk-". */
export const KEY_PATTERN = /\b(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})\b/;

/**
 * The well-known paths we will scan. Order is stable so the renderer can
 * group findings deterministically. Override via opts.paths for tests.
 */
export function defaultScanPaths(home = homedir()): string[] {
  return [
    join(home, '.env'),
    join(home, '.env.local'),
    join(home, '.bashrc'),
    join(home, '.bash_profile'),
    join(home, '.zshrc'),
    join(home, '.profile'),
    join(home, '.aws', 'credentials'),
    join(home, '.config', 'ankrshield', 'electron-store.json'),
    join(home, '.anthropic', 'config'),
    join(home, '.openai', 'config'),
  ];
}

export type KeyProvider = 'anthropic' | 'openai' | 'unknown';

export interface KeyFinding {
  /** Absolute path of the file the key was found in. */
  path: string;
  /** 1-based line number. */
  line: number;
  /**
   * Provider inferred from the prefix. 'sk-ant-' → anthropic, 'sk-' →
   * openai (the OpenAI legacy + Project key shape), other → unknown.
   */
  provider: KeyProvider;
  /**
   * First 8 chars of the matched secret — enough to identify, never enough
   * to re-leak. e.g. "sk-ant-a" or "sk-proj-".
   */
  preview: string;
  /** Stable id derived from (path, line, sha256-prefix). Used by IPC. */
  finding_id: string;
}

export interface ScanOptions {
  /** Override path list (tests). */
  paths?: string[];
  /** Override file reader (tests). Returns null on miss. */
  readImpl?: (path: string) => Promise<string | null>;
}

/**
 * Walk the configured path list, read each file, regex-scan line-by-line,
 * return findings. Never throws — read errors are silently skipped.
 *
 * Idempotent: scanning twice over an unchanged filesystem yields the
 * same finding_ids. finding_id is `${path}:${line}:${sha256(preview).slice(0,8)}`
 * (lowercase) so the renderer can de-dupe across re-scans.
 */
export async function scanForKeysOnDisk(opts: ScanOptions = {}): Promise<KeyFinding[]> {
  const paths = opts.paths ?? defaultScanPaths();
  const read = opts.readImpl ?? defaultReader;
  const out: KeyFinding[] = [];
  for (const path of paths) {
    const content = await read(path);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(KEY_PATTERN);
      if (!m) continue;
      const matched = m[1] ?? m[0];
      out.push({
        path,
        line: i + 1,
        provider: inferProvider(matched),
        preview: matched.slice(0, 8),
        finding_id: makeFindingId(path, i + 1, matched),
      });
    }
  }
  return out;
}

/**
 * Default reader. Returns null if file does not exist OR cannot be read.
 * Never throws.
 */
async function defaultReader(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export function inferProvider(matched: string): KeyProvider {
  if (matched.startsWith('sk-ant-')) return 'anthropic';
  if (matched.startsWith('sk-')) return 'openai';
  return 'unknown';
}

/**
 * Build a stable opaque ID. We hash a small slice rather than the whole
 * secret so a partial leak of the ID itself doesn't yield the key. Hex
 * lowercase to match the rest of the codebase's id conventions.
 */
export function makeFindingId(path: string, line: number, matched: string): string {
  // Lazy-load crypto so this module can be tree-shaken in renderer.
  // (eslint disabled: dynamic require is intentional for tree-shake guard.)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const h = createHash('sha256');
  h.update(`${path}:${line}:${matched.slice(0, 16)}`);
  return h.digest('hex').slice(0, 16);
}

export const __internals = { defaultReader, makeFindingId };
