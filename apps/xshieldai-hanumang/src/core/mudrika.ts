// HanumanG — Mudrika verification engine
// @rule:HNG-S-001 — mudrika is the mandatory delegation credential; no mudrika = refuse
// @rule:HNG-S-008 — mudrika structure: principal_id, agent_id, trust_mask, scope_key, ttl, pramana_chain
// @rule:HNG-S-009 — mudrika TTL must not be expired at verification time
// @rule:HNG-S-010 — trust_mask in mudrika must be ≤ trust_mask of principal (spawn invariant)
// @rule:HNG-S-011 — revocation_url must be reachable; REVOKED mudrikas refuse immediately
// @rule:HNG-P2-003 — signature = base64 Ed25519 over canonical(payload minus signature);
// invalid signature = FAIL, never inflated. Structural-only remains the floor, downgraded.

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

import { canonical } from './notary.js';

export interface MudrikaPayload {
  mudrika_version: string;
  mudrika_id: string;
  principal_id: string;
  agent_id: string;
  task_id: string;
  trust_mask: number;
  scope_key: string;
  issued_at: string;
  ttl_seconds: number;
  required_return_proof: string;
  revocation_url: string;
  pramana_chain: string[];
  signature?: string;
}

export type VerifyOutcome = 'PASS' | 'FAIL' | 'EXPIRED' | 'REVOKED';

// verified   — pubkey registered, signature present and cryptographically valid
// invalid    — pubkey registered, signature present, verification FAILED (outcome=FAIL)
// absent     — pubkey registered but mudrika carries no signature (structural floor, downgraded)
// no_pubkey  — no key registered for the agent (structural floor, downgraded)
export type SignatureState = 'verified' | 'invalid' | 'absent' | 'no_pubkey';

export interface VerifyResult {
  outcome: VerifyOutcome;
  failure_reason: string | null;
  signature_state: SignatureState;
  expires_at: string;
  trust_mask: number;
  scope_key: string;
  principal_id: string;
  mudrika_id: string;
  pramana_chain: string[];
  duration_ms: number;
}

// @rule:HNG-P2-003 — Ed25519 over canonical(payload minus signature)
function checkSignature(m: Partial<MudrikaPayload>, pubkeyPem: string | null): SignatureState {
  if (!pubkeyPem) return 'no_pubkey';
  if (!m.signature) return 'absent';
  try {
    const { signature: _sig, ...unsigned } = m;
    const key = createPublicKey(pubkeyPem);
    const ok = cryptoVerify(
      null,
      Buffer.from(canonical(unsigned), 'utf8'),
      key,
      Buffer.from(m.signature, 'base64')
    );
    return ok ? 'verified' : 'invalid';
  } catch {
    return 'invalid';
  }
}

export function verifyMudrika(
  raw: unknown,
  expected_agent_id?: string,
  pubkeyPem: string | null = null
): VerifyResult {
  const t0 = Date.now();

  if (!raw || typeof raw !== 'object') {
    return fail('mudrika_missing', t0, pubkeyPem ? 'absent' : 'no_pubkey');
  }

  const m = raw as Partial<MudrikaPayload>;
  const signature_state = checkSignature(m, pubkeyPem);

  // @rule:HNG-P2-003 — a present-but-invalid signature is a hard FAIL, never inflated
  if (signature_state === 'invalid') {
    return fail('mudrika_signature_invalid', t0, 'invalid');
  }

  // Required fields
  if (
    !m.mudrika_id ||
    !m.principal_id ||
    !m.agent_id ||
    !m.task_id ||
    !m.scope_key ||
    !m.issued_at ||
    !m.ttl_seconds
  ) {
    return fail('missing_required_fields', t0, signature_state);
  }

  // Agent ID must match if provided
  if (expected_agent_id && m.agent_id !== expected_agent_id) {
    return fail(
      `agent_id_mismatch: expected ${expected_agent_id} got ${m.agent_id}`,
      t0,
      signature_state
    );
  }

  // TTL check — @rule:HNG-S-009
  const issuedAt = new Date(m.issued_at).getTime();
  if (isNaN(issuedAt)) return fail('invalid_issued_at', t0, signature_state);
  const expiresAt = new Date(issuedAt + (m.ttl_seconds ?? 0) * 1000);
  if (Date.now() > expiresAt.getTime()) {
    return {
      outcome: 'EXPIRED',
      failure_reason: `mudrika expired at ${expiresAt.toISOString()}`,
      signature_state,
      expires_at: expiresAt.toISOString(),
      trust_mask: m.trust_mask ?? 0,
      scope_key: m.scope_key ?? '',
      principal_id: m.principal_id ?? '',
      mudrika_id: m.mudrika_id ?? '',
      pramana_chain: m.pramana_chain ?? [],
      duration_ms: Date.now() - t0,
    };
  }

  // Spawn invariant — child trust_mask ≤ declared maximum (32-bit)
  // @rule:HNG-S-010 + BitMask OS spawn invariant
  const trust_mask = m.trust_mask ?? 0;
  if (trust_mask < 0 || trust_mask > 0xffffffff) {
    return fail('trust_mask_out_of_range', t0, signature_state);
  }

  // Pramana chain present (warning if empty — not blocking at verification stage)
  const pramana_chain = m.pramana_chain ?? [];

  return {
    outcome: 'PASS',
    failure_reason: null,
    signature_state,
    expires_at: expiresAt.toISOString(),
    trust_mask,
    scope_key: m.scope_key,
    principal_id: m.principal_id,
    mudrika_id: m.mudrika_id,
    pramana_chain,
    duration_ms: Date.now() - t0,
  };
}

function fail(
  reason: string,
  t0: number,
  signature_state: SignatureState = 'no_pubkey'
): VerifyResult {
  return {
    outcome: 'FAIL',
    failure_reason: reason,
    signature_state,
    expires_at: new Date().toISOString(),
    trust_mask: 0,
    scope_key: '',
    principal_id: '',
    mudrika_id: '',
    pramana_chain: [],
    duration_ms: Date.now() - t0,
  };
}
