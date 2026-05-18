// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — root CA storage (filesystem + OS keychain)
//
// @rule:ASD-002 — every install has its own root CA; never shared across installs
// @rule:ASD-003 — private key lives only in OS keychain, never on disk
// @rule:ASD-004 — keychain unavailable → deny, never silently fall through

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { Entry } from '@napi-rs/keyring';

import { generateRootCA } from './ca-generator.js';
import {
  ASD_CA_KEYCHAIN_ACCOUNT,
  ASD_CA_KEYCHAIN_SERVICE,
  type RootCA,
  type RootCAPublic,
} from './types.js';

// Public artefacts (cert + metadata) live in ~/.ankrshield/ca.{crt,json}.
// Private key NEVER lives here per ASD-003.
const CA_DIR = join(homedir(), '.ankrshield');
const CA_CERT_PATH = join(CA_DIR, 'ca.crt');
const CA_META_PATH = join(CA_DIR, 'ca.json');

export interface EnsureRootCAResult {
  ca: RootCA;
  /** True if the CA was generated this call; false if loaded from existing state. */
  freshlyGenerated: boolean;
}

/**
 * Load the existing root CA from disk + OS keychain, or generate a new one if
 * either is missing. Idempotent on subsequent calls.
 *
 * Throws if the keychain is unavailable / locked — per ASD-004, deny rather
 * than silently fall through.
 */
export async function ensureRootCA(): Promise<EnsureRootCAResult> {
  const entry = new Entry(ASD_CA_KEYCHAIN_SERVICE, ASD_CA_KEYCHAIN_ACCOUNT);

  const existing = await tryLoadExisting(entry);
  if (existing) {
    return { ca: existing, freshlyGenerated: false };
  }

  // Drift case: cert+meta on disk but key missing from keychain (or vice
  // versa). Regenerate from scratch — both halves of the pair must match,
  // and we cannot recover one half from the other.
  const fresh = generateRootCA();
  await persistRootCA(fresh, entry);
  return { ca: fresh, freshlyGenerated: true };
}

/**
 * Read just the public half (cert + metadata) without unlocking the keychain.
 * For UI rendering ("your CA fingerprint is...") and consent-ceremony display.
 */
export async function readRootCAPublic(): Promise<RootCAPublic | null> {
  if (!existsSync(CA_CERT_PATH) || !existsSync(CA_META_PATH)) return null;
  try {
    const [certPem, metaRaw] = await Promise.all([
      readFile(CA_CERT_PATH, 'utf8'),
      readFile(CA_META_PATH, 'utf8'),
    ]);
    const meta = JSON.parse(metaRaw) as Pick<
      RootCA,
      'fingerprintSha256' | 'generatedAt' | 'validUntil'
    >;
    return {
      certPem,
      fingerprintSha256: meta.fingerprintSha256,
      generatedAt: meta.generatedAt,
      validUntil: meta.validUntil,
    };
  } catch {
    return null;
  }
}

async function tryLoadExisting(entry: Entry): Promise<RootCA | null> {
  const publicHalf = await readRootCAPublic();
  if (!publicHalf) return null;

  let keyPem: string | null = null;
  try {
    keyPem = entry.getPassword();
  } catch (err) {
    // Keychain locked or unavailable — surface, do not silently regenerate.
    throw new Error(
      `[aegis-proxy] OS keychain unavailable for ASD_CA_KEYCHAIN_SERVICE="${ASD_CA_KEYCHAIN_SERVICE}": ` +
        (err instanceof Error ? err.message : String(err)) +
        '. Per ASD-004 the proxy denies rather than silently regenerate.'
    );
  }

  if (!keyPem) return null;

  return {
    certPem: publicHalf.certPem,
    keyPem,
    fingerprintSha256: publicHalf.fingerprintSha256,
    generatedAt: publicHalf.generatedAt,
    validUntil: publicHalf.validUntil,
  };
}

async function persistRootCA(ca: RootCA, entry: Entry): Promise<void> {
  await mkdir(dirname(CA_CERT_PATH), { recursive: true, mode: 0o700 });

  await writeFile(CA_CERT_PATH, ca.certPem, { mode: 0o644 });
  await writeFile(
    CA_META_PATH,
    JSON.stringify(
      {
        fingerprintSha256: ca.fingerprintSha256,
        generatedAt: ca.generatedAt,
        validUntil: ca.validUntil,
      },
      null,
      2
    ) + '\n',
    { mode: 0o644 }
  );

  // Key into keychain LAST — if anything fails, the cert+meta on disk will be
  // overwritten on next call (ensureRootCA detects the drift and regenerates).
  try {
    entry.setPassword(ca.keyPem);
  } catch (err) {
    throw new Error(
      `[aegis-proxy] failed to write ASD_CA_KEYCHAIN_SERVICE="${ASD_CA_KEYCHAIN_SERVICE}" to OS keychain: ` +
        (err instanceof Error ? err.message : String(err)) +
        '. Per ASD-003 the key may not be stored anywhere else; refusing to fall through.'
    );
  }
}

/** Test/install-uninstall hook. Removes cert/meta from disk + key from keychain. */
export async function deleteRootCA(): Promise<void> {
  const entry = new Entry(ASD_CA_KEYCHAIN_SERVICE, ASD_CA_KEYCHAIN_ACCOUNT);
  try {
    entry.deletePassword();
  } catch {
    // Ignore — already absent is fine.
  }
  const { rm } = await import('node:fs/promises');
  await rm(CA_CERT_PATH, { force: true });
  await rm(CA_META_PATH, { force: true });
}

// Re-export the paths so tests + consent ceremony can reference them.
export const __paths = { CA_DIR, CA_CERT_PATH, CA_META_PATH };
