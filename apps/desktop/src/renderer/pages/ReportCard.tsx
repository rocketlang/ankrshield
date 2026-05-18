/* SPDX-License-Identifier: AGPL-3.0-only */
// ReportCard — per-app 24h roll-up + HanumanG 7-axis posture (ASD-T-024 / FR-17).
//
// Pulls the aggregated rows from main via IPC; refreshes on a 5s interval.
// Sorted worst-posture first so problems surface at the top. Click an app
// to expand the per-axis breakdown + raw bucket counters.
//
// @rule:ASD-006 — privacy + agency share the cockpit
// @rule:ASD-YK-007 — posture rationale is human-readable, not opaque

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface AxisScore {
  axis: string;
  score: number | null;
  reason: string;
}

interface PostureScore {
  appId: string;
  window: { start: string; end: string; days: number };
  per_axis: AxisScore[];
  overall: number | null;
  judged_axes: number;
}

interface DayBucket {
  date: string;
  request_observed: number;
  pii_redacted: number;
  pii_blocked: number;
  pii_stream_redacted: number;
  aegis_denied: number;
  dan_held: number;
  dan_allowed: number;
  dan_denied: number;
  dan_timed_out: number;
  dan_skipped_cached_allow: number;
  dan_skipped_cached_deny: number;
  dan_skipped_no_high_tools: number;
  budget_throttled: number;
  pii_spans_total: number;
  first_seen: string | null;
  last_seen: string | null;
}

interface ReportRow {
  appId: string;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  bucket: DayBucket;
  totalUsd: number;
  totalRequests: number;
  policy: {
    decision: 'allow' | 'deny' | null;
    hourly_limit_usd: number | null;
    pii_policy: 'redact' | 'block' | 'off' | null;
    dan_carrier: 'os' | 'wa' | 'tg' | null;
  };
  posture: PostureScore;
}

declare global {
  interface Window {
    electronAPI?: {
      aegisProxyGetReportCardAll?: (input?: { windowDays?: number }) => Promise<ReportRow[]>;
    };
  }
}

