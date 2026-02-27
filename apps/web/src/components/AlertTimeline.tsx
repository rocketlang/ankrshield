/**
 * AlertTimeline — renders a vertical timeline of WatchAlert records.
 *
 * Each alert shows:
 *   - Relative time + absolute date
 *   - Domain scanned
 *   - Risk score badge (coloured by severity)
 *   - Risk level chip
 *   - "Notified" indicator if the watch fired a webhook
 *   - Optional details string
 */

import { Bell, BellOff, Clock } from 'lucide-react';

export interface WatchAlert {
  id: string;
  domain: string;
  riskScore: number;
  riskLevel: string;
  triggeredAt: string;
  details?: string | null;
  notified?: boolean | null;
}

interface AlertTimelineProps {
  alerts: WatchAlert[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function riskLevelStyle(level: string): string {
  const l = (level || '').toUpperCase();
  if (l === 'CRITICAL') return 'bg-rose-900/50 text-rose-300 border-rose-500/40';
  if (l === 'HIGH')     return 'bg-red-900/50 text-red-300 border-red-500/40';
  if (l === 'ELEVATED') return 'bg-orange-900/50 text-orange-300 border-orange-500/40';
  if (l === 'MODERATE') return 'bg-yellow-900/50 text-yellow-300 border-yellow-500/40';
  if (l === 'LOW' || l === 'MINIMAL') return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30';
  return 'bg-gray-800 text-gray-400 border-gray-600/40';
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-rose-400';
  if (score >= 60) return 'text-red-400';
  if (score >= 40) return 'text-orange-400';
  if (score >= 20) return 'text-yellow-400';
  return 'text-emerald-400';
}

function dotColor(score: number): string {
  if (score >= 80) return 'bg-rose-500';
  if (score >= 60) return 'bg-red-500';
  if (score >= 40) return 'bg-orange-400';
  if (score >= 20) return 'bg-yellow-400';
  return 'bg-emerald-400';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AlertTimeline({ alerts }: AlertTimelineProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <Bell className="w-8 h-8 text-gray-700" />
        <p className="text-sm text-gray-500">
          No alerts triggered yet — thresholds not exceeded.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical guide line */}
      <div className="absolute left-3 top-3 bottom-3 w-px bg-gray-700/60" />

      <div className="space-y-4 pl-1">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex gap-4 relative">
            {/* Timeline dot */}
            <div className="shrink-0 flex flex-col items-center pt-1">
              <span
                className={`w-3 h-3 rounded-full border-2 border-gray-900 z-10 ${dotColor(alert.riskScore)}`}
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {/* Domain */}
                <span className="font-mono text-sm text-white font-medium truncate max-w-[200px]">
                  {alert.domain}
                </span>

                {/* Risk score */}
                <span className={`text-sm font-bold ${scoreColor(alert.riskScore)}`}>
                  {alert.riskScore}
                </span>

                {/* Risk level chip */}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${riskLevelStyle(alert.riskLevel)}`}
                >
                  {alert.riskLevel || 'UNKNOWN'}
                </span>

                {/* Notified chip */}
                {alert.notified != null && (
                  <span
                    className={`ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                      alert.notified
                        ? 'bg-emerald-900/40 text-emerald-300 border-emerald-600/40'
                        : 'bg-gray-800 text-gray-500 border-gray-700'
                    }`}
                  >
                    {alert.notified ? (
                      <Bell className="w-3 h-3" />
                    ) : (
                      <BellOff className="w-3 h-3" />
                    )}
                    {alert.notified ? 'Notified' : 'Silent'}
                  </span>
                )}
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                <span title={shortDate(alert.triggeredAt)}>
                  {relativeTime(alert.triggeredAt)}
                </span>
                <span className="text-gray-700">·</span>
                <span>{shortDate(alert.triggeredAt)}</span>
              </div>

              {/* Details */}
              {alert.details && (
                <p className="mt-1.5 text-xs text-gray-400 leading-relaxed border-l-2 border-gray-700 pl-2">
                  {alert.details}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom fade */}
      {alerts.length > 8 && (
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none" />
      )}
    </div>
  );
}
