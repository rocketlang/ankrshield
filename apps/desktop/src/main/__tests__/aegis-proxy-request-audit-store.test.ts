// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-031 RequestAuditStore (FR-13 per-request audit receipts).
//
// Covers: persistence shape, eligibility filter, no double-write vs
// ConsentStore, no PII leak in receipt body, filename uniqueness under
// concurrent writes, retention/export compatibility, attach/detach.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AegisProxyEventBus, type AegisProxyEvent } from '../aegis-proxy/event-bus.js';
import {
  RequestAuditStore,
  __internals,
  type RequestAuditReceipt,
} from '../aegis-proxy/request-audit-store.js';
import { exportAuditZip } from '../aegis-proxy/audit-export.js';

let tmpRoot: string;
let auditDir: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'aegis-request-audit-'));
  auditDir = join(tmpRoot, 'audit');
});
afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deniedEvent(over: Partial<AegisProxyEvent> = {}): AegisProxyEvent {
  return {
    kind: 'aegis.denied',
    requestId: 'req-1',
    timestamp: new Date().toISOString(),
    appId: 'cursor.app',
    hostname: 'api.anthropic.com',
    capability_hex: '0x01',
    trust_mask_hex: '0x00',
    reason: 'capability mask mismatch',
    ...over,
  } as AegisProxyEvent;
}

function piiBlockedEvent(over: Partial<AegisProxyEvent> = {}): AegisProxyEvent {
  return {
    kind: 'pii.blocked',
    requestId: 'req-2',
    timestamp: new Date().toISOString(),
    appId: 'cursor.app',
    hostname: 'api.openai.com',
    counts: { aadhaar: 1, email: 2 },
    total: 3,
    ...over,
  } as AegisProxyEvent;
}

// ─── Eligibility filter ───────────────────────────────────────────────────────

describe('ASD-T-031 — RequestAuditStore eligibility', () => {
  it('persists exactly the 8 gated event kinds', () => {
    expect(Array.from(__internals.PERSISTED_KINDS).sort()).toEqual(
      [
        'aegis.denied',
        'budget.throttled',
        'dan.resolved',
        'kill_switch.blocked',
        'pii.blocked',
        'pii.redacted',
        'pii.stream.redacted',
        'privacy.blocked',
      ].sort()
    );
  });

  it('maps each persisted kind to an ASD rule ID', () => {
    for (const kind of __internals.PERSISTED_KINDS) {
      const rule = __internals.KIND_RULE[kind];
      expect(rule, `${kind} should map to an ASD rule`).toMatch(/^ASD-\d+$/);
    }
  });

  it('skips non-gated events (request.observed, cost.recorded, consent.*)', async () => {
    const store = new RequestAuditStore({ auditDir });
    const bus = new AegisProxyEventBus();
    store.attach(bus);
    bus.emit({
      kind: 'request.observed',
      requestId: 'r',
      timestamp: new Date().toISOString(),
      observation: { provider: 'anthropic' } as never,
    });
    bus.emit({
      kind: 'cost.recorded',
      requestId: 'r',
      timestamp: new Date().toISOString(),
      appId: 'x',
      model: 'gpt-5',
      costUsd: 0.01,
      promptTokens: null,
      completionTokens: null,
    });
    bus.emit({
      kind: 'consent.resolved',
      requestId: 'r',
      timestamp: new Date().toISOString(),
      pendingId: 'pid',
      appId: 'x',
      decision: 'allow',
      timedOut: false,
    });
    // Yield one tick — there are no pending writes to await.
    await Promise.resolve();
    expect(store.stats().writes).toBe(0);
  });
});

// ─── Persistence shape ────────────────────────────────────────────────────────

