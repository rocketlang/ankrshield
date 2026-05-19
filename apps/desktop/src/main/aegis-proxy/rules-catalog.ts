// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — didactic rule catalog (ASD-T-033 / FR-18)
//
// Static, in-process map of every shipped ASD rule ID to a 2-3 line
// user-readable explanation. Fed to the renderer's DidacticHint component
// when the user has enabled "Didactic mode" (Vivechana Decision 5).
//
// Authoritative source = LOGICS doc:
//   /root/proposals/ankrshield-desktop-aegis--logics--formal--2026-05-18.md
//
// Editing rules of engagement:
//   - This catalog must stay aligned with the LOGICS doc. If a rule changes
//     wording or scope there, this file is updated in the same commit.
//   - `title` is the rule statement (one line). `summary` is the "why",
//     ≤2 sentences. `citation` is the source — never invent a citation.
//   - Adding a new rule? Add it here AND in the LOGICS doc; T-035 (PROOF
//     parity, future) cross-checks the two.
//
// @rule:ASD-008 — zero default surface; didactic mode is opt-in.

export interface RuleExplanation {
  id: string;
  /** ≤80 char one-liner matching the LOGICS doc heading. */
  title: string;
  /** ≤2-sentence "why this rule exists / what happens when it fires". */
  summary: string;
  /** Source citation — always the LOGICS doc unless a deeper one applies. */
  citation: string;
  /** Optional doctrine layer: A=SHASTRA, B=YUKTI, C=VIVEKA. */
  layer?: 'A' | 'B' | 'C';
}

/**
 * Layer A — SHASTRA: what is true (12 statutes shipped).
 * Layer B — YUKTI: how experts reason (7 meta-reasoning rules).
 * Layer C — VIVEKA: inferences (10 pre-computed inferences, INF-ASD-001..010).
 *
 * Only A + B are surfaced to users today. C is engine-internal and would
 * read as noise in a consent dialog.
 */
