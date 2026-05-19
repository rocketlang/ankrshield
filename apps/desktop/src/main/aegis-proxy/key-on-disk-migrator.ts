// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — key-on-disk migrator (ASD-T-036 / INF-ASD-002)
//
// Migration half of INF-ASD-002. Given one KeyFinding (from the scanner)
// and explicit per-key user consent (the renderer calls in via IPC after
// a ConsentDialog), perform:
//
//   1. Re-read the source file to confirm the secret is still there.
//   2. Write a backup at `${path}.ankrshield-bak-${YYYY-MM-DDTHH-MM-SS}`
//      (mode 0o600 — only owner readable).
//   3. Replace the secret in-line with a [MIGRATED-TO-KEYCHAIN-…] marker
//      preserving surrounding text so .env / shell rc files still parse.
//   4. Write the original secret to OS keychain at
//      service=ankrshield-migrated-keys, account=`${provider}-${nonce}`.
//   5. Log warn("ASD-003: migrated plaintext key from <path>").
//
// Failures at ANY step abort the migration BEFORE touching the source
// file. The backup is written first; if the rewrite fails, the backup
// remains for manual recovery + the source is untouched.
//
// @rule:INF-ASD-002 — explicit user-confirm migration to keychain.
// @rule:ASD-003 — destination is OS keychain only.
// @rule:ASD-004 — keychain unavailable → migration fails; do not silently
//   drop the secret.

import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, copyFile, readFile, writeFile } from 'node:fs/promises';

import type { CredentialBackend } from './dan-carrier-credentials.js';
import { KEY_PATTERN, type KeyFinding } from './key-on-disk-scanner.js';

export const MIGRATED_KEY_SERVICE = 'ankrshield-migrated-keys';

export interface MigrationResult {
  ok: true;
  finding_id: string;
  /** Path of the backup file we created before rewriting. */
  backup_path: string;
  /** Keychain coordinates the secret was written to. */
  keychain_service: string;
  keychain_account: string;
  /** ISO timestamp of the migration. */
  migrated_at: string;
}

export interface MigrationError {
  ok: false;
  finding_id: string;
  reason: string;
}

export interface MigrateKeyOptions {
  /** Override keychain backend (tests). Defaults to @napi-rs/keyring. */
  backend?: CredentialBackend;
  /** Override clock (tests). */
  now?: () => Date;
  /** Override file IO for tests. All five must come together if any do. */
  io?: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string, mode?: number) => Promise<void>;
    copy: (src: string, dst: string) => Promise<void>;
    chmod?: (path: string, mode: number) => Promise<void>;
    exists: (path: string) => boolean;
  };
}

/**
 * Migrate ONE finding. Caller must have obtained explicit user consent
 * via a ConsentDialog before calling — this function does NOT prompt.
 *
 * Returns ok:true on success with backup + keychain coordinates,
 * ok:false on any failure (with a human-readable reason).
 */
