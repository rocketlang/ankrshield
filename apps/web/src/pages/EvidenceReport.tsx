/**
 * ANKR Shield — Legal Evidence Report
 *
 * Fetches live evidence package from /warrior/evidence-report.
 * Provides: JSON download, print-to-PDF, CERT-In template copy, police complaint copy.
 * Public page — no auth required (read-only).
 */

import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4270';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EvidenceEvent {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  confidence: number;
}

interface EvidenceChain {
  id: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  threatScore: number;
  narrative: string;
  detectedAt: string;
  eventCount: number;
  events: EvidenceEvent[];
}

interface EvidenceReport {
  reportId: string;
  generatedAt: string;
  version: string;
  severity: string;
  overallThreatScore: number;
  firstDetected: string | null;
  reportHash: string;
  server: {
    hostname: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    memUsedMb: number;
    memTotalMb: number;
    reportedBy: string;
  };
  attackChains: EvidenceChain[];
  quarantinedAgents: {
    agentId: string;
    agentName?: string;
    reason: string;
    quarantinedAt: string;
  }[];
  legalTemplates: {
    certIn: string;
    policeComplaint: string;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    hour12: false,
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function severityColor(s: string) {
  if (s === 'CRITICAL') return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (s === 'HIGH') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  if (s === 'MEDIUM') return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={() => void copy()}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-semibold transition-all"
    >
      {copied ? '✅ Copied!' : `📋 Copy ${label}`}
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EvidenceReport() {
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedChain, setExpandedChain] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/warrior/evidence-report`)
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<EvidenceReport>;
      })
      .then((data) => {
        setReport(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ankrshield-evidence-${report.reportId.slice(0, 8)}.json`;
    a.click();
  };

  const printReport = () => window.print();

  if (loading)
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Generating evidence package…</div>
      </div>
    );

