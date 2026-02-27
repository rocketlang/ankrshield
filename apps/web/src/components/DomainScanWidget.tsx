/**
 * DomainScanWidget — reusable domain risk scanner
 *
 * Uses xshieldScan GraphQL query. Displays:
 *  - SVG arc gauge (0-100, colour-coded)
 *  - Risk level badge
 *  - Top findings list (source, signal, severity)
 *  - "View Full Report" link
 *
 * The Apollo Client must send X-API-Key header (configured in lib/apollo.ts).
 */

import { useLazyQuery } from '@apollo/client';
import { Globe, AlertTriangle, CheckCircle, ShieldAlert, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { XSHIELD_SCAN_QUERY } from '../graphql/queries';

interface Finding {
  source: string;
  signal: string;
  severity: string;
}

interface ScanResult {
  domain: string;
  riskScore: number;
  riskLevel: string;
  scannedAt: string;
  findings: Finding[];
}

function getRiskColors(score: number) {
  if (score <= 14)
    return {
      stroke: '#34d399', // emerald-400
      text: 'text-emerald-300',
      badge: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30',
      label: 'LOW',
    };
  if (score <= 34)
    return {
      stroke: '#fbbf24', // yellow-400
      text: 'text-yellow-300',
      badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-500/30',
      label: 'MODERATE',
    };
  if (score <= 54)
    return {
      stroke: '#fb923c', // orange-400
      text: 'text-orange-300',
      badge: 'bg-orange-900/40 text-orange-300 border-orange-500/30',
      label: 'ELEVATED',
    };
  if (score <= 74)
    return {
      stroke: '#f87171', // red-400
      text: 'text-red-300',
      badge: 'bg-red-900/40 text-red-300 border-red-500/30',
      label: 'HIGH',
    };
  return {
    stroke: '#fb7185', // rose-400
    text: 'text-rose-300',
    badge: 'bg-rose-900/40 text-rose-300 border-rose-500/30',
    label: 'CRITICAL',
  };
}

// Semi-circle arc gauge
function RiskGauge({ score }: { score: number }) {
  const { stroke, text } = getRiskColors(score);
  const r = 40;
  const circumference = Math.PI * r; // half circle ≈ 125.66
  const filled = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="110" height="65" viewBox="0 0 110 65" className="overflow-visible">
        {/* Track */}
        <path
          d="M 15 55 A 40 40 0 0 1 95 55"
          fill="none"
          stroke="#374151"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d="M 15 55 A 40 40 0 0 1 95 55"
          fill="none"
          stroke={stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          strokeDashoffset="0"
        />
      </svg>
      <span className={`text-3xl font-black -mt-1 ${text}`}>{score}</span>
      <span className="text-xs text-gray-500">/100</span>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return <AlertTriangle className="w-4 h-4 text-red-400" />;
  if (s === 'MEDIUM') return <ShieldAlert className="w-4 h-4 text-orange-400" />;
  return <CheckCircle className="w-4 h-4 text-yellow-400" />;
}

interface DomainScanWidgetProps {
  /** Pre-fill the input with this domain */
  initialDomain?: string;
}

export default function DomainScanWidget({ initialDomain = '' }: DomainScanWidgetProps) {
  const [domain, setDomain] = useState(initialDomain);

  const [runScan, { data, loading, error }] = useLazyQuery<{ xshieldScan: ScanResult }>(
    XSHIELD_SCAN_QUERY,
    { fetchPolicy: 'network-only' }
  );

  const handleScan = () => {
    const d = domain.trim();
    if (!d) return;
    void runScan({ variables: { domain: d } });
  };

  const result = data?.xshieldScan ?? null;
  const colors = result ? getRiskColors(result.riskScore) : null;

  return (
    <div className="space-y-4">
      {/* Input row */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="e.g. example.com"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
          />
        </div>
        <button
          onClick={handleScan}
          disabled={loading || !domain.trim()}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
        >
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-950/50 border border-red-500/30 rounded-lg text-sm text-red-300">
          {error.message}
        </div>
      )}

      {/* Result */}
      {result && colors && (
        <div className={`p-5 rounded-xl border ${colors.badge}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Arc gauge */}
            <div className="shrink-0">
              <RiskGauge score={result.riskScore} />
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-white text-base">{result.domain}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest border ${colors.badge}`}
                >
                  {result.riskLevel || colors.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Scanned {new Date(result.scannedAt).toLocaleString()}
              </p>

              {/* Findings */}
              {result.findings && result.findings.length > 0 ? (
                <div className="space-y-1.5">
                  {result.findings.slice(0, 5).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <SeverityIcon severity={f.severity} />
                      <span className="text-gray-300 font-medium">{f.source}</span>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-400">{f.signal}</span>
                    </div>
                  ))}
                  {result.findings.length > 5 && (
                    <p className="text-xs text-gray-600">
                      +{result.findings.length - 5} more findings
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No threat signals detected.</p>
              )}
            </div>

            {/* Full report link */}
            <a
              href={`/api/risk/report?domain=${encodeURIComponent(result.domain)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-semibold border border-violet-500/30 px-3 py-1.5 rounded-lg transition hover:bg-violet-900/20"
            >
              Full Report <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
