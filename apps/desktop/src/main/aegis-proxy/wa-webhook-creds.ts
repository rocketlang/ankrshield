// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — WA webhook credentials in OS keychain (ASD-T-038)
//
// Two secrets live here, both required for the WA inbound webhook to work:
//
//   - app_secret:    Meta App Secret used to verify X-Hub-Signature-256
//                    on every inbound POST (the lone correctness primitive
//                    that prevents forged DAN approvals).
//   - verify_token:  Arbitrary user-chosen string echoed back during Meta's
//                    GET handshake. Per Meta convention we generate a
//                    random one on first-set if the user doesn't supply.
//
// Stored under the existing `ankrshield-dan-carriers` service for symmetry
// with WhatsApp outbound + Telegram bot creds (dan-carrier-credentials.ts).
//
// @rule:ASD-003 — secrets in OS keychain only, never on disk.

import crypto from 'node:crypto';

import { Entry } from '@napi-rs/keyring';

import type { CredentialBackend } from './dan-carrier-credentials.js';

const KEYCHAIN_SERVICE = 'ankrshield-dan-carriers';
const WA_WEBHOOK_ACCOUNT = 'whatsapp-cloud-webhook';

export interface WaWebhookCredentials {
  /** Meta App Secret — required for HMAC verification. */
  app_secret: string;
  /** Verify-token echoed back to Meta during webhook setup handshake. */
  verify_token: string;
}

const defaultBackend: CredentialBackend = {
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

let backend: CredentialBackend = defaultBackend;

/** Test seam — production never calls this. */
export function __setBackendForTests(b: CredentialBackend): void {
  backend = b;
}
/** Test seam — restore default. */
export function __resetBackendForTests(): void {
  backend = defaultBackend;
}

/**
 * Read both fields. Returns null if either is missing — the webhook
 * server refuses to start without both.
 */
export function getWaWebhookCreds(): WaWebhookCredentials | null {
  const raw = backend.getPassword(KEYCHAIN_SERVICE, WA_WEBHOOK_ACCOUNT);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WaWebhookCredentials>;
    if (typeof parsed.app_secret !== 'string' || parsed.app_secret.length === 0) return null;
    if (typeof parsed.verify_token !== 'string' || parsed.verify_token.length === 0) return null;
    return { app_secret: parsed.app_secret, verify_token: parsed.verify_token };
  } catch {
    return null;
  }
}

/**
 * Set the WA webhook creds. If verify_token is omitted, a random 32-char
 * hex token is generated — this is what the user will paste into Meta's
 * Webhook Configuration page.
 */
export function setWaWebhookCreds(creds: {
  app_secret: string;
  verify_token?: string;
}): WaWebhookCredentials {
  if (!creds.app_secret || typeof creds.app_secret !== 'string') {
    throw new Error('app_secret is required');
  }
  const resolved: WaWebhookCredentials = {
    app_secret: creds.app_secret,
    verify_token: creds.verify_token ?? crypto.randomBytes(16).toString('hex'),
  };
  backend.setPassword(KEYCHAIN_SERVICE, WA_WEBHOOK_ACCOUNT, JSON.stringify(resolved));
  return resolved;
}

export function clearWaWebhookCreds(): boolean {
  return backend.deletePassword(KEYCHAIN_SERVICE, WA_WEBHOOK_ACCOUNT);
}

/** Diagnostic for the renderer: does the keychain have both fields? */
export function hasWaWebhookCreds(): {
  configured: boolean;
  verify_token_preview?: string;
} {
  const c = getWaWebhookCreds();
  if (!c) return { configured: false };
  return {
    configured: true,
    verify_token_preview: c.verify_token.slice(0, 8),
  };
}

export const __coords = { KEYCHAIN_SERVICE, WA_WEBHOOK_ACCOUNT };
