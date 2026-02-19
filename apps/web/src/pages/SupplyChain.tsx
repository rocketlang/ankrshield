/**
 * Supply Chain Risk Scanner
 * Scans npm/PyPI packages for typosquats, vulnerabilities, abandoned packages.
 */

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Package,
  Search,
  Shield,
  Upload,
  X,
} from 'lucide-react';
import { useState } from 'react';

import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4270';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Ecosystem = 'npm' | 'pypi';

interface PackageCheck {
  ecosystem: Ecosystem;
  name: string;
  version?: string;
}

interface SupplyChainFinding {
  type:
    | 'typosquat'
    | 'vulnerability'
    | 'abandoned'
    | 'unknown_package'
    | 'no_source'
    | 'single_maintainer';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  detail: string;
  cve?: string;
  cvss?: number;
}

interface PackageMetadata {
  description?: string;
  latestVersion?: string;
  weeklyDownloads?: number;
  maintainerCount?: number;
  publishedAt?: string;
  repositoryUrl?: string;
}

interface PackageRisk {
  package: PackageCheck;
  score: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  findings: SupplyChainFinding[];
  metadata?: PackageMetadata;
}

interface SupplyChainReport {
  packages: PackageRisk[];
  totalPackages: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  scanDurationMs: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function riskStyle(level: string) {
  switch (level) {
    case 'CRITICAL':
      return {
        label: 'CRITICAL',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/40',
        bar: 'bg-red-500',
        badge: 'bg-red-500/20 text-red-300 border border-red-500/40',
      };
    case 'HIGH':
      return {
        label: 'HIGH',
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/40',
        bar: 'bg-orange-500',
        badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
      };
    case 'MEDIUM':
      return {
        label: 'MEDIUM',
        color: 'text-yellow-400',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/40',
        bar: 'bg-yellow-500',
        badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
      };
    case 'LOW':
      return {
        label: 'LOW',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/40',
        bar: 'bg-blue-500',
        badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
      };
    default:
      return {
        label: 'CLEAN',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/40',
        bar: 'bg-emerald-500',
        badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      };
  }
}

function severityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/20 text-red-300 border border-red-500/40';
    case 'high':
      return 'bg-orange-500/20 text-orange-300 border border-orange-500/40';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
    case 'low':
      return 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
    default:
      return 'bg-gray-500/20 text-gray-300 border border-gray-500/40';
  }
}

function findingIcon(type: string) {
  switch (type) {
    case 'typosquat':
      return '🎭';
    case 'vulnerability':
      return '🐛';
    case 'abandoned':
      return '⚰️';
    case 'unknown_package':
      return '❓';
    case 'no_source':
      return '🔒';
    case 'single_maintainer':
      return '👤';
    default:
      return '⚠️';
  }
}

function fmtDownloads(n?: number) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M/wk`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K/wk`;
  return `${n}/wk`;
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('ankrshield_token');
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

// ─── Package Row ───────────────────────────────────────────────────────────────

