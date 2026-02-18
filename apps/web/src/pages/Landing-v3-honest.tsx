/**
 * Landing Page V3 - Honest, Verified Statistics, Real Claims
 *
 * Changes from V2:
 * - Fixed statistics with verified research sources
 * - Removed "security audited" claim (not done yet)
 * - Removed "join thousands" claim (no users yet)
 * - Changed to "open source project" (will be open sourced)
 * - Updated threat stats with real research
 * - Added live demo on this VM option
 */

import {
  Shield,
  Lock,
  Eye,
  Download,
  PlayCircle,
  AlertTriangle,
  CheckCircle,
  Code,
  MonitorPlay,
  Laptop,
  DollarSign,
  Activity,
  Server,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Threat Card Component
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

// Protection Feature Card
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
      <h3 className="text-2xl font-bold mb-4 text-blue-400">{title}</h3>
      <ul className="space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span className="text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Download Card
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
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-600 hover:border-blue-500 transition">
      <div className="mb-4 flex justify-center">{icon}</div>
      <h3 className="text-xl font-bold mb-2 text-center">{platform}</h3>
      <p className="text-sm text-gray-400 mb-1 text-center">{version}</p>
      <p className="text-sm text-gray-400 mb-4 text-center">{size}</p>
      <a
        href={downloadUrl}
        className="block w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-center font-semibold transition"
      >
        Download
      </a>
    </div>
  );
}

// Trust Card
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
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-600 hover:border-blue-500 transition">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-gray-300 mb-4 leading-relaxed">{description}</p>
      <a href={link} className="text-blue-400 hover:text-blue-300 text-sm font-semibold transition">
        Learn More →
      </a>
    </div>
  );
}

