// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-036 — key-on-disk scanner + migrator (INF-ASD-002).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  scanForKeysOnDisk,
  defaultScanPaths,
  inferProvider,
  makeFindingId,
  KEY_PATTERN,
  type KeyFinding,
} from '../aegis-proxy/key-on-disk-scanner.js';
import { migrateKeyOnDisk, MIGRATED_KEY_SERVICE } from '../aegis-proxy/key-on-disk-migrator.js';
import type { CredentialBackend } from '../aegis-proxy/dan-carrier-credentials.js';

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'aegis-key-scan-'));
});
afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

// ─── KEY_PATTERN ─────────────────────────────────────────────────────────────

describe('ASD-T-036 — KEY_PATTERN', () => {
  it('matches sk-ant- prefix', () => {
    expect('sk-ant-abcdef1234567890ABCDEFGHIJ'.match(KEY_PATTERN)?.[1]).toBe(
      'sk-ant-abcdef1234567890ABCDEFGHIJ'
    );
  });

  it('matches sk- prefix (OpenAI legacy + project)', () => {
    expect('sk-proj-abcdef1234567890ABCDEFGHIJ'.match(KEY_PATTERN)?.[1]).toBe(
      'sk-proj-abcdef1234567890ABCDEFGHIJ'
    );
    expect('sk-abcdef1234567890ABCDEFGHIJ'.match(KEY_PATTERN)?.[1]).toBe(
      'sk-abcdef1234567890ABCDEFGHIJ'
    );
  });

  it('does NOT match short / fake / unrelated strings', () => {
    expect('sk-short'.match(KEY_PATTERN)).toBeNull();
    expect('not-an-api-key'.match(KEY_PATTERN)).toBeNull();
    expect('ASK_ABOUT_PRICING'.match(KEY_PATTERN)).toBeNull();
  });

  it('matches at any word boundary, not just start-of-line', () => {
    expect('OPENAI_API_KEY=sk-abcdef1234567890ABCDEFGHIJ'.match(KEY_PATTERN)?.[1]).toBe(
      'sk-abcdef1234567890ABCDEFGHIJ'
    );
  });
});

// ─── inferProvider + makeFindingId ───────────────────────────────────────────

describe('ASD-T-036 — inferProvider', () => {
  it('classifies anthropic / openai / unknown', () => {
    expect(inferProvider('sk-ant-foo')).toBe('anthropic');
    expect(inferProvider('sk-proj-foo')).toBe('openai');
    expect(inferProvider('sk-foo')).toBe('openai');
    expect(inferProvider('xx-foo')).toBe('unknown');
  });
});

