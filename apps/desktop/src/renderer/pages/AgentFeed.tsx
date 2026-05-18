/* SPDX-License-Identifier: AGPL-3.0-only */
// AgentFeed — live read-only stream of aegis-proxy observation events.
//
// @rule:ASD-006 — privacy engine and agentic safeguard share the cockpit
// @rule:ASD-YK-006 — privacy + agency share the cockpit, not the logic
// @rule:ASD-008 — zero default telemetry; nothing leaves the device
//
// P1 scope: pure observation. No enforce/kill buttons here — those land in P3.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// Event types mirror src/preload/index.ts AegisProxyEventPayload.
type Provider = 'anthropic' | 'openai' | 'unknown';

interface ObservedRequest {
  provider: Provider;
  hostname: string;
  path: string;
  method: string;
  model: string | null;
  isStreaming: boolean;
  promptText: string;
  systemPrompt: string | null;
  hasTools: boolean;
  messageCount: number;
  requestBytes: number;
  // ASD-T-006: best-effort per-app identifier
  appId: string;
  pid: number | null;
  executable: string | null;
}

interface ObservedResponse {
  statusCode: number;
  responseBytes: number;
  promptTokens: number | null;
  completionTokens: number | null;
  finishReason: string | null;
  isStreaming: boolean;
  latencyMs: number;
}

