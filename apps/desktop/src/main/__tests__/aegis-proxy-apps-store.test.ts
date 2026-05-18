// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-007 apps registry store.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppsStore } from '../aegis-proxy/apps-store.js';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'aegis-apps-store-'));
  filePath = join(tmpDir, 'apps.json');
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('ASD-T-007 — AppsStore', () => {
  it('starts empty when file does not exist', async () => {
    const store = new AppsStore({ filePath });
    await store.load();
    expect(store.getAll()).toEqual({});
    await store.stop();
  });

  it('recordRequest creates a fresh entry', async () => {
    const store = new AppsStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    const rec = store.recordRequest('cursor', 'cursor');
    expect(rec.request_count).toBe(1);
    expect(rec.executables).toEqual(['cursor']);
    expect(rec.first_seen).toBeTruthy();
    expect(rec.last_seen).toBe(rec.first_seen);
    await store.stop();
  });

  it('recordRequest increments existing entry + appends new executable', async () => {
    const store = new AppsStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    store.recordRequest('cursor', 'cursor');
    store.recordRequest('cursor', 'cursor'); // same exe — no append
    const rec = store.recordRequest('cursor', 'cursor-helper'); // new exe
    expect(rec.request_count).toBe(3);
    expect(rec.executables).toEqual(['cursor', 'cursor-helper']);
    await store.stop();
  });

  it('does not duplicate executables list', async () => {
    const store = new AppsStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    for (let i = 0; i < 50; i++) store.recordRequest('cursor', 'cursor');
    const rec = store.get('cursor');
    expect(rec?.executables).toEqual(['cursor']);
    expect(rec?.request_count).toBe(50);
    await store.stop();
  });

  it('flush writes JSON file readable by another store', async () => {
    const a = new AppsStore({ filePath, flushDebounceMs: 0 });
    await a.load();
    a.recordRequest('cursor', 'cursor');
    a.recordRequest('claude-desktop', 'claude');
    await a.flush();

    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('"cursor"');
    expect(raw).toContain('"claude-desktop"');

    const b = new AppsStore({ filePath, flushDebounceMs: 0 });
    await b.load();
    expect(b.get('cursor')?.request_count).toBe(1);
    expect(b.get('claude-desktop')?.executables).toEqual(['claude']);
    await b.stop();
  });

  it('sanitises malformed entries on load', async () => {
    // Hand-craft a file with one valid entry + one missing fields + one
    // not-an-object.
    await writeFile(
      filePath,
      JSON.stringify({
        good: {
          first_seen: '2026-01-01T00:00:00Z',
          last_seen: '2026-01-02T00:00:00Z',
          request_count: 5,
          executables: ['good-exe'],
        },
        bad_missing_field: { first_seen: '2026-01-01T00:00:00Z' },
        bad_string: 'not-an-object',
      })
    );
    const store = new AppsStore({ filePath });
    await store.load();
    const map = store.getAll();
    expect(Object.keys(map)).toEqual(['good']);
    await store.stop();
  });

  it('handles corrupted JSON by starting fresh (no throw)', async () => {
    await writeFile(filePath, 'not json at all');
    const store = new AppsStore({ filePath });
    await store.load();
    expect(store.getAll()).toEqual({});
    await store.stop();
  });

  it('get() returns a copy (mutation safe)', async () => {
    const store = new AppsStore({ filePath, flushDebounceMs: 0 });
    await store.load();
    store.recordRequest('cursor', 'cursor');
    const rec = store.get('cursor')!;
    rec.request_count = 999;
    expect(store.get('cursor')!.request_count).toBe(1);
    await store.stop();
  });

  it('stop() final-flushes any pending writes', async () => {
    const store = new AppsStore({ filePath, flushDebounceMs: 10000 });
    await store.load();
    store.recordRequest('cursor', 'cursor');
    // Don't wait for timer; stop forces immediate flush.
    await store.stop();
    const raw = await readFile(filePath, 'utf8');
    expect(raw).toContain('"cursor"');
  });
});