export function ReportCard() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [windowDays, setWindowDays] = useState<number>(1);
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyGetReportCardAll) return;
    const next = await api.aegisProxyGetReportCardAll({ windowDays });
    setRows(next ?? []);
    setLoaded(true);
  }, [windowDays]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const totals = useMemo(() => {
    let req = 0;
    let usd = 0;
    let piiSpans = 0;
    let danDecisions = 0;
    let denials = 0;
    for (const r of rows) {
      req += r.totalRequests;
      usd += r.totalUsd;
      piiSpans += r.bucket.pii_spans_total;
      danDecisions += r.bucket.dan_allowed + r.bucket.dan_denied + r.bucket.dan_timed_out;
      denials += r.bucket.aegis_denied + r.bucket.pii_blocked + r.bucket.budget_throttled;
    }
    return { req, usd, piiSpans, danDecisions, denials };
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-ankr-green">Report</span> Card
          </h1>
          <p className="text-sm text-gray-400">
            Per-app rolling roll-up — requests, spend, redactions, denials, HanumanG 7-axis posture.
            Refresh 5s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Window:</label>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          >
            <option value={1}>last 24h</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
          </select>
          <Link
            to="/agents"
            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            ← Agent Feed
          </Link>
          <Link
            to="/budget"
            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Budget panel
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-5 gap-3">
        <Stat label="Requests" value={String(totals.req)} />
        <Stat label="Spend" value={formatUsd(totals.usd)} />
        <Stat label="PII spans scrubbed" value={String(totals.piiSpans)} />
        <Stat label="DAN decisions" value={String(totals.danDecisions)} />
        <Stat
          label="Denials"
          value={String(totals.denials)}
          tone={totals.denials > 0 ? 'warn' : 'ok'}
        />
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">
          No apps tracked in this window. Once you route an AI app through{' '}
          <code className="text-gray-300">127.0.0.1:4857</code> the report card populates live.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
              <th className="py-2">App</th>
              <th className="py-2 text-right">Requests</th>
              <th className="py-2 text-right">Spend</th>
              <th className="py-2 text-right">PII spans</th>
              <th className="py-2 text-right">DAN ✓ / ✗</th>
              <th className="py-2 text-right">Denials</th>
              <th className="py-2 text-right">Posture</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PostureRow
                key={r.appId}
                row={r}
                expanded={expandedAppId === r.appId}
                onToggle={() => setExpandedAppId((prev) => (prev === r.appId ? null : r.appId))}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PostureRow({
  row,
  expanded,
  onToggle,
}: {
  row: ReportRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const totalDenials =
    row.bucket.aegis_denied + row.bucket.pii_blocked + row.bucket.budget_throttled;
  return (
    <>
      <tr
        className="border-b border-gray-800 cursor-pointer hover:bg-gray-800/60"
        onClick={onToggle}
      >
        <td className="py-2 font-mono">
          <span className="text-gray-400 mr-1">{expanded ? '▼' : '▶'}</span>
          {row.appId}
        </td>
        <td className="py-2 text-right">{row.totalRequests}</td>
        <td className="py-2 text-right font-mono">{formatUsd(row.totalUsd)}</td>
        <td className="py-2 text-right">{row.bucket.pii_spans_total}</td>
        <td className="py-2 text-right text-xs">
          <span className="text-emerald-300">{row.bucket.dan_allowed}</span>
          <span className="text-gray-500"> / </span>
          <span className="text-red-300">{row.bucket.dan_denied + row.bucket.dan_timed_out}</span>
        </td>
        <td className={`py-2 text-right ${totalDenials > 0 ? 'text-red-300' : 'text-gray-500'}`}>
          {totalDenials}
        </td>
        <td className="py-2 text-right font-mono">
          <PostureBadge overall={row.posture.overall} judged={row.posture.judged_axes} />
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-gray-800 bg-gray-900/50">
          <td colSpan={7} className="py-3 px-3">
            <ExpandedDetail row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ExpandedDetail({ row }: { row: ReportRow }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
          HanumanG 7-axis posture
        </h3>
        <table className="w-full text-xs">
          <tbody>
            {row.posture.per_axis.map((a) => (
              <tr key={a.axis} className="border-b border-gray-800/50">
                <td className="py-1 pr-2 font-mono text-gray-300">{a.axis}</td>
                <td className="py-1 px-2 text-right font-mono">
                  {a.score == null ? (
                    <span className="text-gray-600">—</span>
                  ) : (
                    <PostureBadge overall={a.score} judged={1} compact />
                  )}
                </td>
                <td className="py-1 pl-2 text-gray-400">{a.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
          Raw counters · window {row.windowDays}d
        </h3>
        <table className="w-full text-xs font-mono">
          <tbody>
            <CounterRow label="request.observed" value={row.bucket.request_observed} />
            <CounterRow label="pii.redacted" value={row.bucket.pii_redacted} />
            <CounterRow label="pii.blocked" value={row.bucket.pii_blocked} tone="warn" />
            <CounterRow label="pii.stream.redacted" value={row.bucket.pii_stream_redacted} />
            <CounterRow label="aegis.denied" value={row.bucket.aegis_denied} tone="warn" />
            <CounterRow label="dan.held" value={row.bucket.dan_held} />
            <CounterRow label="dan.resolved (allow)" value={row.bucket.dan_allowed} />
            <CounterRow label="dan.resolved (deny)" value={row.bucket.dan_denied} tone="warn" />
            <CounterRow
              label="dan.resolved (timeout)"
              value={row.bucket.dan_timed_out}
              tone="warn"
            />
            <CounterRow
              label="dan.skipped (cached-allow)"
              value={row.bucket.dan_skipped_cached_allow}
            />
            <CounterRow
              label="dan.skipped (cached-deny)"
              value={row.bucket.dan_skipped_cached_deny}
            />
            <CounterRow
              label="dan.skipped (no-high-tools)"
              value={row.bucket.dan_skipped_no_high_tools}
            />
            <CounterRow label="budget.throttled" value={row.bucket.budget_throttled} tone="warn" />
            <CounterRow label="pii spans total" value={row.bucket.pii_spans_total} />
          </tbody>
        </table>
        <div className="text-[11px] text-gray-500 mt-2">
          Policy:{' '}
          {row.policy.decision ? (
            <>
              <span className="text-gray-300">{row.policy.decision}</span> · cap{' '}
              <span className="text-gray-300">
                {row.policy.hourly_limit_usd != null
                  ? `$${row.policy.hourly_limit_usd}/h`
                  : 'unlimited'}
              </span>{' '}
              · pii <span className="text-gray-300">{row.policy.pii_policy ?? 'redact'}</span> · DAN{' '}
              <span className="text-gray-300">{row.policy.dan_carrier ?? 'os'}</span>
            </>
          ) : (
            <span className="text-gray-500">no TOFU yet</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CounterRow({
  label,
  value,
  tone = 'ok',
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
}) {
  return (
    <tr className="border-b border-gray-800/50">
      <td className="py-0.5 pr-2 text-gray-400">{label}</td>
      <td
        className={`py-0.5 text-right ${value > 0 && tone === 'warn' ? 'text-red-300' : value > 0 ? 'text-white' : 'text-gray-600'}`}
      >
        {value}
      </td>
    </tr>
  );
}

function PostureBadge({
  overall,
  judged,
  compact = false,
}: {
  overall: number | null;
  judged: number;
  compact?: boolean;
}) {
  if (overall == null) {
    return <span className="text-gray-500">—</span>;
  }
  const tone = overall >= 0.8 ? 'emerald' : overall >= 0.5 ? 'yellow' : 'red';
  const colour =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'yellow'
        ? 'text-yellow-300'
        : 'text-red-300';
  return (
    <span className={colour}>
      {overall.toFixed(2)}
      {compact ? null : <span className="text-gray-500 text-xs ml-1">/{judged}</span>}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = 'ok',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        tone === 'warn'
          ? 'bg-red-900/40 border border-red-600'
          : 'bg-gray-800 border border-gray-700'
      }`}
    >
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-mono">{value}</div>
    </div>
  );
}

function formatUsd(v: number): string {
  if (v === 0) return '$0';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
