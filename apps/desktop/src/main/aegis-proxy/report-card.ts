// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — HanumanG report-card aggregator (ASD-T-024)
//
// Combines EventTallyStore counters, BudgetLedger spend, AppsPolicyStore
// status, and the HanumanG 7-axis posture scorer into a single per-app
// 24h roll-up matching FR-17 (requests, costs, redactions, denials, top
// categories) plus the posture score for the report card UI.

import type { AppsPolicyStore } from './apps-policy.js';
import type { BudgetLedger } from './budget-ledger.js';
import type { EventTallyStore, DayBucket } from './event-tally-store.js';
import { scorePosture, type PostureScore } from './hanumang-mandate-vendored.js';

export interface ReportCardRow {
  appId: string;
  /** Days covered in this roll-up. */
  windowDays: number;
  /** ISO start (oldest second of the rolling window). */
  windowStart: string;
  /** ISO end (now at compute time). */
  windowEnd: string;
  /** Rolled-up DayBucket sum across windowDays. */
  bucket: DayBucket;
  /** Total USD over the window via BudgetLedger.recentSpend. */
  totalUsd: number;
  /** Request count over the window via BudgetLedger.recentSpend. */
  totalRequests: number;
  /** Per-app stored allow/deny + cap; null if no TOFU yet. */
  policy: {
    decision: 'allow' | 'deny' | null;
    hourly_limit_usd: number | null;
    pii_policy: 'redact' | 'block' | 'off' | null;
    dan_carrier: 'os' | 'wa' | 'tg' | null;
  };
  /** HanumanG 7-axis posture score. */
  posture: PostureScore;
}

export interface BuildReportCardOptions {
  /** Window in days (default 1 = "last 24h"). */
  windowDays?: number;
  /** Override for tests / future "as of" queries. */
  now?: () => Date;
}

/**
 * Build a single per-app report-card row. Pure(-ish): reads from the three
 * stores but performs no writes. Caller owns iteration when summarising
 * multiple apps.
 */
export function buildReportCard(
  appId: string,
  stores: {
    tally: EventTallyStore;
    ledger: BudgetLedger;
    appsPolicy: AppsPolicyStore;
  },
  opts: BuildReportCardOptions = {}
): ReportCardRow {
  const windowDays = Math.max(1, opts.windowDays ?? 1);
  const now = (opts.now ?? (() => new Date()))();
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const bucket = stores.tally.rollup(appId, windowDays);
  const spend = stores.ledger.recentSpend(appId, windowDays * 24, now);
  const policy = stores.appsPolicy.get(appId);

  const posture = scorePosture({
    appId,
    bucket,
    days: windowDays,
    windowStart,
    windowEnd,
    totalUsd: spend.cost_usd,
    hourlyCapUsd: policy?.hourly_limit_usd ?? null,
    hasStoredPolicy: policy != null,
  });

  return {
    appId,
    windowDays,
    windowStart,
    windowEnd,
    bucket,
    totalUsd: spend.cost_usd,
    totalRequests: spend.request_count,
    policy: {
      decision: policy?.decision ?? null,
      hourly_limit_usd: policy?.hourly_limit_usd ?? null,
      pii_policy: policy?.pii_policy ?? null,
      dan_carrier: policy?.dan_carrier ?? null,
    },
    posture,
  };
}

/**
 * Build report cards for every app with any policy OR any tally activity
 * OR any ledger spend in the window. Sorted by overall posture ascending
 * (worst scores first — UI surfaces problems at the top).
 */
export function buildAllReportCards(
  stores: {
    tally: EventTallyStore;
    ledger: BudgetLedger;
    appsPolicy: AppsPolicyStore;
  },
  opts: BuildReportCardOptions = {}
): ReportCardRow[] {
  const seen = new Set<string>();
  for (const a of Object.keys(stores.appsPolicy.getAll())) seen.add(a);
  for (const a of stores.tally.knownAppIds()) seen.add(a);
  for (const a of stores.ledger.knownAppIds()) seen.add(a);
  const rows: ReportCardRow[] = [];
  for (const appId of seen) rows.push(buildReportCard(appId, stores, opts));
  rows.sort((a, b) => {
    // null posture sorts last (no data); otherwise ascending overall.
    const ao = a.posture.overall ?? Number.POSITIVE_INFINITY;
    const bo = b.posture.overall ?? Number.POSITIVE_INFINITY;
    return ao - bo;
  });
  return rows;
}
