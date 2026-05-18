// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-029 ZipWriter + audit export.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ZipWriter, crc32, toDosTime } from '../aegis-proxy/zip-writer.js';
import { exportAuditZip } from '../aegis-proxy/audit-export.js';

let tmpRoot: string;
let auditDir: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'aegis-zip-export-'));
  auditDir = join(tmpRoot, 'audit');
  await mkdir(auditDir, { recursive: true });
});
afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

// ─── crc32 ────────────────────────────────────────────────────────────────────

describe('ASD-T-029 — crc32', () => {
  it('returns 0 for empty buffer', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('matches known value for "abc"', () => {
    // CRC-32 of "abc" (IEEE 802.3) = 0x352441C2.
    expect(crc32(Buffer.from('abc'))).toBe(0x352441c2);
  });

  it('matches known value for "The quick brown fox jumps over the lazy dog"', () => {
    expect(crc32(Buffer.from('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('is deterministic across calls', () => {
    const a = crc32(Buffer.from('hello world'));
    const b = crc32(Buffer.from('hello world'));
    expect(a).toBe(b);
  });
});

// ─── toDosTime ────────────────────────────────────────────────────────────────

describe('ASD-T-029 — toDosTime', () => {
  it('encodes seconds/2 in low 5 bits of dosTime', () => {
    const d = new Date(2026, 4, 18, 12, 30, 30);
    const { dosTime } = toDosTime(d);
    expect(dosTime & 0x1f).toBe(15); // 30 / 2
  });

  it('encodes year-1980 in high 7 bits of dosDate', () => {
    const d = new Date(2026, 4, 18, 0, 0, 0);
    const { dosDate } = toDosTime(d);
    expect((dosDate >> 9) & 0x7f).toBe(46); // 2026 - 1980
  });

  it('handles dates before 1980 by clamping year to 0', () => {
    const d = new Date(1970, 0, 1, 0, 0, 0);
    const { dosDate } = toDosTime(d);
    expect((dosDate >> 9) & 0x7f).toBe(0);
  });
});

// ─── ZipWriter ────────────────────────────────────────────────────────────────

function writerToBuffer(): { writer: ZipWriter; getBytes: () => Buffer } {
  const chunks: Buffer[] = [];
  const writer = new ZipWriter({ write: (c) => chunks.push(c) });
  return { writer, getBytes: () => Buffer.concat(chunks) };
}

describe('ASD-T-029 — ZipWriter', () => {
  it('produces a valid empty ZIP (just EOCD)', () => {
    const { writer, getBytes } = writerToBuffer();
    writer.end();
    const bytes = getBytes();
    // Empty ZIP = 22-byte EOCD only.
    expect(bytes.length).toBe(22);
    // EOCD signature = 0x06054b50.
    expect(bytes.readUInt32LE(0)).toBe(0x06054b50);
    expect(writer.entryCount()).toBe(0);
  });

  it('writes a single entry with correct LFH signature', () => {
    const { writer, getBytes } = writerToBuffer();
    writer.add({ path: 'hello.txt', data: Buffer.from('hello world') });
    writer.end();
    const bytes = getBytes();
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50); // LFH sig
    // path follows at offset 30
    const pathBytes = bytes.subarray(30, 30 + 'hello.txt'.length);
    expect(pathBytes.toString('utf8')).toBe('hello.txt');
    expect(writer.entryCount()).toBe(1);
  });

  it('byteLength matches actual emitted bytes', () => {
    const { writer, getBytes } = writerToBuffer();
    writer.add({ path: 'a', data: Buffer.from('a'.repeat(100)) });
    writer.add({ path: 'b', data: Buffer.from('b'.repeat(200)) });
    writer.end();
    expect(writer.byteLength()).toBe(getBytes().length);
  });

  it('add() after end() throws', () => {
    const { writer } = writerToBuffer();
    writer.end();
    expect(() => writer.add({ path: 'late.txt', data: Buffer.from('x') })).toThrow(/closed/);
  });

  it('end() is idempotent', () => {
    const { writer, getBytes } = writerToBuffer();
    writer.add({ path: 'a', data: Buffer.from('x') });
    writer.end();
    const len1 = getBytes().length;
    writer.end();
    const len2 = getBytes().length;
    expect(len2).toBe(len1);
  });

  it('ZIP unzips correctly with system unzip(1)', async () => {
    // Skip if unzip isn't available (CI runners always have it on Linux/macOS).
    let hasUnzip = false;
    try {
      execSync('which unzip', { stdio: 'pipe' });
      hasUnzip = true;
    } catch {
      hasUnzip = false;
    }
    if (!hasUnzip) {
      expect(true).toBe(true);
      return;
    }

    const { writer, getBytes } = writerToBuffer();
    writer.add({ path: 'a.txt', data: Buffer.from('alpha\n') });
    writer.add({ path: 'sub/b.txt', data: Buffer.from('beta\n') });
    writer.end();
    const zipPath = join(tmpRoot, 'roundtrip.zip');
    await writeFile(zipPath, getBytes());

    const extractDir = join(tmpRoot, 'extract');
    await mkdir(extractDir, { recursive: true });
    execSync(`unzip -q ${zipPath} -d ${extractDir}`);

    expect(existsSync(join(extractDir, 'a.txt'))).toBe(true);
    expect(existsSync(join(extractDir, 'sub', 'b.txt'))).toBe(true);
    const a = await readFile(join(extractDir, 'a.txt'), 'utf8');
    const b = await readFile(join(extractDir, 'sub', 'b.txt'), 'utf8');
    expect(a).toBe('alpha\n');
    expect(b).toBe('beta\n');
  });
});

// ─── exportAuditZip ───────────────────────────────────────────────────────────

const FROZEN = new Date('2026-05-18T12:00:00.000Z');

async function seedDay(day: string, files: Record<string, string>): Promise<void> {
  const dir = join(auditDir, day);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
}

describe('ASD-T-029 — exportAuditZip', () => {
  it('writes a ZIP containing days in the range + manifest.json', async () => {
    await seedDay('2026-05-15', { 'consent-tofu-x.json': '{"x":1}' });
    await seedDay('2026-05-16', { 'consent-dan-y.json': '{"y":2}' });
    await seedDay('2026-05-17', { 'consent-other-z.json': '{"z":3}' });

    const outPath = join(tmpRoot, 'export.zip');
    const result = await exportAuditZip(
      outPath,
      { from: '2026-05-15', to: '2026-05-16' },
      { auditDir, now: () => FROZEN }
    );

    expect(result.outputPath).toBe(outPath);
    expect(result.daysCovered).toEqual(['2026-05-15', '2026-05-16']);
    expect(result.entryCount).toBeGreaterThanOrEqual(3); // 2 consent files + manifest
    expect(existsSync(outPath)).toBe(true);
  });

  it('excludes days outside the range', async () => {
    await seedDay('2026-04-01', { 'old.json': '{}' });
    await seedDay('2026-05-17', { 'recent.json': '{}' });
    const outPath = join(tmpRoot, 'export.zip');
    const result = await exportAuditZip(
      outPath,
      { from: '2026-05-01', to: '2026-05-31' },
      { auditDir, now: () => FROZEN }
    );
    expect(result.daysCovered).toEqual(['2026-05-17']);
  });

  it('defaults: from = earliest, to = today', async () => {
    await seedDay('2026-05-17', { 'r.json': '{}' });
    await seedDay('2026-05-18', { 'r.json': '{}' });
    const outPath = join(tmpRoot, 'export.zip');
    const result = await exportAuditZip(outPath, {}, { auditDir, now: () => FROZEN });
    expect(result.daysCovered).toEqual(['2026-05-17', '2026-05-18']);
  });

  it('throws when from > to', async () => {
    await expect(
      exportAuditZip(
        join(tmpRoot, 'x.zip'),
        { from: '2026-05-20', to: '2026-05-15' },
        { auditDir, now: () => FROZEN }
      )
    ).rejects.toThrow(/from.*>.*to/);
  });

  it('handles empty audit dir gracefully', async () => {
    const outPath = join(tmpRoot, 'empty.zip');
    const result = await exportAuditZip(outPath, {}, { auditDir, now: () => FROZEN });
    expect(result.daysCovered).toEqual([]);
    // manifest.json always present.
    expect(result.entryCount).toBe(1);
  });

  it('includes digests whose ISO-week intersects the range', async () => {
    await mkdir(join(auditDir, 'digests'), { recursive: true });
    // 2026-05-18 is in 2026-W21 (Mon May 18 ~ Sun May 24).
    await writeFile(join(auditDir, 'digests', 'weekly-2026-W21.json'), '{"x":1}');
    // Old digest from 2024 — should not be included for a May-2026 range.
    await writeFile(join(auditDir, 'digests', 'weekly-2024-W01.json'), '{"x":1}');

    const outPath = join(tmpRoot, 'export.zip');
    const result = await exportAuditZip(
      outPath,
      { from: '2026-05-15', to: '2026-05-18' },
      { auditDir, now: () => FROZEN }
    );
    expect(result.digestsIncluded).toContain('weekly-2026-W21.json');
    expect(result.digestsIncluded).not.toContain('weekly-2024-W01.json');
  });

  it('manifest.json content includes range + counts', async () => {
    // Try to unzip with system unzip and read manifest.
    let hasUnzip = false;
    try {
      execSync('which unzip', { stdio: 'pipe' });
      hasUnzip = true;
    } catch {
      hasUnzip = false;
    }
    if (!hasUnzip) {
      expect(true).toBe(true);
      return;
    }

    await seedDay('2026-05-17', { 'consent-x.json': '{"x":1}' });
    const outPath = join(tmpRoot, 'export.zip');
    await exportAuditZip(outPath, {}, { auditDir, now: () => FROZEN });

    const extractDir = join(tmpRoot, 'extract');
    await mkdir(extractDir, { recursive: true });
    execSync(`unzip -q ${outPath} -d ${extractDir}`);
    const manifestPath = join(extractDir, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(manifest.schema_version).toBe(1);
    expect(manifest.range.from).toBe('0000-00-00');
    expect(manifest.range.to).toBe('2026-05-18');
    expect(manifest.days_covered).toContain('2026-05-17');

    // Day file extracted correctly.
    expect(existsSync(join(extractDir, '2026-05-17', 'consent-x.json'))).toBe(true);
    const dayFile = await readFile(join(extractDir, '2026-05-17', 'consent-x.json'), 'utf8');
    expect(dayFile).toBe('{"x":1}');
  });

  it('non-existent audit dir → empty export with just manifest', async () => {
    const outPath = join(tmpRoot, 'no-audit.zip');
    const result = await exportAuditZip(
      outPath,
      {},
      { auditDir: join(tmpRoot, 'nope'), now: () => FROZEN }
    );
    expect(result.daysCovered).toEqual([]);
    expect(result.entryCount).toBe(1);
  });
});

// silence unused-import lint
void readdir;
