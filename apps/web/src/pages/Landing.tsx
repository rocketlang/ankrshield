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
          : 'hover:border-cyan-500/50';
  const dot =
    accent === 'purple'
      ? 'text-purple-400'
      : accent === 'red'
        ? 'text-red-400'
        : accent === 'amber'
          ? 'text-amber-400'
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

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function Landing() {
  const { score, chains, honeypots } = useLiveThreatScore();

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
              Live Dashboard
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <a
              href="#download"
              className="text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-1.5 rounded-lg transition-colors"
            >
              Download
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Background grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(6,182,212,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.07) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Glow blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-0 w-80 h-80 bg-blue-700/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-24 text-center">
          {/* Live threat indicator */}
          <div className="flex justify-center mb-8">
            {score !== null ? (
              <ThreatPill score={score} />
            ) : (
              <Badge color="cyan">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                AI Warrior Active
              </Badge>
            )}
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-6">
            <span className="text-white">AI-Native</span>
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Cyber Defense
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            8 autonomous AI agents defending your Android device, Linux server, and network stack
            against nation-state spyware, zero-days, and AI-powered attack chains — in real time.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a
              href="#download"
              className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-cyan-500/20 text-base"
            >
              <span>📥</span> Download Free
            </a>
            <a
              href={LIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              View Live Threats
            </a>
          </div>

          {/* Live stats strip */}
          <div className="inline-flex items-center gap-8 bg-white/[0.06] border border-white/10 rounded-2xl px-8 py-4">
            <StatBox value={chains} label="Attack Chains" sub="detected" />
            <div className="w-px h-10 bg-white/15" />
            <StatBox value={honeypots} label="Intruders" sub="trapped" />
            <div className="w-px h-10 bg-white/15" />
            <StatBox value="8" label="AI Agents" sub="watching 24/7" />
            <div className="w-px h-10 bg-white/15" />
            <StatBox value="95%" label="Tor Exit" sub="threat score" />
          </div>
        </div>
      </section>

      {/* ── Scrolling ticker ── */}
      <div className="border-y border-white/10 bg-white/[0.04] overflow-hidden py-3">
        <div className="flex gap-12 animate-[marquee_30s_linear_infinite] whitespace-nowrap text-xs text-gray-400 font-mono">
          {Array(3)
            .fill([
              '🔴 185.220.101.45 · Tor Exit · DE · Score 95 · BLOCKED',
              '⚠️ Honeypot hit · /.env · 91.92.240.28',
              '🛡️ AbuseIPDB pre-block · 45.143.200.1 · Score 92',
              '🍯 WordPress brute force · /wp-admin · IDENTIFIED',
              '📡 Reported to AbuseIPDB · categories: WebApp, Hacking',
              '🚫 iptables DROP · 194.165.16.11 · rule added',
              '⚔️ AI Warrior · attack chain detected · score 78',
              '🔬 Spyware IOC match · Pegasus C2 domain',
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
          <h2 className="text-4xl font-black text-white mt-4 mb-4">Four Shields. One Platform.</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Each agent runs independently, correlating signals across your entire stack in real
            time. No cloud dependency. No telemetry. Fully self-hosted.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon="⚔️"
            title="AI Warrior"
            accent="cyan"
            tagline="LLM Threat Correlation"
            bullets={[
              'Multi-stage attack chain detection',
              'Natural language threat narratives',
              'Cross-agent signal correlation',
              'Automated incident triage',
              'Adversarial prompt injection detection',
            ]}
          />
          <FeatureCard
            icon="🔬"
            title="Spyware Detector"
            accent="red"
            tagline="Nation-State Defense"
            bullets={[
              'Pegasus · Candiru · Predator detection',
              'Amnesty International IOC database',
              'Citizen Lab threat feed integration',
              'FinFisher and RCS surveillance signals',
              'Real-time C2 domain checks',
            ]}
          />
          <FeatureCard
            icon="🔒"
            title="Privacy Shield"
            accent="purple"
            tagline="Network-Level Guardian"
            bullets={[
              'DNS-level tracker blocking',
              'Deep packet inspection',
              'Fingerprinting elimination',
              'TLS certificate anomaly detection',
              'Geo-based exfiltration alerts',
            ]}
          />
          <FeatureCard
            icon="🤖"
            title="AI Governance"
            accent="amber"
            tagline="Scope Enforcement"
            bullets={[
              'ChatGPT · Claude · Copilot control',
              'Data exfiltration via prompt prevention',
              'Policy-based AI tool access',
              'Full audit log for AI interactions',
              'Cursor AI and Gemini monitoring',
            ]}
          />
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="border-t border-white/10 bg-white/[0.03]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-16">
            <Badge color="purple">Setup</Badge>
            <h2 className="text-4xl font-black text-white mt-4 mb-4">Live in 5 minutes</h2>
            <p className="text-gray-400 max-w-lg mx-auto">
              Deploy on any Linux server or install the Android app. No cloud account, no signup.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector */}
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20" />
            {[
              {
                n: 1,
                icon: '🖥️',
                title: 'Deploy the Agent',
                desc: 'Run on your Linux server with a single command. Fastify API starts on port 4250. Warrior engine initializes 8 AI agents.',
              },
              {
                n: 2,
                icon: '📱',
                title: 'Install the App',
                desc: 'Scan the QR code below to download the Android APK. Real-time threat alerts sent to your phone from your own server.',
              },
              {
                n: 3,
                icon: '🛡️',
                title: 'Shield Activates',
                desc: 'Honeypots deploy, AbuseIPDB pre-screening starts, attack chains are built, and every threat is scored 0–100.',
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

      {/* ── Live server threat section ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
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
                  Every Linux server on the internet gets probed thousands of times per day — bots
                  scanning for open .env files, WordPress logins, SSH brute force. xShield AI
                  doesn't just detect them. It identifies them, reports them globally, and blocks
                  them at the firewall.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  {[
                    {
                      icon: '🍯',
                      title: 'Honeypot Trap',
                      desc: 'Serve "You Have Been Identified" to attackers probing /.env, /wp-admin, /shell',
                    },
                    {
                      icon: '📡',
                      title: 'AbuseIPDB Report',
                      desc: 'Auto-submit attacker IP to global threat database. Contributes to collective defense.',
                    },
                    {
                      icon: '🚫',
                      title: 'iptables Block',
                      desc: 'Instant kernel-level DROP rule. Attacker can no longer reach any port on your server.',
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
              <div className="w-full lg:w-[400px] shrink-0">
                <div className="bg-[#080d14] border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                    <span className="w-3 h-3 rounded-full bg-red-500/70" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                    <span className="w-3 h-3 rounded-full bg-green-500/70" />
                    <span className="ml-3 text-gray-400 text-xs font-mono">
                      xshield-warrior — live
                    </span>
                  </div>
                  <div className="p-5 font-mono text-xs space-y-2">
                    <div className="text-gray-400">$ xshield warrior start</div>
                    <div className="text-cyan-400">⚔️ AI Warrior engine started</div>
                    <div className="text-cyan-400">🍯 Honeypots deployed (17 paths)</div>
                    <div className="text-cyan-400">🔍 AbuseIPDB pre-screening active</div>
                    <div className="text-gray-400 mt-3">Waiting for threats...</div>
                    <div className="text-yellow-300">⚠️ [16:17:47] 185.220.101.45 → /.env</div>
                    <div className="text-orange-300">📡 AbuseIPDB report submitted</div>
                    <div className="text-red-400">🚫 iptables DROP rule added</div>
                    <div className="text-purple-300">🔍 Pre-block: 91.92.240.28 · score 92%</div>
                    <div className="text-purple-300">🌐 Known threat · Access denied · 403</div>
                    <div className="text-gray-400 animate-pulse mt-2">█</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Research trust ── */}
      <section className="border-t border-white/10 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-gray-400 text-xs uppercase tracking-widest mb-8">
            Threat intelligence sourced from
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: '🏛️', name: 'Amnesty International', label: 'Security Lab' },
              { icon: '🔭', name: 'Citizen Lab', label: 'University of Toronto' },
              { icon: '📡', name: 'Access Now', label: 'Digital Security Helpline' },
              { icon: '🛡️', name: 'EFF', label: 'Electronic Frontier Foundation' },
            ].map((o) => (
              <div
                key={o.name}
                className="border border-white/10 bg-white/[0.04] rounded-xl p-4 text-center hover:border-white/20 hover:bg-white/[0.07] transition-all"
              >
                <div className="text-2xl mb-2">{o.icon}</div>
                <div className="text-white text-sm font-semibold">{o.name}</div>
                <div className="text-gray-400 text-xs mt-0.5">{o.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download / CTA ── */}
      <section id="download" className="border-t border-white/10 relative overflow-hidden py-24">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cyan-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <Badge color="cyan">Free · Open Source · No Telemetry</Badge>
          <h2 className="text-4xl sm:text-5xl font-black text-white mt-6 mb-4">
            Start protecting yourself now
          </h2>
          <p className="text-gray-300 text-lg mb-14 max-w-xl mx-auto">
            Nation-state spyware targets activists, journalists, and executives every day. xShield
            AI is your open-source last line of defense.
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
                  Real-time view of attack chains, honeypot hits, and pre-blocked IPs from your
                  server.
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
              <a
                href={LIVE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-200 transition-colors"
              >
                Live Threats
              </a>
              <Link to="/login" className="hover:text-gray-200 transition-colors">
                Sign in
              </Link>
              <a href="/evidence" className="hover:text-gray-200 transition-colors">
                Evidence
              </a>
            </div>
            <div className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} xShield AI · ANKR Labs · Open Source
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
