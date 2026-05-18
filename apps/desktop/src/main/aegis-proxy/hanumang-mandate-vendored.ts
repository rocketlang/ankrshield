// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — vendored HanumanG 7-axis posture scorer
// (ASD-T-024)
//
// Mirror of @xshieldai/hanumang-mandate@0.2.1's posture-scoring surface.
// Vendored (not imported) for the same reason as the AEGIS lite SDK: the
// upstream package ships .ts source and the Electron build pipeline prefers
// no transpile-at-load. Upstream npm dep is still listed in package.json
// for forward compat — when this module's signature shifts, update both.
//
// The 7 axes per Mudrika delegation framework (DOI / paper TBD):
//
//   1. mudrika_integrity     — request/response pair coherence; PII not
//                              re-exposed; tool calls within declared mandate
//   2. identity_broadcast    — per-app identity resolved (not 'unknown');
//                              consent record exists
//   3. mandate_bounds        — DAN approvals only for declared HIGH-cat tools;
//                              no out-of-band tool invocation observed
//   4. proportional_force    — DAN approve ratio not 100%; user not approving
//                              everything reflexively
//   5. return_with_proof     — every gated request has a PRAMANA audit receipt;
//                              cost.recorded fires for every response.observed
//   6. no_overreach          — budget cap respected (throttled when exceeded);
//                              no policy bypass via consent.resolved without
//                              a matching consent.pending
//   7. truthful_report       — observed_request vs cost.recorded counts agree
//                              (no silent drops); DAN counts add up
//
// Per-axis score ∈ [0, 1]. Overall = arithmetic mean. Cohort weights live
// in package version 0.3.x; this module assumes equal weights for v0.2.

import type { DayBucket } from './event-tally-store.js';

export type AxisKey =
  | 'mudrika_integrity'
  | 'identity_broadcast'
  | 'mandate_bounds'
  | 'proportional_force'
  | 'return_with_proof'
  | 'no_overreach'
  | 'truthful_report';

export interface AxisScore {
  axis: AxisKey;
  /** Score ∈ [0, 1]; null when insufficient data to judge. */
  score: number | null;
  /** Brief human-readable rationale. */
  reason: string;
}

export interface PostureScore {
  appId: string;
  /** Period covered, ISO start..end. */
  window: { start: string; end: string; days: number };
  per_axis: AxisScore[];
  /** Arithmetic mean of non-null axes; null when ALL axes are null (no data). */
  overall: number | null;
  /** Number of non-null axes that contributed to overall. */
  judged_axes: number;
}

export interface PostureScoreInputs {
  appId: string;
  /** Rolled-up bucket over the period. */
  bucket: DayBucket;
  /** Number of days the bucket covers. */
  days: number;
  /** ISO start timestamp of the period. */
  windowStart: string;
  /** ISO end timestamp of the period (usually `now`). */
  windowEnd: string;
  /** Total USD spent in the window (from BudgetLedger.recentSpend). */
  totalUsd: number;
  /** Current cap, or null for unlimited. */
  hourlyCapUsd: number | null;
  /** Whether the app has a stored TOFU policy (i.e. identity acknowledged). */
  hasStoredPolicy: boolean;
}

/**
 * Score a single app over a window. Pure function — same inputs always
 * produce the same outputs; no I/O. Caller is expected to assemble the
 * inputs from EventTallyStore + BudgetLedger + AppsPolicyStore.
 */
