/**
 * EvidencePack — turns a Privacy Report verdict into a cited, filable
 * DPDP/GDPR complaint deposition (ASCT / evidence-pack, 2026-07-10).
 *
 * Honesty spine (FP-018): every line is a COUNTED on-device event or a CITED
 * tracker-db row. AnkrShield observes the DESTINATION of a contact at the DNS
 * layer, NOT its payload — so the pack evidences "a contact to a known tracker
 * endpoint beyond declared scope," never "these exact bytes of personal data."
 * That honest evidence-tier is stated inside the pack so no regulator or
 * fiduciary can dismiss it as an overclaim.
 *
 * This is the FREE consumer face (AnkrShield). The corporate face (xShieldAI)
 * adds AEGIS-signed notarization + Art. 80 aggregation — not in this module.
 */

import { APP_VERSION } from '../appVersion';
import { AppScopeVerdict } from './ScopeService';
import { ScopeDetailRow } from './VpnService';

/** Deterministic, non-cryptographic consistency check (corporate packs are AEGIS-signed). */
function consistencyCheck(pkg: string, rows: ScopeDetailRow[]): string {
  let h = 5381;
  let total = 0;
  const feed = pkg + '|' + rows.map((r) => `${r.domain}:${r.blocked + r.allowed}`).join(',');
  for (let i = 0; i < feed.length; i++) {
    h = ((h << 5) + h + feed.charCodeAt(i)) & 0xffffffff;
  }
  for (const r of rows) {
    total += r.blocked + r.allowed;
  }
  return `${(h >>> 0).toString(16)}-${total}`;
}

function fmt(ts: number): string {
  if (!ts) {
    return 'n/a';
  }
  return new Date(ts).toISOString().slice(0, 10);
}

export interface EvidenceOptions {
  principalName?: string; // the data principal (the user); left blank to fill in
}

/**
 * Build the deposition text for ONE app. Only tracker (beyond-scope) rows are cited.
 * Returns a plain-text document ready to share into an email / complaint portal.
 */
export function buildAppEvidence(
  v: AppScopeVerdict,
  receipts: ScopeDetailRow[],
  opts: EvidenceOptions = {}
): string {
  const trackers = receipts
    .filter((r) => r.category && r.category !== 'clean' && r.category !== 'quarantined')
    .sort((a, b) => b.risk - a.risk || b.blocked + b.allowed - (a.blocked + a.allowed));

  const cited = trackers
    .slice(0, 40)
    .map(
      (r) =>
        `  • ${r.domain} — ${r.category}${r.vendor ? ` · ${r.vendor}` : ''} · ×${r.blocked + r.allowed}` +
        `${r.blocked > 0 ? ` (${r.blocked} blocked)` : ''}`
    )
    .join('\n');

  const check = consistencyCheck(v.packageName, trackers);
  const now = new Date().toISOString();
  const principal = opts.principalName?.trim() || '__________ (you — the affected individual)';

  return `AnkrShield — PRIVACY EVIDENCE PACK
Generated: ${now} (on your device)
Tool: AnkrShield v${APP_VERSION}

RESPONDENT  (Data Fiduciary / Data Controller)
  App:      ${v.appName}
  Package:  ${v.packageName}

FINDING
  Beyond-scope tracker contacts observed: ${v.beyondScope.toLocaleString()} (${v.beyondBlocked.toLocaleString()} blocked by AnkrShield)
  Distinct tracker vendors:                ${v.vendorCount}
  Observation window:                      ${fmt(v.firstTs)} → ${fmt(v.lastTs)} (30-day on-device rollup)
  Category severity:                       ${v.critical ? 'stalkerware/APT-grade endpoint present' : v.aggressive ? 'aggressive data collection' : 'beyond declared scope'}

OBSERVED CONTACTS  (cited — tracker-db rows)
${cited || '  (expand the app in the Privacy Report to load its receipts, then regenerate)'}

LEGAL BASIS
  • DPDP Act, 2023 (India) — §6–7 purpose limitation & data minimisation: personal data may be
    processed only for the specified purpose consented to. Contact with third-party advertising,
    analytics, fingerprinting or data-broker endpoints beyond the app's functional purpose is
    outside declared scope.
  • GDPR (EU) — Art. 5(1)(b) purpose limitation and Art. 5(1)(c) data minimisation (parallel
    provision). Art. 77 confers the right to lodge a complaint with a Supervisory Authority.

METHOD & LIMITS  (honesty statement)
  Vantage: the DNS / connection layer on the data principal's OWN device. Each contact above is a
  counted event; each vendor and category is a cited row in AnkrShield's on-device tracker
  database. AnkrShield observes the DESTINATION of a network contact, not its payload — this pack
  evidences a contact to a known tracker/broker endpoint beyond declared scope, not the specific
  personal data in transit. Nothing here is inferred or generated.

INTEGRITY
  Observations: ${trackers.length} · consistency check: ${check}
  Generated from on-device counts. This pack contains no data that left the device except by your
  deliberate share. (A cryptographically notarized pack is available via xShieldAI for enterprise
  and regulator use.)

DATA PRINCIPAL  (complainant)
  Name:    ${principal}
  Contact: __________

────────────────────────────────────────────────
PRE-FILLED COMPLAINT DRAFT
To the Data Protection Board of India (or your Supervisory Authority):

I, the undersigned data principal, submit that "${v.appName}" (${v.packageName}) contacted
${v.vendorCount} third-party tracker/data-broker endpoint(s) ${v.beyondScope.toLocaleString()} time(s)
beyond its declared purpose, as witnessed on my own device by AnkrShield between ${fmt(v.firstTs)}
and ${fmt(v.lastTs)}. The cited evidence is attached. I request an inquiry into a possible breach
of purpose limitation and data minimisation under the DPDP Act, 2023 (or GDPR Art. 5).

Signed,
${principal}
────────────────────────────────────────────────
Generated by AnkrShield — on-device, cited, compute/quote/null. https://xshieldai.com`;
}