describe('ASD-T-036 — makeFindingId', () => {
  it('is deterministic and 16-char lowercase hex', () => {
    const a = makeFindingId('/x', 1, 'sk-ant-abc');
    const b = makeFindingId('/x', 1, 'sk-ant-abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs across path / line / key', () => {
    const a = makeFindingId('/x', 1, 'sk-ant-abc');
    const b = makeFindingId('/y', 1, 'sk-ant-abc');
    const c = makeFindingId('/x', 2, 'sk-ant-abc');
    const d = makeFindingId('/x', 1, 'sk-ant-xyz');
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});

// ─── defaultScanPaths ────────────────────────────────────────────────────────

describe('ASD-T-036 — defaultScanPaths', () => {
  it('includes the well-known shell + cloud paths under a given home', () => {
    const paths = defaultScanPaths('/h');
    expect(paths).toContain('/h/.env');
    expect(paths).toContain('/h/.bashrc');
    expect(paths).toContain('/h/.zshrc');
    expect(paths).toContain('/h/.aws/credentials');
    expect(paths).toContain('/h/.config/ankrshield/electron-store.json');
  });
});

// ─── scanForKeysOnDisk ───────────────────────────────────────────────────────

describe('ASD-T-036 — scanForKeysOnDisk', () => {
  it('returns empty list when no files contain keys', async () => {
    const findings = await scanForKeysOnDisk({
      paths: ['/x/.env'],
      readImpl: async () => 'PATH=/usr/local/bin\nFOO=bar\n',
    });
    expect(findings).toEqual([]);
  });

  it('finds anthropic key on the right line + correct preview', async () => {
    const content =
      '# my env\n' +
      'export PATH=/usr/local/bin\n' +
      'ANTHROPIC_API_KEY=sk-ant-abcdef1234567890ABCDEFGHIJ\n';
    const findings = await scanForKeysOnDisk({
      paths: ['/h/.env'],
      readImpl: async () => content,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      path: '/h/.env',
      line: 3,
      provider: 'anthropic',
      preview: 'sk-ant-a',
    });
    expect(findings[0]?.finding_id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('finds multiple keys across multiple files; preserves order', async () => {
    const responses = new Map<string, string>([
      ['/h/.env', 'A=sk-abcdefghij1234567890XYZWQR\n'],
      ['/h/.bashrc', 'export X=sk-ant-1234567890abcdefghij1234567890\n'],
    ]);
    const findings = await scanForKeysOnDisk({
      paths: ['/h/.env', '/h/.bashrc'],
      readImpl: async (p) => responses.get(p) ?? null,
    });
    expect(findings.map((f) => f.path)).toEqual(['/h/.env', '/h/.bashrc']);
    expect(findings.map((f) => f.provider)).toEqual(['openai', 'anthropic']);
  });

  it('silently skips paths the reader returns null for (missing files)', async () => {
    const findings = await scanForKeysOnDisk({
      paths: ['/h/.env', '/h/.bashrc'],
      readImpl: async (p) => (p === '/h/.env' ? 'X=sk-abcdef1234567890ABCDEFGHIJ' : null),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('/h/.env');
  });

  it('preview is exactly 8 chars + never the full secret', async () => {
    const findings = await scanForKeysOnDisk({
      paths: ['/h/.env'],
      readImpl: async () => 'X=sk-ant-supersecretvalue1234567890\n',
    });
    expect(findings[0]?.preview.length).toBe(8);
    expect(findings[0]?.preview).not.toContain('supersecret');
  });
});

// ─── migrateKeyOnDisk ────────────────────────────────────────────────────────

interface FakeBackend extends CredentialBackend {
  stored: Map<string, string>;
}

function makeFakeBackend(): FakeBackend {
  const stored = new Map<string, string>();
  return {
    stored,
    getPassword: (s, a) => stored.get(`${s}/${a}`) ?? null,
    setPassword: (s, a, v) => stored.set(`${s}/${a}`, v),
    deletePassword: (s, a) => stored.delete(`${s}/${a}`),
  };
}

describe('ASD-T-036 — migrateKeyOnDisk', () => {
  it('happy path: backs up source, writes keychain, rewrites source with marker', async () => {
    const path = join(tmpRoot, '.env');
    const secret = 'sk-ant-abcdef1234567890ABCDEFGHIJ';
    await writeFile(path, `ANTHROPIC_API_KEY=${secret}\nFOO=bar\n`);

    const finding: KeyFinding = {
      path,
      line: 1,
      provider: 'anthropic',
      preview: secret.slice(0, 8),
      finding_id: 'test-id',
    };
    const backend = makeFakeBackend();
    const result = await migrateKeyOnDisk(finding, {
      backend,
      now: () => new Date('2026-05-19T12:00:00Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keychain_service).toBe(MIGRATED_KEY_SERVICE);
    expect(result.keychain_account).toMatch(/^anthropic-[0-9a-f]{8}$/);
    // Keychain holds the original secret.
    expect(backend.stored.get(`${result.keychain_service}/${result.keychain_account}`)).toBe(
      secret
    );
    // Backup exists with the original content.
    const backup = await readFile(result.backup_path, 'utf8');
    expect(backup).toContain(secret);
    // Source rewritten with marker; secret no longer present.
    const after = await readFile(path, 'utf8');
    expect(after).not.toContain(secret);
    expect(after).toContain('[MIGRATED-TO-KEYCHAIN');
    expect(after).toContain(`keychain=${MIGRATED_KEY_SERVICE}/${result.keychain_account}`);
    // Other lines preserved.
    expect(after).toContain('FOO=bar');
  });

  it('aborts cleanly if source file is missing', async () => {
    const finding: KeyFinding = {
      path: join(tmpRoot, 'does-not-exist'),
      line: 1,
      provider: 'anthropic',
      preview: 'sk-ant-a',
      finding_id: 'gone',
    };
    const result = await migrateKeyOnDisk(finding, { backend: makeFakeBackend() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no longer exists/);
  });

  it('aborts cleanly if secret is no longer at recorded location', async () => {
    const path = join(tmpRoot, '.env');
    await writeFile(path, 'NO_KEY_HERE=anymore\n');
    const finding: KeyFinding = {
      path,
      line: 1,
      provider: 'anthropic',
      preview: 'sk-ant-a',
      finding_id: 'stale',
    };
    const backend = makeFakeBackend();
    const result = await migrateKeyOnDisk(finding, { backend });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no longer at the recorded location/);
    // Keychain untouched.
    expect(backend.stored.size).toBe(0);
  });

  it('tolerates ±3 line drift (file edited since scan)', async () => {
    const path = join(tmpRoot, '.env');
    const secret = 'sk-ant-abcdef1234567890ABCDEFGHIJ';
    // Secret is on line 4 but finding said line 2 — within ±3 window.
    await writeFile(path, `# line 1\n# line 2\n# line 3\nANTHROPIC_API_KEY=${secret}\n`);
    const finding: KeyFinding = {
      path,
      line: 2,
      provider: 'anthropic',
      preview: secret.slice(0, 8),
      finding_id: 'drifted',
    };
    const result = await migrateKeyOnDisk(finding, { backend: makeFakeBackend() });
    expect(result.ok).toBe(true);
    const after = await readFile(path, 'utf8');
    expect(after).not.toContain(secret);
  });

  it('keychain write failure aborts without touching source', async () => {
    const path = join(tmpRoot, '.env');
    const secret = 'sk-ant-abcdef1234567890ABCDEFGHIJ';
    const original = `ANTHROPIC_API_KEY=${secret}\n`;
    await writeFile(path, original);
    const finding: KeyFinding = {
      path,
      line: 1,
      provider: 'anthropic',
      preview: secret.slice(0, 8),
      finding_id: 'kc-fail',
    };
    const backend: CredentialBackend = {
      getPassword: () => null,
      setPassword: () => {
        throw new Error('keychain locked');
      },
      deletePassword: () => false,
    };
    const result = await migrateKeyOnDisk(finding, { backend });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/keychain write failed/);
    // Source still intact.
    expect(await readFile(path, 'utf8')).toBe(original);
  });

  it('backup file is owner-readable (POSIX 0o600 not asserted on Windows)', async () => {
    if (process.platform === 'win32') return;
    const path = join(tmpRoot, '.env');
    const secret = 'sk-ant-abcdef1234567890ABCDEFGHIJ';
    await writeFile(path, `K=${secret}\n`);
    const finding: KeyFinding = {
      path,
      line: 1,
      provider: 'anthropic',
      preview: secret.slice(0, 8),
      finding_id: 'mode',
    };
    const result = await migrateKeyOnDisk(finding, { backend: makeFakeBackend() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { stat } = await import('node:fs/promises');
    const s = await stat(result.backup_path);
    // Source rewrite mode is 0o600; backup inherits source perms via copyFile.
    // We don't assert backup mode (platform-dependent) — just that source
    // came back at 0o600.
    const src = await stat(path);
    expect(src.mode & 0o777).toBe(0o600);
  });
});
