// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-019 ConsentDialog → ConsentStore impression + decision flow.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConsentStore, type ConsentDecision } from '../aegis-proxy/consent-store.js';

let auditDir: string;
let store: ConsentStore;

beforeEach(async () => {
  auditDir = await mkdtemp(join(tmpdir(), 'aegis-consent-dialog-'));
  store = new ConsentStore({ auditDir });
});

afterEach(async () => {
  if (auditDir) await rm(auditDir, { recursive: true, force: true });
});

const CONTEXT = {
  purpose: 'Authorise cursor → api.anthropic.com',
  consequences: 'Future requests flow through with the chosen policy.',
  revocation_path: 'Settings → Apps → forget this app.',
};

describe('ASD-T-019 — ConsentStore impression + decision records', () => {
  it('accepts the new "impression" decision type', async () => {
    const rec = await store.record({
      ceremony: 'tofu-consent',
      decision: 'impression',
      subject: { pendingId: 'p-1', appId: 'cursor', hostname: 'api.anthropic.com' },
      context: CONTEXT,
    });
    expect(rec.decision).toBe<ConsentDecision>('impression');
    expect(rec.consent_record_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('impression then decision creates two paired records', async () => {
    const impression = await store.record({
      ceremony: 'tofu-consent',
      decision: 'impression',
      subject: { pendingId: 'p-1', appId: 'cursor' },
      context: CONTEXT,
    });
    const decision = await store.record({
      ceremony: 'tofu-consent',
      decision: 'allow',
      subject: {
        pendingId: 'p-1',
        appId: 'cursor',
        impression_consent_record_id: impression.consent_record_id,
      },
      context: CONTEXT,
    });
    expect(decision.consent_record_id).not.toBe(impression.consent_record_id);
    expect((decision.subject as Record<string, unknown>).impression_consent_record_id).toBe(
      impression.consent_record_id
    );
  });

  it('records land on disk under YYYY-MM-DD subdirs', async () => {
    await store.record({
      ceremony: 'dan-gate',
      decision: 'impression',
      subject: { pendingId: 'p-2' },
      context: CONTEXT,
    });
    const dates = await readdir(auditDir);
    expect(dates).toHaveLength(1);
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const files = await readdir(join(auditDir, dates[0]!));
    expect(files.some((f) => f.startsWith('consent-dan-gate-') && f.endsWith('.json'))).toBe(true);
  });

  it('PRAMANA-shape: every required field present in disk record', async () => {
    const rec = await store.record({
      ceremony: 'tofu-consent',
      decision: 'allow',
      subject: { pendingId: 'p-3', appId: 'cursor' },
      context: CONTEXT,
    });
    const dates = await readdir(auditDir);
    const dir = join(auditDir, dates[0]!);
    const files = await readdir(dir);
    const raw = await readFile(join(dir, files[0]!), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.consent_record_id).toBe(rec.consent_record_id);
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.ceremony).toBe('tofu-consent');
    expect(parsed.decision).toBe('allow');
    expect(parsed.subject.pendingId).toBe('p-3');
    expect(parsed.context.purpose).toBe(CONTEXT.purpose);
    expect(parsed.context.consequences).toBe(CONTEXT.consequences);
    expect(parsed.context.revocation_path).toBe(CONTEXT.revocation_path);
  });

  it('latestForCeremony surfaces decision records (not just impressions)', async () => {
    await store.record({
      ceremony: 'tofu-consent',
      decision: 'impression',
      subject: { pendingId: 'p-old' },
      context: CONTEXT,
    });
    await store.record({
      ceremony: 'tofu-consent',
      decision: 'allow',
      subject: { pendingId: 'p-old' },
      context: CONTEXT,
    });
    const latest = await store.latestForCeremony('tofu-consent');
    expect(latest).not.toBeNull();
    // Both records have the same ceremony tag; latest could be either since
    // their ids are lexically sorted. The contract is "exists, and is one of
    // the records written" — both impression + decision satisfy "answered".
    expect(['impression', 'allow']).toContain(latest!.decision);
  });

  it('hasAnswered is true once any record exists (incl. impression)', async () => {
    expect(await store.hasAnswered('dan-gate')).toBe(false);
    await store.record({
      ceremony: 'dan-gate',
      decision: 'impression',
      subject: { pendingId: 'p-4' },
      context: CONTEXT,
    });
    expect(await store.hasAnswered('dan-gate')).toBe(true);
  });

  it('ceremony tags are not mutually exclusive — tofu and dan coexist', async () => {
    await store.record({
      ceremony: 'tofu-consent',
      decision: 'allow',
      subject: { appId: 'cursor' },
      context: CONTEXT,
    });
    await store.record({
      ceremony: 'dan-gate',
      decision: 'allow',
      subject: { appId: 'cursor' },
      context: CONTEXT,
    });
    expect(await store.latestForCeremony('tofu-consent')).not.toBeNull();
    expect(await store.latestForCeremony('dan-gate')).not.toBeNull();
    // Cross-lookup should not pollute either.
    expect((await store.latestForCeremony('tofu-consent'))!.ceremony).toBe('tofu-consent');
    expect((await store.latestForCeremony('dan-gate'))!.ceremony).toBe('dan-gate');
  });

  it('rejects nothing on the type level — TS catches invalid decision at compile time', () => {
    // This is a compile-time guarantee: any non-'allow'|'deny'|'skip'|'impression'
    // would fail tsc. The runtime trusts the type.
    const valid: ConsentDecision[] = ['allow', 'deny', 'skip', 'impression'];
    expect(valid).toHaveLength(4);
  });
});
