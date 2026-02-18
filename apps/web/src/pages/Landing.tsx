/**
 * Landing Page — ANKR Shield
 * Your AI Security Guardian
 *
 * Features:
 * - Hero section with shield icon and tagline
 * - Stats bar with key metrics
 * - 4 feature cards with gradient borders
 * - How it works (3 steps)
 * - CTA section with download + GitHub buttons
 */

import { Link } from 'react-router-dom';

// ─── Gradient border card wrapper ─────────────────────────────────────────────
function GradientCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl p-[1px] bg-gradient-to-br from-blue-500 via-cyan-400 to-blue-700 ${className}`}
    >
      <div className="rounded-2xl bg-gray-900 h-full p-6">{children}</div>
    </div>
  );
}

// ─── Feature Card ──────────────────────────────────────────────────────────────
function FeatureCard({
  icon,
  title,
  tagline,
  bullets,
}: {
  icon: string;
  title: string;
  tagline: string;
  bullets: string[];
}) {
  return (
    <GradientCard>
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      <p className="text-cyan-400 text-sm font-medium mb-4">{tagline}</p>
      <ul className="space-y-2">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
            <span className="mt-0.5 text-cyan-400 shrink-0">&#10003;</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </GradientCard>
  );
}

// ─── Step Card (How it Works) ──────────────────────────────────────────────────
function StepCard({
  step,
  icon,
  title,
  description,
}: {
  step: number;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Step number + connector line */}
      <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-2xl font-bold mb-4 shadow-lg shadow-blue-500/30">
        {step}
      </div>
      <div className="text-3xl mb-3">{icon}</div>
      <h4 className="text-lg font-semibold text-white mb-2">{title}</h4>
      <p className="text-gray-400 text-sm leading-relaxed max-w-xs">{description}</p>
    </div>
  );
}

// ─── Stat Pill ─────────────────────────────────────────────────────────────────
function StatPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-300">
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
      {label}
    </span>
  );
}

// ─── Main Landing Page ─────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              ankrshield
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              How it Works
            </a>
            <a
              href="https://github.com/rocketlang-private/ankrshield"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-300 hover:text-white transition-colors px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white px-4 py-2 rounded-lg transition-all shadow-md shadow-blue-500/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute top-20 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute top-40 left-0 w-72 h-72 bg-blue-800/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
          {/* Shield icon */}
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-400/20 border border-blue-500/30 mb-8 shadow-xl shadow-blue-500/10">
            <span className="text-5xl">🛡️</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
            <span className="bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
              ANKR Shield
            </span>
            <br />
            <span className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Your AI Security Guardian
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Defend your devices from nation-state spyware, AI-powered attack chains, and privacy
            breaches — with 8 autonomous AI agents watching 24/7.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <a
              href="#download"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-blue-500/30 text-base"
            >
              <span>📥</span> Download the App
            </a>
            <a
              href="https://github.com/rocketlang-private/ankrshield"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-4 rounded-xl transition-all border border-gray-700 hover:border-gray-500 text-base"
            >
              <span>🐙</span> View on GitHub
            </a>
          </div>

          {/* Threat alert badge */}
          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-full px-4 py-2 text-sm text-red-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Pegasus · Candiru · Predator · FinFisher — actively detected
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="border-y border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <StatPill label="8 AI Agents Monitored" />
            <span className="hidden sm:block w-px h-4 bg-gray-700" />
            <StatPill label="Pegasus / Candiru / Predator Detection" />
            <span className="hidden sm:block w-px h-4 bg-gray-700" />
            <StatPill label="Real-time Threat Intelligence" />
            <span className="hidden sm:block w-px h-4 bg-gray-700" />
            <StatPill label="DNS-level Privacy Blocking" />
            <span className="hidden sm:block w-px h-4 bg-gray-700" />
            <StatPill label="AI Governance Enforcement" />
          </div>
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Four Layers of AI-Powered Protection
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Each shield layer runs independently as an autonomous agent, correlating signals across
            your entire infrastructure in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon="⚔️"
            title="AI Warrior"
            tagline="LLM-Powered Threat Correlation"
            bullets={[
              'Detects multi-stage attack chains across AI agents',
              'Natural language threat explanation',
              'Cross-agent signal correlation with LLM reasoning',
              'Automated incident triage and escalation',
              'Adversarial prompt injection detection',
            ]}
          />
          <FeatureCard
            icon="🔬"
            title="Spyware Detector"
            tagline="Nation-State Spyware Defense"
            bullets={[
              'IOC database from Amnesty International',
              'Citizen Lab threat feed integration',
              'Pegasus, Candiru, Predator detection',
              'FinFisher and RCS surveillance signals',
              'Real-time C2 domain reputation checks',
            ]}
          />
          <FeatureCard
            icon="🔒"
            title="Privacy Shield"
            tagline="Network-Level Privacy Guardian"
            bullets={[
              'DNS-level tracker and ad blocking',
              'Deep packet network traffic analysis',
              'Fingerprinting and pixel tracker elimination',
              'TLS certificate anomaly detection',
              'Geo-based data exfiltration alerts',
            ]}
          />
          <FeatureCard
            icon="🤖"
            title="AI Governance"
            tagline="Scope Enforcement for AI Tools"
            bullets={[
              'ChatGPT, Claude, Copilot scope control',
              'Cursor AI and Gemini activity monitoring',
              'Data exfiltration prevention via AI prompts',
              'Policy-based AI tool access control',
              'Audit log for all AI interactions',
            ]}
          />
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="relative py-24 bg-gray-900/40">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Up and running in minutes. ANKR Shield integrates with your existing infrastructure
              without disruption.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Connector lines (desktop only) */}
            <div className="hidden md:block absolute top-7 left-1/3 right-1/3 h-px bg-gradient-to-r from-blue-500/50 to-cyan-400/50" />

            <StepCard
              step={1}
              icon="🖥️"
              title="Install on Your Server"
              description="Deploy the ANKR Shield agent on your server or VM in under 5 minutes using our single-line installer script. Supports Linux, macOS, and Docker."
            />
            <StepCard
              step={2}
              icon="📱"
              title="Connect Your Devices"
              description="Register your phones, laptops, and workstations via the dashboard. Each device gets a unique identity token for tamper-proof attribution."
            />
            <StepCard
              step={3}
              icon="🤖"
              title="AI Monitors 24/7"
              description="Eight autonomous AI agents immediately begin correlating threats, blocking spyware, and enforcing your privacy policies — completely in the background."
            />
          </div>
        </div>
      </section>

      {/* ── Trust / Research Sources ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">Built on Verified Threat Research</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Our IOC databases and detection signatures are sourced from the world's leading security
            research organizations.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: '🏛️', name: 'Amnesty International', label: 'Security Lab' },
            { icon: '🔭', name: 'Citizen Lab', label: 'University of Toronto' },
            { icon: '📡', name: 'Access Now', label: 'Digital Security Helpline' },
            { icon: '🛡️', name: 'EFF', label: 'Electronic Frontier Foundation' },
          ].map((org) => (
            <div
              key={org.name}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center hover:border-gray-600 transition-colors"
            >
              <div className="text-3xl mb-2">{org.icon}</div>
              <div className="text-white font-semibold text-sm">{org.name}</div>
              <div className="text-gray-500 text-xs mt-1">{org.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section
        id="download"
        className="relative overflow-hidden py-24 bg-gradient-to-br from-blue-950 via-gray-950 to-cyan-950"
      >
        {/* Decorative glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-blue-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-5xl mb-6">🛡️</div>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
            Protect Yourself Now
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Nation-state spyware targets activists, journalists, and executives every day. ANKR
            Shield is your open-source defense layer.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#"
              className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white font-bold px-10 py-4 rounded-xl transition-all shadow-xl shadow-blue-500/30 text-lg"
            >
              <span>📥</span>
              Download the App
            </a>
            <a
              href="https://github.com/rocketlang-private/ankrshield"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-transparent hover:bg-gray-800 text-white font-bold px-10 py-4 rounded-xl transition-all border border-gray-600 hover:border-gray-400 text-lg"
            >
              <span>🐙</span>
              View GitHub
            </a>
          </div>

          <p className="mt-8 text-gray-600 text-sm">
            Open source · No telemetry · Self-hosted · MIT License
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 bg-gray-950 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <span className="font-bold text-white tracking-tight">ankrshield</span>
              <span className="text-gray-600 text-sm ml-2">— Your AI Security Guardian</span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#features" className="hover:text-gray-300 transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="hover:text-gray-300 transition-colors">
                How it Works
              </a>
              <Link to="/login" className="hover:text-gray-300 transition-colors">
                Sign in
              </Link>
              <Link to="/register" className="hover:text-gray-300 transition-colors">
                Register
              </Link>
              <a
                href="https://github.com/rocketlang-private/ankrshield"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-300 transition-colors"
              >
                GitHub
              </a>
            </div>

            {/* Legal */}
            <div className="text-xs text-gray-700">
              &copy; {new Date().getFullYear()} ANKR Shield. Open Source.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