export async function migrateKeyOnDisk(
  finding: KeyFinding,
  opts: MigrateKeyOptions = {}
): Promise<MigrationResult | MigrationError> {
  const io = opts.io ?? defaultIo;
  const backend = opts.backend ?? (await loadDefaultBackend());
  const now = (opts.now ?? (() => new Date()))();

  if (!io.exists(finding.path)) {
    return { ok: false, finding_id: finding.finding_id, reason: 'source file no longer exists' };
  }

  let content: string;
  try {
    content = await io.read(finding.path);
  } catch (err) {
    return {
      ok: false,
      finding_id: finding.finding_id,
      reason: `source read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Locate the secret at the recorded line. Be tolerant of small line
  // shifts (file edited since scan) by scanning a ±3 window.
  const lines = content.split(/\r?\n/);
  const center = Math.max(0, finding.line - 1);
  const lo = Math.max(0, center - 3);
  const hi = Math.min(lines.length, center + 4);
  let matchLineIndex = -1;
  let matched = '';
  for (let i = lo; i < hi; i++) {
    const m = lines[i]!.match(KEY_PATTERN);
    if (m && (m[1] ?? m[0]).startsWith(finding.preview)) {
      matchLineIndex = i;
      matched = m[1] ?? m[0];
      break;
    }
  }
  if (matchLineIndex === -1 || matched === '') {
    return {
      ok: false,
      finding_id: finding.finding_id,
      reason: 'secret no longer at the recorded location (file edited since scan?)',
    };
  }

  // Step 1: BACKUP first so a failed rewrite never destroys the original.
  // chmod to 0o600 explicitly — copyFile inherits source perms (often
  // 0o644 for shell rc files) which would leave a plaintext secret
  // world-readable. umask is bypassed by an explicit chmod.
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupPath = `${finding.path}.ankrshield-bak-${stamp}`;
  try {
    await io.copy(finding.path, backupPath);
    if (io.chmod) await io.chmod(backupPath, 0o600);
  } catch (err) {
    return {
      ok: false,
      finding_id: finding.finding_id,
      reason: `backup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 2: Write the secret to keychain. Do this BEFORE rewriting the
  // source so we never zero the source with no destination.
  const nonce = crypto.randomBytes(4).toString('hex');
  const account = `${finding.provider}-${nonce}`;
  try {
    backend.setPassword(MIGRATED_KEY_SERVICE, account, matched);
  } catch (err) {
    return {
      ok: false,
      finding_id: finding.finding_id,
      reason: `keychain write failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 3: Replace the secret in-line with a marker. Preserve everything
  // else on the line so shell rc / dotenv files still parse — assignments
  // like `OPENAI_API_KEY=sk-...` become `OPENAI_API_KEY=[MIGRATED…]`.
  const marker =
    `[MIGRATED-TO-KEYCHAIN by ankrshield ${now.toISOString().slice(0, 19)}Z` +
    ` keychain=${MIGRATED_KEY_SERVICE}/${account}]`;
  lines[matchLineIndex] = lines[matchLineIndex]!.replace(matched, marker);
  const rewritten = lines.join('\n');
  try {
    await io.write(finding.path, rewritten, 0o600);
    // Defensive chmod — Node's writeFile mode is masked by umask on most
    // platforms; chmod bypasses that so the rewritten source can't end
    // up world-readable even though the secret is already gone from it.
    if (io.chmod) await io.chmod(finding.path, 0o600);
  } catch (err) {
    // Source rewrite failed — but the backup exists and the keychain
    // entry exists. Report so the user can manually recover.
    return {
      ok: false,
      finding_id: finding.finding_id,
      reason:
        `source rewrite failed: ${err instanceof Error ? err.message : String(err)}` +
        ` (backup at ${backupPath}; keychain entry ${MIGRATED_KEY_SERVICE}/${account} exists)`,
    };
  }

  // Step 4: log + return success.
  // eslint-disable-next-line no-console
  console.warn(
    `[aegis-proxy] ASD-003: migrated plaintext key from ${finding.path}:${finding.line} ` +
      `→ keychain ${MIGRATED_KEY_SERVICE}/${account} (backup ${backupPath}).`
  );
  return {
    ok: true,
    finding_id: finding.finding_id,
    backup_path: backupPath,
    keychain_service: MIGRATED_KEY_SERVICE,
    keychain_account: account,
    migrated_at: now.toISOString(),
  };
}

// ─── Default IO (tests inject their own) ─────────────────────────────────────

const defaultIo: NonNullable<MigrateKeyOptions['io']> = {
  read: (p) => readFile(p, 'utf8'),
  write: (p, c, mode = 0o600) => writeFile(p, c, { mode }),
  copy: copyFile,
  chmod: (p, mode) => chmod(p, mode),
  exists: existsSync,
};

async function loadDefaultBackend(): Promise<CredentialBackend> {
  // Lazy-import to avoid pulling the native module in tests that inject a backend.
  const { Entry } = await import('@napi-rs/keyring');
  return {
    getPassword(service, account) {
      try {
        return new Entry(service, account).getPassword() ?? null;
      } catch {
        return null;
      }
    },
    setPassword(service, account, secret) {
      new Entry(service, account).setPassword(secret);
    },
    deletePassword(service, account) {
      try {
        return new Entry(service, account).deletePassword();
      } catch {
        return false;
      }
    },
  };
}
