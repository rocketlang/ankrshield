// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-028 AuditRetentionStore + AuditRetentionWorker.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AuditRetentionStore,
  RETENTION_DAYS_DEFAULT,
  RETENTION_DAYS_MIN,
  RETENTION_DAYS_MAX,
} from '../aegis-proxy/audit-retention-config.js';
import {
  AuditRetentionWorker,
  isoWeekKey,
  __internals,
} from '../aegis-proxy/audit-retention-worker.js';
import { ConsentStore } from '../aegis-proxy/consent-store.js';
import { EventTallyStore } from '../aegis-proxy/event-tally-store.js';

let tmpRoot: string;
let auditDir: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'aegis-retention-'));
  auditDir = join(tmpRoot, 'audit');
  await mkdir(auditDir, { recursive: true });
});
afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

const FROZEN = new Date('2026-05-18T12:00:00.000Z');

// ─── AuditRetentionStore ──────────────────────────────────────────────────────

describe('ASD-T-028 — AuditRetentionStore', () => {
  it('defaults to 90d + keep_weekly + compress_prior', async () => {
    const s = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json') });
    await s.load();
    expect(s.get()).toEqual({
      retention_days: RETENTION_DAYS_DEFAULT,
      keep_weekly_digests: true,
      compress_prior_day: true,
    });
  });

  it('set(retention_days = null) means indefinite', async () => {
    const s = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await s.load();
    s.set({ retention_days: null });
    expect(s.get().retention_days).toBeNull();
    await s.stop();
  });

  it('set clamps numeric retention_days to [MIN, MAX]', async () => {
    const s = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await s.load();
    expect(s.set({ retention_days: 1 }).retention_days).toBe(RETENTION_DAYS_MIN);
    expect(s.set({ retention_days: 9999 }).retention_days).toBe(RETENTION_DAYS_MAX);
    expect(s.set({ retention_days: Number.NaN }).retention_days).toBe(RETENTION_DAYS_DEFAULT);
    await s.stop();
  });

  it('persistence roundtrip', async () => {
    const a = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await a.load();
    a.set({ retention_days: 30, compress_prior_day: false });
    await a.flush();
    const b = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json') });
    await b.load();
    expect(b.get()).toEqual({
      retention_days: 30,
      keep_weekly_digests: true,
      compress_prior_day: false,
    });
  });

  it('sanitises malformed on load', async () => {
    await writeFile(
      join(tmpRoot, 'r.json'),
      JSON.stringify({ retention_days: 'forever', keep_weekly_digests: 'maybe' })
    );
    const s = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json') });
    await s.load();
    expect(s.get().retention_days).toBe(RETENTION_DAYS_DEFAULT);
    expect(s.get().keep_weekly_digests).toBe(true);
  });

  it('corrupted JSON → defaults', async () => {
    await writeFile(join(tmpRoot, 'r.json'), '{nope');
    const s = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json') });
    await s.load();
    expect(s.get().retention_days).toBe(RETENTION_DAYS_DEFAULT);
  });
});

// ─── isoWeekKey ───────────────────────────────────────────────────────────────

