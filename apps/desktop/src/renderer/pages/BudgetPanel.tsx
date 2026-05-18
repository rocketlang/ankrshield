/* SPDX-License-Identifier: AGPL-3.0-only */
// BudgetPanel — per-app spend view + cap editing (ASD-T-020 / FR-16 P2).
//
// Pulls budget summary from main via IPC, subscribes to cost.recorded events
// for live updates. Cap edits use ConsentDialog (FR-21) so every change
// produces a PRAMANA-shape record. Apps over cap render in red so the panel
// surfaces problems immediately.
//
// @rule:ASD-005 — cap > 0 required; null clears (revert to unlimited per ASD-T-014 default)
// @rule:ASD-006 — privacy + agency share the cockpit
// @rule:ASD-YK-007 — every cap-change ceremony is PRAMANA-shape

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ConsentDialog } from '../components/ConsentDialog';

interface BudgetRow {
  appId: string;
  hourly_limit_usd: number | null;
  current_hour_usd: number;
  current_hour_requests: number;
  last_24h_usd: number;
  last_24h_requests: number;
}

declare global {
  interface Window {
    electronAPI?: {
      aegisProxyGetBudgetSummary?: () => Promise<BudgetRow[]>;
      aegisProxySetBudgetCap?: (input: {
        appId: string;
        hourly_limit_usd: number | null;
      }) => Promise<{ ok: boolean; applied_usd: number | null; error?: string }>;
      onAegisProxyEvent?: (
        cb: (e: { kind: string; appId?: string; costUsd?: number }) => void
      ) => () => void;
    };
  }
}

export function BudgetPanel() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyGetBudgetSummary) return;
    const next = await api.aegisProxyGetBudgetSummary();
    setRows(next ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const api = window.electronAPI;
    if (!api?.onAegisProxyEvent) return;
    const unsub = api.onAegisProxyEvent((e) => {
      // cost.recorded / budget.throttled update spend; consent.resolved
      // may have changed a cap. All cheap → just refresh.
      if (
        e.kind === 'cost.recorded' ||
        e.kind === 'budget.throttled' ||
        e.kind === 'consent.resolved'
      ) {
        void refresh();
      }
    });
    return () => unsub();
  }, [refresh]);

  const totals = useMemo(() => {
    let hour = 0;
    let day = 0;
    let overCap = 0;
    for (const r of rows) {
      hour += r.current_hour_usd;
      day += r.last_24h_usd;
      if (r.hourly_limit_usd != null && r.current_hour_usd >= r.hourly_limit_usd) overCap += 1;
    }
    return { hour, day, overCap };
  }, [rows]);

  const editingRow = editingAppId ? (rows.find((r) => r.appId === editingAppId) ?? null) : null;

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-ankr-green">Budget</span> Panel
          </h1>
          <p className="text-sm text-gray-400">
            Per-app hourly spend vs cap. Live-updated from cost.recorded events.
          </p>
        </div>
        <Link to="/agents" className="text-sm text-ankr-green hover:underline">
          ← Agent Feed
        </Link>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="This hour" value={formatUsd(totals.hour)} />
        <Stat label="Last 24h" value={formatUsd(totals.day)} />
        <Stat
          label="Over cap"
          value={String(totals.overCap)}
          tone={totals.overCap > 0 ? 'warn' : 'ok'}
        />
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">
          No apps tracked yet. Start an LLM-using app through the proxy and refresh.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
              <th className="py-2">App</th>
              <th className="py-2 text-right">This hour</th>
              <th className="py-2 text-right">Last 24h</th>
              <th className="py-2 text-right">Cap (USD/hr)</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const overCap =
                r.hourly_limit_usd != null && r.current_hour_usd >= r.hourly_limit_usd;
              return (
                <tr
                  key={r.appId}
                  className={`border-b border-gray-800 ${overCap ? 'bg-red-900/30' : ''}`}
                >
                  <td className="py-2 font-mono">{r.appId}</td>
                  <td className="py-2 text-right">
                    {formatUsd(r.current_hour_usd)}
                    <span className="text-xs text-gray-500 ml-1">
                      ({r.current_hour_requests} req)
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {formatUsd(r.last_24h_usd)}
                    <span className="text-xs text-gray-500 ml-1">({r.last_24h_requests} req)</span>
                  </td>
                  <td className="py-2 text-right font-mono">
                    {r.hourly_limit_usd == null ? (
                      <span className="text-gray-500">unlimited</span>
                    ) : (
                      formatUsd(r.hourly_limit_usd)
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingAppId(r.appId)}
                      className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                    >
                      Edit cap
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editingRow ? (
        <CapEditDialog
          row={editingRow}
          onClose={() => setEditingAppId(null)}
          onCommitted={() => {
            setEditingAppId(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
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

function CapEditDialog({
  row,
  onClose,
  onCommitted,
}: {
  row: BudgetRow;
  onClose: () => void;
  onCommitted: () => void;
}) {
  const [cap, setCap] = useState<string>(
    row.hourly_limit_usd == null ? '' : String(row.hourly_limit_usd)
  );
  const [err, setErr] = useState<string | null>(null);

  const parsed = cap === '' ? null : Number(cap);
  // Cap is valid if (a) empty string → null (clear) OR (b) finite number > 0.
  const valid = cap === '' || (Number.isFinite(parsed) && (parsed as number) > 0);

  const handleDecided = async (input: { decision: 'allow' | 'deny' | 'skip' }) => {
    if (input.decision !== 'allow') {
      onClose();
      return;
    }
    if (!valid) {
      setErr('Cap must be a positive number (USD/hr) or empty to clear.');
      return;
    }
    const api = window.electronAPI;
    if (!api?.aegisProxySetBudgetCap) {
      onClose();
      return;
    }
    const r = await api.aegisProxySetBudgetCap({
      appId: row.appId,
      hourly_limit_usd: parsed,
    });
    if (!r.ok) {
      setErr(r.error ?? 'Failed to update cap.');
      return;
    }
    onCommitted();
  };

  const verb = parsed == null ? 'Clear the hourly cap' : `Set the hourly cap to $${parsed}`;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <ConsentDialog
          ceremony="budget-cap-change"
          title={`Change cap for ${row.appId}`}
          variant="ceremony"
          allowLabel="Apply"
          allowDisabled={!valid}
          subject={{
            appId: row.appId,
            previous_hourly_limit_usd: row.hourly_limit_usd,
            requested_hourly_limit_usd: parsed,
          }}
          purpose={`${verb} for ${row.appId}.`}
          consequences={
            parsed == null
              ? 'Removes the hourly cap. The app can spend without limit until a future cap is set. Use with caution — counter to ASD-005 spirit.'
              : `Future requests from ${row.appId} that would push the current-hour total above $${parsed} return 429 ASD-007-budget-throttled until the hour rolls over.`
          }
          revocation_path="Budget Panel → Edit cap (this dialog) again to change or clear."
          onDecided={handleDecided}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-gray-400">New cap (USD/hour, empty = clear)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white font-mono"
              placeholder="e.g. 0.50 (or empty)"
            />
          </label>
          {err ? <div className="text-xs text-red-400 mt-2">{err}</div> : null}
        </ConsentDialog>
        <div className="text-right mt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            Cancel without recording a decision
          </button>
        </div>
      </div>
    </div>
  );
}

function formatUsd(v: number): string {
  if (v === 0) return '$0';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
