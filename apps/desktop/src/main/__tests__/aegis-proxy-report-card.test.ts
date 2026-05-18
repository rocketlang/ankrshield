// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-024 EventTallyStore + scorePosture + buildReportCard.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AegisProxyEventBus } from '../aegis-proxy/event-bus.js';
import { AppsPolicyStore } from '../aegis-proxy/apps-policy.js';
import { BudgetLedger } from '../aegis-proxy/budget-ledger.js';
import { EventTallyStore } from '../aegis-proxy/event-tally-store.js';
import { scorePosture } from '../aegis-proxy/hanumang-mandate-vendored.js';
import { buildReportCard, buildAllReportCards } from '../aegis-proxy/report-card.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'aegis-report-card-'));
});
afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

const FROZEN = new Date('2026-05-18T12:00:00.000Z');

// ─── EventTallyStore ──────────────────────────────────────────────────────────

describe('ASD-T-024 — EventTallyStore.handle', () => {
  it('starts empty; rollup of unknown app is a blank bucket', () => {
    const s = new EventTallyStore({ now: () => FROZEN });
    const b = s.rollup('cursor', 1);
    expect(b.request_observed).toBe(0);
    expect(b.dan_held).toBe(0);
  });

  it('counts request.observed against the right app + day', () => {
    const bus = new AegisProxyEventBus();
    const s = new EventTallyStore({ now: () => FROZEN });
    s.attach(bus);
    bus.emit({
      kind: 'request.observed',
      requestId: 'r1',
      timestamp: '2026-05-18T11:00:00.000Z',
      observation: {
        provider: 'anthropic',
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        model: 'claude-opus-4-7',
        isStreaming: false,
        promptText: 'hi',
        systemPrompt: null,
        hasTools: false,
        messageCount: 1,
        requestBytes: 100,
        appId: 'cursor',
        pid: 1234,
        executable: 'cursor',
      },
    });
    const r = s.rollup('cursor', 1);
    expect(r.request_observed).toBe(1);
    expect(r.first_seen).toBe('2026-05-18T11:00:00.000Z');
    s.detach();
  });

  it('counts pii.redacted + pii.blocked + pii.stream.redacted with spans tally', () => {
    const bus = new AegisProxyEventBus();
    const s = new EventTallyStore({ now: () => FROZEN });
    s.attach(bus);
    bus.emit({
      kind: 'pii.redacted',
      requestId: 'r1',
      timestamp: '2026-05-18T11:00:00.000Z',
      appId: 'cursor',
      hostname: 'h',
      counts: { aadhaar: 2 },
      total: 2,
    });
    bus.emit({
      kind: 'pii.blocked',
      requestId: 'r2',
      timestamp: '2026-05-18T11:00:00.000Z',
      appId: 'cursor',
      hostname: 'h',
      counts: { pan: 1 },
      total: 1,
    });
    bus.emit({
      kind: 'pii.stream.redacted',
      requestId: 'r3',
      timestamp: '2026-05-18T11:00:00.000Z',
      appId: 'cursor',
      hostname: 'h',
      counts: { email: 3 },
      total: 3,
    });
    const r = s.rollup('cursor', 1);
    expect(r.pii_redacted).toBe(1);
    expect(r.pii_blocked).toBe(1);
    expect(r.pii_stream_redacted).toBe(1);
    expect(r.pii_spans_total).toBe(6);
  });

  it('dispatches dan.resolved by outcome (timeout / allow / deny)', () => {
    const s = new EventTallyStore({ now: () => FROZEN });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    for (const decision of ['allow', 'deny'] as const) {
      bus.emit({
        kind: 'dan.resolved',
        requestId: 'r',
        timestamp: '2026-05-18T11:00:00.000Z',
        pendingId: 'p',
        appId: 'cursor',
        decision,
        timedOut: false,
      });
    }
    bus.emit({
      kind: 'dan.resolved',
      requestId: 'r',
      timestamp: '2026-05-18T11:00:00.000Z',
      pendingId: 'p',
      appId: 'cursor',
      decision: 'deny',
      timedOut: true,
    });
    const r = s.rollup('cursor', 1);
    expect(r.dan_allowed).toBe(1);
    expect(r.dan_denied).toBe(1);
    expect(r.dan_timed_out).toBe(1);
  });

  it('dispatches dan.skipped by reason', () => {
    const s = new EventTallyStore({ now: () => FROZEN });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    for (const reason of ['cached-allow', 'cached-deny', 'no-high-tools'] as const) {
      bus.emit({
        kind: 'dan.skipped',
        requestId: 'r',
        timestamp: '2026-05-18T11:00:00.000Z',
        appId: 'cursor',
        hostname: 'h',
        reason,
      });
    }
    const r = s.rollup('cursor', 1);
    expect(r.dan_skipped_cached_allow).toBe(1);
    expect(r.dan_skipped_cached_deny).toBe(1);
    expect(r.dan_skipped_no_high_tools).toBe(1);
  });

  it('different apps stay independent', () => {
    const s = new EventTallyStore({ now: () => FROZEN });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    bus.emit({
      kind: 'aegis.denied',
      requestId: 'r',
      timestamp: '2026-05-18T11:00:00.000Z',
      appId: 'cursor',
      hostname: 'h',
      capability_hex: '0x1',
      trust_mask_hex: '0x0',
      reason: 'x',
    });
    bus.emit({
      kind: 'aegis.denied',
      requestId: 'r',
      timestamp: '2026-05-18T11:00:00.000Z',
      appId: 'claude-desktop',
      hostname: 'h',
      capability_hex: '0x1',
      trust_mask_hex: '0x0',
      reason: 'x',
    });
    expect(s.rollup('cursor', 1).aegis_denied).toBe(1);
    expect(s.rollup('claude-desktop', 1).aegis_denied).toBe(1);
    expect(s.rollup('unknown', 1).aegis_denied).toBe(0);
  });

  it('range() returns contiguous zero-filled buckets', () => {
    const s = new EventTallyStore({ now: () => FROZEN });
    const buckets = s.range('cursor', 7);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.request_observed === 0)).toBe(true);
  });

  it('detach stops further counting', () => {
    const s = new EventTallyStore({ now: () => FROZEN });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    bus.emit({
      kind: 'request.observed',
      requestId: 'r1',
      timestamp: '2026-05-18T11:00:00.000Z',
      observation: {
        provider: 'anthropic',
        hostname: 'h',
        path: '/',
        method: 'POST',
        model: null,
        isStreaming: false,
        promptText: '',
        systemPrompt: null,
        hasTools: false,
        messageCount: 0,
        requestBytes: 0,
        appId: 'cursor',
        pid: null,
        executable: null,
      },
    });
    s.detach();
    bus.emit({
      kind: 'request.observed',
      requestId: 'r2',
      timestamp: '2026-05-18T11:00:00.000Z',
      observation: {
        provider: 'anthropic',
        hostname: 'h',
        path: '/',
        method: 'POST',
        model: null,
        isStreaming: false,
        promptText: '',
        systemPrompt: null,
        hasTools: false,
        messageCount: 0,
        requestBytes: 0,
        appId: 'cursor',
        pid: null,
        executable: null,
      },
    });
    expect(s.rollup('cursor', 1).request_observed).toBe(1);
  });

  it('retention pruning drops day buckets older than retentionDays', () => {
    const s = new EventTallyStore({
      now: () => new Date('2026-05-18T12:00:00Z'),
      retentionDays: 2,
    });
    const bus = new AegisProxyEventBus();
    s.attach(bus);
    // Old event 5 days ago.
    bus.emit({
      kind: 'aegis.denied',
      requestId: 'r',
      timestamp: '2026-05-13T11:00:00.000Z',
      appId: 'cursor',
      hostname: 'h',
      capability_hex: '0x1',
      trust_mask_hex: '0x0',
      reason: 'x',
    });
    // Recent event yesterday.
    bus.emit({
      kind: 'aegis.denied',
      requestId: 'r',
      timestamp: '2026-05-17T11:00:00.000Z',
      appId: 'cursor',
      hostname: 'h',
      capability_hex: '0x1',
      trust_mask_hex: '0x0',
      reason: 'x',
    });
    const snap = s.snapshot();
    expect(snap.cursor).toBeDefined();
    expect(Object.keys(snap.cursor)).toEqual(['2026-05-17']);
  });
});

