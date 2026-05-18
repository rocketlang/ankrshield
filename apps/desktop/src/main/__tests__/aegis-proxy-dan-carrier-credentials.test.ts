// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-017 DAN carrier credentials (WhatsApp + Telegram).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  __setCredentialBackendForTests,
  getWhatsAppCreds,
  setWhatsAppCreds,
  clearWhatsAppCreds,
  getTelegramCreds,
  setTelegramCreds,
  clearTelegramCreds,
  type CredentialBackend,
} from '../aegis-proxy/dan-carrier-credentials.js';

function makeMemoryBackend(): CredentialBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getPassword: (s, a) => store.get(`${s}|${a}`) ?? null,
    setPassword: (s, a, secret) => {
      store.set(`${s}|${a}`, secret);
    },
    deletePassword: (s, a) => store.delete(`${s}|${a}`),
  };
}

let backend: ReturnType<typeof makeMemoryBackend>;

beforeEach(() => {
  backend = makeMemoryBackend();
  __setCredentialBackendForTests(backend);
});

afterEach(() => {
  __setCredentialBackendForTests(null);
});

describe('ASD-T-017 — WhatsApp credentials', () => {
  it('getWhatsAppCreds returns null when unset', () => {
    expect(getWhatsAppCreds()).toBeNull();
  });

  it('set + get roundtrip', () => {
    setWhatsAppCreds({
      phone_number_id: '12345',
      access_token: 'EAAxxx',
      to_number: '+15551234567',
    });
    const got = getWhatsAppCreds();
    expect(got).toEqual({
      phone_number_id: '12345',
      access_token: 'EAAxxx',
      to_number: '+15551234567',
    });
  });

  it('rejects creds with missing fields', () => {
    expect(() =>
      setWhatsAppCreds({
        phone_number_id: '',
        access_token: 'x',
        to_number: '+1',
      })
    ).toThrow(/WhatsApp credentials require/);
    expect(() =>
      setWhatsAppCreds({
        phone_number_id: 'p',
        access_token: '',
        to_number: '+1',
      })
    ).toThrow(/WhatsApp credentials require/);
    expect(() =>
      setWhatsAppCreds({
        phone_number_id: 'p',
        access_token: 'a',
        to_number: '',
      })
    ).toThrow(/WhatsApp credentials require/);
  });

  it('clearWhatsAppCreds removes the entry', () => {
    setWhatsAppCreds({
      phone_number_id: 'p',
      access_token: 'a',
      to_number: '+1',
    });
    expect(getWhatsAppCreds()).not.toBeNull();
    expect(clearWhatsAppCreds()).toBe(true);
    expect(getWhatsAppCreds()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    // Manually corrupt the backend
    backend.setPassword('ankrshield-dan-carriers', 'whatsapp-cloud-api', 'not-json{');
    expect(getWhatsAppCreds()).toBeNull();
  });

  it('returns null on JSON with missing required fields', () => {
    backend.setPassword(
      'ankrshield-dan-carriers',
      'whatsapp-cloud-api',
      JSON.stringify({ phone_number_id: 'x' })
    );
    expect(getWhatsAppCreds()).toBeNull();
  });

  it('overwrite replaces the previous entry', () => {
    setWhatsAppCreds({ phone_number_id: 'p1', access_token: 'a1', to_number: '+1' });
    setWhatsAppCreds({ phone_number_id: 'p2', access_token: 'a2', to_number: '+2' });
    expect(getWhatsAppCreds()?.phone_number_id).toBe('p2');
  });
});

describe('ASD-T-017 — Telegram credentials', () => {
  it('getTelegramCreds returns null when unset', () => {
    expect(getTelegramCreds()).toBeNull();
  });

  it('set + get roundtrip', () => {
    setTelegramCreds({ bot_token: '1234:AA', chat_id: '987' });
    expect(getTelegramCreds()).toEqual({ bot_token: '1234:AA', chat_id: '987' });
  });

  it('rejects creds with missing fields', () => {
    expect(() => setTelegramCreds({ bot_token: '', chat_id: '1' })).toThrow(/Telegram/);
    expect(() => setTelegramCreds({ bot_token: 'x', chat_id: '' })).toThrow(/Telegram/);
  });

  it('clearTelegramCreds removes the entry', () => {
    setTelegramCreds({ bot_token: 'x', chat_id: '1' });
    expect(clearTelegramCreds()).toBe(true);
    expect(getTelegramCreds()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    backend.setPassword('ankrshield-dan-carriers', 'telegram-bot-api', '{{nope');
    expect(getTelegramCreds()).toBeNull();
  });

  it('WhatsApp and Telegram entries are independent', () => {
    setWhatsAppCreds({ phone_number_id: 'p', access_token: 'a', to_number: '+1' });
    setTelegramCreds({ bot_token: 'b', chat_id: 'c' });
    expect(getWhatsAppCreds()).not.toBeNull();
    expect(getTelegramCreds()).not.toBeNull();
    clearWhatsAppCreds();
    expect(getWhatsAppCreds()).toBeNull();
    expect(getTelegramCreds()).not.toBeNull();
  });
});