function PackageRow({ pkg }: { pkg: PackageRisk }) {
  const [expanded, setExpanded] = useState(false);
  const style = riskStyle(pkg.riskLevel);

  return (
    <div className={`border rounded-lg overflow-hidden ${style.border} ${style.bg}`}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5 transition"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Expand icon */}
        <span className="text-gray-500 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>

        {/* Package name + ecosystem */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-white">{pkg.package.name}</span>
            {pkg.package.version && (
              <span className="text-xs text-gray-500">v{pkg.package.version}</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono">
              {pkg.package.ecosystem}
            </span>
          </div>
          {pkg.metadata?.description && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{pkg.metadata.description}</p>
          )}
        </div>

        {/* Downloads */}
        <div className="hidden md:block text-right flex-shrink-0 w-24">
          <div className="text-xs text-gray-400">Downloads</div>
          <div className="text-sm text-gray-200">{fmtDownloads(pkg.metadata?.weeklyDownloads)}</div>
        </div>

        {/* Findings count */}
        <div className="text-right flex-shrink-0 w-16">
          <div className="text-xs text-gray-400">Findings</div>
          <div className="text-sm text-gray-200">{pkg.findings.length}</div>
        </div>

        {/* Score bar */}
        <div className="flex-shrink-0 w-28">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Score</span>
            <span className={`text-xs font-bold ${style.color}`}>{pkg.score}</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${style.bar}`}
              style={{ width: `${pkg.score}%` }}
            />
          </div>
        </div>

        {/* Risk badge */}
        <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded ${style.badge}`}>
          {style.label}
        </span>
      </button>

      {/* Expanded findings */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-white/5">
          {/* Metadata row */}
          {pkg.metadata && (
            <div className="flex flex-wrap gap-4 py-3 text-xs text-gray-400">
              {pkg.metadata.latestVersion && (
                <span>
                  Latest:{' '}
                  <span className="text-gray-200 font-mono">{pkg.metadata.latestVersion}</span>
                </span>
              )}
              {pkg.metadata.maintainerCount !== undefined && (
                <span>
                  Maintainers: <span className="text-gray-200">{pkg.metadata.maintainerCount}</span>
                </span>
              )}
              {pkg.metadata.publishedAt && (
                <span>
                  Published: <span className="text-gray-200">{pkg.metadata.publishedAt}</span>
                </span>
              )}
              {pkg.metadata.repositoryUrl && (
                <a
                  href={pkg.metadata.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Repository ↗
                </a>
              )}
            </div>
          )}

          {/* Findings list */}
          {pkg.findings.length === 0 ? (
            <p className="text-sm text-emerald-400 py-2">No issues detected.</p>
          ) : (
            <div className="space-y-2 mt-2">
              {pkg.findings.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-black/20 rounded-lg border border-white/5"
                >
                  <span className="text-lg leading-none mt-0.5">{findingIcon(f.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                        {f.type.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${severityBadge(f.severity)}`}
                      >
                        {f.severity}
                      </span>
                      {f.cve && <span className="text-xs font-mono text-red-300">{f.cve}</span>}
                      {f.cvss !== undefined && (
                        <span className="text-xs text-gray-400">CVSS {f.cvss.toFixed(1)}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual Entry Form ─────────────────────────────────────────────────────────

interface ManualEntry {
  ecosystem: Ecosystem;
  name: string;
  version: string;
}

function ManualForm({ onScan }: { onScan: (pkgs: PackageCheck[]) => void }) {
  const [entries, setEntries] = useState<ManualEntry[]>([
    { ecosystem: 'npm', name: '', version: '' },
  ]);

  function update(i: number, field: keyof ManualEntry, value: string) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  function addRow() {
    setEntries((prev) => [...prev, { ecosystem: 'npm', name: '', version: '' }]);
  }

  function removeRow(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    const valid = entries
      .filter((e) => e.name.trim())
      .map((e) => ({
        ecosystem: e.ecosystem,
        name: e.name.trim(),
        ...(e.version.trim() ? { version: e.version.trim() } : {}),
      }));
    if (valid.length === 0) return;
    onScan(valid);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1">
        <span className="col-span-3">Ecosystem</span>
        <span className="col-span-5">Package name</span>
        <span className="col-span-3">Version (optional)</span>
        <span className="col-span-1" />
      </div>

      {entries.map((e, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <select
            value={e.ecosystem}
            onChange={(ev) => update(i, 'ecosystem', ev.target.value as Ecosystem)}
            className="col-span-3 bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="npm">npm</option>
            <option value="pypi">pypi</option>
          </select>
          <input
            value={e.name}
            onChange={(ev) => update(i, 'name', ev.target.value)}
            placeholder="e.g. lodash"
            className="col-span-5 bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 font-mono placeholder-gray-600"
          />
          <input
            value={e.version}
            onChange={(ev) => update(i, 'version', ev.target.value)}
            placeholder="e.g. 4.17.21"
            className="col-span-3 bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 font-mono placeholder-gray-600"
          />
          <button
            onClick={() => removeRow(i)}
            disabled={entries.length === 1}
            className="col-span-1 flex items-center justify-center text-gray-500 hover:text-red-400 disabled:opacity-30 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      <div className="flex gap-3 pt-1">
        <button
          onClick={addRow}
          disabled={entries.length >= 50}
          className="text-sm text-blue-400 hover:text-blue-300 transition disabled:opacity-30"
        >
          + Add package
        </button>
        <button
          onClick={submit}
          className="ml-auto flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition"
        >
          <Search className="w-4 h-4" />
          Scan packages
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SupplyChain() {
  const [tab, setTab] = useState<'manual' | 'manifest'>('manual');
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<SupplyChainReport | null>(null);
  const [error, setError] = useState('');

  async function runScan(pkgs: PackageCheck[]) {
    setScanning(true);
    setError('');
    setReport(null);
    try {
      const res = await authFetch('/risk/supply-chain', {
        method: 'POST',
        body: JSON.stringify({ packages: pkgs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }));
        setError((err as { error: string }).error ?? 'Scan failed');
        return;
      }
      const data = (await res.json()) as SupplyChainReport;
      setReport(data);
    } catch {
      setError('Network error — is the API running?');
    } finally {
      setScanning(false);
    }
  }

  // Manifest endpoint returns full report directly — wire it in
  async function runManifestScan(text: string, eco: string) {
    setScanning(true);
    setError('');
    setReport(null);
    try {
      const res = await authFetch('/risk/supply-chain/manifest', {
        method: 'POST',
        body: JSON.stringify({ manifest: text, ecosystem: eco }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }));
        setError((err as { error: string }).error ?? 'Scan failed');
        return;
      }
      const data = (await res.json()) as SupplyChainReport;
      setReport(data);
    } catch {
      setError('Network error — is the API running?');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#080c14] text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
              <Package className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Supply Chain Scanner</h1>
              <p className="text-sm text-gray-400">
                Detect typosquats, vulnerabilities, and abandoned packages in npm &amp; PyPI
              </p>
            </div>
          </div>

          {/* Input panel */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit">
              <button
                onClick={() => setTab('manual')}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Manual entry
              </button>
              <button
                onClick={() => setTab('manifest')}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  tab === 'manifest' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Paste manifest
              </button>
            </div>

            {tab === 'manual' ? (
              <ManualForm onScan={runScan} />
            ) : (
              <ManifestScanForm onScan={runManifestScan} />
            )}
          </div>

          {/* Scanning indicator */}
          {scanning && (
            <div className="flex items-center gap-3 text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-xl px-5 py-4">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">
                Scanning packages — checking OSV vulnerabilities, npm/PyPI registries, typosquat
                patterns…
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Results */}
          {report && <Results report={report} />}
        </main>
      </div>
    </div>
  );
}

// ─── Manifest Scan Form (with state) ──────────────────────────────────────────

function ManifestScanForm({ onScan }: { onScan: (text: string, eco: string) => void }) {
  const [text, setText] = useState('');
  const [eco, setEco] = useState<'auto' | 'npm' | 'pypi'>('auto');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Detect as:</label>
        <select
          value={eco}
          onChange={(e) => setEco(e.target.value as 'auto' | 'npm' | 'pypi')}
          className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="auto">Auto-detect</option>
          <option value="npm">npm (package.json)</option>
          <option value="pypi">PyPI (requirements.txt)</option>
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Paste your package.json or requirements.txt content here…'}
        rows={10}
        className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 placeholder-gray-600 resize-none"
      />
      <div className="flex justify-end">
        <button
          onClick={() => onScan(text, eco)}
          disabled={!text.trim()}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          Scan manifest
        </button>
      </div>
    </div>
  );
}

// ─── Results Panel ─────────────────────────────────────────────────────────────

function Results({ report }: { report: SupplyChainReport }) {
  const riskyFirst = [...report.packages].sort((a, b) => b.score - a.score);
  const hasIssues =
    report.criticalCount + report.highCount + report.mediumCount + report.lowCount > 0;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Scan Complete
          </h2>
          <span className="text-xs text-gray-500">
            {report.totalPackages} packages · {fmtDuration(report.scanDurationMs)}
          </span>
        </div>

        {hasIssues ? (
          <div className="flex flex-wrap gap-3">
            {report.criticalCount > 0 && (
              <SummaryPill
                count={report.criticalCount}
                label="Critical"
                cls="bg-red-500/20 text-red-300 border-red-500/40"
              />
            )}
            {report.highCount > 0 && (
              <SummaryPill
                count={report.highCount}
                label="High"
                cls="bg-orange-500/20 text-orange-300 border-orange-500/40"
              />
            )}
            {report.mediumCount > 0 && (
              <SummaryPill
                count={report.mediumCount}
                label="Medium"
                cls="bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
              />
            )}
            {report.lowCount > 0 && (
              <SummaryPill
                count={report.lowCount}
                label="Low"
                cls="bg-blue-500/20 text-blue-300 border-blue-500/40"
              />
            )}
            <span className="ml-auto text-sm text-gray-400 self-center">
              {report.totalPackages -
                report.criticalCount -
                report.highCount -
                report.mediumCount -
                report.lowCount}{' '}
              clean
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-emerald-400">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-medium">
              All {report.totalPackages} packages are clean — no issues found.
            </span>
          </div>
        )}
      </div>

      {/* Package list */}
      <div className="space-y-3">
        {riskyFirst.map((pkg, i) => (
          <PackageRow key={`${pkg.package.ecosystem}:${pkg.package.name}:${i}`} pkg={pkg} />
        ))}
      </div>
    </div>
  );
}

function SummaryPill({ count, label, cls }: { count: number; label: string; cls: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${cls}`}
    >
      <span className="text-base leading-none font-bold">{count}</span>
      {label}
    </span>
  );
}