  if (error || !report)
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="text-red-400 text-sm">⚠️ {error ?? 'Failed to load report'}</div>
      </div>
    );

  const sc = severityColor(report.severity);

  return (
    <div className="min-h-screen bg-[#080c14] text-white font-sans antialiased print:bg-white print:text-black">
      {/* ── Nav ── */}
      <nav className="border-b border-white/5 bg-[#080c14]/90 backdrop-blur sticky top-0 z-50 print:hidden">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛡️</span>
            <span className="font-bold tracking-tight">ANKR Shield</span>
            <span className="text-gray-600 text-sm">/ Evidence Report</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadJson}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-semibold transition-all"
            >
              📥 Download JSON
            </button>
            <button
              onClick={printReport}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-semibold transition-all"
            >
              🖨️ Save as PDF
            </button>
            <a
              href="/live"
              className="text-gray-600 hover:text-gray-400 text-xs transition-colors ml-2"
            >
              ← Live Feed
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* ── Header ── */}
        <div className="print:border-b print:border-gray-300 print:pb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-black tracking-tight mb-1 print:text-black">
                Cyber Incident Evidence Report
              </h1>
              <p className="text-gray-500 text-sm print:text-gray-700">
                Generated by ANKR Shield · {fmtDate(report.generatedAt)} · v{report.version}
              </p>
            </div>
            <span className={`px-4 py-2 rounded-xl border text-lg font-black ${sc}`}>
              {report.severity}
            </span>
          </div>
        </div>

        {/* ── Integrity Hash ── */}
        <div className="rounded-2xl border border-white/5 bg-gray-900/60 p-5 print:border print:border-gray-300">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">
            Report Integrity · SHA-256
          </p>
          <code className="text-emerald-400 text-xs font-mono break-all print:text-green-700">
            {report.reportHash}
          </code>
          <p className="text-gray-600 text-xs mt-2">
            This hash uniquely identifies and verifies the authenticity of this evidence package.
            Present this alongside the JSON file in court or to CERT-In.
          </p>
        </div>

        {/* ── Summary ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: 'Threat Score',
              value: `${report.overallThreatScore}/100`,
              sub: report.severity,
            },
            { label: 'Attack Chains', value: report.attackChains.length, sub: 'detected' },
            { label: 'Quarantined', value: report.quarantinedAgents.length, sub: 'agents locked' },
            {
              label: 'First Detected',
              value: report.firstDetected ? fmtDate(report.firstDetected) : 'N/A',
              sub: '',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-gray-900/40 border border-white/5 rounded-xl p-4 print:border print:border-gray-300"
            >
              <p className="text-gray-600 text-[10px] uppercase tracking-widest">{s.label}</p>
              <p className="text-white font-bold text-lg leading-tight print:text-black">
                {s.value}
              </p>
              {s.sub && <p className="text-gray-600 text-xs">{s.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Server Fingerprint ── */}
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 p-6 print:border print:border-gray-300">
          <h2 className="font-bold text-base mb-4 flex items-center gap-2 print:text-black">
            🖥️ Affected System Fingerprint
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2 text-sm">
            {Object.entries(report.server).map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-gray-600 text-xs capitalize">
                  {k.replace(/([A-Z])/g, ' $1')}
                </span>
                <span className="text-gray-200 font-mono text-xs print:text-black">
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Attack Chains ── */}
        <div>
          <h2 className="font-bold text-xl mb-5 flex items-center gap-2 print:text-black">
            ⛓ Attack Chain Evidence ({report.attackChains.length})
          </h2>
          <div className="space-y-4">
            {report.attackChains.map((chain, i) => {
              const cs = severityColor(chain.severity);
              const expanded = expandedChain === chain.id;
              return (
                <div
                  key={chain.id}
                  className={`rounded-2xl border ${cs.split(' ').find((c) => c.startsWith('border'))!} bg-gray-900/60 overflow-hidden print:border print:border-gray-400`}
                >
                  {/* Chain header */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${cs}`}>
                          {chain.severity} · {chain.threatScore}
                        </span>
                        <span className="text-gray-500 text-xs font-mono bg-gray-800 px-2 py-0.5 rounded print:bg-gray-200 print:text-gray-700">
                          {chain.type}
                        </span>
                        <span className="text-gray-600 text-xs">{chain.eventCount} events</span>
                      </div>
                      <span className="text-gray-600 text-xs shrink-0">
                        {fmtDate(chain.detectedAt)}
                      </span>
                    </div>

                    {/* Chain number + ID */}
                    <p className="text-gray-600 text-xs font-mono mb-2">
                      [{i + 1}] Chain ID: {chain.id}
                    </p>

                    {/* Narrative — the AI-generated reason */}
                    <p className="text-gray-100 text-sm leading-relaxed print:text-black">
                      {chain.narrative}
                    </p>

                    {/* Events toggle */}
                    {chain.events.length > 0 && (
                      <button
                        onClick={() => setExpandedChain(expanded ? null : chain.id)}
                        className="mt-3 text-xs text-gray-600 hover:text-gray-400 transition-colors print:hidden"
                      >
                        {expanded ? '▲ Hide' : '▼ Show'} {chain.events.length} raw event
                        {chain.events.length !== 1 ? 's' : ''}
                      </button>
                    )}
                  </div>

                  {/* Raw events */}
                  {expanded && chain.events.length > 0 && (
                    <div className="border-t border-white/5 bg-black/20 p-5 space-y-3 print:hidden">
                      {chain.events.map((ev) => (
                        <div key={ev.id} className="flex gap-3">
                          <span className="text-gray-600 text-xs font-mono shrink-0 mt-0.5">
                            {fmtDate(ev.timestamp)}
                          </span>
                          <div>
                            <span className="text-xs font-mono text-cyan-600 mr-2">
                              [{ev.type}]
                            </span>
                            <span className="text-gray-300 text-xs">{ev.description}</span>
                            <span className="text-gray-600 text-xs ml-2">
                              confidence {ev.confidence}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Quarantined Agents ── */}
        {report.quarantinedAgents.length > 0 && (
          <div>
            <h2 className="font-bold text-xl mb-4 print:text-black">🔒 Quarantined Agents</h2>
            <div className="space-y-3">
              {report.quarantinedAgents.map((q) => (
                <div
                  key={q.agentId}
                  className="rounded-xl border border-red-500/20 bg-red-950/10 p-4 print:border print:border-red-400"
                >
                  <p className="text-xs font-mono text-gray-500 mb-1">{q.agentName ?? q.agentId}</p>
                  <p className="text-red-300 text-sm print:text-red-800">{q.reason}</p>
                  <p className="text-gray-600 text-xs mt-1">at {fmtDate(q.quarantinedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Legal Templates ── */}
        <div className="print:break-before-page">
          <h2 className="font-bold text-xl mb-5 flex items-center gap-2 print:text-black">
            ⚖️ Legal Filing Templates
          </h2>

          <div className="space-y-6">
            {/* CERT-In */}
            <div className="rounded-2xl border border-blue-500/20 bg-gray-900/40 p-6 print:border print:border-blue-400">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2 print:hidden">
                <div>
                  <h3 className="font-bold text-white">CERT-In Complaint</h3>
                  <p className="text-gray-500 text-xs">
                    Indian Computer Emergency Response Team · cert-in.org.in
                  </p>
                </div>
                <CopyButton text={report.legalTemplates.certIn} label="CERT-In Template" />
              </div>
              <pre className="text-gray-400 text-xs font-mono whitespace-pre-wrap leading-relaxed bg-black/30 rounded-xl p-4 max-h-64 overflow-y-auto print:max-h-none print:bg-white print:text-black print:text-xs">
                {report.legalTemplates.certIn}
              </pre>
            </div>

            {/* Police Complaint */}
            <div className="rounded-2xl border border-purple-500/20 bg-gray-900/40 p-6 print:border print:border-purple-400">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2 print:hidden">
                <div>
                  <h3 className="font-bold text-white">Police Complaint / FIR</h3>
                  <p className="text-gray-500 text-xs">
                    Cyber Crime Portal · cybercrime.gov.in · Section 66 IT Act
                  </p>
                </div>
                <CopyButton text={report.legalTemplates.policeComplaint} label="Police Complaint" />
              </div>
              <pre className="text-gray-400 text-xs font-mono whitespace-pre-wrap leading-relaxed bg-black/30 rounded-xl p-4 max-h-64 overflow-y-auto print:max-h-none print:bg-white print:text-black print:text-xs">
                {report.legalTemplates.policeComplaint}
              </pre>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-700 print:hidden">
          <span>
            ANKR Shield · AI Warrior evidence package · SHA-256 verified · {report.reportId}
          </span>
          <div className="flex gap-3">
            <button
              onClick={downloadJson}
              className="text-cyan-700 hover:text-cyan-500 transition-colors"
            >
              📥 Download JSON
            </button>
            <button
              onClick={printReport}
              className="text-purple-700 hover:text-purple-500 transition-colors"
            >
              🖨️ Save PDF
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