describe('ASD-T-031 — RequestAuditStore persistence', () => {
  it('writes one receipt per eligible event', async () => {
    const store = new RequestAuditStore({ auditDir });
    const bus = new AegisProxyEventBus();
    store.attach(bus);
    const settled = store.nextWrite();
    bus.emit(deniedEvent());
    await settled;
    const today = new Date().toISOString().slice(0, 10);
    const files = await readdir(join(auditDir, today));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^request-aegis_denied-cursor\.app-.*\.json$/);
  });

  it('receipt body matches PRAMANA shape', async () => {
    const store = new RequestAuditStore({ auditDir });
    const path = await store.record(deniedEvent({ requestId: 'req-shape' }));
    expect(path).not.toBeNull();
    const raw = await readFile(path!, 'utf8');
    const parsed = JSON.parse(raw) as RequestAuditReceipt;
    expect(parsed.receipt_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.event_kind).toBe('aegis.denied');
    expect(parsed.request_id).toBe('req-shape');
    expect(parsed.app_id).toBe('cursor.app');
    expect(parsed.hostname).toBe('api.anthropic.com');
    expect(parsed.rule).toBe('ASD-005');
    expect(parsed.detail).toMatchObject({
      capability_hex: '0x01',
      trust_mask_hex: '0x00',
      reason: 'capability mask mismatch',
    });
  });

  it('pii receipt body carries only counts, never redacted strings', async () => {
    const store = new RequestAuditStore({ auditDir });
    const path = await store.record(piiBlockedEvent());
    const parsed = JSON.parse(await readFile(path!, 'utf8')) as RequestAuditReceipt;
    expect(parsed.detail).toEqual({ counts: { aadhaar: 1, email: 2 }, total: 3 });
    // Guard: no field on the receipt body should hold the literal value of
    // a redacted PII span. counts is a number map; total is a number.
    const flat = JSON.stringify(parsed.detail);
    expect(flat).not.toMatch(/\b\d{12}\b/); // no raw 12-digit aadhaar
    expect(flat).not.toMatch(/@/); // no raw email
  });

  it('files mode 0o644, dirs 0o700 (best-effort on POSIX)', async () => {
    if (process.platform === 'win32') return;
    const { stat } = await import('node:fs/promises');
    const store = new RequestAuditStore({ auditDir });
    const path = await store.record(deniedEvent());
    const fStat = await stat(path!);
    const dStat = await stat(join(auditDir, new Date().toISOString().slice(0, 10)));
    expect(fStat.mode & 0o777).toBe(0o644);
    expect(dStat.mode & 0o777).toBe(0o700);
  });
});

// ─── Filename uniqueness under concurrency ────────────────────────────────────

describe('ASD-T-031 — RequestAuditStore concurrency', () => {
  it('parallel writes from same app at same ms produce distinct filenames', async () => {
    const store = new RequestAuditStore({ auditDir });
    const fixedTs = '2026-05-19T10:00:00.000Z';
    // Freeze Date so two records collide on timestamp; nonce must save us.
    const realNow = Date.now;
    Date.now = () => new Date(fixedTs).getTime();
    const realIso = Date.prototype.toISOString;
    Date.prototype.toISOString = function () {
      return fixedTs;
    };
    try {
      const paths = await Promise.all([
        store.record(deniedEvent({ requestId: 'a' })),
        store.record(deniedEvent({ requestId: 'b' })),
        store.record(deniedEvent({ requestId: 'c' })),
      ]);
      const files = await readdir(join(auditDir, '2026-05-19'));
      expect(files).toHaveLength(3);
      expect(new Set(paths).size).toBe(3);
    } finally {
      Date.now = realNow;
      Date.prototype.toISOString = realIso;
    }
  });
});

// ─── Attach / detach lifecycle ────────────────────────────────────────────────

describe('ASD-T-031 — RequestAuditStore lifecycle', () => {
  it('detach() stops further writes', async () => {
    const store = new RequestAuditStore({ auditDir });
    const bus = new AegisProxyEventBus();
    store.attach(bus);
    const settled = store.nextWrite();
    bus.emit(deniedEvent({ requestId: 'before' }));
    await settled;
    expect(store.stats().writes).toBe(1);

    store.detach();
    bus.emit(deniedEvent({ requestId: 'after' }));
    // Give the bus tick a chance — but listener should be gone.
    await Promise.resolve();
    await Promise.resolve();
    expect(store.stats().writes).toBe(1);
  });

  it('attach() is idempotent — double-attach does not double-write', async () => {
    const store = new RequestAuditStore({ auditDir });
    const bus = new AegisProxyEventBus();
    store.attach(bus);
    store.attach(bus); // no-op
    const settled = store.nextWrite();
    bus.emit(deniedEvent());
    await settled;
    expect(store.stats().writes).toBe(1);
  });
});

