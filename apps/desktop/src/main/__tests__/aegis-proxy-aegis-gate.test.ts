// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-012 AEGIS lite gate.

import { describe, it, expect } from 'vitest';

import {
  AegisGate,
  AegisLiteError,
  DESKTOP_AGENT_MASK,
  resolveCapability,
} from '../aegis-proxy/aegis-gate.js';
import { TRUST_PERM, ROLE_MASK } from '../aegis-proxy/aegis-lite-vendored.js';

describe('ASD-T-012 — DESKTOP_AGENT_MASK', () => {
  it('includes the four AI_* bits plus EXECUTOR role', () => {
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.AI_READ).toBeTruthy();
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.AI_QUERY).toBeTruthy();
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.AI_SUGGEST).toBeTruthy();
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.AI_EXECUTE).toBeTruthy();
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.READ).toBeTruthy();
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.EXECUTE).toBeTruthy();
  });

  it('does NOT include APPROVE or AUTONOMOUS by default', () => {
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.APPROVE).toBe(0);
    expect(DESKTOP_AGENT_MASK & TRUST_PERM.AUTONOMOUS).toBe(0);
  });
});

describe('ASD-T-012 — resolveCapability', () => {
  it('returns AI_EXECUTE for any observed LLM call (P2 step 1 coarse mapping)', () => {
    expect(resolveCapability({ appId: 'cursor', hasTools: false, isStreaming: false })).toBe(
      TRUST_PERM.AI_EXECUTE
    );
    expect(resolveCapability({ appId: 'cursor', hasTools: true, isStreaming: true })).toBe(
      TRUST_PERM.AI_EXECUTE
    );
  });
});

describe('ASD-T-012 — AegisGate', () => {
  it('agentFor creates an agent with DESKTOP_AGENT_MASK on first call', () => {
    const gate = new AegisGate();
    const a = gate.agentFor('cursor');
    expect(a.id).toBe('cursor');
    expect(a.trust_mask).toBe(DESKTOP_AGENT_MASK);
  });

  it('agentFor is idempotent (same agent object reused)', () => {
    const gate = new AegisGate();
    const a = gate.agentFor('cursor');
    const b = gate.agentFor('cursor');
    expect(b).toBe(a);
  });

  it('guard() returns LiteGuardResult for default-mask app + AI_EXECUTE', () => {
    const gate = new AegisGate();
    const result = gate.guard({ appId: 'cursor', hasTools: false, isStreaming: true });
    expect(result.allowed).toBe(true);
    expect(result.agent_id).toBe('cursor');
    expect(result.capability).toBe(TRUST_PERM.AI_EXECUTE);
  });

  it('guard() throws AegisLiteError when trust_mask lacks AI_EXECUTE', () => {
    const gate = new AegisGate();
    // Downgrade to VIEWER (no EXECUTE, no AI_* bits)
    gate.setTrustMask('downgraded', ROLE_MASK.VIEWER);
    expect(() => gate.guard({ appId: 'downgraded', hasTools: false, isStreaming: false })).toThrow(
      AegisLiteError
    );
  });

  it('AegisLiteError carries agent_id, capability, trust_mask for event emission', () => {
    const gate = new AegisGate();
    gate.setTrustMask('test', ROLE_MASK.GUEST); // 0 mask
    try {
      gate.guard({ appId: 'test', hasTools: false, isStreaming: false });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AegisLiteError);
      const e = err as AegisLiteError;
      expect(e.agent_id).toBe('test');
      expect(e.capability).toBe(TRUST_PERM.AI_EXECUTE);
      expect(e.trust_mask).toBe(0);
      expect(e.message).toMatch(/AEGIS Lite/);
    }
  });

  it('setTrustMask replaces existing agent (used by P2 TOFU dialog)', () => {
    const gate = new AegisGate();
    gate.agentFor('cursor'); // default mask
    gate.setTrustMask('cursor', TRUST_PERM.AI_READ); // downgrade
    // AI_EXECUTE not in mask → guard should throw
    expect(() => gate.guard({ appId: 'cursor', hasTools: false, isStreaming: false })).toThrow(
      AegisLiteError
    );
    // AI_READ would pass but resolveCapability returns AI_EXECUTE in P2 step 1
  });

  it('snapshot returns the per-app trust_mask map', () => {
    const gate = new AegisGate();
    gate.agentFor('cursor');
    gate.agentFor('claude-desktop');
    gate.setTrustMask('downgraded', ROLE_MASK.VIEWER);
    const snap = gate.snapshot();
    expect(snap.length).toBe(3);
    expect(snap.find((s) => s.appId === 'cursor')).toBeDefined();
    expect(snap.find((s) => s.appId === 'downgraded')?.trust_mask_hex).toMatch(/^0x/);
  });

  it('guard() is microseconds-fast (well under ASD-YK-001 50 ms budget)', () => {
    const gate = new AegisGate();
    gate.agentFor('perf');
    const N = 10_000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      gate.guard({ appId: 'perf', hasTools: false, isStreaming: false });
    }
    const elapsedNs = Number(process.hrtime.bigint() - start);
    const perCallMicros = elapsedNs / N / 1000;
    // 10k calls — expect well under 50 ms per call (target is <1 μs, give 50 μs headroom)
    expect(perCallMicros).toBeLessThan(50);
  });
});
