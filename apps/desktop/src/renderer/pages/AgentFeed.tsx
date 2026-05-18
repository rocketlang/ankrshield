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
    };

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
  state: 'pending' | 'completed' | 'parse_failed' | 'tls_error' | 'privacy_blocked';
  errorMessage: string | null;
}

const MAX_ROWS = 200;

declare global {
  interface Window {
    electronAPI?: {
      onAegisProxyEvent?: (cb: (e: AegisProxyEvent) => void) => () => void;
    };
  }
}

export function AgentFeed() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const rowsByIdRef = useRef<Map<string, FeedRow>>(new Map());

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAegisProxyEvent) {
      // Renderer running outside Electron (e.g. vite dev w/o main) — show
      // empty state rather than crash.
      return;
    }
    const unsubscribe = api.onAegisProxyEvent((event) => {
      if (pausedRef.current) return;
      setRows((prev) => mergeEvent(prev, rowsByIdRef.current, event));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const stats = useMemo(() => summariseFeed(rows), [rows]);

  return (
    <div className="p-6 space-y-4">
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

      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
  let latencySum = 0;
  let latencyCount = 0;
  for (const r of rows) {
    if (r.provider === 'anthropic') anthropic++;
    if (r.provider === 'openai') openai++;
    if (r.state === 'tls_error') tlsErrors++;
    if (r.state === 'privacy_blocked') privacyBlocked++;
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
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
  };
}