// ─── ZIP export compatibility ─────────────────────────────────────────────────

describe('ASD-T-031 — receipts are picked up by audit-export ZIP', () => {
  it('exportAuditZip includes request-* receipts in the archive', async () => {
    const store = new RequestAuditStore({ auditDir });
    await store.record(deniedEvent({ requestId: 'export-test' }));
    const zipPath = join(tmpRoot, 'audit.zip');
    const today = new Date().toISOString().slice(0, 10);
    const result = await exportAuditZip(zipPath, { from: today, to: today }, { auditDir });
    expect(result.entryCount).toBeGreaterThanOrEqual(2); // ≥1 receipt + manifest
    expect(result.daysCovered).toContain(today);
    // ZIP central-dir lookup: verify a request-* file is named in the byte stream.
    // The store-method writer writes filenames verbatim; a grep on the raw
    // bytes is enough.
    const zipBytes = await readFile(zipPath);
    expect(zipBytes.toString('latin1')).toMatch(/request-aegis_denied-cursor\.app-/);
  });
});

// ─── Coexistence with ConsentStore ────────────────────────────────────────────

describe('ASD-T-031 — coexists with ConsentStore (filename prefix split)', () => {
  it('request-* and consent-* live in same date dir without name collision', async () => {
    const { ConsentStore } = await import('../aegis-proxy/consent-store.js');
    const consent = new ConsentStore({ auditDir });
    const reqAudit = new RequestAuditStore({ auditDir });
    await consent.record({
      ceremony: 'tofu-consent',
      decision: 'allow',
      subject: { app_id: 'cursor.app' },
      context: { purpose: 'p', consequences: 'c', revocation_path: 'r' },
    });
    await reqAudit.record(deniedEvent());
    const today = new Date().toISOString().slice(0, 10);
    const files = await readdir(join(auditDir, today));
    const consentFiles = files.filter((f) => f.startsWith('consent-'));
    const requestFiles = files.filter((f) => f.startsWith('request-'));
    expect(consentFiles).toHaveLength(1);
    expect(requestFiles).toHaveLength(1);
  });

  it('list() returns only request-* receipts, not consent-* records', async () => {
    const { ConsentStore } = await import('../aegis-proxy/consent-store.js');
    const consent = new ConsentStore({ auditDir });
    const reqAudit = new RequestAuditStore({ auditDir });
    await consent.record({
      ceremony: 'tofu-consent',
      decision: 'allow',
      subject: { app_id: 'cursor.app' },
      context: { purpose: 'p', consequences: 'c', revocation_path: 'r' },
    });
    await reqAudit.record(deniedEvent());
    const today = new Date().toISOString().slice(0, 10);
    const listed = await reqAudit.list(today);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.event_kind).toBe('aegis.denied');
  });
});

// ─── Error accounting ────────────────────────────────────────────────────────

describe('ASD-T-031 — RequestAuditStore error accounting', () => {
  it('write failure increments errors counter and does not throw on bus', async () => {
    // Point at a path that cannot be created (file where dir is expected).
    const badAuditDir = join(tmpRoot, 'audit-as-file');
    await (await import('node:fs/promises')).writeFile(badAuditDir, 'not a dir');
    const store = new RequestAuditStore({ auditDir: badAuditDir });
    const bus = new AegisProxyEventBus();
    store.attach(bus);
    bus.emit(deniedEvent());
    // Let the rejected mkdir settle (microtask + IO).
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(store.stats().writes).toBe(0);
    expect(store.stats().errors).toBeGreaterThan(0);
  });
});
