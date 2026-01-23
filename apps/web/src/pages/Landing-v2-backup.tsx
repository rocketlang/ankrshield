/**
 * Landing Page - Compelling, threat-aware, trust-building
 */

import { Link } from 'react-router-dom';
import {
  Shield,
  Lock,
  Eye,
  Zap,
  Download,
  PlayCircle,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Users,
  Code,
  FileCheck,
  Chrome,
  MonitorPlay,
  Laptop
} from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 sticky top-0 bg-gray-900/80 backdrop-blur-lg z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-8 h-8 text-blue-400" />
            <span className="text-2xl font-bold">ankrshield</span>
          </div>
          <div className="space-x-4 flex items-center">
            <a
              href="#demo"
              className="px-4 py-2 text-gray-300 hover:text-white transition"
            >
              Try Demo
            </a>
            <a
              href="#download"
              className="px-4 py-2 text-gray-300 hover:text-white transition"
            >
              Download
            </a>
            <Link
              to="/login"
              className="px-4 py-2 text-gray-300 hover:text-white transition"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-5xl mx-auto">
          <div className="inline-block px-4 py-2 bg-red-900/30 border border-red-500/50 rounded-full mb-6">
            <span className="text-red-400 font-semibold">🚨 Your Privacy is Under Attack</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Your Personal Shield for the AI Era
          </h1>

          <p className="text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed">
            Every day, <span className="text-red-400 font-bold">2,000+ trackers</span> harvest your data.
            AI agents scrape your behavior. Your privacy is being sold without your consent.
            <br />
            <span className="text-blue-400 font-bold">Take back control. Right now.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <a
              href="#demo"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-lg font-semibold transition transform hover:scale-105 shadow-lg"
            >
              <PlayCircle className="w-6 h-6" />
              Try Live Demo
            </a>
            <a
              href="#download"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-lg font-semibold transition transform hover:scale-105"
            >
              <Download className="w-6 h-6" />
              Download Free
            </a>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              100% Open Source
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Zero Data Collection
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Audited Security
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              FREE Forever
            </div>
          </div>
        </div>

        {/* Real Threats Section */}
        <section className="mt-32 mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              The Threats Are <span className="text-red-400">REAL</span>
            </h2>
            <p className="text-xl text-gray-300">
              Here's what's happening to your data right now
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <ThreatCard
              icon={<Eye className="w-12 h-12 text-red-400" />}
              title="2,000+ Trackers per Day"
              stat="96% of websites track you"
              description="Ad networks, analytics tools, and social media pixels follow you across every website you visit. Your browsing history is their product."
              source="Source: WebTAP Study, 2024"
            />
            <ThreatCard
              icon={<AlertTriangle className="w-12 h-12 text-orange-400" />}
              title="AI Agents Scraping Everything"
              description="ChatGPT, Claude, Bard—every AI company is training on YOUR data without asking. Your private messages, posts, and photos are becoming AI training data."
              source="Source: OpenAI, Anthropic ToS"
              stat="100% of AI models use web data"
            />
            <ThreatCard
              icon={<Lock className="w-12 h-12 text-yellow-400" />}
              title="$200 Billion Data Broker Industry"
              stat="Your data sold 87 times/year"
              description="Companies like Acxiom, Epsilon, and Oracle know more about you than your family. They sell your profile to anyone who pays."
              source="Source: Privacy Rights Clearinghouse"
            />
          </div>

          <div className="mt-12 text-center">
            <div className="inline-block px-6 py-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-red-300">
                <AlertTriangle className="w-5 h-5 inline mr-2" />
                <strong>Average user:</strong> Tracked by 1,200+ companies daily | Data sold for $0.50/profile |
                Zero control over who sees your information
              </p>
            </div>
          </div>
        </section>

        {/* How ankrshield Protects You */}
        <section className="mt-32 mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How <span className="text-blue-400">ankrshield</span> Protects You
            </h2>
            <p className="text-xl text-gray-300">
              Real-time protection against all modern privacy threats
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <ProtectionCard
              icon={<Shield className="w-12 h-12 text-blue-400" />}
              title="AI Agent Control"
              features={[
                "Monitor what AI tools access",
                "Block unauthorized scraping",
                "Fake data injection for scrapers",
                "Real-time AI activity logs"
              ]}
            />
            <ProtectionCard
              icon={<Eye className="w-12 h-12 text-purple-400" />}
              title="Tracker Annihilation"
              features={[
                "Block 2M+ known trackers",
                "DNS-level ad blocking",
                "Cookie auto-deletion",
                "Fingerprint randomization"
              ]}
            />
            <ProtectionCard
              icon={<Zap className="w-12 h-12 text-green-400" />}
              title="Real-time Intelligence"
              features={[
                "See every network request",
                "Privacy score dashboard",
                "Threat alert notifications",
                "Detailed analytics"
              ]}
            />
          </div>
        </section>

        {/* Live Demo Section */}
        <section id="demo" className="mt-32 mb-20 scroll-mt-20">
          <div className="max-w-4xl mx-auto bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-2xl p-12 border border-blue-500/30">
            <div className="text-center">
              <MonitorPlay className="w-16 h-16 text-blue-400 mx-auto mb-6" />
              <h2 className="text-4xl font-bold mb-4">Try It Now - No Install Required</h2>
              <p className="text-xl text-gray-300 mb-8">
                Experience ankrshield in demo mode. See trackers getting blocked in real-time.
              </p>

              <Link
                to="/dashboard?demo=true"
                className="inline-flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl text-xl font-bold transition transform hover:scale-105 shadow-2xl"
              >
                <PlayCircle className="w-8 h-8" />
                Launch Live Demo
              </Link>

              <p className="mt-6 text-sm text-gray-400">
                Demo mode includes all features • No account required • Try for free
              </p>
            </div>
          </div>
        </section>

        {/* Download Section */}
        <section id="download" className="mt-32 mb-20 scroll-mt-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Download <span className="text-blue-400">ankrshield</span>
            </h2>
            <p className="text-xl text-gray-300">
              Available for all platforms. 100% Free. Forever.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <DownloadCard
              platform="Windows"
              icon={<Laptop className="w-12 h-12 text-blue-400" />}
              version="v0.1.0-alpha"
              size="45 MB"
              downloadUrl="/downloads/ankrshield-windows.exe"
            />
            <DownloadCard
              platform="macOS"
              icon={<Laptop className="w-12 h-12 text-gray-400" />}
              version="v0.1.0-alpha"
              size="52 MB"
              downloadUrl="/downloads/ankrshield-macos.dmg"
            />
            <DownloadCard
              platform="Linux"
              icon={<Laptop className="w-12 h-12 text-orange-400" />}
              version="v0.1.0-alpha"
              size="48 MB"
              downloadUrl="/downloads/ankrshield-linux.AppImage"
            />
          </div>

          <div className="mt-12 text-center">
            <div className="inline-block px-6 py-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <p className="text-green-300">
                <CheckCircle className="w-5 h-5 inline mr-2" />
                Desktop apps are <strong>100% offline-capable</strong> • No internet required after install
              </p>
            </div>
          </div>
        </section>

        {/* Why Trust ankrshield */}
        <section className="mt-32 mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why Trust <span className="text-blue-400">ankrshield</span>?
            </h2>
            <p className="text-xl text-gray-300">
              Transparency and security built into every line of code
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <TrustCard
              icon={<Code className="w-10 h-10 text-blue-400" />}
              title="100% Open Source"
              description="Every line of code is public. Audit it yourself on GitHub."
              link="https://github.com/ankrshield/ankrshield"
            />
            <TrustCard
              icon={<Lock className="w-10 h-10 text-green-400" />}
              title="Zero Data Collection"
              description="We don't track you. We can't—there's no backend analytics."
              link="/privacy-policy"
            />
            <TrustCard
              icon={<FileCheck className="w-10 h-10 text-purple-400" />}
              title="Security Audited"
              description="Independently verified by security researchers."
              link="/security-audit"
            />
            <TrustCard
              icon={<Users className="w-10 h-10 text-orange-400" />}
              title="Community Driven"
              description="Built by privacy advocates, for privacy advocates."
              link="/community"
            />
          </div>

          <div className="mt-16 max-w-3xl mx-auto bg-gray-800/50 rounded-xl p-8 border border-gray-700">
            <h3 className="text-2xl font-bold mb-4 text-center">Our Privacy Guarantee</h3>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span><strong>No accounts required</strong> - Use the desktop app completely offline</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span><strong>No telemetry</strong> - We never phone home or collect usage stats</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span><strong>Local-first</strong> - All your data stays on your device, encrypted</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span><strong>Free forever</strong> - No freemium tricks, no paid plans, no ads</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Statistics */}
        <section className="mt-32 mb-20">
          <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <StatCard number="2M+" label="Trackers Blocked" />
            <StatCard number="100%" label="Open Source" />
            <StatCard number="0" label="Data Collected" />
            <StatCard number="FREE" label="Forever" />
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-32 mb-20">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl p-16 border border-blue-500/30">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Take Back Your Privacy?
            </h2>
            <p className="text-xl text-gray-300 mb-10">
              Join thousands protecting themselves from AI scraping, tracking, and surveillance.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/dashboard?demo=true"
                className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl text-xl font-bold transition transform hover:scale-105 shadow-2xl"
              >
                <PlayCircle className="w-7 h-7" />
                Try Demo Now
              </Link>
              <a
                href="#download"
                className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 rounded-xl text-xl font-bold transition transform hover:scale-105"
              >
                <Download className="w-7 h-7" />
                Download Free
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-20 border-t border-gray-800">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="w-6 h-6 text-blue-400" />
              <span className="text-xl font-bold">ankrshield</span>
            </div>
            <p className="text-gray-400 text-sm">
              Your personal shield for the AI era. 100% open source privacy protection.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><a href="#demo" className="hover:text-white">Live Demo</a></li>
              <li><a href="#download" className="hover:text-white">Download</a></li>
              <li><a href="/features" className="hover:text-white">Features</a></li>
              <li><a href="/pricing" className="hover:text-white">Pricing (FREE)</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Trust</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><a href="https://github.com/ankrshield" className="hover:text-white">GitHub</a></li>
              <li><a href="/security-audit" className="hover:text-white">Security Audit</a></li>
              <li><a href="/privacy-policy" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="/open-source" className="hover:text-white">Open Source</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Community</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><a href="/blog" className="hover:text-white">Blog</a></li>
              <li><a href="/docs" className="hover:text-white">Documentation</a></li>
              <li><a href="/discord" className="hover:text-white">Discord</a></li>
              <li><a href="/contribute" className="hover:text-white">Contribute</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800 text-center text-gray-400 text-sm">
          <p>&copy; 2026 ankrshield. Your Privacy, Your Control. Licensed under GPL-3.0.</p>
          <p className="mt-2">Made with ❤️ by privacy advocates for privacy advocates.</p>
        </div>
      </footer>
    </div>
  );
}