describe('ASD-T-028 — isoWeekKey', () => {
  it('returns YYYY-Www format', () => {
    expect(isoWeekKey(new Date('2026-05-18T12:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('Sunday and Monday of the same ISO week share the key', () => {
    // 2026-01-04 is Sunday; 2026-01-05 is Monday — week starts Monday so
    // these belong to different ISO weeks. Verify by picking a week explicitly:
    // 2026-05-04 Mon and 2026-05-10 Sun should both be in 2026-W19.
    const mon = isoWeekKey(new Date('2026-05-04T12:00:00Z'));
    const sun = isoWeekKey(new Date('2026-05-10T12:00:00Z'));
    expect(mon).toBe(sun);
  });
});

// ─── pruning ──────────────────────────────────────────────────────────────────

describe('ASD-T-028 — AuditRetentionWorker.runHeavyPass: prune', () => {
  async function seedDateDirs(days: string[]) {
    for (const d of days) {
      const dir = join(auditDir, d);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `consent-test-${d}.json`), JSON.stringify({ ts: d }));
    }
  }

  it('prunes date-dirs older than retention_days', async () => {
    await seedDateDirs(['2026-01-01', '2026-04-01', '2026-05-17']);
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    r.set({ retention_days: 30, compress_prior_day: false });
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    const stats = await w.runHeavyPass();
    expect(stats.pruned).toBe(2); // 2026-01-01 + 2026-04-01 outside 30d
    const remaining = await readdir(auditDir);
    expect(remaining).toContain('2026-05-17');
    expect(remaining).not.toContain('2026-01-01');
    expect(remaining).not.toContain('2026-04-01');
    expect(remaining).toContain('digests'); // digest dir always preserved
  });

  it('retention_days = null never prunes', async () => {
    await seedDateDirs(['2025-01-01', '2026-05-17']);
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    r.set({ retention_days: null, compress_prior_day: false });
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    const stats = await w.runHeavyPass();
    expect(stats.pruned).toBe(0);
    const remaining = await readdir(auditDir);
    expect(remaining).toContain('2025-01-01');
    expect(remaining).toContain('2026-05-17');
  });

  it('digests subdir is never pruned even when ancient', async () => {
    await seedDateDirs(['2025-01-01']);
    await mkdir(join(auditDir, 'digests'), { recursive: true });
    await writeFile(
      join(auditDir, 'digests', 'weekly-2025-W01.json'),
      JSON.stringify({ isoWeek: '2025-W01' })
    );
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    r.set({ retention_days: 7, compress_prior_day: false });
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    await w.runHeavyPass();
    const digests = await readdir(join(auditDir, 'digests'));
    expect(digests).toContain('weekly-2025-W01.json');
  });
});

// ─── gzip prior day ───────────────────────────────────────────────────────────

describe('ASD-T-028 — AuditRetentionWorker.runHeavyPass: gzip prior day', () => {
  it('compresses yesterday .json files to .json.gz', async () => {
    const yesterday = new Date('2026-05-17T12:00:00.000Z');
    const yKey = __internals.dayKey(yesterday);
    const dir = join(auditDir, yKey);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'consent-test-1.json'),
      JSON.stringify({ ceremony: 'test', payload: 'x'.repeat(500) })
    );

    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    const stats = await w.runHeavyPass();
    expect(stats.gzipped).toBeGreaterThanOrEqual(1);
    const files = await readdir(dir);
    expect(files.some((f) => f.endsWith('.json.gz'))).toBe(true);
    expect(files).not.toContain('consent-test-1.json');
  });

  it('compress_prior_day=false skips gzip pass', async () => {
    const yesterday = new Date('2026-05-17T12:00:00.000Z');
    const yKey = __internals.dayKey(yesterday);
    const dir = join(auditDir, yKey);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'consent-test-1.json'), JSON.stringify({ x: 1 }));
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    r.set({ compress_prior_day: false });
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    const stats = await w.runHeavyPass();
    expect(stats.gzipped).toBe(0);
    const files = await readdir(dir);
    expect(files).toContain('consent-test-1.json');
  });

  it('does not re-gzip if .json.gz already exists', async () => {
    const yesterday = new Date('2026-05-17T12:00:00.000Z');
    const yKey = __internals.dayKey(yesterday);
    const dir = join(auditDir, yKey);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'consent-test-1.json'), JSON.stringify({ x: 1 }));
    await writeFile(join(dir, 'consent-test-1.json.gz'), Buffer.from([0x1f, 0x8b])); // fake gz

    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    const stats = await w.runHeavyPass();
    expect(stats.gzipped).toBe(0);
    // both should still be there — the source .json wasn't touched.
    const files = await readdir(dir);
    expect(files).toContain('consent-test-1.json');
    expect(files).toContain('consent-test-1.json.gz');
  });
});