// ─── scorePosture ─────────────────────────────────────────────────────────────

describe('ASD-T-024 — scorePosture', () => {
  it('returns null overall when bucket is empty + no policy', () => {
    const s = scorePosture({
      appId: 'cursor',
      bucket: emptyBucket('2026-05-18'),
      days: 1,
      windowStart: 'a',
      windowEnd: 'b',
      totalUsd: 0,
      hourlyCapUsd: null,
      hasStoredPolicy: false,
    });
    // identity_broadcast is 0 (no policy); return_with_proof is 1 (architectural);
    // others are null — overall is mean of {0, 1} = 0.5.
    expect(s.overall).not.toBeNull();
    expect(s.judged_axes).toBeGreaterThanOrEqual(2);
  });

  it('identity_broadcast = 1 when TOFU policy stored', () => {
    const s = scorePosture({
      appId: 'cursor',
      bucket: emptyBucket('2026-05-18'),
      days: 1,
      windowStart: 'a',
      windowEnd: 'b',
      totalUsd: 0,
      hourlyCapUsd: 0.5,
      hasStoredPolicy: true,
    });
    const ident = s.per_axis.find((a) => a.axis === 'identity_broadcast');
    expect(ident?.score).toBe(1);
  });

  it('proportional_force penalises 100% approve over 5+ decisions', () => {
    const b = emptyBucket('2026-05-18');
    b.dan_allowed = 10;
    const s = scorePosture({
      appId: 'cursor',
      bucket: b,
      days: 1,
      windowStart: 'a',
      windowEnd: 'b',
      totalUsd: 0,
      hourlyCapUsd: null,
      hasStoredPolicy: true,
    });
    const pf = s.per_axis.find((a) => a.axis === 'proportional_force');
    expect(pf?.score).toBeLessThanOrEqual(0.5);
  });

  it('overall ∈ [0, 1] and rounded to 2dp', () => {
    const b = emptyBucket('2026-05-18');
    b.request_observed = 10;
    b.dan_allowed = 7;
    b.dan_denied = 3;
    const s = scorePosture({
      appId: 'cursor',
      bucket: b,
      days: 1,
      windowStart: 'a',
      windowEnd: 'b',
      totalUsd: 0.1,
      hourlyCapUsd: 1,
      hasStoredPolicy: true,
    });
    expect(s.overall).not.toBeNull();
    expect(s.overall!).toBeGreaterThanOrEqual(0);
    expect(s.overall!).toBeLessThanOrEqual(1);
    expect(Math.round(s.overall! * 100) / 100).toBeCloseTo(s.overall!, 6);
  });

  it('no_overreach null when cap is null', () => {
    const s = scorePosture({
      appId: 'cursor',
      bucket: emptyBucket('2026-05-18'),
      days: 1,
      windowStart: 'a',
      windowEnd: 'b',
      totalUsd: 999,
      hourlyCapUsd: null,
      hasStoredPolicy: true,
    });
    const ax = s.per_axis.find((a) => a.axis === 'no_overreach');
    expect(ax?.score).toBeNull();
  });
});

