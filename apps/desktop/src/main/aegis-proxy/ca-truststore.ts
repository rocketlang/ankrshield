// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — install/uninstall root CA in OS trust store
//
// @rule:ASD-002 — per-install CA installed into system trust store on user consent
// @rule:ASD-012 — root CA install is its own ceremony with explicit consent
// @rule:ASD-004 — failure mode is deny; install errors surface, never silent
//
// Linux is the implemented path (the dev VM); macOS + Windows are stubs that
// return a clear "not yet implemented" error. The renderer ceremony lists the
// platform-specific manual command in those cases.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// @vscode/sudo-prompt is a maintained fork that surfaces the OS native
// password dialog (pkexec on Linux, security on mac, UAC on Windows).
import sudo from '@vscode/sudo-prompt';

const CA_CRT_PATH = join(homedir(), '.ankrshield', 'ca.crt');

export const LINUX_TRUST_STORE_PATH = '/usr/local/share/ca-certificates/ankrshield-ca.crt';

export interface TrustStoreInstallResult {
  ok: boolean;
  installedAt?: string;
  error?: string;
  /** Manual command for the user if automatic install isn't implemented for this OS. */
  manualCommand?: string;
}

export interface TrustStoreStatus {
  platformSupported: boolean;
  installed: boolean;
  installedAt?: string;
  manualInstallCommand?: string;
  manualRevokeCommand?: string;
}

/**
 * Install the per-install root CA into the OS trust store. Requires elevated
 * privileges; the OS native password dialog is surfaced via @vscode/sudo-prompt.
 */
export async function installRootCAToTrustStore(): Promise<TrustStoreInstallResult> {
  if (!existsSync(CA_CRT_PATH)) {
    return {
      ok: false,
      error: `Root CA not found at ${CA_CRT_PATH}. Run ensureRootCA() first.`,
    };
  }
  if (process.platform === 'linux') return installLinux();
  if (process.platform === 'darwin') return installMacStub();
  if (process.platform === 'win32') return installWindowsStub();
  return {
    ok: false,
    error: `Unsupported platform: ${process.platform}`,
  };
}

/**
 * Query whether the CA is currently installed in the OS trust store. Cheap;
 * for Linux this is just an existsSync on the well-known target path.
 */
export function getTrustStoreStatus(): TrustStoreStatus {
  if (process.platform === 'linux') {
    const installed = existsSync(LINUX_TRUST_STORE_PATH);
    return {
      platformSupported: true,
      installed,
      installedAt: installed ? LINUX_TRUST_STORE_PATH : undefined,
      manualInstallCommand: `sudo cp "${CA_CRT_PATH}" "${LINUX_TRUST_STORE_PATH}" && sudo update-ca-certificates`,
      manualRevokeCommand: `sudo rm "${LINUX_TRUST_STORE_PATH}" && sudo update-ca-certificates --fresh`,
    };
  }
  if (process.platform === 'darwin') {
    return {
      platformSupported: false,
      installed: false,
      manualInstallCommand: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${CA_CRT_PATH}"`,
      manualRevokeCommand: `sudo security delete-certificate -c "ankrshield desktop root CA" /Library/Keychains/System.keychain`,
    };
  }
  if (process.platform === 'win32') {
    return {
      platformSupported: false,
      installed: false,
      manualInstallCommand: `certutil -addstore -f Root "${CA_CRT_PATH}"`,
      manualRevokeCommand: `certutil -delstore Root "ankrshield desktop root CA"`,
    };
  }
  return { platformSupported: false, installed: false };
}

// ─── Platform implementations ─────────────────────────────────────────────────

function installLinux(): Promise<TrustStoreInstallResult> {
  const cmd = `cp "${CA_CRT_PATH}" "${LINUX_TRUST_STORE_PATH}" && update-ca-certificates`;
  return new Promise((resolve) => {
    sudo.exec(cmd, { name: 'AnkrShield' }, (err) => {
      if (err) {
        resolve({
          ok: false,
          error: err.message,
          manualCommand: `sudo ${cmd}`,
        });
        return;
      }
      resolve({ ok: true, installedAt: LINUX_TRUST_STORE_PATH });
    });
  });
}

function installMacStub(): Promise<TrustStoreInstallResult> {
  return Promise.resolve({
    ok: false,
    error: 'Automatic install for macOS not yet implemented in P1.',
    manualCommand: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${CA_CRT_PATH}"`,
  });
}

function installWindowsStub(): Promise<TrustStoreInstallResult> {
  return Promise.resolve({
    ok: false,
    error: 'Automatic install for Windows not yet implemented in P1.',
    manualCommand: `certutil -addstore -f Root "${CA_CRT_PATH}"`,
  });
}