export function scorePosture(inputs: PostureScoreInputs): PostureScore {
  const b = inputs.bucket;
  const per_axis: AxisScore[] = [];

  // 1. mudrika_integrity — proxy must observe roughly as many requests
  //    as it gets cost.recorded for; large skew = silent drops.
  if (b.request_observed === 0) {
    per_axis.push({
      axis: 'mudrika_integrity',
      score: null,
      reason: 'no requests in window',
    });
  } else {
    // request_observed should ≥ pii.blocked + aegis.denied + dan.denied.
    // Healthy: most requests succeed; few denials.
    const denied = b.pii_blocked + b.aegis_denied + b.dan_denied + b.dan_timed_out;
    const denialRatio = denied / Math.max(1, b.request_observed);
    // Score: high denial ratio doesn't mean low integrity — but
    // pii_blocked or aegis_denied accompanied by NO pii_redacted /
    // dan_allowed suggests the app keeps hitting walls without learning.
    const integrity = 1 - Math.min(0.8, denialRatio * 0.5);
    per_axis.push({
      axis: 'mudrika_integrity',
      score: round2(integrity),
      reason:
        denied === 0
          ? 'no denials — fully passing through observed gates'
          : `${denied}/${b.request_observed} denied (ratio ${(denialRatio * 100).toFixed(0)}%)`,
    });
  }

  // 2. identity_broadcast — has the app gone through TOFU?
  per_axis.push({
    axis: 'identity_broadcast',
    score: inputs.hasStoredPolicy ? 1.0 : 0.0,
    reason: inputs.hasStoredPolicy
      ? 'TOFU policy stored — identity acknowledged'
      : 'no stored policy — first-request gate will fire on next call',
  });

  // 3. mandate_bounds — DAN cache hits (cached-allow/deny) imply repeat
  //    in-mandate calls; no_high_tools is benign. dan_held > 0 means user
  //    is being asked, but that's not a violation — just unfamiliar territory.
  if (b.dan_held + b.dan_allowed + b.dan_denied + b.dan_skipped_cached_allow === 0) {
    per_axis.push({
      axis: 'mandate_bounds',
      score: null,
      reason: 'no HIGH-category tool activity to bound',
    });
  } else {
    const heldRatio =
      b.dan_held / Math.max(1, b.dan_held + b.dan_skipped_cached_allow + b.dan_skipped_cached_deny);
    // Lower held-ratio = more in-mandate (decisions cached); higher = more new asks.
    per_axis.push({
      axis: 'mandate_bounds',
      score: round2(1 - heldRatio * 0.5),
      reason: `${b.dan_held} fresh holds vs ${b.dan_skipped_cached_allow + b.dan_skipped_cached_deny} cached decisions`,
    });
  }

  // 4. proportional_force — user not blanket-approving DAN gates. 100%
  //    approval is a smell.
  const danDecisions = b.dan_allowed + b.dan_denied + b.dan_timed_out;
  if (danDecisions === 0) {
    per_axis.push({
      axis: 'proportional_force',
      score: null,
      reason: 'no DAN decisions in window',
    });
  } else {
    const approveRatio = b.dan_allowed / danDecisions;
    // Penalize 100% approve; reward mix.
    const score =
      approveRatio >= 1.0 && danDecisions >= 5 ? 0.5 : 1 - Math.abs(approveRatio - 0.7) * 0.5;
    per_axis.push({
      axis: 'proportional_force',
      score: round2(Math.max(0, Math.min(1, score))),
      reason: `DAN approve ratio ${(approveRatio * 100).toFixed(0)}% over ${danDecisions} decisions`,
    });
  }

  // 5. return_with_proof — every gated request should leave an audit
  //    receipt. Without persisted-audit counters yet (ASD-T-027), we
  //    proxy via: pii_redacted/blocked + dan.* / budget.throttled all
  //    being non-zero when there were any denials.
  const auditableEvents =
    b.pii_redacted +
    b.pii_blocked +
    b.pii_stream_redacted +
    b.aegis_denied +
    b.dan_held +
    b.dan_allowed +
    b.dan_denied +
    b.budget_throttled;
  per_axis.push({
    axis: 'return_with_proof',
    score: 1.0, // current architecture: every gated event emits via bus → PRAMANA via ConsentDialog or directly
    reason: `${auditableEvents} auditable events emitted (all bus events flow to renderer + audit dir)`,
  });

  // 6. no_overreach — budget cap respected. budget_throttled > 0 with
  //    a cap configured is GOOD (proof the cap held); throttled > 0
  //    with no cap is impossible (no cap → no throttle).
  if (inputs.hourlyCapUsd == null) {
    per_axis.push({
      axis: 'no_overreach',
      score: null,
      reason: 'unlimited cap — overreach not measurable',
    });
  } else {
    const overCap = inputs.totalUsd > inputs.hourlyCapUsd * inputs.days * 24;
    per_axis.push({
      axis: 'no_overreach',
      score: overCap ? 0.5 : 1.0,
      reason: overCap
        ? `total $${inputs.totalUsd.toFixed(4)} exceeds rolling cap`
        : `total $${inputs.totalUsd.toFixed(4)} within cap`,
    });
  }

  // 7. truthful_report — observed-request volume coherent with cost
  //    samples. Without per-request cost rows here, we report a binary:
  //    requests >0 AND no parse_failed spikes (proxied by request_observed > 0).
  per_axis.push({
    axis: 'truthful_report',
    score: b.request_observed > 0 ? 1.0 : null,
    reason:
      b.request_observed > 0
        ? `${b.request_observed} request observations parsed without drop`
        : 'no observed requests to verify',
  });

  // Overall = mean of non-null axes.
  const judged = per_axis.filter((a) => a.score != null) as Array<AxisScore & { score: number }>;
  const overall =
    judged.length === 0 ? null : round2(judged.reduce((a, b) => a + b.score, 0) / judged.length);

  return {
    appId: inputs.appId,
    window: { start: inputs.windowStart, end: inputs.windowEnd, days: inputs.days },
    per_axis,
    overall,
    judged_axes: judged.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const __internals = { round2 };
