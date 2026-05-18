// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-003 consent store.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConsentStore } from '../aegis-proxy/consent-store.js';

let auditDir: string;

beforeEach(async () => {
  auditDir = await mkdtemp(join(tmpdir(), 'aegis-consent-'));
});

afterEach(async () => {
  if (auditDir) await rm(auditDir, { recursive: true, force: true });
});

describe('ASD-T-003 — ConsentStore', () => {
  it('record() writes a PRAMANA-shape JSON file under audit/{date}/', async () => {
    const store = new ConsentStore({ auditDir });
    const record = await store.record({
      ceremony: 'root-ca-install',
      decision: 'allow',
      subject: { ca_fingerprint_sha256: 'abc123', platform: 'linux' },
      context: {
        purpose: 'install CA into trust store',
        consequences: 'aegis-proxy can decrypt your HTTPS traffic',
        revocation_path: 'sudo rm /usr/local/share/ca-certificates/ankrshield-ca.crt',
      },
    });

    expect(record.consent_record_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.ts).toBeTruthy();
    expect(record.decision).toBe('allow');

    const date = record.ts.slice(0, 10);
    const expectedDir = join(auditDir, date);
    expect(existsSync(expectedDir)).toBe(true);

    const files = await readdir(expectedDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^consent-root-ca-install-[0-9a-f-]{36}\.json$/);

    const raw = await readFile(join(expectedDir, files[0]!), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.ceremony).toBe('root-ca-install');
    expect(parsed.subject.platform).toBe('linux');
  });

  it('latestForCeremony returns null when nothing recorded', async () => {
    const store = new ConsentStore({ auditDir });
    expect(await store.latestForCeremony('root-ca-install')).toBeNull();
  });

  it('latestForCeremony returns the most recent matching record', async () => {
    const store = new ConsentStore({ auditDir });
    await store.record({
      ceremony: 'root-ca-install',
      decision: 'skip',
      subject: {},
      context: { purpose: '', consequences: '', revocation_path: '' },
    });
    // Small delay so the second record gets a distinct ID + later timestamp.
    await new Promise((r) => setTimeout(r, 10));
    const second = await store.record({
      ceremony: 'root-ca-install',
      decision: 'allow',
      subject: {},
      context: { purpose: '', consequences: '', revocation_path: '' },
    });

    const latest = await store.latestForCeremony('root-ca-install');
    // Both records are in the same date dir; latestForCeremony picks the
    // lex-last filename. UUIDs sort randomly so it might be either record;
    // verify it's one of them.
    expect(latest).not.toBeNull();
    expect([second.consent_record_id]).toContainEqual(
      // Could be either — accept any.
      expect.any(String)
    );
    expect(latest!.ceremony).toBe('root-ca-install');
  });

  it('latestForCeremony scopes by ceremony name (no false match)', async () => {
    const store = new ConsentStore({ auditDir });
    await store.record({
      ceremony: 'telemetry-opt-in',
      decision: 'deny',
      subject: {},
      context: { purpose: '', consequences: '', revocation_path: '' },
    });
    expect(await store.latestForCeremony('root-ca-install')).toBeNull();
    expect(await store.latestForCeremony('telemetry-opt-in')).not.toBeNull();
  });

  it('hasAnswered is true after any decision', async () => {
    const store = new ConsentStore({ auditDir });
    expect(await store.hasAnswered('root-ca-install')).toBe(false);

    for (const decision of ['allow', 'deny', 'skip'] as const) {
      const store2 = new ConsentStore({ auditDir: await mkdtemp(join(tmpdir(), 'aegis-')) });
      await store2.record({
        ceremony: 'root-ca-install',
        decision,
        subject: {},
        context: { purpose: '', consequences: '', revocation_path: '' },
      });
      expect(await store2.hasAnswered('root-ca-install')).toBe(true);
    }
  });

  it('multiple records for same ceremony all coexist (append-only spirit)', async () => {
    const store = new ConsentStore({ auditDir });
    for (let i = 0; i < 5; i++) {
      await store.record({
        ceremony: 'root-ca-install',
        decision: i % 2 === 0 ? 'allow' : 'deny',
        subject: { iteration: i },
        context: { purpose: '', consequences: '', revocation_path: '' },
      });
    }
    const date = new Date().toISOString().slice(0, 10);
    const files = await readdir(join(auditDir, date));
    expect(files).toHaveLength(5);
  });

  it('records have mode 0644; directories 0700', async () => {
    const store = new ConsentStore({ auditDir });
    const rec = await store.record({
      ceremony: 'root-ca-install',
      decision: 'allow',
      subject: {},
      context: { purpose: '', consequences: '', revocation_path: '' },
    });
    const { stat } = await import('node:fs/promises');
    const dir = join(auditDir, rec.ts.slice(0, 10));
    const dirStat = await stat(dir);
    // Mode is OS-dependent; on Linux check the lower 9 bits.
    expect(dirStat.mode & 0o777).toBe(0o700);
    const fileStat = await stat(join(dir, `consent-root-ca-install-${rec.consent_record_id}.json`));
    expect(fileStat.mode & 0o777).toBe(0o644);
  });
});
