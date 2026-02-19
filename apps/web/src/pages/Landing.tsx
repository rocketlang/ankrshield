/**
 * xShield AI — Landing Page
 * xshieldai.com
 */

import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const APK_URL = 'https://xshieldai.com/ankrshield.apk';
const LIVE_URL = 'https://xshieldai.com/live';
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4270';

// ─── Live threat score ticker ──────────────────────────────────────────────────
function useLiveThreatScore() {
  const [score, setScore] = useState<number | null>(null);
  const [chains, setChains] = useState(0);
  const [honeypots, setHoneypots] = useState(0);
  useEffect(() => {
    const load = async () => {
      try {
        const [liveRes, hitsRes] = await Promise.all([
          fetch(`${API_BASE}/warrior/threats/live`),
          fetch(`${API_BASE}/warrior/honeypot-hits`),
        ]);
        if (liveRes.ok) {
          const d = await liveRes.json();
          setScore(d.warrior?.overallThreatScore ?? 0);
          setChains(d.warrior?.attackChainsTotal ?? 0);
        }
        if (hitsRes.ok) {
          const h = await hitsRes.json();
          setHoneypots(h.total ?? 0);
        }
      } catch {
        /* offline */
      }
    };
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => clearInterval(id);
  }, []);
  return { score, chains, honeypots };
}

// ─── Components ────────────────────────────────────────────────────────────────