export const RULES_CATALOG: Record<string, RuleExplanation> = {
  // ─── Layer A — SHASTRA ─────────────────────────────────────────────────────
  'ASD-001': {
    id: 'ASD-001',
    layer: 'A',
    title: 'The local LLM proxy binds only to loopback.',
    summary:
      'Your AI traffic is intercepted on 127.0.0.1:4857 only. The proxy will refuse to start ' +
      'if asked to bind anywhere else — so no other machine on your network can route through it.',
    citation: 'LOGICS §ASD-001',
  },
  'ASD-002': {
    id: 'ASD-002',
    layer: 'A',
    title: "Every person's proxy has its own root CA.",
    summary:
      'Your install generates a private root certificate and uses it to sign per-host leaves on ' +
      'the fly. The root key never leaves your OS keychain; no shared CA is shipped.',
    citation: 'LOGICS §ASD-002',
  },
  'ASD-003': {
    id: 'ASD-003',
    layer: 'A',
    title: 'API keys live in the OS keychain, never on disk.',
    summary:
      'Provider API keys are stored in macOS Keychain / Windows Credential Manager / Linux ' +
      'libsecret. ankrshield never writes them to a config file or settings JSON.',
    citation: 'LOGICS §ASD-003',
  },
  'ASD-004': {
    id: 'ASD-004',
    layer: 'A',
    title: 'The failure mode is deny, not allow.',
    summary:
      "When AEGIS, the PII scanner, or the budget governor can't make a clean decision, the " +
      'request is denied — never silently passed through. You will see the denial.',
    citation: 'LOGICS §ASD-004',
  },
  'ASD-005': {
    id: 'ASD-005',
    layer: 'A',
    title: 'Per-app consent is named, stored, budgeted, and revocable.',
    summary:
      'First time an app uses the proxy you must answer a named-consent dialog with two choices: ' +
      "Allow with budget (mandatory hourly cap) or Deny. There's no unbounded 'Allow'.",
    citation: 'LOGICS §ASD-005 · Vivechana Decision 2',
  },
  'ASD-006': {
    id: 'ASD-006',
    layer: 'A',
    title: 'The privacy engine and the agentic safeguard run in one process.',
    summary:
      'One Electron main process owns tracker blocking, DoH, spyware scanning, the AI tool log, ' +
      'and this proxy. One trust boundary you crossed at install, not two.',
    citation: 'LOGICS §ASD-006',
  },
  'ASD-007': {
    id: 'ASD-007',
    layer: 'A',
    title: 'Audit receipts are append-only and user-owned.',
    summary:
      'Every gated request writes a PRAMANA-format JSON receipt to ~/.ankrshield/audit/. ' +
      'The app never edits or backdates a receipt; daily rotation gzips the prior day.',
    citation: 'LOGICS §ASD-007 · FR-13',
  },
  'ASD-008': {
    id: 'ASD-008',
    layer: 'A',
    title: 'Default telemetry is zero.',
    summary:
      'Shipped binary sends no telemetry, no crash reports, no usage stats. Each opt-in (crash ' +
      'reports, cloud sync) is its own dialog with named consent, off by default, revocable.',
    citation: 'LOGICS §ASD-008 · Founder Q4',
  },
  'ASD-009': {
    id: 'ASD-009',
    layer: 'A',
    title: 'The kill switch cannot be throttled by the proxy.',
    summary:
      "Kill-switch IPC runs on a dedicated worker thread that doesn't share the request queue. " +
      'Even an overloaded proxy must honour PAUSE / THROTTLE / LOCK within 1 second p99.',
    citation: 'LOGICS §ASD-009 · FR-15',
  },
  'ASD-010': {
    id: 'ASD-010',
    layer: 'A',
    title: 'The proxy cannot be used to bypass the privacy engine.',
    summary:
      'A tracker / spyware / DoH-blocklist host blocked by the privacy engine is also blocked ' +
      'by the proxy — wrapping the request in an LLM API shape does not buy bypass.',
    citation: 'LOGICS §ASD-010 · FR-11',
  },
  'ASD-011': {
    id: 'ASD-011',
    layer: 'A',
    title: 'Streaming redaction cannot falsify tokens.',
    summary:
      'When the PII scanner replaces sensitive spans in a streaming response, it writes a ' +
      'visible [REDACTED:type] marker. It never substitutes plausible-looking fake content.',
    citation: 'LOGICS §ASD-011 · FR-21 / NFR-3',
  },
  'ASD-012': {
    id: 'ASD-012',
    layer: 'A',
    title: 'Root CA installation requires explicit named consent.',
    summary:
      'Installing the root CA into your OS trust store is its own ceremony. You see what it ' +
      "does, why it's needed, how to revoke it, and what happens if you refuse.",
    citation: 'LOGICS §ASD-012',
  },
  // ─── Layer B — YUKTI ───────────────────────────────────────────────────────
  'ASD-YK-001': {
    id: 'ASD-YK-001',
    layer: 'B',
    title: 'PreToolUse latency budget is inherited from AEG-YK-004.',
    summary:
      'The whole AEGIS gate has a 50ms p99 budget: 1ms bitmask check + 30ms PII scan + 5ms ' +
      "budget read + slack. Slower than that and we'd visibly drag the AI app.",
    citation: 'LOGICS §ASD-YK-001 · NFR-1',
  },
  'ASD-YK-002': {
    id: 'ASD-YK-002',
    layer: 'B',
    title: 'TOFU beats allow-list for consumer surface.',
    summary:
      "A consumer can't enumerate every AI app they'll ever run. Trust-On-First-Use catches " +
      'every new app at first request without you having to pre-declare anything.',
    citation: 'LOGICS §ASD-YK-002',
  },
  'ASD-YK-003': {
    id: 'ASD-YK-003',
    layer: 'B',
    title: 'Pause beats block for mid-stream enforcement.',
    summary:
      'Killing a streaming response mid-tokens looks like a crash. Pausing lets the stream ' +
      'end cleanly while still preventing the next gated action — what the user sees is honest.',
    citation: 'LOGICS §ASD-YK-003',
  },
  'ASD-YK-004': {
    id: 'ASD-YK-004',
    layer: 'B',
    title: 'One proxy, multiple provider adapters.',
    summary:
      'A single 4857 proxy port handles Anthropic, OpenAI, and future providers via per-provider ' +
      'adapters. Adding a new provider does not add a new port or a new trust boundary.',
    citation: 'LOGICS §ASD-YK-004',
  },
  'ASD-YK-005': {
    id: 'ASD-YK-005',
    layer: 'B',
    title: 'Per-app identity is best-effort, never authoritative.',
    summary:
      "App-id resolution uses TLS-SNI + PID lookup heuristics. A spoofed identity can't grant " +
      "rights it didn't already have — consent decisions are scoped to what's verifiable.",
    citation: 'LOGICS §ASD-YK-005',
  },
  'ASD-YK-006': {
    id: 'ASD-YK-006',
    layer: 'B',
    title: 'Privacy engine and agentic safeguard share the cockpit, not the logic.',
    summary:
      'Same Electron shell renders both surfaces, but the policy state machines stay separate. ' +
      "A bug in one doesn't trip the other; UX consistency without coupling.",
    citation: 'LOGICS §ASD-YK-006',
  },
  'ASD-YK-007': {
    id: 'ASD-YK-007',
    layer: 'B',
    title: 'Consent ceremonies have their own component, not a modal library.',
    summary:
      'Generic confirm-modals reduce consent to muscle memory. ConsentDialog is a dedicated ' +
      'component with explicit purpose / consequences / revocation / record-id slots.',
    citation: 'LOGICS §ASD-YK-007 · FR-21',
  },
};

/** All catalog IDs in stable order. Used by the renderer to render a full table. */
export const RULE_IDS: readonly string[] = Object.keys(RULES_CATALOG).sort();

/** Look up by ID. Returns null on miss — caller decides fallback (usually hide). */
export function getRule(id: string): RuleExplanation | null {
  return RULES_CATALOG[id] ?? null;
}

/** Filter by layer for renderer grouping. */
export function rulesByLayer(layer: 'A' | 'B' | 'C'): RuleExplanation[] {
  return Object.values(RULES_CATALOG).filter((r) => r.layer === layer);
}