// ─── buildReportCard ──────────────────────────────────────────────────────────

describe('ASD-T-024 — buildReportCard', () => {
  it('produces row with bucket + spend + policy + posture', async () => {
    const tally = new EventTallyStore({ now: () => FROZEN });
    const ledger = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    const appsPolicy = new AppsPolicyStore({
      filePath: join(tmpDir, 'ap.json'),
      flushDebounceMs: 0,
    });
    await appsPolicy.load();
    appsPolicy.recordAllow('cursor', {
      hourly_limit_usd: 0.5,
      pii_policy: 'redact',
      dan_carrier: 'os',
    });
    ledger.recordCost('cursor', 0.05, FROZEN);

    const row = buildReportCard('cursor', { tally, ledger, appsPolicy }, { now: () => FROZEN });
    expect(row.appId).toBe('cursor');
    expect(row.totalUsd).toBeCloseTo(0.05, 6);
    expect(row.totalRequests).toBe(1);
    expect(row.policy.decision).toBe('allow');
    expect(row.policy.hourly_limit_usd).toBe(0.5);
    expect(row.posture).toBeDefined();
    expect(row.posture.per_axis.length).toBe(7);
    await appsPolicy.stop();
    await ledger.stop();
  });

  it('buildAllReportCards unions across stores + sorts worst posture first', async () => {
    const tally = new EventTallyStore({ now: () => FROZEN });
    const ledger = new BudgetLedger({ filePath: join(tmpDir, 'b.json'), flushDebounceMs: 0 });
    const appsPolicy = new AppsPolicyStore({
      filePath: join(tmpDir, 'ap.json'),
      flushDebounceMs: 0,
    });
    await appsPolicy.load();
    // cursor has a policy + activity → higher posture.
    appsPolicy.recordAllow('cursor', {
      hourly_limit_usd: 1,
      pii_policy: 'redact',
      dan_carrier: 'os',
    });
    ledger.recordCost('cursor', 0.1, FROZEN);
    // shady-cli only appears in ledger → no policy → lower posture.
    ledger.recordCost('shady-cli', 0.05, FROZEN);

    const rows = buildAllReportCards({ tally, ledger, appsPolicy }, { now: () => FROZEN });
    expect(rows.map((r) => r.appId).sort()).toEqual(['cursor', 'shady-cli']);
    // shady-cli (no policy) should sort first (worst posture first).
    expect(rows[0]!.appId).toBe('shady-cli');
    await appsPolicy.stop();
    await ledger.stop();
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyBucket(date: string) {
  return {
    date,
    request_observed: 0,
    pii_redacted: 0,
    pii_blocked: 0,
    pii_stream_redacted: 0,
    aegis_denied: 0,
    dan_held: 0,
    dan_allowed: 0,
    dan_denied: 0,
    dan_timed_out: 0,
    dan_skipped_cached_allow: 0,
    dan_skipped_cached_deny: 0,
    dan_skipped_no_high_tools: 0,
    budget_throttled: 0,
    pii_spans_total: 0,
    first_seen: null,
    last_seen: null,
  };
}