function Badge({ children, color = 'cyan' }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    cyan: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
    red: 'bg-red-500/15 border-red-500/40 text-red-300',
    purple: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
    amber: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    green: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest ${map[color] ?? map.cyan}`}
    >
      {children}
    </span>
  );
}

function ThreatPill({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 80
      ? 'text-red-300 border-red-500/50 bg-red-500/15'
      : score >= 60
        ? 'text-orange-300 border-orange-500/50 bg-orange-500/15'
        : score >= 30
          ? 'text-yellow-300 border-yellow-500/50 bg-yellow-500/15'
          : 'text-emerald-300 border-emerald-500/50 bg-emerald-500/15';
  const label = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'SECURE';
  return (
    <span
      className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-black font-mono ${color}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      LIVE THREAT · {label} · {score}
    </span>
  );
}

function FeatureCard({
  icon,
  title,
  tagline,
  bullets,
  accent = 'cyan',
}: {
  icon: string;
  title: string;
  tagline: string;
  bullets: string[];
  accent?: string;
}) {
  const border =
    accent === 'purple'
      ? 'hover:border-purple-500/50'
      : accent === 'red'
        ? 'hover:border-red-500/50'
        : accent === 'amber'
          ? 'hover:border-amber-500/50'
          : accent === 'green'
            ? 'hover:border-emerald-500/50'
            : 'hover:border-cyan-500/50';
  const dot =
    accent === 'purple'
      ? 'text-purple-400'
      : accent === 'red'
        ? 'text-red-400'
        : accent === 'amber'
          ? 'text-amber-400'
          : accent === 'green'
            ? 'text-emerald-400'
            : 'text-cyan-400';
  return (
    <div
      className={`group rounded-2xl border border-white/10 bg-white/[0.05] p-6 transition-all hover:bg-white/[0.08] ${border}`}
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
      <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${dot}`}>{tagline}</p>
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
            <span className={`mt-0.5 shrink-0 ${dot}`}>›</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatBox({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-black font-mono text-white tracking-tight">{value}</div>
      <div className="text-sm font-semibold text-gray-200 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── APT actor card ────────────────────────────────────────────────────────────
function AptCard({
  flag,
  name,
  alias,
  origin,
  targets,
  malware,
  color,
}: {
  flag: string;
  name: string;
  alias: string;
  origin: string;
  targets: string;
  malware: string[];
  color: string;
}) {
  const ring =
    color === 'red'
      ? 'border-red-500/25 hover:border-red-500/50'
      : color === 'blue'
        ? 'border-blue-500/25 hover:border-blue-500/50'
        : color === 'purple'
          ? 'border-purple-500/25 hover:border-purple-500/50'
          : 'border-amber-500/25 hover:border-amber-500/50';
  const tag =
    color === 'red'
      ? 'bg-red-500/15 text-red-300'
      : color === 'blue'
        ? 'bg-blue-500/15 text-blue-300'
        : color === 'purple'
          ? 'bg-purple-500/15 text-purple-300'
          : 'bg-amber-500/15 text-amber-300';
  return (
    <div
      className={`rounded-xl border bg-white/[0.04] p-5 transition-all hover:bg-white/[0.07] ${ring}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-2xl mb-1">{flag}</div>
          <div className="text-white font-bold text-sm">{name}</div>
          <div className="text-gray-400 text-xs">{alias}</div>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tag}`}>{origin}</span>
      </div>
      <div className="text-gray-400 text-xs mb-3">
        <span className="text-gray-500 uppercase tracking-wide text-[10px]">Targets · </span>
        {targets}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {malware.map((m) => (
          <span
            key={m}
            className="text-[10px] font-mono bg-white/[0.06] border border-white/10 text-gray-300 px-2 py-0.5 rounded"
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Malware family row ────────────────────────────────────────────────────────
function MalwareRow({
  name,
  type,
  origin,
  technique,
  cve,
}: {
  name: string;
  type: string;
  origin: string;
  technique: string;
  cve?: string;
}) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/[0.06] last:border-0 group hover:bg-white/[0.03] -mx-4 px-4 rounded transition-colors">
      <div className="w-32 shrink-0">
        <span className="font-mono font-bold text-red-300 text-sm">{name}</span>
      </div>
      <div className="w-28 shrink-0">
        <span className="text-xs bg-red-500/10 border border-red-500/20 text-red-300 px-2 py-0.5 rounded font-semibold">
          {type}
        </span>
      </div>
      <div className="w-24 shrink-0 text-xs text-gray-400">{origin}</div>
      <div className="flex-1 text-xs text-gray-300">{technique}</div>
      {cve && (
        <div className="shrink-0">
          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
            {cve}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Platform shield card ──────────────────────────────────────────────────────
function PlatformShieldCard({
  icon,
  name,
  badge,
  heroStat,
  heroLabel,
  accent,
  vectors,
}: {
  icon: string;
  name: string;
  badge: string;
  heroStat: string;
  heroLabel: string;
  accent: 'orange' | 'green' | 'blue' | 'slate';
  vectors: { icon: string; label: string; count?: string }[];
}) {
  const ring =
    accent === 'orange'
      ? 'border-orange-500/25 hover:border-orange-500/45'
      : accent === 'green'
        ? 'border-emerald-500/25 hover:border-emerald-500/45'
        : accent === 'blue'
          ? 'border-blue-500/25 hover:border-blue-500/45'
          : 'border-slate-500/25 hover:border-slate-400/40';
  const statColor =
    accent === 'orange'
      ? 'text-orange-400'
      : accent === 'green'
        ? 'text-emerald-400'
        : accent === 'blue'
          ? 'text-blue-400'
          : 'text-slate-300';
  const countColor =
    accent === 'orange'
      ? 'text-orange-400/80'
      : accent === 'green'
        ? 'text-emerald-400/80'
        : accent === 'blue'
          ? 'text-blue-400/80'
          : 'text-slate-400';

  return (
    <div
      className={`rounded-2xl border bg-white/[0.04] p-6 transition-all hover:bg-white/[0.07] ${ring}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-3xl mb-2">{icon}</div>
          <div className="text-white font-bold text-base">{name}</div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">
            {badge}
          </div>
        </div>
        <span
          className="w-2 h-2 rounded-full bg-green-500 animate-pulse mt-1 shrink-0"
          title="Live detection active"
        />
      </div>

      {/* Hero stat */}
      <div className="mb-5 rounded-xl bg-black/40 border border-white/[0.06] px-4 py-3">
        <div className={`text-3xl font-black font-mono leading-none ${statColor}`}>{heroStat}</div>
        <div className="text-gray-400 text-xs mt-1.5 leading-snug">{heroLabel}</div>
      </div>

      {/* Threat vectors */}
      <ul className="space-y-2.5">
        {vectors.map((v) => (
          <li key={v.label} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 text-sm leading-none mt-0.5">{v.icon}</span>
            <span className="text-gray-300 flex-1 leading-snug">{v.label}</span>
            {v.count && (
              <span className={`shrink-0 font-mono font-bold text-[10px] ${countColor}`}>
                {v.count}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function Landing() {
  const { score } = useLiveThreatScore();

  return (
    <div className="min-h-screen bg-[#0d1117] text-white font-sans antialiased">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0d1117]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-black">
              x
            </div>
            <span className="font-black tracking-tight text-lg">
              xShield<span className="text-cyan-400">AI</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-300">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#threats" className="hover:text-white transition-colors">
              Threat DB
            </a>
            <a href="#apt" className="hover:text-white transition-colors">
              APT Groups
            </a>
            <a href="#risk" className="hover:text-white transition-colors">
              Risk Intel
            </a>
            <a href="#platforms" className="hover:text-white transition-colors">
              Platforms
            </a>
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How it Works
            </a>
            <a
              href={LIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#pricing"
              className="text-sm text-gray-300 hover:text-white transition-colors hidden md:block"
            >
              Pricing
            </a>
            <Link
              to="/login"
              className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <a
              href="https://github.com/rocketlang/ankrshield"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-1.5 rounded-lg transition-colors"
            >
              GitHub →
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(6,182,212,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.07) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-0 w-80 h-80 bg-blue-700/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-24 text-center">
          <div className="flex justify-center mb-8 gap-3 flex-wrap">
            {score !== null ? (
              <ThreatPill score={score} />
            ) : (
              <Badge color="cyan">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                DRP Platform · Live
              </Badge>
            )}
            <Badge color="green">17 Intel Sources</Badge>
            <Badge color="purple">AI Enabled · BYO Key</Badge>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-6">
            <span className="text-white">Enterprise Threat</span>
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Intelligence.
            </span>
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Open Source.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-4 leading-relaxed">
            Full Digital Risk Protection in under 30 seconds. 17 parallel intelligence sources. AI
            threat narrative. Self-hosted free forever — or managed cloud from $199/month.
          </p>
          <p className="text-sm text-gray-500 mb-10">
            Apache 2.0 · Audit every line of code · No black box · No vendor lock-in ·{' '}
            <span className="text-emerald-400 font-semibold">Enterprise EE from $25K/year</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a
              href="https://github.com/rocketlang/ankrshield"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 text-base"
            >
              <span>⭐</span> Star on GitHub — Free Forever
            </a>
            <a
              href={LIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              View Live Dashboard
            </a>
          </div>

          <div className="inline-flex items-center gap-8 bg-white/[0.06] border border-white/10 rounded-2xl px-8 py-4">
            <StatBox value="17" label="Intel Sources" sub="running in parallel" />
            <div className="w-px h-10 bg-white/15" />
            <StatBox value="350x" label="Cheaper" sub="vs Constella" />
            <div className="w-px h-10 bg-white/15" />
            <StatBox value="🤖" label="AI Enabled" sub="BYO API key" />
            <div className="w-px h-10 bg-white/15" />
            <StatBox value="47" label="APT Groups" sub="tracked" />
            <div className="w-px h-10 bg-white/15" />
            <StatBox value="&lt;30s" label="Full Report" sub="no wait, no call" />
          </div>
        </div>
      </section>

      {/* ── Scrolling ticker ── */}
      <div className="border-y border-white/10 bg-white/[0.04] overflow-hidden py-3">
        <div className="flex gap-12 animate-[marquee_40s_linear_infinite] whitespace-nowrap text-xs text-gray-400 font-mono">
          {Array(3)
            .fill([
              '🔴 185.220.101.45 · Tor Exit · DE · Score 95 · BLOCKED',
              '⚠️ BPFDoor IOC match · Chinese APT41 C2 beacon',
              '🛡️ AbuseIPDB pre-block · 45.143.200.1 · Score 92',
              '🔬 Pegasus C2 domain detected · NSO Group spyware',
              '🍯 WordPress brute force · /wp-admin · IDENTIFIED',
              '📡 Reported to AbuseIPDB · categories: WebApp, Hacking',
              '🚫 iptables DROP · 194.165.16.11 · Sandworm TTPs',
              '⚔️ XZ Utils backdoor IOC · CVE-2024-3094 · CRITICAL',
              '🔬 Symbiote rootkit · LD_PRELOAD hijack · BLOCKED',
              '💀 Lazarus Group SSH key exfil attempt · DPRK',
              '🌐 Turla Penguin C2 · FSB APT · Serpent backdoor',
              '🧬 YARA match: BPFDoor_Linux_Backdoor @ /dev/shm/.init · confidence 90',
              '🚨 PwnKit exploit attempt · CVE-2021-4034 · BLOCKED',
              '📷 QR Quishing blocked · xn--mcrsft-hdb.xyz/signin · score 100 · OAuth hijack detected',
              '📤 Discord exfil · powershell.exe → webhook/1122334455 · MALWARE_EXFIL · score 95',
              '🤖 Telegram C2 · AsyncRAT bot token · ThreatFox tag: telegram-bot · BLOCKED',
              '🎭 Brand impersonation · @ankr_official_airdrop · Levenshtein 0 · score 91 · ALERT',
            ])
            .flat()
            .map((item, i) => (
              <span key={i} className="shrink-0">
                {item}
              </span>
            ))}
        </div>
      </div>

      {/* ── Feature cards ── */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <Badge color="cyan">Protection Layers</Badge>
          <h2 className="text-4xl font-black text-white mt-4 mb-4">Seven Shields. One Platform.</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Each agent runs independently, correlating signals across your entire stack in real
            time. No cloud dependency. No telemetry. Fully self-hosted.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            icon="⚔️"
            title="AI Warrior"
            accent="cyan"
            tagline="LLM Threat Correlation"
            bullets={[
              'Multi-stage attack chain detection & scoring',
              'Natural language threat narratives per incident',
              'Cross-agent signal correlation (6 sources)',
              'Automated incident triage and classification',
              'Adversarial prompt injection detection',
              'MITRE ATT&CK TTP mapping per alert',
            ]}
          />
          <FeatureCard
            icon="🔬"
            title="Spyware Detector"
            accent="red"
            tagline="Nation-State Defense"
            bullets={[
              'Pegasus · Candiru · Predator · FinSpy detection',
              'Amnesty International & Citizen Lab IOC feeds',
              'NSO Group, Hacking Team, Intellexa C2 domains',
              'RCS (Remote Control System) surveillance signals',
              'Android stalkerware: FlexiSpy, mSpy, Cerberus',
              'Real-time domain reputation against 40+ threat feeds',
            ]}
          />
          <FeatureCard
            icon="🐧"
            title="Linux Shield"
            accent="red"
            tagline="Kernel-Level Defense"
            bullets={[
              'YARA binary scanning — 11 rules, 8 malware families',
              'BPFDoor · Symbiote · OrBit rootkit detection',
              'LD_PRELOAD hijack & library injection alerts',
              'Reptile · Diamorphine kernel module IOCs',
              '/proc filesystem manipulation detection',
              'XZ Utils (CVE-2024-3094) supply chain defense',
            ]}
          />
          <FeatureCard
            icon="🔒"
            title="Privacy Shield"
            accent="purple"
            tagline="Network-Level Guardian"
            bullets={[
              'DNS-level tracker & C2 domain blocking',
              'Deep packet inspection for exfiltration',
              'TLS certificate anomaly & MITM detection',
              'Tor exit node pre-identification (95% score)',
              'VPN-leak & DNS-over-HTTPS bypass detection',
              'Geo-based data exfiltration alerts',
            ]}
          />
          <FeatureCard
            icon="🤖"
            title="AI Governance"
            accent="amber"
            tagline="Scope Enforcement"
            bullets={[
              'ChatGPT · Claude · Copilot · Gemini monitoring',
              'Data exfiltration via AI prompt prevention',
              'Policy-based AI tool access controls',
              'Full audit log for all AI interactions',
              'Cursor AI and GitHub Copilot telemetry control',
              'Shadow AI usage detection across network',
            ]}
          />
          <FeatureCard
            icon="🕵️"
            title="Threat Intel"
            accent="green"
            tagline="Global IOC Database"
            bullets={[
              '47 APT groups tracked with live IOC updates',
              'AbuseIPDB integration — report & receive threat data',
              "Shodan exposure scan for your server's open ports",
              'CVE exploit attempt detection (PoC watchlist)',
              'Honeypot data shared with global defense network',
              'Dark web breach mention alerting',
            ]}
          />
          <FeatureCard
            icon="📡"
            title="Social Shield"
            accent="purple"
            tagline="Messaging Platform Defense"
            bullets={[
              'QR phishing (quishing) — 10-signal heuristic detector',
              'Discord / Telegram / Slack webhook exfil detection',
              'Telegram Bot C2 — 100+ malware families tracked live',
              'Social brand impersonation: Levenshtein + typosquat variants',
              'Process-level exfil: powershell→webhook = MALWARE_EXFIL (95)',
              'ThreatFox IOC lookup for social platform C2 tokens',
            ]}
          />
        </div>
      </section>

      {/* ── Linux malware DB ── */}
      <section id="threats" className="border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <Badge color="red">Linux Threat Database</Badge>
            <h2 className="text-4xl font-black text-white mt-4 mb-4">
              What's actually attacking your server
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-6">
              Linux servers face the most sophisticated malware on the internet — rootkits that hide
              inside the kernel, backdoors that survive reboots, and nation-state implants that
              evade every antivirus. xShield AI tracks them all.
            </p>
            {/* YARA badge */}
            <div className="inline-flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl px-5 py-3 text-sm">
              <span className="text-2xl">🧬</span>
              <div className="text-left">
                <div className="text-orange-300 font-bold">YARA Binary Scanning Active</div>
                <div className="text-gray-400 text-xs">
                  11 pattern-matching rules scan /tmp, /dev/shm, /var/tmp and all known artifact
                  paths — catches malware by binary content, not just filename or path.
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-orange-400 font-black font-mono text-xl">11</div>
                <div className="text-gray-500 text-[10px]">rules</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a0f18] overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-3 border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              <div className="w-32">Malware</div>
              <div className="w-28">Type</div>
              <div className="w-24">Origin</div>
              <div className="flex-1">Attack Technique</div>
              <div className="shrink-0">CVE</div>
            </div>
            <div className="px-4">
              <MalwareRow
                name="BPFDoor"
                type="Backdoor"
                origin="China / APT41"
                technique="Uses BPF packet filter to hide C2 traffic — invisible to netstat, ps, and most EDR tools"
              />
              <MalwareRow
                name="Symbiote"
                type="Rootkit"
                origin="Brazil / Gov"
                technique="Injects into every running process via LD_PRELOAD, hides network connections at libc level"
              />
              <MalwareRow
                name="OrBit"
                type="Rootkit"
                origin="Unknown"
                technique="Hooks libc read/write/getdents to hide files, processes, and network sockets from all userspace tools"
              />
              <MalwareRow
                name="Reptile"
                type="Kernel Rootkit"
                origin="Multiple APTs"
                technique="Loadable kernel module (LKM) rootkit; hides itself, files, processes, and opens reverse shell"
              />
              <MalwareRow
                name="Diamorphine"
                type="Kernel Rootkit"
                origin="Open Source"
                technique="LKM rootkit that hides processes by PID, elevates any process to root via signal 64"
              />
              <MalwareRow
                name="HiddenWasp"
                type="Backdoor"
                origin="China"
                technique="Deployed post-exploitation; uses rootkit to hide, establishes persistent reverse shell to C2"
              />
              <MalwareRow
                name="Lightning Framework"
                type="Modular RAT"
                origin="Unknown"
                technique="Modular malware framework: installs SSH backdoor, rootkit, plugins loaded at runtime"
              />
              <MalwareRow
                name="FontOnLake"
                type="Backdoor"
                origin="SE Asia APT"
                technique="Trojanizes legitimate Linux utilities (cat, kill, sftp) to maintain persistence and collect creds"
              />
              <MalwareRow
                name="Kobalos"
                type="Backdoor"
                origin="Unknown"
                technique="Tiny but complex backdoor targeting HPC clusters and university research systems in US/EU"
              />
              <MalwareRow
                name="Mirai"
                type="Botnet"
                origin="Criminal"
                technique="Brute-forces SSH/Telnet default creds, recruits servers into DDoS botnet army"
              />
              <MalwareRow
                name="XorDDoS"
                type="Botnet"
                origin="China"
                technique="SSH brute force → persistent backdoor → XOR-encrypted C2 → DDoS from compromised Linux servers"
              />
              <MalwareRow
                name="Chaos"
                type="Botnet"
                origin="China"
                technique="Multi-arch botnet (x86/ARM/MIPS), spreads via CVE exploits and SSH keys, targets Linux & FreeBSD"
              />
              <MalwareRow
                name="XZ Utils backdoor"
                type="Supply Chain"
                origin="State Actor"
                technique="Obfuscated backdoor injected into xz/liblzma 5.6.0-5.6.1 via social engineering of maintainer"
                cve="CVE-2024-3094"
              />
              <MalwareRow
                name="PwnKit"
                type="Privilege Esc"
                origin="Any actor"
                technique="Memory corruption in pkexec (polkit) allows unprivileged user to become root on any Linux system"
                cve="CVE-2021-4034"
              />
              <MalwareRow
                name="DirtyPipe"
                type="Privilege Esc"
                origin="Any actor"
                technique="Linux kernel pipe bug allows overwriting read-only files — used to patch /etc/passwd for root access"
                cve="CVE-2022-0847"
              />
              <MalwareRow
                name="Dirty COW"
                type="Privilege Esc"
                origin="Any actor"
                technique="Race condition in copy-on-write kernel mechanism; exploited in the wild for 9 years before patch"
                cve="CVE-2016-5195"
              />
            </div>
          </div>

          <p className="text-center text-gray-500 text-xs mt-6">
            xShield AI maintains IOC signatures, behavioral heuristics, and network indicators for
            all threats above. Database updated continuously from Amnesty Tech, Citizen Lab, ESET
            Research, and Kaspersky GReAT feeds.
          </p>
        </div>
      </section>

      {/* ── APT Groups ── */}
      <section id="apt" className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <Badge color="purple">Nation-State Actors</Badge>
          <h2 className="text-4xl font-black text-white mt-4 mb-4">
            The groups actively targeting you
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Government-backed hacker groups with billion-dollar budgets, zero-day stockpiles, and
            years of persistence. xShield AI tracks their infrastructure, malware families, and
            tactics in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AptCard
            flag="🇷🇺"
            name="Sandworm"
            alias="APT44 · Voodoo Bear"
            origin="Russia / GRU"
            targets="Energy grids, telecoms, government, Ukraine"
            color="red"
            malware={['Industroyer2', 'NotPetya', 'BlackEnergy', 'Cyclops Blink', 'Prestige']}
          />
          <AptCard
            flag="🇷🇺"
            name="Turla"
            alias="Snake · Uroburos · Waterbug"
            origin="Russia / FSB"
            targets="Governments, embassies, defence contractors"
            color="red"
            malware={['Penguin Turla', 'Kazuar', 'Carbon', 'HyperStack', 'Serpent']}
          />
          <AptCard
            flag="🇷🇺"
            name="APT28"
            alias="Fancy Bear · Sofacy"
            origin="Russia / GRU"
            targets="NATO, elections, journalists, think tanks"
            color="red"
            malware={['X-Agent', 'Komplex', 'Zebrocy', 'Sofacy', 'Nimcy']}
          />
          <AptCard
            flag="🇨🇳"
            name="APT41"
            alias="Double Dragon · Winnti"
            origin="China / MSS"
            targets="Healthcare, gaming, telecoms, supply chain"
            color="blue"
            malware={['BPFDoor', 'CROSSWALK', 'SPECULOOS', 'Shadowpad', 'Winnti']}
          />
          <AptCard
            flag="🇨🇳"
            name="APT10"
            alias="Stone Panda · MenuPass"
            origin="China / MSS"
            targets="MSPs, aerospace, satellite, defence"
            color="blue"
            malware={['PlugX', 'RedLeaves', 'QuasarRAT', 'UPPERCUT', 'ANEL']}
          />
          <AptCard
            flag="🇨🇳"
            name="Volt Typhoon"
            alias="Bronze Silhouette"
            origin="China / PLA"
            targets="US critical infrastructure, power grid, water"
            color="blue"
            malware={[
              'LOTL techniques',
              'Living off the Land',
              'KV-botnet',
              'ManageEngine exploits',
            ]}
          />
          <AptCard
            flag="🇰🇵"
            name="Lazarus Group"
            alias="Hidden Cobra · ZINC"
            origin="North Korea / RGB"
            targets="Crypto exchanges, banks, defence, researchers"
            color="purple"
            malware={['BLINDINGCAN', 'HOPLIGHT', 'DTrack', 'AppleJeus', 'TraderTraitor']}
          />
          <AptCard
            flag="🇰🇵"
            name="Kimsuky"
            alias="Thallium · Black Banshee"
            origin="North Korea / RGB"
            targets="Think tanks, journalists, South Korea, US gov"
            color="purple"
            malware={['BabyShark', 'PowerShower', 'FlowerPower', 'AppleSeed', 'GoldDragon']}
          />
          <AptCard
            flag="🇮🇷"
            name="APT33"
            alias="Elfin · Refined Kitten"
            origin="Iran / IRGC"
            targets="Aerospace, petrochemical, Saudi, US defence"
            color="amber"
            malware={['SHAMOON', 'StoneDrill', 'TURNEDUP', 'DROPSHOT', 'NANOCORE']}
          />
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-gray-300 text-sm">
            <span className="text-white font-bold">47 APT groups tracked</span> including Equation
            Group (NSA-linked), OceanLotus/APT32 (Vietnam), SideWinder (India), MuddyWater (Iran),
            DarkHalo/UNC2452 (SolarWinds), and FIN7/Carbanak criminal APTs.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            IOC database sourced from: Mandiant, CrowdStrike, ESET, Recorded Future, Sekoia, CISA
            advisories
          </p>
        </div>
      </section>

      {/* ── Platform shield coverage ── */}
      <section id="platforms" className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <Badge color="amber">Platform Coverage</Badge>
          <h2 className="text-4xl font-black text-white mt-4 mb-4">
            Every device. Every threat vector.
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Attackers don't pick one platform. From kernel-level Linux rootkits to zero-click iPhone
            spyware, xShield AI maintains live detection across your entire attack surface — server,
            phone, and beyond.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <PlatformShieldCard
            icon="🐧"
            name="Linux"
            badge="Server &amp; VPS Defense"
            heroStat="800+"
            heroLabel="Active botnet C2 IPs tracked live — Feodo Tracker + ThreatFox, refreshed every 5 min"
            accent="orange"
            vectors={[
              { icon: '🧬', label: 'YARA binary pattern rules loaded', count: '11' },
              { icon: '🦠', label: 'Rootkit families with live behavioral IOCs', count: '8' },
              { icon: '🌐', label: 'APT groups with Linux C2 infrastructure', count: '7' },
              { icon: '🔍', label: '/proc · LD_PRELOAD · kernel module scanning', count: 'live' },
              { icon: '🚨', label: 'Critical kernel CVEs in active detection', count: '4' },
            ]}
          />
          <PlatformShieldCard
            icon="🤖"
            name="Android"
            badge="Mobile Spyware Defense"
            heroStat="5"
            heroLabel="Nation-state spyware tools actively tracked — Pegasus, Predator, Hermit, Reign, FinFisher"
            accent="green"
            vectors={[
              { icon: '🔬', label: 'NSO Group · Intellexa · Hacking Team · FinFisher' },
              { icon: '💳', label: 'Banking trojan families in IOC database', count: '100+' },
              { icon: '👁️', label: 'Commercial stalkerware apps monitored', count: '50+' },
              { icon: '⚡', label: 'Zero-click exploit chain C2 indicators', count: 'live' },
              { icon: '📦', label: 'Malicious APK sideload &amp; re-sign detection' },
            ]}
          />
          <PlatformShieldCard
            icon="🪟"
            name="Windows"
            badge="Endpoint &amp; Server Guard"
            heroStat="150+"
            heroLabel="Active ransomware families + webhook exfil stealers tracked — LockBit, BlackCat, RedLine, Raccoon and growing"
            accent="blue"
            vectors={[
              { icon: '💀', label: 'LockBit · BlackCat · Cl0p · REvil · Conti IOCs' },
              {
                icon: '📤',
                label: 'Discord/Telegram webhook exfil — 40+ stealer families',
                count: '40+',
              },
              { icon: '📦', label: 'Supply chain attack indicators (SolarWinds TTPs)' },
              { icon: '🏠', label: 'Active Directory lateral movement detection' },
              { icon: '🛠️', label: 'LOLBin abuse — powershell/mshta/rundll32 exfil patterns' },
            ]}
          />
          <PlatformShieldCard
            icon="🍎"
            name="iOS / iPhone"
            badge="Zero-Click Spyware Defense"
            heroStat="7"
            heroLabel="Zero-click exploit chains documented by Citizen Lab &amp; Kaspersky GReAT"
            accent="slate"
            vectors={[
              { icon: '🔭', label: 'Pegasus targets confirmed: 50,000+ (Amnesty Tech)' },
              { icon: '⚡', label: 'FORCEDENTRY · Triangulation · BLASTPASS IOCs' },
              { icon: '💰', label: 'iOS zero-day exploit market price', count: '$2.5M' },
              { icon: '🔒', label: 'No-jailbreak MDM &amp; config profile abuse detection' },
              { icon: '📡', label: 'C2 domains from Citizen Lab NSO Group research' },
            ]}
          />
        </div>

        {/* Bottom stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              value: '1,900+',
              label: 'Linux malware families',
              sub: 'documented by AV-TEST research',
              color: 'text-orange-400',
            },
            {
              value: '3M+',
              label: 'Android malware samples',
              sub: 'circulating in the wild',
              color: 'text-emerald-400',
            },
            {
              value: '450K',
              label: 'New Windows samples daily',
              sub: 'AV-TEST global telemetry',
              color: 'text-blue-400',
            },
            {
              value: '$2.5M',
              label: 'iOS zero-click exploit price',
              sub: 'Zerodium public price list',
              color: 'text-slate-300',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-5 text-center"
            >
              <div className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</div>
              <div className="text-gray-200 text-xs font-semibold mt-1">{s.label}</div>
              <div className="text-gray-500 text-[10px] mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live server threat section ── */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="rounded-3xl border border-red-500/20 bg-red-950/10 overflow-hidden">
            <div className="p-8 sm:p-12">
              <div className="flex flex-col lg:flex-row items-start gap-12">
                {/* Left */}
                <div className="flex-1">
                  <Badge color="red">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Live Server Protection
                  </Badge>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mt-5 mb-4">
                    Your server is being scanned
                    <br />
                    <span className="text-red-400">right now.</span>
                  </h2>
                  <p className="text-gray-300 leading-relaxed mb-8 max-w-lg">
                    Every Linux server gets probed thousands of times per day — bots scanning for
                    .env files, Tor exit nodes, XorDDoS recruitment, and nation-state
                    pre-positioning. xShield AI identifies them before they reach your application
                    layer.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    {[
                      {
                        icon: '🍯',
                        title: 'Honeypot Trap',
                        desc: 'Serve "You Have Been Identified" to bots probing /.env, /wp-admin, /shell, /cgi-bin',
                      },
                      {
                        icon: '📡',
                        title: 'AbuseIPDB Report',
                        desc: 'Auto-report attacker IP to global threat database with full attack context.',
                      },
                      {
                        icon: '🚫',
                        title: 'iptables Block',
                        desc: 'Instant kernel-level DROP rule. Attacker blocked from all ports immediately.',
                      },
                    ].map((c) => (
                      <div
                        key={c.title}
                        className="bg-white/[0.06] border border-white/10 rounded-xl p-4"
                      >
                        <div className="text-2xl mb-2">{c.icon}</div>
                        <div className="text-white font-bold text-sm mb-1">{c.title}</div>
                        <div className="text-gray-400 text-xs leading-relaxed">{c.desc}</div>
                      </div>
                    ))}
                  </div>
                  <a
                    href={LIVE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-red-300 font-bold px-6 py-3 rounded-xl transition-all text-sm"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    View Live Threat Dashboard
                  </a>
                </div>
                {/* Right — terminal mockup */}
                <div className="w-full lg:w-[420px] shrink-0">
                  <div className="bg-[#080d14] border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                      <span className="w-3 h-3 rounded-full bg-red-500/70" />
                      <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                      <span className="w-3 h-3 rounded-full bg-green-500/70" />
                      <span className="ml-3 text-gray-400 text-xs font-mono">
                        xshield-warrior — live
                      </span>
                    </div>
                    <div className="p-5 font-mono text-xs space-y-1.5">
                      <div className="text-gray-400">$ xshield warrior start</div>
                      <div className="text-cyan-400">⚔️ AI Warrior engine started</div>
                      <div className="text-cyan-400">🍯 Honeypots deployed (17 paths)</div>
                      <div className="text-cyan-400">🔍 AbuseIPDB pre-screening active</div>
                      <div className="text-cyan-400">🐧 Linux rootkit IOC monitor active</div>
                      <div className="text-cyan-400">
                        🧬 YARA scanner ready (11 rules / 8 families)
                      </div>
                      <div className="text-cyan-400">
                        🛰️ APT C2 domain watchlist loaded (47 groups)
                      </div>
                      <div className="text-gray-500 mt-2">─────────────────────────────</div>
                      <div className="text-yellow-300">⚠️ [16:17:47] 185.220.101.45 → /.env</div>
                      <div className="text-gray-400"> Tor exit · DE · AbuseScore 95</div>
                      <div className="text-orange-300">📡 AbuseIPDB report submitted</div>
                      <div className="text-red-400">🚫 iptables DROP rule added</div>
                      <div className="text-gray-500">─────────────────────────────</div>
                      <div className="text-purple-300">🔍 Pre-block: 91.92.240.28 · score 92</div>
                      <div className="text-purple-300"> ISP: Frantech · Known bullet-proof</div>
                      <div className="text-purple-300">🌐 Access denied · 403 · pre-screened</div>
                      <div className="text-gray-500">─────────────────────────────</div>
                      <div className="text-orange-300">🧬 YARA: Symbiote_Linux_Rootkit matched</div>
                      <div className="text-orange-300"> /tmp/.so.cache · conf 87 · QUARANTINE</div>
                      <div className="text-gray-500">─────────────────────────────</div>
                      <div className="text-red-300">💀 APT IOC match: bpfdoor beacon sig</div>
                      <div className="text-red-300"> Matches APT41 / Double Dragon TTPs</div>
                      <div className="text-red-300">🚨 CRITICAL · warrior escalating</div>
                      <div className="text-gray-400 animate-pulse mt-2">█</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-16">
            <Badge color="purple">Setup</Badge>
            <h2 className="text-4xl font-black text-white mt-4 mb-4">Live in 5 minutes</h2>
            <p className="text-gray-400 max-w-lg mx-auto">
              Deploy on any Linux server or install the Android app. No cloud account, no signup.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20" />
            {[
              {
                n: 1,
                icon: '🖥️',
                title: 'Deploy the Agent',
                desc: 'Run on your Linux server with a single command. Fastify API starts on port 4250. All 8 AI agents initialize automatically.',
              },
              {
                n: 2,
                icon: '📱',
                title: 'Install the App',
                desc: 'Scan the QR code to download the Android APK. Real-time push alerts from your own server — no third-party cloud.',
              },
              {
                n: 3,
                icon: '🛡️',
                title: 'Shield Activates',
                desc: 'Honeypots deploy, AbuseIPDB pre-screening starts, APT IOC matching begins, and every threat is scored 0–100.',
              },
            ].map((s) => (
              <div
                key={s.n}
                className="flex flex-col items-center text-center bg-white/[0.05] border border-white/10 rounded-2xl p-8 hover:border-cyan-500/30 transition-colors"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/25 to-blue-600/25 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-2xl font-black mb-5">
                  {s.n}
                </div>
                <div className="text-3xl mb-3">{s.icon}</div>
                <h4 className="text-lg font-bold text-white mb-2">{s.title}</h4>
                <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Research trust ── */}
      <section className="border-t border-white/10 py-16 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-gray-400 text-xs uppercase tracking-widest mb-8">
            Threat intelligence sourced from
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { icon: '🏛️', name: 'Amnesty Tech', label: 'Security Lab' },
              { icon: '🔭', name: 'Citizen Lab', label: 'Univ. of Toronto' },
              { icon: '🐛', name: 'abuse.ch', label: 'Feodo · ThreatFox' },
              { icon: '📱', name: 'SlashNext', label: 'QR Phishing Research' },
              { icon: '🦅', name: 'Mandiant', label: 'Google Threat Intel' },
              { icon: '🦁', name: 'CrowdStrike', label: 'Adversary Intel' },
              { icon: '🔎', name: 'ESET Research', label: 'Threat Reports' },
              { icon: '🏴', name: 'CISA', label: 'US Gov Advisories' },
            ].map((o) => (
              <div
                key={o.name}
                className="border border-white/10 bg-white/[0.04] rounded-xl p-4 text-center hover:border-white/20 hover:bg-white/[0.07] transition-all"
              >
                <div className="text-2xl mb-2">{o.icon}</div>
                <div className="text-white text-xs font-semibold">{o.name}</div>
                <div className="text-gray-400 text-[10px] mt-0.5">{o.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Digital Risk Intelligence ── */}
      <section id="risk" className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <Badge color="red">Digital Risk Intelligence</Badge>
          <h2 className="text-4xl font-black text-white mt-4 mb-4">
            Know your exposure before attackers do
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            xShield continuously monitors your domain and server for breach records, exposed
            services, phishing impostors, and IP reputation — the same intelligence used by
            enterprise SOC teams, now free.
          </p>
        </div>

        {/* Four intelligence pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
          {[
            {
              icon: '🔍',
              source: 'GreyNoise Community',
              badge: 'FREE · No Auth',
              title: 'IP Reputation',
              desc: 'Classifies your server IP as malicious / benign / internet background noise against the global GreyNoise sensor network.',
              accent: 'text-cyan-400',
              border: 'border-cyan-500/30',
              glow: 'bg-cyan-600/5',
              facts: ['19M+ IPs tracked', 'Real-time classification', 'Scanner vs. threat actor'],
            },
            {
              icon: '🌐',
              source: 'Shodan',
              badge: 'Free API Key',
              title: 'Attack Surface',
              desc: 'Enumerates every port and service your server exposes to the internet — and flags CVEs Shodan has already associated with them.',
              accent: 'text-orange-400',
              border: 'border-orange-500/30',
              glow: 'bg-orange-600/5',
              facts: ['Open port enumeration', 'Software version fingerprint', 'CVE correlation'],
            },
            {
              icon: '💧',
              source: 'Have I Been Pwned',
              badge: 'FREE · Public List',
              title: 'Breach Monitor',
              desc: 'Checks whether your domain appears in any of the 900+ public breach records in the HIBP database — no paid subscription required.',
              accent: 'text-purple-400',
              border: 'border-purple-500/30',
              glow: 'bg-purple-600/5',
              facts: ['900+ breach records', 'Domain-level check', '14B+ pwned accounts indexed'],
            },
            {
              icon: '🎣',
              source: 'urlscan.io',
              badge: 'FREE · No Auth',
              title: 'Phishing & Typosquat',
              desc: "Detects phishing pages and typosquatting domains targeting your brand. Generates 30+ domain variants and checks each against urlscan's verdict database.",
              accent: 'text-rose-400',
              border: 'border-rose-500/30',
              glow: 'bg-rose-600/5',
              facts: ['30+ typosquat variants', 'Malicious verdict check', 'Screenshot evidence'],
            },
          ].map((pillar) => (
            <div
              key={pillar.source}
              className={`${pillar.glow} border ${pillar.border} rounded-2xl p-6 flex flex-col gap-4`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">{pillar.icon}</span>
                <span className="text-[10px] font-bold text-gray-500 border border-white/10 rounded-full px-2.5 py-0.5 uppercase tracking-widest whitespace-nowrap">
                  {pillar.badge}
                </span>
              </div>
              <div>
                <div
                  className={`text-xs font-bold uppercase tracking-widest mb-1 ${pillar.accent}`}
                >
                  {pillar.source}
                </div>
                <div className="text-white font-black text-lg leading-tight">{pillar.title}</div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">{pillar.desc}</p>
              <ul className="space-y-1.5">
                {pillar.facts.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className={`${pillar.accent} text-[10px]`}>▶</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Risk score visualiser card */}
        <div className="border border-white/10 bg-white/[0.03] rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-10">
          {/* Score gauge (static visual) */}
          <div className="flex-shrink-0 flex flex-col items-center gap-3">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="48" fill="none" stroke="#1f2937" strokeWidth="12" />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="url(#riskGrad)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${0.72 * 301.6} 301.6`}
                />
                <defs>
                  <linearGradient id="riskGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center rotate-90">
                <span className="text-3xl font-black text-white font-mono">72</span>
                <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">
                  HIGH
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-500 text-center">Risk Score 0–100</div>
          </div>

          {/* Description */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2">
              Composite Risk Score
            </div>
            <h3 className="text-2xl font-black text-white mb-3">
              One number that summarises your entire threat exposure
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              xShield aggregates signals from 17 intelligence sources — GreyNoise, Shodan, HIBP,
              urlscan.io, ThreatFox, QR heuristics, process-level exfil detection, and social brand
              scanning — into a single 0–100 risk score. Each source contributes weighted risk
              factors with diminishing returns, so a single critical finding doesn't get washed out
              by minor noise.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                {
                  level: 'Minimal',
                  range: '0–14',
                  color: 'text-emerald-400 border-emerald-500/40',
                },
                { level: 'Low', range: '15–34', color: 'text-cyan-400 border-cyan-500/40' },
                { level: 'Medium', range: '35–54', color: 'text-yellow-400 border-yellow-500/40' },
                { level: 'High', range: '55–74', color: 'text-orange-400 border-orange-500/40' },
                { level: 'Critical', range: '75–100', color: 'text-red-400 border-red-500/40' },
              ].map((l) => (
                <span
                  key={l.level}
                  className={`text-xs font-bold px-3 py-1 rounded-full border font-mono ${l.color} bg-white/5`}
                >
                  {l.level} · {l.range}
                </span>
              ))}
            </div>
          </div>

          {/* API snippet */}
          <div className="flex-shrink-0 w-full md:w-64">
            <div className="bg-black/60 border border-white/10 rounded-xl p-5 font-mono text-xs">
              <div className="text-gray-500 mb-2"># REST API</div>
              <div className="text-cyan-300">GET /risk/report</div>
              <div className="text-gray-400"> ?domain=example.com</div>
              <div className="text-gray-600 mt-3 mb-1">→ returns</div>
              <div className="text-emerald-300">{'{'}</div>
              <div className="text-gray-300 ml-2">
                riskScore: <span className="text-orange-300">72</span>,
              </div>
              <div className="text-gray-300 ml-2">
                riskLevel: <span className="text-yellow-300">"high"</span>,
              </div>
              <div className="text-gray-300 ml-2">factors: [...]</div>
              <div className="text-emerald-300">{'}'}</div>
            </div>
          </div>
        </div>

        {/* AI Threat Narrative — Sample Report */}
        <div className="mt-10 border border-violet-500/30 bg-violet-600/5 rounded-2xl p-8 md:p-10">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span className="text-2xl">🤖</span>
            <div>
              <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-0.5">
                AI Threat Narrative · Powered by xShield Intelligence
              </div>
              <div className="text-white font-black text-xl">
                Sample Report — ankr.in · Risk Score{' '}
                <span className="text-red-400 font-mono">100</span>
                <span className="ml-2 text-xs font-bold text-red-400 border border-red-500/40 rounded-full px-2 py-0.5 uppercase">
                  Critical
                </span>
              </div>
            </div>
            <div className="ml-auto text-[10px] text-gray-600 font-mono">
              AI Enabled · BYO Anthropic / Groq / OpenAI key
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Executive Summary */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-5">
              <div className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">
                📋 Executive Summary
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">
                The domain <span className="text-white font-semibold">ankr.in</span> has been
                identified as a <span className="text-red-400 font-semibold">critical risk</span>,
                with a risk score of 100, due to multiple security vulnerabilities and active
                phishing threats. The presence of{' '}
                <span className="text-orange-300">12 registered lookalike domains</span>, lack of
                DMARC record, and absence of CAA record pose significant risks to the organization's
                security and reputation. Immediate attention is required to mitigate these risks and
                prevent potential attacks.
              </p>
            </div>

            {/* Immediate Actions */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-5">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">
                ⚡ Immediate Actions
              </div>
              <ol className="space-y-2">
                {[
                  'Implement a DMARC record to prevent email spoofing',
                  'Configure a CAA record to restrict SSL certificate issuance',
                  'Monitor and request takedown of lookalike domains',
                  'Review and update DNS configuration to improve security score',
                  'Conduct a security audit to identify additional vulnerabilities',
                ].map((action, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>

            {/* Intelligence Sources Used */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-5">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3">
                🔍 Intelligence Sources · 17 Parallel Checks
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'GreyNoise', color: 'text-cyan-400 border-cyan-500/30' },
                  { label: 'Shodan', color: 'text-orange-400 border-orange-500/30' },
                  { label: 'OTX', color: 'text-yellow-400 border-yellow-500/30' },
                  { label: 'HIBP', color: 'text-purple-400 border-purple-500/30' },
                  { label: 'urlscan.io', color: 'text-rose-400 border-rose-500/30' },
                  { label: 'crt.sh', color: 'text-blue-400 border-blue-500/30' },
                  { label: 'DNS Typosquat', color: 'text-emerald-400 border-emerald-500/30' },
                  { label: 'PasteBin', color: 'text-gray-400 border-gray-500/30' },
                  { label: 'SPF/DMARC/DNSSEC', color: 'text-red-400 border-red-500/30' },
                  { label: 'OpenPhish', color: 'text-pink-400 border-pink-500/30' },
                  { label: 'ASN Reputation', color: 'text-indigo-400 border-indigo-500/30' },
                  { label: 'GitHub Dork', color: 'text-violet-400 border-violet-500/30' },
                  { label: 'RDAP', color: 'text-teal-400 border-teal-500/30' },
                  { label: 'QR Heuristic', color: 'text-amber-400 border-amber-500/30' },
                  { label: 'Process Monitor', color: 'text-lime-400 border-lime-500/30' },
                  { label: 'ThreatFox Social', color: 'text-fuchsia-400 border-fuchsia-500/30' },
                  { label: 'Brand Scan', color: 'text-sky-400 border-sky-500/30' },
                ].map(({ label, color }) => (
                  <span
                    key={label}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full border ${color} bg-white/5`}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Risk Explanation */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-5">
              <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-3">
                📊 Risk Breakdown · Why Score = 100
              </div>
              <div className="space-y-2">
                {[
                  { label: '12 registered typosquat domains', score: 49, color: 'bg-red-500' },
                  { label: 'No DMARC record (email spoofing)', score: 45, color: 'bg-orange-500' },
                  { label: 'No SPF record', score: 40, color: 'bg-orange-400' },
                  { label: 'No CAA record', score: 15, color: 'bg-yellow-500' },
                  { label: 'OTX pulse activity', score: 8, color: 'bg-gray-500' },
                ].map(({ label, score, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{label}</span>
                      <span className="font-mono text-white">{score}</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 text-center text-xs text-gray-600">
            This briefing was auto-generated in ~19 seconds by the xShield AI threat narrative
            engine — replacing hours of manual CTI analyst work.{' '}
            <span className="text-violet-400">Try it free on your own domain →</span>
          </div>
        </div>
      </section>

      {/* ── Ransomware Defense ── */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <Badge color="red">Ransomware Defense</Badge>
            <h2 className="text-4xl font-black text-white mt-4 mb-4">
              The #1 threat to your business
              <br />
              <span className="text-red-400">detected before encryption starts</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Ransomware attacks cost businesses an average of{' '}
              <span className="text-white font-semibold">$1.54M per incident</span>. Attackers spend
              200+ days inside your network before encrypting. xShield detects them at every stage.
            </p>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
            {[
              {
                val: '$1.54M',
                label: 'Avg ransom cost',
                sub: 'IBM Cost of Breach 2023',
                color: 'text-red-400',
              },
              {
                val: '4,000+',
                label: 'Attacks per day',
                sub: 'across all sectors',
                color: 'text-orange-400',
              },
              {
                val: '200',
                label: 'Days avg dwell time',
                sub: 'before encryption',
                color: 'text-amber-400',
              },
              {
                val: '66%',
                label: 'Businesses hit',
                sub: 'in last 12 months',
                color: 'text-red-400',
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-5 text-center"
              >
                <div className={`text-3xl font-black font-mono ${s.color}`}>{s.val}</div>
                <div className="text-gray-200 text-xs font-semibold mt-1">{s.label}</div>
                <div className="text-gray-500 text-[10px] mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left — active groups */}
            <div>
              <h3 className="text-xl font-black text-white mb-6">
                Active Ransomware Groups — Tracked Live
              </h3>
              <div className="rounded-2xl border border-white/10 bg-[#0a0f18] overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                  <div className="w-28">Group</div>
                  <div className="w-20">Avg Ransom</div>
                  <div className="flex-1">Targets</div>
                  <div className="shrink-0">Status</div>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {[
                    {
                      name: 'LockBit 3.0',
                      ransom: '$1.8M',
                      targets: 'Finance, healthcare, govt',
                      active: true,
                    },
                    {
                      name: 'BlackCat / ALPHV',
                      ransom: '$2.3M',
                      targets: 'Critical infrastructure',
                      active: true,
                    },
                    {
                      name: 'Cl0p',
                      ransom: '$3.1M',
                      targets: 'MOVEit exploit victims',
                      active: true,
                    },
                    {
                      name: 'Play',
                      ransom: '$1.2M',
                      targets: 'Manufacturing, legal',
                      active: true,
                    },
                    {
                      name: 'Akira',
                      ransom: '$1.5M',
                      targets: 'SME · IT & construction',
                      active: true,
                    },
                    {
                      name: 'Royal',
                      ransom: '$2.0M',
                      targets: 'Healthcare, education',
                      active: false,
                    },
                  ].map((g) => (
                    <div
                      key={g.name}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="w-28">
                        <span className="font-mono font-bold text-red-300 text-sm">{g.name}</span>
                      </div>
                      <div className="w-20 text-xs font-semibold text-orange-300 font-mono">
                        {g.ransom}
                      </div>
                      <div className="flex-1 text-xs text-gray-400">{g.targets}</div>
                      <div className="shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.active ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-gray-500/15 text-gray-500 border border-gray-500/20'}`}
                        >
                          {g.active ? '● ACTIVE' : '◦ Reduced'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-gray-600 text-xs mt-3 text-center">
                IOCs tracked via abuse.ch Feodo, ThreatFox, and CISA advisories · Updated
                continuously
              </p>
            </div>

            {/* Right — detection layers + terminal */}
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    icon: '🍯',
                    title: 'Canary File Honeypots',
                    desc: 'Sentinel files planted in /tmp, /home, /var/www. Any modification = immediate alert. First sign of encryption caught before any real files are touched.',
                  },
                  {
                    icon: '📊',
                    title: 'Entropy Spike Detection',
                    desc: 'Ransomware causes mass high-entropy writes as it encrypts. xShield monitors I/O patterns — flags abnormal encryption activity within seconds.',
                  },
                  {
                    icon: '🌐',
                    title: 'Ransomware C2 Feed',
                    desc: 'Domain and IP IOCs from Feodo Tracker + ThreatFox + CISA advisories. Outbound connection to known C2 = immediate kill + alert.',
                  },
                  {
                    icon: '🔒',
                    title: 'Shadow Copy Protection',
                    desc: 'Ransomware deletes backups before encrypting. xShield alerts on vssadmin / wbadmin calls — catching the pre-encryption prep phase.',
                  },
                ].map((d) => (
                  <div
                    key={d.title}
                    className="flex gap-4 bg-white/[0.04] border border-white/10 rounded-xl p-4"
                  >
                    <span className="text-2xl shrink-0 mt-0.5">{d.icon}</span>
                    <div>
                      <div className="text-white font-bold text-sm mb-1">{d.title}</div>
                      <div className="text-gray-400 text-xs leading-relaxed">{d.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Terminal */}
              <div className="bg-[#080d14] border border-white/15 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                  <span className="w-3 h-3 rounded-full bg-red-500/70" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <span className="w-3 h-3 rounded-full bg-green-500/70" />
                  <span className="ml-3 text-gray-400 text-xs font-mono">
                    xshield-ransomware-shield
                  </span>
                </div>
                <div className="p-5 font-mono text-xs space-y-1.5">
                  <div className="text-cyan-400">
                    🛡️ Ransomware shield active — canary files deployed
                  </div>
                  <div className="text-gray-500">─────────────────────────────</div>
                  <div className="text-yellow-300">
                    ⚠️ [03:14:22] Canary file modified: /tmp/.xshield-sentinel
                  </div>
                  <div className="text-gray-400"> Process: suspicious_update (PID 8821)</div>
                  <div className="text-orange-300">
                    📊 High-entropy writes detected: 847 files/min
                  </div>
                  <div className="text-red-400">
                    🚨 RANSOMWARE PATTERN — LockBit 3.0 signature match
                  </div>
                  <div className="text-gray-500">─────────────────────────────</div>
                  <div className="text-red-300">🔴 Process tree killed · PID 8821 + children</div>
                  <div className="text-red-300">🔒 Network isolation: outbound DROP applied</div>
                  <div className="text-purple-300">
                    📡 C2 IP 185.220.101.45 → Feodo tracker match
                  </div>
                  <div className="text-emerald-400">
                    ✅ 847 files protected · 0 encrypted · Alert sent
                  </div>
                  <div className="text-gray-400 animate-pulse mt-2">█</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social & Messaging Platform Threats ── */}
      <section id="social-threats" className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <Badge color="purple">Emerging Threat Vectors</Badge>
            <h2 className="text-4xl font-black text-white mt-4 mb-4">
              Attackers moved to messaging apps.
              <br />
              <span className="text-purple-400">Your security didn't follow.</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Telegram, Discord, and WhatsApp are now active C2 infrastructure. QR codes bypass
              email gateways. Social platforms host brand impersonation at scale. xShield v0.7
              detects all of it.
            </p>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
            {[
              {
                val: '587%',
                label: 'QR phishing surge',
                sub: 'SlashNext Threat Report 2023',
                color: 'text-amber-400',
              },
              {
                val: '40+',
                label: 'Stealer families',
                sub: 'use Discord webhook exfil',
                color: 'text-purple-400',
              },
              {
                val: '100+',
                label: 'Malware families',
                sub: 'use Telegram as C2 channel',
                color: 'text-fuchsia-400',
              },
              {
                val: '$3.1B',
                label: 'BEC losses in 2023',
                sub: 'via messaging & social platforms',
                color: 'text-red-400',
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-5 text-center"
              >
                <div className={`text-3xl font-black font-mono ${s.color}`}>{s.val}</div>
                <div className="text-gray-200 text-xs font-semibold mt-1">{s.label}</div>
                <div className="text-gray-500 text-[10px] mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Four threat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
            {/* QR Quishing */}
            <div className="bg-amber-600/5 border border-amber-500/30 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">📷</span>
                <span className="text-[10px] font-bold text-gray-500 border border-white/10 rounded-full px-2.5 py-0.5 uppercase tracking-widest whitespace-nowrap">
                  QR Detector v0.7
                </span>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-1 text-amber-400">
                  QR Phishing / "Quishing"
                </div>
                <div className="text-white font-black text-lg leading-tight">
                  QR codes bypass email security
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">
                Attackers embed phishing URLs in QR codes. Email gateways scan text, not images.
                xShield decodes the URL and runs 10 heuristic checks — URL shortener, suspicious
                TLD, IP-as-host, IDN homograph (punycode), OAuth redirect hijack, data URI payloads,
                and ThreatFox IOC matching.
              </p>
              <ul className="space-y-1.5">
                {[
                  '10 detection signals scored 0–100',
                  'OAuth redirect_uri hijack detection',
                  'Punycode / IDN homograph attack',
                  'ThreatFox IOC database lookup (+80)',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-amber-400 text-[10px]">▶</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Discord/Telegram/Slack Exfil */}
            <div className="bg-purple-600/5 border border-purple-500/30 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">📤</span>
                <span className="text-[10px] font-bold text-gray-500 border border-white/10 rounded-full px-2.5 py-0.5 uppercase tracking-widest whitespace-nowrap">
                  Exfil Detector v0.7
                </span>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-1 text-purple-400">
                  Webhook Data Exfiltration
                </div>
                <div className="text-white font-black text-lg leading-tight">
                  Stealers phone home via Discord & Telegram
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">
                Raccoon, Vidar, RedLine, AgentTesla and 40+ info-stealer families exfiltrate stolen
                credentials, crypto wallets, and browser cookies to Discord webhooks. Process-level
                detection identifies <code className="text-purple-300">powershell.exe</code>,{' '}
                <code className="text-purple-300">python.exe</code>, and{' '}
                <code className="text-purple-300">svchost.exe</code> calling webhook URLs —
                near-zero false positives.
              </p>
              <ul className="space-y-1.5">
                {[
                  'Discord · Telegram · Slack · Teams webhooks',
                  'Process allowlist: browsers = clean (score 5)',
                  'powershell/cmd/python → webhook = MALWARE (95)',
                  'Batch scan: filter non-zero findings only',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-purple-400 text-[10px]">▶</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Telegram C2 */}
            <div className="bg-fuchsia-600/5 border border-fuchsia-500/30 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">🤖</span>
                <span className="text-[10px] font-bold text-gray-500 border border-white/10 rounded-full px-2.5 py-0.5 uppercase tracking-widest whitespace-nowrap">
                  Social C2 Detector v0.7
                </span>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-1 text-fuchsia-400">
                  Telegram Bot C2 Infrastructure
                </div>
                <div className="text-white font-black text-lg leading-tight">
                  100+ malware families use Telegram as C2
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">
                AsyncRAT, ToxicEye, WarzoneRAT, and Lumma Stealer route C2 traffic through the
                Telegram Bot API — encrypted, globally distributed, and never blocked by firewalls.
                xShield checks domains and URLs for Telegram bot token patterns and queries
                ThreatFox for tagged social C2 IOCs.
              </p>
              <ul className="space-y-1.5">
                {[
                  'Telegram bot token regex detection in URLs',
                  'ThreatFox tags: telegram-bot, discord-c2',
                  'AsyncRAT · ToxicEye · WarzoneRAT · Lumma',
                  'Encrypted, CDN-backed, always-on channel',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-fuchsia-400 text-[10px]">▶</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Brand Impersonation */}
            <div className="bg-sky-600/5 border border-sky-500/30 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">🎭</span>
                <span className="text-[10px] font-bold text-gray-500 border border-white/10 rounded-full px-2.5 py-0.5 uppercase tracking-widest whitespace-nowrap">
                  Brand Monitor v0.7
                </span>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest mb-1 text-sky-400">
                  Social Brand Impersonation
                </div>
                <div className="text-white font-black text-lg leading-tight">
                  Fake accounts, fake airdrops, fake support
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">
                Attackers create Telegram channels, Discord servers, and Twitter accounts using
                typosquatted brand names to run crypto scams, fake airdrops, and BEC attacks.
                xShield uses Levenshtein distance, typosquat variant generation, and impersonation
                suffix detection to catch them before victims are defrauded.
              </p>
              <ul className="space-y-1.5">
                {[
                  'Edit distance 1/2 Levenshtein matching',
                  'Impersonation patterns: _official, _airdrop, _support',
                  '30+ typosquat variant algorithms',
                  'Telegram · Discord · Twitter · Instagram coverage',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-sky-400 text-[10px]">▶</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Terminal mockup — all 4 detectors firing */}
          <div className="bg-[#080d14] border border-white/15 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <span className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-3 text-gray-400 text-xs font-mono">
                xshield-social-threat-detector — v0.7.0
              </span>
            </div>
            <div className="p-5 font-mono text-xs space-y-1.5">
              <div className="text-cyan-400">
                🛡️ Social threat detectors loaded (QR · Exfil · Social C2 · Brand)
              </div>
              <div className="text-gray-500">──────────────────────────────────────────</div>
              <div className="text-amber-300">
                📷 [QR] xn--mcrsft-hdb.xyz/signin — score 100/100 CRITICAL
              </div>
              <div className="text-gray-400">
                {' '}
                Signals: punycode_domain · suspicious_tld · login_mimicry · oauth_redirect_abuse
              </div>
              <div className="text-amber-300">
                {' '}
                redirect_uri → http://45.142.212.100/steal ← raw IP + exfil endpoint
              </div>
              <div className="text-gray-500">──────────────────────────────────────────</div>
              <div className="text-red-300">
                📤 [EXFIL] powershell.exe → discord.com/api/webhooks/1122334455/stealer_output
              </div>
              <div className="text-red-300">
                {' '}
                Score 95/100 MALWARE_EXFIL · platform=discord · process=powershell.exe
              </div>
              <div className="text-red-300">
                {' '}
                Raccoon Stealer / RedLine pattern — credentials + clipboard likely exfiltrated
              </div>
              <div className="text-gray-500">──────────────────────────────────────────</div>
              <div className="text-fuchsia-300">
                🤖 [C2] api.telegram.org/bot987654321:AAAA/sendDocument ← svchost.exe
              </div>
              <div className="text-fuchsia-300">
                {' '}
                ThreatFox tag: telegram-bot · score 85/100 · AsyncRAT C2 pattern
              </div>
              <div className="text-gray-500">──────────────────────────────────────────</div>
              <div className="text-sky-300">
                🎭 [BRAND] @ankr_official_airdrop (Telegram) — impersonation score 91/100
              </div>
              <div className="text-sky-300">
                {' '}
                Edit distance 0 (exact brand match) + _official + _airdrop suffix
              </div>
              <div className="text-red-400">
                🚨 4 social threat vectors detected · AI narrative generated · Alerts sent
              </div>
              <div className="text-gray-400 animate-pulse mt-2">█</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          {/* Header */}
          <div className="text-center mb-6">
            <Badge color="green">Pricing</Badge>
            <h2 className="text-4xl font-black text-white mt-4 mb-4">
              Open source core.
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Enterprise when you need it.
              </span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-base">
              Big orgs don't trust cheap security — and they shouldn't. So we open-sourced the
              engine. Read every line of code. Deploy it yourself. When you need SLAs, SSO, SIEM
              integrations, and a dedicated team — that's Enterprise EE.
            </p>
          </div>

          {/* OSS Trust Banner */}
          <div className="mb-12 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-6 py-5 flex flex-col sm:flex-row items-center gap-5">
            <div className="text-3xl shrink-0">🔓</div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm font-semibold text-emerald-300 mb-0.5">
                Why open source? Because security software you can't audit is a liability.
              </p>
              <p className="text-xs text-gray-500">
                Every detector, every scoring algorithm, every AI prompt — on GitHub. No black box.
                No hidden telemetry. Fork it. Audit it. Deploy it air-gapped.
              </p>
            </div>
            <a
              href="https://github.com/rocketlang/ankrshield"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-bold px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition-colors whitespace-nowrap"
            >
              View on GitHub →
            </a>
          </div>

          {/* Tier Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-14">
            {/* OSS Core */}
            <div className="rounded-2xl border border-emerald-500/25 bg-white/[0.03] p-7 flex flex-col relative">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                OSS Core
              </div>
              <div className="text-5xl font-black font-mono text-white mb-1">FREE</div>
              <div className="text-xs text-gray-500 mb-1">Apache 2.0 · Self-hosted · Forever</div>
              <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mb-6">
                No account. No data sent to us.
              </div>
              <ul className="space-y-2.5 flex-1 mb-8">
                {[
                  'Full risk engine — all 17 detectors',
                  'AIWarrior + attack chain correlation',
                  'Social threat detection (QR, exfil, C2)',
                  'Self-hosted web dashboard',
                  'CLI tool for automation',
                  'Community support via GitHub',
                  'Audit every line of source code',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-emerald-400 mt-0.5 shrink-0">›</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="https://github.com/rocketlang/ankrshield"
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-sm px-4 py-2.5 rounded-xl transition-colors bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold"
              >
                Clone on GitHub →
              </a>
            </div>

            {/* Cloud Hosted */}
            <div className="rounded-2xl border border-cyan-500/40 bg-white/[0.04] p-7 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-widest bg-cyan-500 text-black px-3 py-1 rounded-full">
                Hosted
              </div>
              <div className="text-xs font-black uppercase tracking-widest text-cyan-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                xShield Cloud
              </div>
              <div className="text-5xl font-black font-mono text-white mb-1">$199</div>
              <div className="text-xs text-gray-500 mb-1">/month · billed monthly</div>
              <div className="text-[10px] text-cyan-600 font-semibold uppercase tracking-wider mb-6">
                Everything in OSS + managed infrastructure
              </div>
              <ul className="space-y-2.5 flex-1 mb-8">
                {[
                  'Fully managed — no ops burden',
                  'Up to 25 devices monitored',
                  'Continuous domain watch + alerts',
                  'Email · Slack · WhatsApp · Telegram',
                  'REST API + webhooks',
                  'Automatic threat feed updates',
                  'Priority email support',
                  '99.9% uptime SLA',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-cyan-400 mt-0.5 shrink-0">›</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/register?plan=cloud"
                className="text-center text-sm px-4 py-2.5 rounded-xl transition-colors bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
              >
                Start 14-day Trial
              </Link>
            </div>

            {/* Enterprise EE */}
            <div className="rounded-2xl border border-amber-500/40 bg-white/[0.04] p-7 flex flex-col relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              </div>
              <div className="relative text-xs font-black uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Enterprise EE
              </div>
              <div className="relative text-5xl font-black font-mono text-white mb-1">$25K+</div>
              <div className="relative text-xs text-gray-500 mb-1">
                /year · on-prem or dedicated cloud
              </div>
              <div className="relative text-[10px] text-amber-600 font-semibold uppercase tracking-wider mb-6">
                Genuinely premium. Not a feature flag.
              </div>
              <ul className="relative space-y-2.5 flex-1 mb-8">
                {[
                  'On-prem or air-gapped deployment',
                  'SAML / SSO (Okta, Azure AD)',
                  'SIEM integrations (Splunk, Sentinel)',
                  'SOC 2 / ISO 27001 evidence export',
                  'AIWarrior fleet — cross-org correlation',
                  'Custom LLM model (BYO fine-tune)',
                  'Named CSM + 4-hr P1 SLA',
                  'Quarterly threat briefings',
                  'Multi-tenant console',
                  'White-label option',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-amber-400 mt-0.5 shrink-0">›</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:enterprise@xshieldai.com"
                className="relative text-center text-sm px-4 py-2.5 rounded-xl transition-colors bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold"
              >
                Book a Call →
              </a>
            </div>
          </div>

          {/* Feature comparison — 6 platforms */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm font-semibold text-white">Feature comparison — 6 platforms</p>
              <p className="text-xs text-gray-500">Based on public documentation · Q1 2026</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 w-52">
                      Capability
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-emerald-400">
                      xShield OSS
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-amber-400">
                      xShield EE
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-blue-400">
                      Wazuh
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">
                      Resecurity
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">
                      Rec. Future
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400">
                      Darktrace
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {(
                    [
                      // [label, xShield OSS, xShield EE, Wazuh, Resecurity, Recorded Future, Darktrace]
                      ['Open source / auditable', '✓', '✓', '✓', '✗', '✗', '✗'],
                      ['Self-host / air-gapped', '✓', '✓', '✓', '✗', '✗', '~'],
                      ['Data stays on your infra', '✓', '✓', '✓', '✗', '✗', '~'],
                      ['No vendor lock-in', '✓', '✓', '✓', '✗', '✗', '✗'],
                      ['BYO AI model (open key)', '✓', '✓', '✗', '✗', '✗', '✗'],
                      ['Social threat detection', '✓', '✓', '✗', '✗', '✗', '✗'],
                      ['QR / webhook / C2 detection', '✓', '✓', '✗', '✗', '✗', '✗'],
                      ['SSO / SAML', '✗', '✓', '✓', '✓', '✓', '✓'],
                      ['SIEM integrations', '✗', '✓', '✓', '✓', '✓', '✓'],
                      ['Compliance export (SOC 2)', '✗', '✓', '✗', '✓', '✓', '✓'],
                      ['Dedicated CSM + SLA', '✗', '✓', '✗', '✓', '✓', '✓'],
                    ] as const
                  ).map(([cap, oss, ee, wazuh, res, rf, dt]) => (
                    <tr key={cap} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-2.5 text-gray-300 font-medium text-xs">{cap}</td>
                      {(
                        [
                          {
                            val: oss,
                            yes: 'text-emerald-400',
                            no: 'text-red-500/60',
                            part: 'text-yellow-500/70',
                          },
                          {
                            val: ee,
                            yes: 'text-amber-400',
                            no: 'text-red-500/60',
                            part: 'text-yellow-500/70',
                          },
                          {
                            val: wazuh,
                            yes: 'text-blue-400',
                            no: 'text-red-500/50',
                            part: 'text-yellow-500/60',
                          },
                          {
                            val: res,
                            yes: 'text-gray-400',
                            no: 'text-red-600/50',
                            part: 'text-yellow-600/50',
                          },
                          {
                            val: rf,
                            yes: 'text-gray-400',
                            no: 'text-red-600/50',
                            part: 'text-yellow-600/50',
                          },
                          {
                            val: dt,
                            yes: 'text-gray-400',
                            no: 'text-red-600/50',
                            part: 'text-yellow-600/50',
                          },
                        ] as const
                      ).map(({ val, yes, no, part }, i) => (
                        <td
                          key={i}
                          className={`px-3 py-2.5 text-center font-mono font-bold text-sm ${val === '✓' ? yes : val === '✗' ? no : val === '~' ? part : 'text-gray-600'}`}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-white/[0.05] text-[10px] text-gray-600">
              ~ = available in enterprise / on-prem tier only &nbsp;·&nbsp; ✗ = not publicly
              available &nbsp;·&nbsp; Based on vendor public documentation
            </div>
          </div>

          {/* Market Pricing Context — separate from feature table */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-white/10">
              <p className="text-sm text-center text-gray-400">
                <span className="text-white font-semibold">Market pricing context</span> — price
                signals the business model
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-white/[0.06]">
              {[
                { name: 'xShield OSS', price: 'FREE', sub: 'Apache 2.0 · forever', hl: 'emerald' },
                { name: 'xShield EE', price: 'from $25K', sub: '/year · enterprise', hl: 'amber' },
                { name: 'Wazuh', price: 'FREE / $2K+', sub: '/year · cloud managed', hl: null },
                { name: 'Resecurity', price: '$15K–50K', sub: '/year · Vendr 2025', hl: null },
                { name: 'Rec. Future', price: '$60K–100K+', sub: '/year · Vendr 2025', hl: null },
                { name: 'Darktrace', price: '$30K–100K+', sub: '/year · Vendr 2025', hl: null },
              ].map((c) => (
                <div
                  key={c.name}
                  className={`px-4 py-5 text-center ${c.hl === 'emerald' ? 'bg-emerald-500/5' : c.hl === 'amber' ? 'bg-amber-500/5' : ''}`}
                >
                  <div
                    className={`text-sm font-black font-mono ${c.hl === 'emerald' ? 'text-emerald-400' : c.hl === 'amber' ? 'text-amber-400' : 'text-gray-500'}`}
                  >
                    {c.price}
                  </div>
                  <div
                    className={`text-xs font-semibold mt-1 ${c.hl ? 'text-white' : 'text-gray-400'}`}
                  >
                    {c.name}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5">{c.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-center text-xs text-gray-600">
            Feature comparison based on public documentation as of Q1 2026. Pricing estimates from
            Vendr 2025, G2 buyer reports, and vendor public pricing pages — enterprise deals vary
            significantly by scope and negotiation.{' '}
            <a
              href="mailto:enterprise@xshieldai.com"
              className="text-gray-500 hover:text-cyan-400 underline transition-colors"
            >
              Dispute a claim →
            </a>
            {' · '}
            <a
              href="mailto:enterprise@xshieldai.com"
              className="text-cyan-600 hover:text-cyan-400 transition-colors"
            >
              enterprise@xshieldai.com
            </a>
          </p>
        </div>
      </section>

      {/* ── Download / CTA ── */}
      <section id="download" className="border-t border-white/10 relative overflow-hidden py-24">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cyan-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <Badge color="cyan">Open Source · Apache 2.0 · Self-hosted · No Account Required</Badge>
          <h2 className="text-4xl sm:text-5xl font-black text-white mt-6 mb-4">
            Deploy it yourself. Own your data.
          </h2>
          <p className="text-gray-300 text-lg mb-14 max-w-xl mx-auto">
            Clone the repo, run the engine, point it at your domain. 17 intelligence sources + AI
            threat narrative — no account, no telemetry, no vendor trust required.
          </p>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-10">
            {/* QR card */}
            <div className="bg-white/[0.06] border border-white/15 rounded-2xl p-8 flex flex-col items-center gap-5 shadow-2xl">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                📱 Scan · Download Android APK
              </div>
              <div className="bg-white p-3 rounded-xl">
                <QRCodeSVG
                  value={APK_URL}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#0d1117"
                  level="M"
                />
              </div>
              <p className="text-gray-400 text-xs text-center max-w-[200px]">
                Scan QR code to download xShield AI APK directly to your Android
              </p>
              <a
                href={APK_URL}
                download="xshieldai.apk"
                className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black px-6 py-3 rounded-xl transition-colors text-sm w-full justify-center"
              >
                📥 Direct Download APK
              </a>
            </div>

            {/* Info column */}
            <div className="flex flex-col gap-4 max-w-sm w-full text-left">
              <div className="border border-white/10 bg-white/[0.05] rounded-xl p-5">
                <p className="text-white font-bold mb-1.5">Android App</p>
                <p className="text-gray-300 text-sm leading-relaxed">
                  Scan QR or tap download. Enable "Install from unknown sources" in Android
                  settings. Connects to your self-hosted xShield AI server for live threat alerts.
                </p>
              </div>
              <div className="border border-white/10 bg-white/[0.05] rounded-xl p-5">
                <p className="text-white font-bold mb-1.5">Self-Hosted Server</p>
                <div className="bg-black/50 rounded-lg p-3 font-mono text-xs text-cyan-400">
                  npx @xshieldai/warrior start
                </div>
              </div>
              <div className="border border-white/10 bg-white/[0.05] rounded-xl p-5">
                <p className="text-white font-bold mb-1.5">Live Threat Dashboard</p>
                <p className="text-gray-300 text-sm mb-3">
                  Real-time view of attack chains, honeypot hits, APT IOC matches, and pre-blocked
                  IPs.
                </p>
                <a
                  href={LIVE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-red-400 hover:text-red-300 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Open Live Dashboard →
                </a>
              </div>
              <p className="text-gray-400 text-xs text-center">
                Open source · Self-hosted · MIT License · No telemetry ever
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-black">
                x
              </div>
              <span className="font-black text-white">
                xShield<span className="text-cyan-400">AI</span>
              </span>
              <span className="text-gray-400 text-sm ml-1">— AI-Native Cybersecurity</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="#features" className="hover:text-gray-200 transition-colors">
                Features
              </a>
              <a href="#threats" className="hover:text-gray-200 transition-colors">
                Threat DB
              </a>
              <a href="#apt" className="hover:text-gray-200 transition-colors">
                APT Groups
              </a>
              <a href="#pricing" className="hover:text-gray-200 transition-colors">
                Pricing
              </a>
              <a
                href={LIVE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-200 transition-colors"
              >
                Live
              </a>
              <Link to="/login" className="hover:text-gray-200 transition-colors">
                Sign in
              </Link>
            </div>
            <div className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} xShield AI · ANKR Labs
            </div>
          </div>
        </div>
      </footer>

      {/* ── Marquee keyframe ── */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
