// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-015 per-app TOFU policy store.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppsPolicyStore } from '../aegis-proxy/apps-policy.js';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'aegis-apps-policy-'));
  filePath = join(tmpDir, 'apps-policy.json');
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('ASD-T-015 — AppsPolicyStore', () => {
  it('starts empty when file does not exist', async () => {
    const store = new AppsPolicyStore({ filePath });
    await store.load();
    expect(store.getAll()).toEqual({});
    expect(store.get('cursor')).toBeNull();
    expect(store.hasDecision('cursor')).toBe(false);
    await store.stop();
  });

  it('recordAllow stores policy with mandatory budget + chosen pii/dan', async () => {
    const store = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    const policy = store.recordAllow('cursor', {
      hourly_limit_usd: 0.5,
      pii_policy: 'redact',
      dan_carrier: 'os',
    });
    expect(policy.decision).toBe('allow');
    expect(policy.hourly_limit_usd).toBe(0.5);
    expect(policy.pii_policy).toBe('redact');
    expect(policy.dan_carrier).toBe('os');
    expect(policy.decided_at).toBeTruthy();
    expect(store.hasDecision('cursor')).toBe(true);
    await store.stop();
  });

  it('recordAllow throws on hourly_limit_usd <= 0 (ASD-005 no unbounded allow)', async () => {
    const store = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    expect(() =>
      store.recordAllow('cursor', { hourly_limit_usd: 0, pii_policy: 'redact', dan_carrier: 'os' })
    ).toThrow(/ASD-005/);
    expect(() =>
      store.recordAllow('cursor', { hourly_limit_usd: -1, pii_policy: 'redact', dan_carrier: 'os' })
    ).toThrow(/ASD-005/);
    expect(() =>
      store.recordAllow('cursor', {
        hourly_limit_usd: Number.NaN,
        pii_policy: 'redact',
        dan_carrier: 'os',
      })
    ).toThrow(/ASD-005/);
    expect(() =>
      store.recordAllow('cursor', {
        hourly_limit_usd: Number.POSITIVE_INFINITY,
        pii_policy: 'redact',
        dan_carrier: 'os',
      })
    ).toThrow(/ASD-005/);
    expect(store.hasDecision('cursor')).toBe(false);
    await store.stop();
  });

  it('recordDeny stores deny with null budget + safe defaults', async () => {
    const store = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    const policy = store.recordDeny('shady-cli');
    expect(policy.decision).toBe('deny');
    expect(policy.hourly_limit_usd).toBeNull();
    expect(policy.pii_policy).toBe('block');
    expect(policy.dan_carrier).toBe('os');
    expect(store.hasDecision('shady-cli')).toBe(true);
    await store.stop();
  });

  it('forget removes the policy so user is re-prompted', async () => {
    const store = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    store.recordDeny('cursor');
    expect(store.forget('cursor')).toBe(true);
    expect(store.hasDecision('cursor')).toBe(false);
    expect(store.forget('cursor')).toBe(false);
    await store.stop();
  });

  it('persistence roundtrip via JSON file', async () => {
    const a = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await a.load();
    a.recordAllow('cursor', { hourly_limit_usd: 0.5, pii_policy: 'redact', dan_carrier: 'os' });
    a.recordDeny('shady-cli');
    await a.flush();

    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('"cursor"');
    expect(raw).toContain('"shady-cli"');

    const b = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await b.load();
    expect(b.get('cursor')?.decision).toBe('allow');
    expect(b.get('cursor')?.hourly_limit_usd).toBe(0.5);
    expect(b.get('shady-cli')?.decision).toBe('deny');
    await b.stop();
  });

  it('sanitises malformed entries on load', async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        good: {
          decision: 'allow',
          decided_at: '2026-05-18T10:00:00Z',
          hourly_limit_usd: 0.5,
          pii_policy: 'redact',
          dan_carrier: 'os',
        },
        bad_decision: { decision: 'maybe', decided_at: '2026-05-18T10:00:00Z' },
        bad_string: 'nope',
        good_minimal: {
          decision: 'deny',
          decided_at: '2026-05-18T10:00:00Z',
          // missing pii/dan/budget — should be defaulted
        },
      })
    );
    const store = new AppsPolicyStore({ filePath });
    await store.load();
    const map = store.getAll();
    expect(Object.keys(map).sort()).toEqual(['good', 'good_minimal']);
    expect(map.good.pii_policy).toBe('redact');
    expect(map.good_minimal!.hourly_limit_usd).toBeNull();
    expect(map.good_minimal!.pii_policy).toBe('redact'); // default
    expect(map.good_minimal!.dan_carrier).toBe('os'); // default
    await store.stop();
  });

  it('handles corrupted JSON by starting fresh (no throw)', async () => {
    await writeFile(filePath, 'definitely not json');
    const store = new AppsPolicyStore({ filePath });
    await store.load();
    expect(store.getAll()).toEqual({});
    await store.stop();
  });

  it('get() returns a copy (mutation safe)', async () => {
    const store = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    store.recordAllow('cursor', { hourly_limit_usd: 0.5, pii_policy: 'redact', dan_carrier: 'os' });
    const policy = store.get('cursor')!;
    policy.hourly_limit_usd = 999;
    expect(store.get('cursor')!.hourly_limit_usd).toBe(0.5);
    await store.stop();
  });

  it('stop() final-flushes any pending writes', async () => {
    const store = new AppsPolicyStore({ filePath, flushDebounceMs: 10000 });
    await store.load();
    store.recordDeny('cursor');
    await store.stop();
    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('"cursor"');
  });

  it('latest decision wins (overwrites prior)', async () => {
    const store = new AppsPolicyStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    store.recordDeny('cursor');
    expect(store.get('cursor')?.decision).toBe('deny');
    store.recordAllow('cursor', { hourly_limit_usd: 1, pii_policy: 'off', dan_carrier: 'wa' });
    expect(store.get('cursor')?.decision).toBe('allow');
    expect(store.get('cursor')?.pii_policy).toBe('off');
    expect(store.get('cursor')?.dan_carrier).toBe('wa');
    await store.stop();
  });
});