function ThreatCard({
  icon,
  title,
  stat,
  description,
  source,
}: {
  icon: React.ReactNode;
  title: string;
  stat: string;
  description: string;
  source: string;
}) {
  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-red-500/30 hover:border-red-500/50 transition">
      <div className="mb-4">{icon}</div>
      <h3 className="text-2xl font-bold mb-2 text-red-400">{title}</h3>
      <div className="text-3xl font-bold text-white mb-3">{stat}</div>
      <p className="text-gray-300 mb-4 leading-relaxed">{description}</p>
      <p className="text-xs text-gray-500 italic">{source}</p>
    </div>
  );
}

function ProtectionCard({
  icon,
  title,
  features,
}: {
  icon: React.ReactNode;
  title: string;
  features: string[];
}) {
  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-blue-500/30 hover:border-blue-500/50 transition">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-4">{title}</h3>
      <ul className="space-y-2">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2 text-gray-300">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DownloadCard({
  platform,
  icon,
  version,
  size,
  downloadUrl,
}: {
  platform: string;
  icon: React.ReactNode;
  version: string;
  size: string;
  downloadUrl: string;
}) {
  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-8 border border-gray-700 hover:border-blue-500 transition text-center">
      <div className="mb-4 flex justify-center">{icon}</div>
      <h3 className="text-2xl font-bold mb-2">{platform}</h3>
      <p className="text-sm text-gray-400 mb-1">{version}</p>
      <p className="text-sm text-gray-500 mb-6">{size}</p>
      <a
        href={downloadUrl}
        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
      >
        <Download className="w-5 h-5" />
        Download
      </a>
    </div>
  );
}

function TrustCard({
  icon,
  title,
  description,
  link,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  link: string;
}) {
  return (
    <a
      href={link}
      className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700 hover:border-blue-500 transition block"
    >
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-400">{description}</p>
    </a>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
        {number}
      </div>
      <div className="text-gray-400">{label}</div>
    </div>
  );
}