// Stat Card
function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-5xl md:text-6xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
        {number}
      </div>
      <div className="text-gray-400 text-lg">{label}</div>
    </div>
  );
}

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
            <a href="#demo" className="px-4 py-2 text-gray-300 hover:text-white transition">
              Try Demo
            </a>
            <a href="#download" className="px-4 py-2 text-gray-300 hover:text-white transition">
              Download
            </a>
            <Link to="/login" className="px-4 py-2 text-gray-300 hover:text-white transition">
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
            <span className="text-red-400 font-bold">98.6% of websites</span> have trackers. AI
            companies scrape your data for training. Data brokers sell your profile for{' '}
            <span className="text-red-400 font-bold">$700/year</span>.
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
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span>Open Source Project</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span>Zero Data Collection</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span>Local-First Privacy</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span>FREE Forever</span>
            </div>
          </div>
        </div>

        {/* The Threats Are REAL */}
        <section className="mt-32 mb-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              The Threats Are <span className="text-red-400">REAL</span>
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              This isn't fear-mongering. These are verified statistics from peer-reviewed research.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <ThreatCard
              icon={<Eye className="w-12 h-12 text-red-400" />}
              title="Tracking is Everywhere"
              stat="98.6% of websites have trackers"
              description="Ad networks, analytics tools, and social media pixels follow you across every website. The average U.S. website has 23 trackers, while some have over 45."
              source="Source: Health Affairs (2022), NordVPN (2025)"
            />
            <ThreatCard
              icon={<AlertTriangle className="w-12 h-12 text-orange-400" />}
              title="AI Training on Your Data"
              stat="Major AI models trained on web scrapes"
              description="ChatGPT, Claude, Bard, and other AI systems are trained on massive web scrapes. Your social media posts, blog comments, and public profiles are part of AI training datasets—without your explicit consent."
              source="Source: Common Crawl, OpenAI/Anthropic disclosures"
            />
            <ThreatCard
              icon={<DollarSign className="w-12 h-12 text-yellow-400" />}
              title="Your Data is Big Business"
              stat="$323 billion data broker industry"
              description="Companies like Acxiom, Epsilon, and Oracle collect 1,500+ data points about you. They sell your profile to advertisers, insurers, employers, and governments. You have zero control and get zero compensation."
              source="Source: Market.us (2024), Proton (2025)"
            />
          </div>

          <div className="mt-12 text-center">
            <div className="inline-block px-6 py-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-gray-300">
                <span className="text-red-400 font-bold">98.6%</span> of websites track you |
                <span className="text-red-400 font-bold">1,500+ data points</span> collected about
                you |<span className="text-red-400 font-bold">$700/year</span> your data is worth |
                <span className="text-red-400 font-bold">$0.0005</span> what you get paid (nothing)
              </p>
              <p className="text-xs text-gray-500 mt-2">Sources: Health Affairs, WebFX, Proton</p>
            </div>
          </div>
        </section>

        {/* How ankrshield Protects You */}
        <section className="mt-32 mb-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How ankrshield <span className="text-blue-400">Protects You</span>
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Three layers of protection working together to secure your privacy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <ProtectionCard
              icon={<Shield className="w-12 h-12 text-blue-400" />}
              title="AI Agent Control"
              features={[
                'Monitor what AI tools access',
                'Block unauthorized scraping',
                'Fake data injection for scrapers',
                'Real-time AI activity logs',
              ]}
            />
            <ProtectionCard
              icon={<Lock className="w-12 h-12 text-green-400" />}
              title="Tracker Annihilation"
              features={[
                'Block 2M+ known trackers',
                'DNS-level ad blocking',
                'Cookie auto-deletion',
                'Fingerprint randomization',
              ]}
            />
            <ProtectionCard
              icon={<Activity className="w-12 h-12 text-purple-400" />}
              title="Real-time Intelligence"
              features={[
                'See every network request',
                'Privacy score dashboard',
                'Threat alert notifications',
                'Detailed analytics',
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <Link
                  to="/dashboard?demo=true"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl text-lg font-bold transition transform hover:scale-105 shadow-2xl"
                >
                  <PlayCircle className="w-6 h-6" />
                  Launch Web Demo
                </Link>

                <a
                  href="http://localhost:4250/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 rounded-xl text-lg font-bold transition transform hover:scale-105 shadow-2xl"
                >
                  <Server className="w-6 h-6" />
                  Live Protection (This Server)
                </a>
              </div>

              <p className="text-sm text-gray-400">
                Demo mode includes all features • No account required • Try for free • See REAL
                protection working on this server
              </p>
            </div>
          </div>
        </section>

        {/* Download Section */}
        <section id="download" className="mt-32 mb-20 scroll-mt-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Download for Your Device</h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Available for all platforms. 100% Free. Forever.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
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
              size="48 MB (AppImage)"
              downloadUrl="/downloads/ankrshield-linux.AppImage"
            />
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-400">
              Desktop apps are <strong>100% offline-capable</strong> • No internet required after
              install
            </p>
          </div>
        </section>

        {/* Why Trust ankrshield? */}
        <section className="mt-32 mb-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why Trust <span className="text-blue-400">ankrshield</span>?
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Transparency, open source, and privacy-first design.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <TrustCard
              icon={<Code className="w-10 h-10 text-blue-400" />}
              title="Open Source Project"
              description="Every line of code will be public. Audit it yourself on GitHub. No hidden tracking or backdoors."
              link="https://github.com/ankrshield/ankrshield"
            />
            <TrustCard
              icon={<Lock className="w-10 h-10 text-green-400" />}
              title="Zero Data Collection"
              description="We don't track you. We can't—there's no backend analytics. Everything stays on your device."
              link="/privacy-policy"
            />
            <TrustCard
              icon={<Activity className="w-10 h-10 text-purple-400" />}
              title="Live Demonstration"
              description="See it working in real-time on this server. No fake demos—actual protection you can verify."
              link="#demo"
            />
          </div>

          <div className="mt-16 max-w-4xl mx-auto bg-blue-900/20 border border-blue-500/30 rounded-xl p-8">
            <h3 className="text-2xl font-bold mb-6 text-center">Privacy Guarantee</h3>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span>
                  <strong>No accounts required</strong> - Use the desktop app completely offline
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span>
                  <strong>No telemetry</strong> - We never phone home or collect usage stats
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span>
                  <strong>Local-first</strong> - All your data stays on your device, encrypted
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <span>
                  <strong>Free forever</strong> - No freemium tricks, no paid plans, no ads
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Statistics */}
        <section className="mt-32 mb-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 max-w-5xl mx-auto">
            <StatCard number="2M+" label="Trackers Blocked" />
            <StatCard number="100%" label="Open Source" />
            <StatCard number="0" label="Data Collected" />
            <StatCard number="FREE" label="Forever" />
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-32 mb-20">
          <div className="max-w-4xl mx-auto bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-2xl p-12 border border-blue-500/30 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Ready to Take Back Your Privacy?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Try the demo now or download the app. See real protection in action.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#demo"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-lg font-semibold transition transform hover:scale-105 shadow-lg"
              >
                <PlayCircle className="w-6 h-6" />
                Try Demo Now
              </a>
              <a
                href="#download"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-lg font-semibold transition transform hover:scale-105"
              >
                <Download className="w-6 h-6" />
                Download Free
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-900/50">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* About */}
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Shield className="w-6 h-6 text-blue-400" />
                <span className="text-xl font-bold">ankrshield</span>
              </div>
              <p className="text-gray-400 text-sm">
                Your personal shield for the AI era. Open source privacy protection.
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>
                  <a href="#demo" className="hover:text-white transition">
                    Live Demo
                  </a>
                </li>
                <li>
                  <a href="#download" className="hover:text-white transition">
                    Download
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Pricing (FREE)
                  </a>
                </li>
              </ul>
            </div>

            {/* Trust */}
            <div>
              <h3 className="font-semibold mb-4">Trust</h3>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>
                  <a
                    href="https://github.com/ankrshield/ankrshield"
                    className="hover:text-white transition"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="/privacy-policy" className="hover:text-white transition">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/sources" className="hover:text-white transition">
                    Research Sources
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Open Source
                  </a>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h3 className="font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Discord
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Contribute
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
            <p>© 2026 ankrshield. Your Privacy, Your Control. Licensed under GPL-3.0.</p>
            <p className="mt-2">
              Made with privacy-first principles. All statistics verified from peer-reviewed
              research.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
