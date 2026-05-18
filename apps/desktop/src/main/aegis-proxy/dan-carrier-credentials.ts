// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — DAN carrier credentials in OS keychain (ASD-T-017)
//
// WhatsApp Cloud API + Telegram Bot API both need a few small fields each.
// Per ASD-003 / FR-3, ALL of them live in the OS keychain only — never on
// disk. Loaded lazily by the carriers via getWhatsAppCreds / getTelegramCreds.
// Setters wrap @napi-rs/keyring with a tiny JSON-encoded blob so we can keep
// multiple fields under one keychain entry per platform.
//
// @rule:ASD-003 — API keys in OS keychain only
// @rule:ASD-004 — keychain unavailable / unset → carrier no-ops + falls back

import { Entry } from '@napi-rs/keyring';

const KEYCHAIN_SERVICE = 'ankrshield-dan-carriers';
const WHATSAPP_ACCOUNT = 'whatsapp-cloud-api';
const TELEGRAM_ACCOUNT = 'telegram-bot-api';

export interface WhatsAppCredentials {
  /** Meta-issued phone number ID (the sender). */
  phone_number_id: string;
  /** Meta Cloud API access token. */
  access_token: string;
  /** Recipient phone number in E.164 (e.g. +15551234567). */
  to_number: string;
}

export interface TelegramCredentials {
  /** Bot token from @BotFather, e.g. "1234567:AAH...". */
  bot_token: string;
  /** Numeric chat ID (user/group/channel) to receive DAN alerts. */
  chat_id: string;
}

/**
 * Test-seam: allow tests to swap the keychain backend without touching
 * @napi-rs/keyring (which is a native module). Production wires through to
 * the real Entry.
 */
export interface CredentialBackend {
  getPassword(service: string, account: string): string | null;
  setPassword(service: string, account: string, secret: string): void;
  deletePassword(service: string, account: string): boolean;
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

/** Tests: swap the keychain backend. Production code must not call this. */
export function __setCredentialBackendForTests(b: CredentialBackend | null): void {
  backend = b ?? defaultBackend;
}

export function getWhatsAppCreds(): WhatsAppCredentials | null {
  return readJson<WhatsAppCredentials>(KEYCHAIN_SERVICE, WHATSAPP_ACCOUNT, isWhatsAppCreds);
}

export function setWhatsAppCreds(creds: WhatsAppCredentials): void {
  if (!isWhatsAppCreds(creds)) {
    throw new Error('WhatsApp credentials require phone_number_id, access_token, to_number');
  }
  backend.setPassword(KEYCHAIN_SERVICE, WHATSAPP_ACCOUNT, JSON.stringify(creds));
}

export function clearWhatsAppCreds(): boolean {
  return backend.deletePassword(KEYCHAIN_SERVICE, WHATSAPP_ACCOUNT);
}

export function getTelegramCreds(): TelegramCredentials | null {
  return readJson<TelegramCredentials>(KEYCHAIN_SERVICE, TELEGRAM_ACCOUNT, isTelegramCreds);
}

export function setTelegramCreds(creds: TelegramCredentials): void {
  if (!isTelegramCreds(creds)) {
    throw new Error('Telegram credentials require bot_token and chat_id');
  }
  backend.setPassword(KEYCHAIN_SERVICE, TELEGRAM_ACCOUNT, JSON.stringify(creds));
}

export function clearTelegramCreds(): boolean {
  return backend.deletePassword(KEYCHAIN_SERVICE, TELEGRAM_ACCOUNT);
}

function readJson<T>(service: string, account: string, guard: (v: unknown) => v is T): T | null {
  const raw = backend.getPassword(service, account);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isWhatsAppCreds(v: unknown): v is WhatsAppCredentials {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.phone_number_id === 'string' &&
    o.phone_number_id.length > 0 &&
    typeof o.access_token === 'string' &&
    o.access_token.length > 0 &&
    typeof o.to_number === 'string' &&
    o.to_number.length > 0
  );
}

function isTelegramCreds(v: unknown): v is TelegramCredentials {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.bot_token === 'string' &&
    o.bot_token.length > 0 &&
    typeof o.chat_id === 'string' &&
    o.chat_id.length > 0
  );
}

export const __keychain = { KEYCHAIN_SERVICE, WHATSAPP_ACCOUNT, TELEGRAM_ACCOUNT };
