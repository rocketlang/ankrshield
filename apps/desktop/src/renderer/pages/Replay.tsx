/* SPDX-License-Identifier: AGPL-3.0-only */
// Replay — 24h time-scrubber view of proxy activity (ASD-T-030 / FR-16 P3).
//
// The renderer-side companion to the in-memory RequestLogStore. Pulls a
// time-windowed snapshot via IPC, lets the user drag a slider through the
// past 24h, and lists events within the chosen window. Click a row to
// inspect the raw JSON payload.
//
// @rule:ASD-006 — privacy + agency share the cockpit
// @rule:ASD-008 — local only; no telemetry leaves on opening this page

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface ReplayEntry {
  id: string;
  timestamp: string;
  kind: string;
  appId: string;
  hostname: string;
  summary: string;
  raw: unknown;
}

interface ReplayRange {
  oldest: string | null;
  newest: string | null;
  size: number;
}

declare global {
  interface Window {
    electronAPI?: {
      aegisProxyReplayList?: (input?: { since?: string; until?: string }) => Promise<ReplayEntry[]>;
      aegisProxyReplayRange?: () => Promise<ReplayRange>;
    };
  }
}

const WINDOW_OPTIONS = [
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '2 hours', ms: 2 * 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
] as const;

export function Replay() {
  const [range, setRange] = useState<ReplayRange | null>(null);
  const [entries, setEntries] = useState<ReplayEntry[]>([]);
  const [windowMs, setWindowMs] = useState<number>(WINDOW_OPTIONS[0].ms);
  /** Slider value: ms offset from oldest. 0 = oldest, max = newest. */
  const [sliderMs, setSliderMs] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refreshRange = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyReplayRange) return;
    const r = await api.aegisProxyReplayRange();
    setRange(r);
  }, []);

  // Initial + periodic range refresh (catches new events).
  useEffect(() => {
    void refreshRange();
    const id = setInterval(refreshRange, 5000);
    return () => clearInterval(id);
  }, [refreshRange]);

  // Recompute slider window + fetch entries when slider or window changes.
  const sliderUntil = useMemo<string | null>(() => {
    if (!range?.oldest || !range.newest) return null;
    const oldest = Date.parse(range.oldest);
    return new Date(oldest + sliderMs).toISOString();
  }, [range, sliderMs]);

  const sliderSince = useMemo<string | null>(() => {
    if (!sliderUntil) return null;
    return new Date(Date.parse(sliderUntil) - windowMs).toISOString();
  }, [sliderUntil, windowMs]);

  useEffect(() => {
    if (!sliderSince || !sliderUntil) return;
    const api = window.electronAPI;
    if (!api?.aegisProxyReplayList) return;
    let cancelled = false;
    void api.aegisProxyReplayList({ since: sliderSince, until: sliderUntil }).then((list) => {
      if (!cancelled) setEntries(list ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [sliderSince, sliderUntil]);

  // Slider max: total ms between oldest and newest.
  const sliderMax = useMemo<number>(() => {
    if (!range?.oldest || !range.newest) return 0;
    return Math.max(0, Date.parse(range.newest) - Date.parse(range.oldest));
  }, [range]);

  // Initialise slider at "newest" when range first lands.
  useEffect(() => {
    if (range && sliderMs === 0 && sliderMax > 0) {
      setSliderMs(sliderMax);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.newest, sliderMax]);

  const jumpToNow = () => setSliderMs(sliderMax);
  const jumpToStart = () => setSliderMs(0);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-ankr-green">24h</span> Replay
          </h1>
          <p className="text-sm text-gray-400">
            Scrub through the past 24h of proxy activity. Local only — no telemetry leaves on
            opening this page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/agents"
            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            ← Agent Feed
          </Link>
          <Link
            to="/report-card"
            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Report card
          </Link>
        </div>
      </header>

      {!range || !range.oldest || !range.newest || range.size === 0 ? (
        <p className="text-sm text-gray-400">
          No replay entries yet. Once an AI app makes a request through{' '}
          <code className="text-gray-300">127.0.0.1:4857</code> the buffer starts filling.
        </p>
      ) : (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-3">
            <div className="flex items-baseline justify-between text-xs text-gray-400">
              <span>{range.size} events in buffer</span>
              <span>
                {formatTs(range.oldest)} → {formatTs(range.newest)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={Math.max(1000, Math.floor(sliderMax / 1000))}
              value={sliderMs}
              onChange={(e) => setSliderMs(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={jumpToStart}
                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                ⏮ Start
              </button>
              <span className="font-mono text-white">
                {sliderUntil ? formatTs(sliderUntil) : '—'}
              </span>
              <button
                type="button"
                onClick={jumpToNow}
                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                Now ⏭
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">Window:</span>
              {WINDOW_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setWindowMs(o.ms)}
                  className={`px-2 py-1 rounded ${
                    windowMs === o.ms
                      ? 'bg-ankr-green text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
              <span className="text-gray-500 ml-2">→ {entries.length} events in window</span>
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="text-sm text-gray-400">No events in the selected window.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
                  <th className="py-2 w-24">Time</th>
                  <th className="py-2 w-32">Kind</th>
                  <th className="py-2 w-40">App</th>
                  <th className="py-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <ReplayRow
                    key={`${e.id}-${i}`}
                    entry={e}
                    expanded={expandedId === `${e.id}-${i}`}
                    onToggle={() =>
                      setExpandedId((p) => (p === `${e.id}-${i}` ? null : `${e.id}-${i}`))
                    }
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function ReplayRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: ReplayEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const kindClass =
    entry.kind === 'aegis.denied' ||
    entry.kind === 'pii.blocked' ||
    entry.kind === 'budget.throttled' ||
    entry.kind === 'kill_switch.blocked'
      ? 'text-red-300'
      : entry.kind === 'pii.redacted' ||
          entry.kind === 'pii.stream.redacted' ||
          entry.kind === 'dan.held'
        ? 'text-yellow-300'
        : entry.kind === 'response.observed' || entry.kind === 'dan.resolved'
          ? 'text-emerald-300'
          : 'text-gray-300';
  return (
    <>
      <tr
        className="border-b border-gray-800 cursor-pointer hover:bg-gray-800/60"
        onClick={onToggle}
      >
        <td className="py-2 font-mono text-xs text-gray-400">{entry.timestamp.slice(11, 19)}</td>
        <td className={`py-2 font-mono text-xs ${kindClass}`}>{entry.kind}</td>
        <td className="py-2 font-mono text-xs text-white">{entry.appId || '—'}</td>
        <td className="py-2 text-xs">{entry.summary}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-gray-800 bg-gray-900/50">
          <td colSpan={4} className="py-2 px-3">
            <pre className="text-[11px] font-mono text-gray-300 overflow-x-auto">
              {JSON.stringify(entry.raw, null, 2)}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function formatTs(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}
