/**
 * ANKR Shield — Live Threat Intelligence
 * Real data from AI Warrior running on this server.
 * Polls /warrior/threats/live every 5 seconds.
 */

import { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4270';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AttackChain {
  id: string;
  type?: string;
  score: number;
  narrative: string;
  startTime: string;
  eventCount: number;
}

interface QuarantinedAgent {
  agentId: string;
  agentName?: string;
  reason: string;
  since: string;
}

interface HoneypotHit {
  ip: string;
  path: string;
  ua: string;
  at: string;
}

interface LiveData {
  ok: boolean;
  timestamp: string;
  server: {
    uptimeSeconds: number;
    loadAvg1m: number;
    memUsedMb: number;
    memTotalMb: number;
    heapUsedMb?: number;
    hostname: string;
    platform: string;
  };
  warrior: {
    running: boolean;
    overallThreatScore: number;
    attackChainsTotal: number;
    activeQuarantines: number;
    recentChains: AttackChain[];
    quarantinedAgents: QuarantinedAgent[];
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function scoreLevel(score: number) {
  if (score >= 80)
    return {
      label: 'CRITICAL',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/40',
      ring: 'border-red-500',
      bar: 'bg-red-500',
    };
  if (score >= 60)
    return {
      label: 'HIGH',
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/40',
      ring: 'border-orange-500',
      bar: 'bg-orange-500',
    };
  if (score >= 30)
    return {
      label: 'MEDIUM',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/40',
      ring: 'border-yellow-500',
      bar: 'bg-yellow-500',
    };
  return {
    label: 'CLEAR',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    ring: 'border-emerald-500',
    bar: 'bg-emerald-500',
  };
}

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      hour12: false,
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  } catch {
    return iso;
  }
}

function fmtTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const s = scoreLevel(score);
  if (size === 'lg') {
    return (
      <div
        className={`relative w-36 h-36 rounded-full border-4 ${s.ring} flex flex-col items-center justify-center`}
      >
        <span className={`text-5xl font-black font-mono ${s.color}`}>{score}</span>
        <span className={`text-xs font-bold uppercase tracking-widest mt-1 ${s.color}`}>
          {s.label}
        </span>
      </div>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${s.bg} ${s.border} ${s.color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.bar}`} />
      {s.label} · {score}
    </span>
  );
}

function ThreatCard({ chain, index: _index }: { chain: AttackChain; index: number }) {
  const s = scoreLevel(chain.score);
  return (
    <div
      className={`relative rounded-2xl border ${s.border} bg-gray-900/80 overflow-hidden group transition-all hover:shadow-lg hover:shadow-black/40`}
    >
      {/* Score bar accent */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />

      <div className="pl-5 pr-5 py-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <ScoreBadge score={chain.score} />
            {chain.type && (
              <span className="text-xs text-gray-500 font-mono bg-gray-800 px-2 py-0.5 rounded">
                {chain.type}
              </span>
            )}
            <span className="text-xs text-gray-600">
              {chain.eventCount} event{chain.eventCount !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs text-gray-600 shrink-0 mt-0.5">
            {fmtTimeAgo(chain.startTime)}
          </span>
        </div>

        {/* Narrative / Reason — the main content */}
        <p className="text-gray-200 text-sm leading-relaxed">{chain.narrative}</p>

        {/* Footer */}
        <p className="mt-3 text-xs text-gray-600 font-mono">
          ID {chain.id.slice(0, 8)}… · {fmtTime(chain.startTime)}
        </p>
      </div>
    </div>
  );
}

function ServerStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3">
      <p className="text-gray-600 text-[10px] uppercase tracking-widest">{label}</p>
      <p className="text-white text-lg font-bold font-mono leading-tight">{value}</p>
      {sub && <p className="text-gray-600 text-xs">{sub}</p>}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LiveThreats() {
  const [data, setData] = useState<LiveData | null>(null);
  const [hits, setHits] = useState<HoneypotHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState('');
  const [polls, setPolls] = useState(0);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch5s = async () => {
    try {
      const [liveRes, hitsRes] = await Promise.all([
        fetch(`${API_BASE}/warrior/threats/live`),
        fetch(`${API_BASE}/warrior/honeypot-hits`),
      ]);
      if (!liveRes.ok) throw new Error(`${liveRes.status}`);
      const json = (await liveRes.json()) as LiveData;
      setData(json);
      if (hitsRes.ok) {
        const hitsJson = (await hitsRes.json()) as { recent: HoneypotHit[] };
        setHits(hitsJson.recent ?? []);
      }
      setError(null);
      setLastFetch(new Date().toLocaleTimeString('en-IN', { hour12: false }));
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unreachable');
    }
    setPolls((n) => n + 1);
  };

  useEffect(() => {
    void fetch5s();
    timerRef.current = setInterval(() => void fetch5s(), 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const score = data?.warrior.overallThreatScore ?? 0;
  const sl = scoreLevel(score);

  return (
    <div className="min-h-screen bg-[#080c14] text-white font-sans antialiased">
      {/* ── Top nav ── */}
      <nav className="border-b border-white/5 bg-[#080c14]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛡️</span>
            <span className="font-bold tracking-tight">ANKR Shield</span>
            <span className="hidden sm:inline text-gray-600 text-sm">/ Live Intelligence</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Live pill */}
            {!error ? (
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${pulse ? 'text-cyan-300' : 'text-cyan-500'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                LIVE · {lastFetch}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-red-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                OFFLINE
              </div>
            )}
            <a
              href="/evidence"
              className="text-xs text-purple-500 hover:text-purple-300 border border-purple-800 rounded px-2 py-1 transition-colors"
            >
              ⚖️ Evidence
            </a>
            <a href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← Home
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-center">
            <p className="text-red-400 text-sm">
              ⚠️ Cannot reach ANKR Shield API — {error}. Retrying every 5s…
            </p>
          </div>
        )}

        {data && (
          <>
            {/* ── Hero row: score + server ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Big score */}
              <div className="lg:col-span-2 flex flex-col items-center justify-center gap-5 bg-gray-900/40 border border-white/5 rounded-2xl py-10">
                <ScoreBadge score={score} size="lg" />
                <div className="text-center">
                  <p className="text-gray-600 text-xs uppercase tracking-widest">
                    Overall Threat Score
                  </p>
                  <p className={`text-sm font-bold mt-1 ${sl.color}`}>
                    {score >= 80
                      ? '🔴 Immediate action required'
                      : score >= 60
                        ? '🟠 Investigate threats'
                        : score >= 30
                          ? '🟡 Monitor closely'
                          : '🟢 System secure'}
                  </p>
                </div>
                <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${sl.bar} rounded-full transition-all duration-700`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>

              {/* Server stats */}
              <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ServerStat
                  label="Hostname"
                  value={data.server.hostname}
                  sub={data.server.platform}
                />
                <ServerStat label="Uptime" value={fmtUptime(data.server.uptimeSeconds)} />
                <ServerStat
                  label="Load (1m)"
                  value={data.server.loadAvg1m.toFixed(2)}
                  sub="CPU avg"
                />
                <ServerStat
                  label="Memory"
                  value={`${data.server.memUsedMb.toLocaleString()} MB`}
                  sub={`of ${data.server.memTotalMb.toLocaleString()} MB`}
                />
                <ServerStat
                  label="Attack Chains"
                  value={data.warrior.attackChainsTotal}
                  sub="total detected"
                />
                <ServerStat
                  label="Quarantined"
                  value={data.warrior.activeQuarantines}
                  sub={data.warrior.activeQuarantines > 0 ? 'agents locked' : 'none active'}
                />
              </div>
            </div>

            {/* ── Attack Chains with Reasons ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <span className={`text-xl ${sl.color}`}>⛓</span>
                  Threat Intelligence Feed
                  <span className="text-xs text-gray-600 font-normal ml-1">
                    ({data.warrior.recentChains.length} recent chains)
                  </span>
                </h2>
                <span className="text-xs text-gray-700">refreshes every 5s · {polls} polls</span>
              </div>

              {data.warrior.recentChains.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-12 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-emerald-400 font-semibold">No threats detected</p>
                  <p className="text-gray-600 text-sm mt-1">AI Warrior is monitoring — all clear</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.warrior.recentChains.map((chain, i) => (
                    <ThreatCard key={chain.id} chain={chain} index={i} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Attacker Flashback — Honeypot Hits ── */}
            {hits.length > 0 && (
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
                  <span className="text-xl">🍯</span> Intruders Identified
                  <span className="text-xs text-gray-600 font-normal ml-1">
                    ({hits.length} honeypot hits)
                  </span>
                </h2>
                <div className="space-y-3">
                  {hits.map((hit, i) => (
                    <div
                      key={`${hit.ip}-${hit.at}-${i}`}
                      className="relative rounded-2xl border border-red-500/30 bg-red-950/10 overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                      <div className="pl-5 pr-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="px-2.5 py-0.5 rounded-lg border text-xs font-bold bg-red-500/10 border-red-500/40 text-red-400">
                            ⚠️ INTRUDER IDENTIFIED
                          </span>
                          <span className="text-gray-600 text-xs">{fmtTimeAgo(hit.at)}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="text-gray-600 uppercase tracking-widest text-[10px]">
                              IP Address
                            </p>
                            <code className="text-red-300 font-mono">{hit.ip}</code>
                          </div>
                          <div>
                            <p className="text-gray-600 uppercase tracking-widest text-[10px]">
                              Probe Target
                            </p>
                            <code className="text-orange-300 font-mono">{hit.path}</code>
                          </div>
                          <div>
                            <p className="text-gray-600 uppercase tracking-widest text-[10px]">
                              Timestamp
                            </p>
                            <code className="text-gray-400 font-mono">{fmtTime(hit.at)}</code>
                          </div>
                        </div>
                        <p className="mt-2 text-gray-600 text-xs truncate">UA: {hit.ua}</p>
                        <p className="mt-1 text-[10px] text-red-700">
                          Warning served · Fingerprint logged · Reported to CERT-In
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Quarantined Agents ── */}
            {data.warrior.quarantinedAgents.length > 0 && (
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
                  <span className="text-xl">🔒</span> Quarantined Agents
                </h2>
                <div className="space-y-3">
                  {data.warrior.quarantinedAgents.map((q) => (
                    <div
                      key={q.agentId}
                      className="rounded-2xl border border-red-500/20 bg-red-950/10 p-5"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <ScoreBadge score={80} />
                        <span className="text-gray-400 text-xs font-mono">
                          {q.agentName ?? q.agentId}
                        </span>
                      </div>
                      <p className="text-red-300 text-sm leading-relaxed">{q.reason}</p>
                      <p className="mt-2 text-xs text-gray-700 font-mono">
                        quarantined {fmtTimeAgo(q.since)} · {fmtTime(q.since)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Skeleton while loading */}
        {!data && !error && (
          <div className="space-y-4 animate-pulse">
            <div className="h-56 bg-gray-900/40 rounded-2xl border border-white/5" />
            <div className="h-40 bg-gray-900/40 rounded-2xl border border-white/5" />
            <div className="h-32 bg-gray-900/40 rounded-2xl border border-white/5" />
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-700">
          <span>ANKR Shield · AI Warrior threat intelligence · real data, no simulation</span>
          <a
            href="/ankrshield.apk"
            download
            className="text-cyan-700 hover:text-cyan-500 transition-colors"
          >
            📥 Download Android App
          </a>
        </div>
      </div>
    </div>
  );
}