type AegisProxyEvent =
  | { kind: 'request.observed'; requestId: string; timestamp: string; observation: ObservedRequest }
  | {
      kind: 'response.observed';
      requestId: string;
      timestamp: string;
      observation: ObservedResponse;
    }
  | {
      kind: 'request.parse_failed';
      requestId: string;
      timestamp: string;
      provider: Provider;
      hostname: string;
      path: string;
      error: string;
    }
  | {
      kind: 'tls.client_error';
      requestId: string;
      timestamp: string;
      hostname: string;
      error: string;
    }
  | {
      kind: 'privacy.blocked';
      requestId: string;
      timestamp: string;
      hostname: string;
      via: 'http' | 'connect';
    }
  | {
      kind: 'aegis.denied';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      capability_hex: string;
      trust_mask_hex: string;
      reason: string;
    }
  | {
      kind: 'pii.redacted';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      counts: Record<string, number>;
      total: number;
    }
  | {
      kind: 'pii.blocked';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      counts: Record<string, number>;
      total: number;
    }
  | {
      kind: 'budget.throttled';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      currentSpendUsd: number;
      hourlyLimitUsd: number;
      bucket: string;
    }
  | {
      kind: 'cost.recorded';
      requestId: string;
      timestamp: string;
      appId: string;
      model: string | null;
      costUsd: number;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | {
      kind: 'consent.pending';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      hostname: string;
      timeoutMs: number;
    }
  | {
      kind: 'consent.resolved';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      decision: 'allow' | 'deny';
      timedOut: boolean;
    }
  | {
      kind: 'dan.held';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      hostname: string;
      timeoutMs: number;
      highRiskTools: Array<{ name: string; category: string }>;
    }
  | {
      kind: 'dan.resolved';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      decision: 'allow' | 'deny';
      timedOut: boolean;
    }
  | {
      kind: 'dan.skipped';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      reason: 'cached-allow' | 'cached-deny' | 'no-high-tools';
    };

interface PendingConsent {
  pendingId: string;
  appId: string;
  hostname: string;
  heldAt: string;
  timeoutMs: number;
}

interface PendingDan {
  pendingId: string;
  appId: string;
  hostname: string;
  heldAt: string;
  timeoutMs: number;
  highRiskTools: Array<{ name: string; category: string }>;
}

/** Aggregated per-request view, built by pairing request/response by requestId. */
interface FeedRow {
  requestId: string;
  startedAt: string;
  provider: Provider | 'unknown';
  appId: string;
  hostname: string;
  path: string;
  model: string | null;
  isStreaming: boolean;
  messageCount: number;
  hasTools: boolean;
  statusCode: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  finishReason: string | null;
  latencyMs: number | null;
  state:
    | 'pending'
    | 'completed'
    | 'parse_failed'
    | 'tls_error'
    | 'privacy_blocked'
    | 'aegis_denied'
    | 'pii_blocked'
    | 'budget_throttled';
  errorMessage: string | null;
  /** PII redaction counts (per type → count) when this row had redactions applied. */
  piiRedactedCounts?: Record<string, number> | null;
  /** Total PII spans redacted (sum of counts). */
  piiRedactedTotal?: number;
  /** USD cost recorded for this request (after response observed). */
  costUsd?: number;
}

const MAX_ROWS = 200;

declare global {
  interface Window {
    electronAPI?: {
      onAegisProxyEvent?: (cb: (e: AegisProxyEvent) => void) => () => void;
      aegisProxyListPendingConsents?: () => Promise<PendingConsent[]>;
      aegisProxyResolvePendingConsent?: (input: {
        pendingId: string;
        decision: 'allow' | 'deny';
        hourly_limit_usd?: number;
        pii_policy?: 'redact' | 'block' | 'off';
        dan_carrier?: 'os' | 'wa' | 'tg';
      }) => Promise<{ ok: boolean; error?: string }>;
      aegisProxyListPendingDan?: () => Promise<
        Array<
          PendingDan & {
            highRiskTools: Array<{ name: string; category: string; matchedBy: string }>;
          }
        >
      >;
      aegisProxyResolvePendingDan?: (input: {
        pendingId: string;
        decision: 'allow' | 'deny';
      }) => Promise<{ ok: boolean; error?: string }>;
      aegisProxyForgetDanCache?: (appId: string) => Promise<{ ok: boolean; cleared: number }>;
    };
  }
}

export function AgentFeed() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const rowsByIdRef = useRef<Map<string, FeedRow>>(new Map());

  // ASD-T-015 TOFU pending-consent dialog state.
  const [pendingConsents, setPendingConsents] = useState<PendingConsent[]>([]);
  // ASD-T-016 DAN gate pending state.
  const [pendingDans, setPendingDans] = useState<PendingDan[]>([]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAegisProxyEvent) {
      // Renderer running outside Electron (e.g. vite dev w/o main) — show
      // empty state rather than crash.
      return;
    }
    // Snapshot pending state at mount (covers renderer-reload while
    // proxy was already holding requests).
    void api.aegisProxyListPendingConsents?.().then((list) => {
      if (list) setPendingConsents(list);
    });
    void api.aegisProxyListPendingDan?.().then((list) => {
      if (list)
        setPendingDans(
          list.map((d) => ({
            pendingId: d.pendingId,
            appId: d.appId,
            hostname: d.hostname,
            heldAt: d.heldAt,
            timeoutMs: d.timeoutMs,
            highRiskTools: d.highRiskTools.map((t) => ({ name: t.name, category: t.category })),
          }))
        );
    });
    const unsubscribe = api.onAegisProxyEvent((event) => {
      if (!pausedRef.current) {
        setRows((prev) => mergeEvent(prev, rowsByIdRef.current, event));
      }
      // Pending state is updated regardless of pause.
      if (event.kind === 'consent.pending') {
        setPendingConsents((prev) => [
          ...prev,
          {
            pendingId: event.pendingId,
            appId: event.appId,
            hostname: event.hostname,
            heldAt: event.timestamp,
            timeoutMs: event.timeoutMs,
          },
        ]);
      } else if (event.kind === 'consent.resolved') {
        setPendingConsents((prev) => prev.filter((p) => p.pendingId !== event.pendingId));
      } else if (event.kind === 'dan.held') {
        setPendingDans((prev) => [
          ...prev,
          {
            pendingId: event.pendingId,
            appId: event.appId,
            hostname: event.hostname,
            heldAt: event.timestamp,
            timeoutMs: event.timeoutMs,
            highRiskTools: event.highRiskTools,
          },
        ]);
      } else if (event.kind === 'dan.resolved') {
        setPendingDans((prev) => prev.filter((p) => p.pendingId !== event.pendingId));
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const stats = useMemo(() => summariseFeed(rows), [rows]);

  return (
    <div className="p-6 space-y-4">
      {pendingConsents.length > 0 ? (
        <PendingConsentInbox
          pending={pendingConsents}
          onResolved={(pendingId) =>
            setPendingConsents((prev) => prev.filter((p) => p.pendingId !== pendingId))
          }
        />
      ) : null}
      {pendingDans.length > 0 ? (
        <DanInbox
          pending={pendingDans}
          onResolved={(pendingId) =>
            setPendingDans((prev) => prev.filter((p) => p.pendingId !== pendingId))
          }
        />
      ) : null}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-ankr-green">Agent</span> Feed
          </h1>
          <p className="text-sm text-gray-400">
            Live observation of LLM API calls through the aegis-proxy. Local only — no telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {rows.length} / {MAX_ROWS} rows
          </span>
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm font-medium transition ${
              paused ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600"
            onClick={() => {
              rowsByIdRef.current.clear();
              setRows([]);
            }}
          >
            ✕ Clear
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-4">
        <Stat label="Anthropic" value={stats.anthropic} />
        <Stat label="OpenAI" value={stats.openai} />
        <Stat
          label="Avg latency"
          value={stats.avgLatencyMs == null ? '—' : `${stats.avgLatencyMs} ms`}
        />
        <Stat
          label="TLS errors"
          value={stats.tlsErrors}
          subtone={stats.tlsErrors > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="Privacy-blocked"
          value={stats.privacyBlocked}
          subtone={stats.privacyBlocked > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="AEGIS-denied"
          value={stats.aegisDenied}
          subtone={stats.aegisDenied > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="PII redacted"
          value={stats.piiTotalSpans}
          subtone={stats.piiTotalSpans > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="PII blocked"
          value={stats.piiBlockedRows}
          subtone={stats.piiBlockedRows > 0 ? 'warn' : 'ok'}
        />
        <Stat label="Cost so far" value={`$${stats.totalCostUsd.toFixed(4)}`} />
        <Stat
          label="Budget throttled"
          value={stats.budgetThrottled}
          subtone={stats.budgetThrottled > 0 ? 'warn' : 'ok'}
        />
      </section>

      <section className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">App</th>
              <th className="px-3 py-2 text-left">Provider</th>
              <th className="px-3 py-2 text-left">Model</th>
              <th className="px-3 py-2 text-left">Host / Path</th>
              <th className="px-3 py-2 text-right">Msgs</th>
              <th className="px-3 py-2 text-right">In tok</th>
              <th className="px-3 py-2 text-right">Out tok</th>
              <th className="px-3 py-2 text-right">Latency</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-gray-500">
                  <div>
                    Waiting for agent activity. Point your LLM client at
                    <code className="mx-1 text-ankr-green">HTTPS_PROXY=http://127.0.0.1:4857</code>.
                  </div>
                  <div className="mt-3">
                    First time?{' '}
                    <Link to="/setup/root-ca" className="text-ankr-green hover:underline">
                      Run the CA setup ceremony →
                    </Link>{' '}
                    so HTTPS CONNECT works.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => <FeedRowView key={row.requestId} row={row} />)
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  subtone,
}: {
  label: string;
  value: number | string;
  subtone?: 'ok' | 'warn';
}) {
  const valueColor =
    subtone === 'warn' ? 'text-yellow-400' : subtone === 'ok' ? 'text-ankr-green' : 'text-white';
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</div>
    </div>
  );
}

function FeedRowView({ row }: { row: FeedRow }) {
  const time = formatTime(row.startedAt);
  const providerBadge = providerBadgeText(row.provider);
  const statusCell = renderStatus(row);
  return (
    <tr className="border-t border-gray-700 hover:bg-gray-750">
      <td className="px-3 py-2 font-mono text-xs text-gray-400">{time}</td>
      <td className="px-3 py-2 font-mono text-xs">
        <span className={appBadgeClass(row.appId)}>{row.appId}</span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${providerBadgeClass(row.provider)}`}
        >
          {providerBadge}
        </span>
        {row.isStreaming ? (
          <span className="ml-1 text-xs text-gray-500" title="Streaming SSE">
            ⥥
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{row.model ?? '—'}</td>
      <td className="px-3 py-2 font-mono text-xs">
        <div className="text-gray-300">{row.hostname}</div>
        <div className="text-gray-500 truncate max-w-md" title={row.path}>
          {row.path}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono">{row.messageCount}</td>
      <td className="px-3 py-2 text-right font-mono">{row.promptTokens ?? '—'}</td>
      <td className="px-3 py-2 text-right font-mono">{row.completionTokens ?? '—'}</td>
      <td className="px-3 py-2 text-right font-mono">
        {row.latencyMs == null ? '—' : `${row.latencyMs} ms`}
      </td>
      <td className="px-3 py-2">{statusCell}</td>
    </tr>
  );
}

function renderStatus(row: FeedRow) {
  if (row.state === 'pending') {
    return <span className="text-yellow-400">⋯ pending</span>;
  }
  if (row.state === 'privacy_blocked') {
    return (
      <span className="text-red-300" title={row.errorMessage ?? 'privacy engine refused this host'}>
        🛡 privacy-blocked
      </span>
    );
  }
  if (row.state === 'aegis_denied') {
    return (
      <span className="text-red-400" title={row.errorMessage ?? 'AEGIS gate denied (ASD-004)'}>
        ⛔ aegis-denied
      </span>
    );
  }
  if (row.state === 'pii_blocked') {
    return (
      <span
        className="text-purple-300"
        title={row.errorMessage ?? 'PII boundary blocked (ASD-011)'}
      >
        🔒 pii-blocked
      </span>
    );
  }
  if (row.state === 'budget_throttled') {
    return (
      <span
        className="text-amber-400"
        title={row.errorMessage ?? 'Hourly budget exceeded (ASD-007)'}
      >
        💸 budget-throttled
      </span>
    );
  }
  if (row.state === 'parse_failed') {
    return (
      <span className="text-orange-400" title={row.errorMessage ?? ''}>
        parse_failed
      </span>
    );
  }
  if (row.state === 'tls_error') {
    return (
      <span className="text-red-400" title={row.errorMessage ?? ''}>
        tls_error
      </span>
    );
  }
  const sc = row.statusCode;
  if (sc == null) return <span className="text-gray-500">—</span>;
  const color =
    sc >= 200 && sc < 300
      ? 'text-ankr-green'
      : sc >= 400 && sc < 500
        ? 'text-yellow-400'
        : sc >= 500
          ? 'text-red-400'
          : 'text-gray-300';
  return (
    <span className={`font-mono ${color}`}>
      {sc} {row.finishReason ? <span className="text-gray-500">· {row.finishReason}</span> : null}
    </span>
  );
}

function providerBadgeText(p: string) {
  if (p === 'anthropic') return 'Anthropic';
  if (p === 'openai') return 'OpenAI';
  return 'Unknown';
}

function providerBadgeClass(p: string) {
  if (p === 'anthropic') return 'bg-orange-600/30 text-orange-300';
  if (p === 'openai') return 'bg-green-600/30 text-green-300';
  return 'bg-gray-600/30 text-gray-300';
}

function appBadgeClass(appId: string) {
  // Unknown apps render in dim grey; known apps get a stronger tone.
  if (appId.startsWith('unknown:')) return 'text-gray-500';
  return 'text-gray-200';
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleTimeString('en-GB', { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  } catch {
    return iso;
  }
}

// ─── Event merge logic ────────────────────────────────────────────────────────

function mergeEvent(
  prev: FeedRow[],
  byId: Map<string, FeedRow>,
  event: AegisProxyEvent
): FeedRow[] {
  switch (event.kind) {
    case 'request.observed': {
      const row: FeedRow = {
        requestId: event.requestId,
        startedAt: event.timestamp,
        provider: event.observation.provider,
        appId: event.observation.appId,
        hostname: event.observation.hostname,
        path: event.observation.path,
        model: event.observation.model,
        isStreaming: event.observation.isStreaming,
        messageCount: event.observation.messageCount,
        hasTools: event.observation.hasTools,
        statusCode: null,
        promptTokens: null,
        completionTokens: null,
        finishReason: null,
        latencyMs: null,
        state: 'pending',
        errorMessage: null,
      };
      byId.set(event.requestId, row);
      const next = [row, ...prev];
      return capList(next, byId);
    }
    case 'response.observed': {
      const existing = byId.get(event.requestId);
      const merged: FeedRow = existing
        ? { ...existing }
        : {
            requestId: event.requestId,
            startedAt: event.timestamp,
            provider: 'unknown',
            appId: 'unknown:?',
            hostname: '',
            path: '',
            model: null,
            isStreaming: event.observation.isStreaming,
            messageCount: 0,
            hasTools: false,
            statusCode: null,
            promptTokens: null,
            completionTokens: null,
            finishReason: null,
            latencyMs: null,
            state: 'pending',
            errorMessage: null,
          };
      merged.statusCode = event.observation.statusCode;
      merged.promptTokens = event.observation.promptTokens;
      merged.completionTokens = event.observation.completionTokens;
      merged.finishReason = event.observation.finishReason;
      merged.latencyMs = event.observation.latencyMs;
      merged.state = 'completed';
      byId.set(event.requestId, merged);
      return prev.map((r) => (r.requestId === merged.requestId ? merged : r));
    }
    case 'request.parse_failed': {
      const existing = byId.get(event.requestId);
      const merged: FeedRow = {
        ...(existing ?? {
          requestId: event.requestId,
          startedAt: event.timestamp,
          provider: event.provider,
          appId: 'unknown:?',
          hostname: event.hostname,
          path: event.path,
          model: null,
          isStreaming: false,
          messageCount: 0,
          hasTools: false,
          statusCode: null,
          promptTokens: null,
          completionTokens: null,
          finishReason: null,
          latencyMs: null,
          state: 'pending',
          errorMessage: null,
        }),
        state: 'parse_failed',
        errorMessage: event.error,
      };
      byId.set(event.requestId, merged);
      if (existing) {
        return prev.map((r) => (r.requestId === merged.requestId ? merged : r));
      }
      return capList([merged, ...prev], byId);
    }
    case 'tls.client_error': {
      const row: FeedRow = {
        requestId: event.requestId,
        startedAt: event.timestamp,
        provider: 'unknown',
        appId: 'unknown:?',
        hostname: event.hostname,
        path: '(TLS handshake)',
        model: null,
        isStreaming: false,
        messageCount: 0,
        hasTools: false,
        statusCode: null,
        promptTokens: null,
        completionTokens: null,
        finishReason: null,
        latencyMs: null,
        state: 'tls_error',
        errorMessage: event.error,
      };
      byId.set(event.requestId, row);
      return capList([row, ...prev], byId);
    }
    case 'privacy.blocked': {
      const row: FeedRow = {
        requestId: event.requestId,
        startedAt: event.timestamp,
        provider: 'unknown',
        appId: 'unknown:?',
        hostname: event.hostname,
        path: event.via === 'connect' ? '(CONNECT — refused)' : '(HTTP — refused)',
        model: null,
        isStreaming: false,
        messageCount: 0,
        hasTools: false,
        statusCode: 403,
        promptTokens: null,
        completionTokens: null,
        finishReason: null,
        latencyMs: null,
        state: 'privacy_blocked',
        errorMessage: 'privacy engine refused this host (ASD-010)',
      };
      byId.set(event.requestId, row);
      return capList([row, ...prev], byId);
    }
    case 'aegis.denied': {
      const existing = byId.get(event.requestId);
      const row: FeedRow = existing
        ? { ...existing, statusCode: 403, state: 'aegis_denied', errorMessage: event.reason }
        : {
            requestId: event.requestId,
            startedAt: event.timestamp,
            provider: 'unknown',
            appId: event.appId,
            hostname: event.hostname,
            path: '(AEGIS gate — denied)',
            model: null,
            isStreaming: false,
            messageCount: 0,
            hasTools: false,
            statusCode: 403,
            promptTokens: null,
            completionTokens: null,
            finishReason: null,
            latencyMs: null,
            state: 'aegis_denied',
            errorMessage: event.reason,
          };
      byId.set(event.requestId, row);
      if (existing) {
        return prev.map((r) => (r.requestId === row.requestId ? row : r));
      }
      return capList([row, ...prev], byId);
    }
    case 'pii.redacted': {
      // Augment existing row (request.observed already fired) with redaction counts.
      // If no existing row, create a stub so the redaction event isn't lost.
      const existing = byId.get(event.requestId);
      const row: FeedRow = existing
        ? { ...existing, piiRedactedCounts: event.counts, piiRedactedTotal: event.total }
        : {
            requestId: event.requestId,
            startedAt: event.timestamp,
            provider: 'unknown',
            appId: event.appId,
            hostname: event.hostname,
            path: '(PII redacted, no request.observed)',
            model: null,
            isStreaming: false,
            messageCount: 0,
            hasTools: false,
            statusCode: null,
            promptTokens: null,
            completionTokens: null,
            finishReason: null,
            latencyMs: null,
            state: 'pending',
            errorMessage: null,
            piiRedactedCounts: event.counts,
            piiRedactedTotal: event.total,
          };
      byId.set(event.requestId, row);
      if (existing) {
        return prev.map((r) => (r.requestId === row.requestId ? row : r));
      }
      return capList([row, ...prev], byId);
    }
    case 'pii.blocked': {
      const existing = byId.get(event.requestId);
      const row: FeedRow = existing
        ? {
            ...existing,
            statusCode: 403,
            state: 'pii_blocked',
            errorMessage: `${event.total} PII span(s) detected; per-app policy is 'block'`,
            piiRedactedCounts: event.counts,
            piiRedactedTotal: event.total,
          }
        : {
            requestId: event.requestId,
            startedAt: event.timestamp,
            provider: 'unknown',
            appId: event.appId,
            hostname: event.hostname,
            path: '(PII boundary — blocked)',
            model: null,
            isStreaming: false,
            messageCount: 0,
            hasTools: false,
            statusCode: 403,
            promptTokens: null,
            completionTokens: null,
            finishReason: null,
            latencyMs: null,
            state: 'pii_blocked',
            errorMessage: `${event.total} PII span(s) detected; per-app policy is 'block'`,
            piiRedactedCounts: event.counts,
            piiRedactedTotal: event.total,
          };
      byId.set(event.requestId, row);
      if (existing) {
        return prev.map((r) => (r.requestId === row.requestId ? row : r));
      }
      return capList([row, ...prev], byId);
    }
    case 'budget.throttled': {
      const row: FeedRow = {
        requestId: event.requestId,
        startedAt: event.timestamp,
        provider: 'unknown',
        appId: event.appId,
        hostname: event.hostname,
        path: '(Budget — throttled)',
        model: null,
        isStreaming: false,
        messageCount: 0,
        hasTools: false,
        statusCode: 429,
        promptTokens: null,
        completionTokens: null,
        finishReason: null,
        latencyMs: null,
        state: 'budget_throttled',
        errorMessage: `Spent $${event.currentSpendUsd.toFixed(4)} of $${event.hourlyLimitUsd.toFixed(2)} this hour`,
      };
      byId.set(event.requestId, row);
      return capList([row, ...prev], byId);
    }
    case 'cost.recorded': {
      // Augment existing row (response.observed already fired) with cost.
      const existing = byId.get(event.requestId);
      if (!existing) return prev;
      const row: FeedRow = { ...existing, costUsd: event.costUsd };
      byId.set(event.requestId, row);
      return prev.map((r) => (r.requestId === row.requestId ? row : r));
    }
  }
}

function capList(rows: FeedRow[], byId: Map<string, FeedRow>): FeedRow[] {
  if (rows.length <= MAX_ROWS) return rows;
  const dropped = rows.slice(MAX_ROWS);
  for (const r of dropped) byId.delete(r.requestId);
  return rows.slice(0, MAX_ROWS);
}

// ─── Summary stats ────────────────────────────────────────────────────────────

function summariseFeed(rows: FeedRow[]) {
  let anthropic = 0;
  let openai = 0;
  let tlsErrors = 0;
  let privacyBlocked = 0;
  let aegisDenied = 0;
  let piiRedactedRows = 0;
  let piiBlockedRows = 0;
  let piiTotalSpans = 0;
  let budgetThrottled = 0;
  let totalCostUsd = 0;
  let latencySum = 0;
  let latencyCount = 0;
  for (const r of rows) {
    if (r.provider === 'anthropic') anthropic++;
    if (r.provider === 'openai') openai++;
    if (r.state === 'tls_error') tlsErrors++;
    if (r.state === 'privacy_blocked') privacyBlocked++;
    if (r.state === 'aegis_denied') aegisDenied++;
    if (r.state === 'pii_blocked') piiBlockedRows++;
    if (r.state === 'budget_throttled') budgetThrottled++;
    if (r.piiRedactedTotal && r.piiRedactedTotal > 0) {
      piiRedactedRows++;
      piiTotalSpans += r.piiRedactedTotal;
    }
    if (r.costUsd && r.costUsd > 0) totalCostUsd += r.costUsd;
    if (r.latencyMs != null) {
      latencySum += r.latencyMs;
      latencyCount++;
    }
  }
  return {
    anthropic,
    openai,
    tlsErrors,
    privacyBlocked,
    aegisDenied,
    piiRedactedRows,
    piiBlockedRows,
    piiTotalSpans,
    budgetThrottled,
    totalCostUsd,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
  };
}

function PendingConsentInbox({
  pending,
  onResolved,
}: {
  pending: PendingConsent[];
  onResolved: (pendingId: string) => void;
}) {
  return (
    <section className="bg-yellow-900/40 border border-yellow-600 rounded-lg p-4 space-y-3">
      <header>
        <h2 className="font-semibold text-yellow-200">
          🛂 {pending.length} pending consent{pending.length === 1 ? '' : 's'}
        </h2>
        <p className="text-xs text-yellow-300">
          Apps below are blocked at the proxy waiting for your TOFU decision. Modal-until-decided
          (ASD-005); a 60-second timeout treats no answer as deny.
        </p>
      </header>
      {pending.map((p) => (
        <PendingConsentForm key={p.pendingId} pending={p} onResolved={onResolved} />
      ))}
    </section>
  );
}

function PendingConsentForm({
  pending,
  onResolved,
}: {
  pending: PendingConsent;
  onResolved: (pendingId: string) => void;
}) {
  const [budget, setBudget] = useState<string>('');
  const [piiPolicy, setPiiPolicy] = useState<'redact' | 'block' | 'off'>('redact');
  const [danCarrier, setDanCarrier] = useState<'os' | 'wa' | 'tg'>('os');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (decision: 'allow' | 'deny') => {
    const api = window.electronAPI;
    if (!api?.aegisProxyResolvePendingConsent) return;
    if (decision === 'allow') {
      const n = Number(budget);
      if (!Number.isFinite(n) || n <= 0) {
        setErr('Hourly budget must be a positive number (USD). ASD-005: no unbounded allow.');
        return;
      }
    }
    setSubmitting(true);
    setErr(null);
    const r = await api.aegisProxyResolvePendingConsent({
      pendingId: pending.pendingId,
      decision,
      hourly_limit_usd: decision === 'allow' ? Number(budget) : undefined,
      pii_policy: piiPolicy,
      dan_carrier: danCarrier,
    });
    setSubmitting(false);
    if (!r.ok) {
      setErr(r.error ?? 'Failed to resolve consent.');
      return;
    }
    onResolved(pending.pendingId);
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-mono text-sm text-white">{pending.appId}</span>
          <span className="ml-2 text-xs text-gray-400">→ {pending.hostname}</span>
        </div>
        <span className="text-xs text-gray-500">held {pending.heldAt.slice(11, 19)} UTC</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">
            Hourly budget (USD) <span className="text-red-400">*</span>
          </span>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            disabled={submitting}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
            placeholder="e.g. 0.50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">PII policy</span>
          <select
            value={piiPolicy}
            onChange={(e) => setPiiPolicy(e.target.value as 'redact' | 'block' | 'off')}
            disabled={submitting}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
          >
            <option value="redact">Redact (default)</option>
            <option value="block">Block on PII</option>
            <option value="off">Off (no scanning)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">DAN carrier (P2 ASD-T-016+)</span>
          <select
            value={danCarrier}
            onChange={(e) => setDanCarrier(e.target.value as 'os' | 'wa' | 'tg')}
            disabled={submitting}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
          >
            <option value="os">OS notification (default)</option>
            <option value="wa">WhatsApp</option>
            <option value="tg">Telegram</option>
          </select>
        </label>
      </div>
      {err ? <div className="text-xs text-red-400">{err}</div> : null}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('allow')}
          className="px-3 py-1.5 rounded font-medium text-sm bg-ankr-green text-white hover:bg-green-600 disabled:opacity-50"
        >
          Allow with budget
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('deny')}
          className="px-3 py-1.5 rounded font-medium text-sm bg-red-700/70 text-white hover:bg-red-700 disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

function DanInbox({
  pending,
  onResolved,
}: {
  pending: PendingDan[];
  onResolved: (pendingId: string) => void;
}) {
  return (
    <section className="bg-red-900/40 border border-red-600 rounded-lg p-4 space-y-3">
      <header>
        <h2 className="font-semibold text-red-200">
          ⚠ {pending.length} DAN gate hold{pending.length === 1 ? '' : 's'}
        </h2>
        <p className="text-xs text-red-300">
          HIGH-category tool access requires explicit approval (ASD-008). Default timeout 30s — no
          answer = deny (INF-ASD-008).
        </p>
      </header>
      {pending.map((p) => (
        <DanRow key={p.pendingId} pending={p} onResolved={onResolved} />
      ))}
    </section>
  );
}

function DanRow({
  pending,
  onResolved,
}: {
  pending: PendingDan;
  onResolved: (pendingId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (decision: 'allow' | 'deny') => {
    const api = window.electronAPI;
    if (!api?.aegisProxyResolvePendingDan) return;
    setSubmitting(true);
    setErr(null);
    const r = await api.aegisProxyResolvePendingDan({ pendingId: pending.pendingId, decision });
    setSubmitting(false);
    if (!r.ok) {
      setErr(r.error ?? 'Failed to resolve DAN gate.');
      return;
    }
    onResolved(pending.pendingId);
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-mono text-sm text-white">{pending.appId}</span>
          <span className="ml-2 text-xs text-gray-400">→ {pending.hostname}</span>
        </div>
        <span className="text-xs text-gray-500">held {pending.heldAt.slice(11, 19)} UTC</span>
      </div>
      <ul className="text-xs space-y-1">
        {pending.highRiskTools.map((t) => (
          <li key={t.name} className="font-mono">
            <span className="text-red-300">{t.name}</span>
            <span className="text-gray-500"> → </span>
            <span className="text-yellow-300">{t.category}</span>
          </li>
        ))}
      </ul>
      {err ? <div className="text-xs text-red-400">{err}</div> : null}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('allow')}
          className="px-3 py-1.5 rounded font-medium text-sm bg-ankr-green text-white hover:bg-green-600 disabled:opacity-50"
        >
          Allow this request
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('deny')}
          className="px-3 py-1.5 rounded font-medium text-sm bg-red-700/70 text-white hover:bg-red-700 disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