// ─── weekly digest ────────────────────────────────────────────────────────────

describe('ASD-T-028 — AuditRetentionWorker.runHeavyPass: weekly digest', () => {
  it('writes a digest JSON keyed by ISO week', async () => {
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    const tally = new EventTallyStore({ now: () => FROZEN });
    const w = new AuditRetentionWorker(
      { retention: r, tally, consents: new ConsentStore({ auditDir }) },
      { auditDir, now: () => FROZEN }
    );
    const stats = await w.runHeavyPass();
    expect(stats.digestsWritten).toBe(1);
    const digests = await readdir(join(auditDir, 'digests'));
    expect(digests.some((f) => f.startsWith('weekly-') && f.endsWith('.json'))).toBe(true);
    const raw = await readFile(join(auditDir, 'digests', digests[0]!), 'utf8');
    const json = JSON.parse(raw);
    expect(json.isoWeek).toMatch(/^\d{4}-W\d{2}$/);
    expect(json.window_days).toBe(7);
    expect(json.generated_at).toBeTruthy();
    expect(json.per_app_tally).toEqual({});
  });

  it('counts consent records in the digest', async () => {
    // Seed two consent files in today's dir.
    const todayKey = '2026-05-18';
    const dir = join(auditDir, todayKey);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'consent-tofu-consent-' + 'a'.repeat(32) + '.json'),
      JSON.stringify({ ceremony: 'tofu-consent' })
    );
    await writeFile(
      join(dir, 'consent-dan-gate-' + 'b'.repeat(32) + '.json'),
      JSON.stringify({ ceremony: 'dan-gate' })
    );

    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    await w.runHeavyPass();
    const digests = await readdir(join(auditDir, 'digests'));
    const raw = await readFile(join(auditDir, 'digests', digests[0]!), 'utf8');
    const json = JSON.parse(raw);
    expect(json.consent_records['tofu-consent']).toBe(1);
    expect(json.consent_records['dan-gate']).toBe(1);
  });

  it('listDigests returns weekly files sorted newest first', async () => {
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    await mkdir(join(auditDir, 'digests'), { recursive: true });
    await writeFile(join(auditDir, 'digests', 'weekly-2025-W01.json'), '{}');
    await writeFile(join(auditDir, 'digests', 'weekly-2026-W20.json'), '{}');
    const list = await w.listDigests();
    expect(list).toHaveLength(2);
    expect(list[0]!.isoWeek).toBe('2026-W20');
    expect(list[1]!.isoWeek).toBe('2025-W01');
  });
});

// ─── tick gating ──────────────────────────────────────────────────────────────

describe('ASD-T-028 — AuditRetentionWorker.tick', () => {
  it('runs heavy pass on first call; no-ops on same-day re-tick', async () => {
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => FROZEN }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => FROZEN }
    );
    const s1 = await w.tick();
    expect(s1.digestsWritten).toBe(1);
    const s2 = await w.tick();
    expect(s2.digestsWritten).toBe(0);
    expect(s2.pruned).toBe(0);
    expect(s2.gzipped).toBe(0);
  });

  it('next-day tick runs heavy pass again', async () => {
    const r = new AuditRetentionStore({ filePath: join(tmpRoot, 'r.json'), flushDebounceMs: 0 });
    await r.load();
    let now = new Date('2026-05-18T12:00:00.000Z');
    const w = new AuditRetentionWorker(
      {
        retention: r,
        tally: new EventTallyStore({ now: () => now }),
        consents: new ConsentStore({ auditDir }),
      },
      { auditDir, now: () => now }
    );
    await w.tick();
    now = new Date('2026-05-19T12:00:00.000Z');
    const s = await w.tick();
    expect(s.digestsWritten).toBe(1);
  });
});

// Lift the unused-import lint noise — stat used implicitly via the worker.
void stat;
