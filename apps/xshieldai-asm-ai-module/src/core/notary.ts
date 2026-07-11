// LakshmanRekha — Evidence Notary client (Ed25519 notarization)
// @rule:ASMAI-P2-001 — attestation issuance is the reliable floor (FP-010); notarization
// is best-effort and fails LOUD (_meta.notarized:false + notary_error), never blocks.
// @rule:ASMAI-S-009 — notary base resolved from the ports.json authority (R-008); no port literal.

import { readFileSync } from 'fs';

export function notaryBase(): string | null {
  const env = process.env['NOTARY_URL'];
  if (env) return env.replace(/\/$/, '');
  try {
    const p = JSON.parse(readFileSync('/root/.ankr/config/ports.json', 'utf8'));
    const port = p?.security?.xshieldaiEvidenceNotary;
    if (Number.isInteger(port)) return 'http://localhost:'.concat(String(port));
  } catch {
    /* authority unreadable — degrade */
  }
  return null;
}

// Canonical JSON — stable key order so the signature is reproducible.
// Copied verbatim from xshieldai-evidence-notary/notary.mjs; the pack sent to
// /notarize must be byte-identical at re-verify time.
export function canonical(obj: unknown): string {
  if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    return (
      '{' +
      Object.keys(rec)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(rec[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(obj);
}

export interface NotaryRecord {
  issuer: string;
  notaryId: string;
  ts: string;
  alg: string;
  packSha256: string;
  packBytes: number;
  meta: Record<string, unknown>;
  pubkeyFingerprint: string;
}

export type NotarizeResult =
  | { notarized: true; record: NotaryRecord; signature: string; pubkey_fingerprint: string }
  | { notarized: false; notary_error: string };

export async function notarizePack(
  pack: string,
  meta: Record<string, unknown>
): Promise<NotarizeResult> {
  const base = notaryBase();
  if (!base) {
    return { notarized: false, notary_error: 'notary unresolvable (ports.json authority)' };
  }
  try {
    const r = await fetch(base + '/notarize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pack, meta }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return { notarized: false, notary_error: `notary HTTP ${r.status}` };
    const cert = (await r.json()) as { record?: NotaryRecord; signature?: string };
    if (!cert.record?.notaryId || !cert.signature) {
      return { notarized: false, notary_error: 'notary response missing record/signature' };
    }
    return {
      notarized: true,
      record: cert.record,
      signature: cert.signature,
      pubkey_fingerprint: cert.record.pubkeyFingerprint,
    };
  } catch (e) {
    return { notarized: false, notary_error: e instanceof Error ? e.message : String(e) };
  }
}

// compute/quote/null — verdict is null (abstain) when the notary is unreachable.
export async function verifyPack(
  record: unknown,
  signature: string,
  pack: string
): Promise<{ verdict: 'valid' | 'invalid' | null; reasons: string[] }> {
  const base = notaryBase();
  if (!base) return { verdict: null, reasons: ['notary unresolvable (ports.json authority)'] };
  try {
    const r = await fetch(base + '/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ record, signature, pack }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return { verdict: null, reasons: [`notary HTTP ${r.status}`] };
    const v = (await r.json()) as { valid?: boolean; reasons?: string[] };
    return { verdict: v.valid ? 'valid' : 'invalid', reasons: v.reasons ?? [] };
  } catch (e) {
    return { verdict: null, reasons: [e instanceof Error ? e.message : String(e)] };
  }
}
