/**
 * RiskTrendChart — 30-day risk score trend using Recharts AreaChart.
 *
 * Props:
 *   data  — array of { date, score, domain } (chronological order)
 *
 * Dark-theme: transparent background, violet-400 stroke, gradient fill,
 * custom dark tooltip, gray axis labels.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { Activity } from 'lucide-react';

export interface TrendDataPoint {
  date: string;
  score: number;
  domain: string;
}

interface RiskTrendChartProps {
  data: TrendDataPoint[];
}

// Format date string to a short label like "Feb 27"
function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    // Fallback: take last 5 chars
    return dateStr.slice(-5);
  }
}

// Relative time helper
function relativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return dateStr;
  }
}

function scoreColor(score: number): string {
  if (score <= 29) return '#34d399';
  if (score <= 59) return '#fbbf24';
  if (score <= 79) return '#fb923c';
  return '#f87171';
}

// Custom tooltip rendered in a dark card
function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as TrendDataPoint;
  const sc = point.score;
  const color = scoreColor(sc);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 shadow-xl text-xs space-y-0.5 min-w-[140px]">
      <p className="text-gray-400 font-medium">{point.domain}</p>
      <p className="text-gray-500">{formatDateLabel(point.date)}</p>
      <div className="flex items-center gap-1.5 pt-1">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-white font-bold text-sm">{sc}</span>
        <span className="text-gray-500">/ 100</span>
      </div>
      <p className="text-gray-600">{relativeTime(point.date)}</p>
    </div>
  );
}

export default function RiskTrendChart({ data }: RiskTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-center">
        <Activity className="w-8 h-8 text-gray-700" />
        <p className="text-sm text-gray-500">
          No scan history yet — run your first domain scan
        </p>
      </div>
    );
  }

  // Thin the labels: only show up to 6 evenly spread
  const tickIndices = (() => {
    const n = data.length;
    if (n <= 6) return data.map((_, i) => i);
    const step = Math.floor(n / 5);
    const idxs: number[] = [];
    for (let i = 0; i < n; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    return idxs;
  })();

  const tickValues = tickIndices.map((i) => data[i].date);

  return (
    <div style={{ width: '100%', height: 200 }}>
      {/* SVG gradient definition rendered outside Recharts so it gets picked up */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="violetFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
          </linearGradient>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="violetFillInternal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1f2937"
            vertical={false}
          />

          <XAxis
            dataKey="date"
            ticks={tickValues}
            tickFormatter={formatDateLabel}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            interval="preserveStartEnd"
          />

          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#4c1d95', strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <Area
            type="monotone"
            dataKey="score"
            stroke="#a78bfa"           /* violet-400 */
            strokeWidth={2}
            fill="url(#violetFillInternal)"
            dot={false}
            activeDot={{
              r: 4,
              fill: '#a78bfa',
              stroke: '#1e1b4b',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
