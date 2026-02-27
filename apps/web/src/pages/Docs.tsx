/**
 * xShield AI — Documentation Page
 * Self-hosting quick start, REST API reference, GraphQL, SDK, and env vars.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
      <Link to="/" className="flex items-center gap-2">
        <span className="text-xl font-black tracking-tight">
          x<span className="text-cyan-400">Shield</span>
          <span className="text-white/40 font-light"> AI</span>
        </span>
      </Link>
      <nav className="flex items-center gap-6 text-sm text-white/60">
        <Link to="/" className="hover:text-white transition">
          Home
        </Link>
        <Link to="/pricing" className="hover:text-white transition">
          Pricing
        </Link>
        <Link to="/developers" className="hover:text-white transition">
          Developers
        </Link>
        <Link to="/login" className="hover:text-white transition">
          Login
        </Link>
        <Link
          to="/register"
          className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-4 py-2 rounded-lg transition"
        >
          Get Started
        </Link>
      </nav>
    </header>
  );
}

// ─── Code block ───────────────────────────────────────────────────────────────
function CodeBlock({ children, lang = '' }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="relative group rounded-xl overflow-hidden border border-white/10 my-4">
      {lang && (
        <div className="px-4 py-1.5 bg-white/[0.04] border-b border-white/10 text-xs text-white/30 font-mono uppercase tracking-widest">
          {lang}
        </div>
      )}
      <button
        onClick={copy}
        className="absolute top-2 right-3 text-xs text-white/20 hover:text-white/60 transition opacity-0 group-hover:opacity-100"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre
        style={{ background: '#0d1117', color: '#7ee787' }}
        className="p-4 text-sm overflow-x-auto leading-relaxed font-mono whitespace-pre"
      >
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-2xl font-bold mt-14 mb-4 pb-3 border-b border-white/10 scroll-mt-20"
    >
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold mt-6 mb-2 text-white/90">{children}</h3>;
}

// ─── Quick Start tabs ─────────────────────────────────────────────────────────
const TABS = ['npx', 'Docker', 'From Source'] as const;
type Tab = (typeof TABS)[number];

function QuickStart() {
  const [active, setActive] = useState<Tab>('npx');

  return (
    <div>
      <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit mb-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              active === t ? 'bg-cyan-500 text-black' : 'text-white/50 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {active === 'npx' && (
        <div>
          <p className="text-white/60 text-sm mb-3">
            The fastest way to run xShield Warrior locally — no installation required.
          </p>
          <ol className="list-none space-y-4">
            <li>
              <span className="text-cyan-400 font-bold text-xs uppercase tracking-widest">
                Step 1 — Run the warrior
              </span>
              <CodeBlock lang="bash">{`npx xshield-warrior start`}</CodeBlock>
            </li>
            <li>
              <span className="text-cyan-400 font-bold text-xs uppercase tracking-widest">
                Step 2 — Verify it is running
              </span>
              <CodeBlock lang="bash">{`curl http://localhost:4481/health`}</CodeBlock>
            </li>
            <li>
              <span className="text-cyan-400 font-bold text-xs uppercase tracking-widest">
                Step 3 — Scan your first domain
              </span>
              <CodeBlock lang="bash">{`curl "http://localhost:4481/risk/score?domain=example.com"`}</CodeBlock>
            </li>
            <li>
              <span className="text-cyan-400 font-bold text-xs uppercase tracking-widest">
                Step 4 — Pull the IOC feed
              </span>
              <CodeBlock lang="bash">{`curl "http://localhost:4481/ioc/feed?format=hosts" -o /etc/hosts.xshield`}</CodeBlock>
            </li>
          </ol>
        </div>
      )}

      {active === 'Docker' && (
        <div>
          <p className="text-white/60 text-sm mb-3">
            Run xShield Warrior in a container. Exposes port 4481 by default.
          </p>
          <CodeBlock lang="bash">{`docker run -p 4481:4481 xshieldai/warrior`}</CodeBlock>
          <p className="text-white/50 text-sm mt-2">
            Pass environment variables with{' '}
            <code className="text-cyan-400">-e DATABASE_URL=...</code>. See the Environment
            Variables section below.
          </p>
          <CodeBlock lang="bash">
            {`docker run -p 4481:4481 \\
  -e DATABASE_URL="postgresql://user:pass@host/db" \\
  -e STRIPE_SECRET_KEY="sk_live_..." \\
  xshieldai/warrior`}
          </CodeBlock>
        </div>
      )}

      {active === 'From Source' && (
        <div>
          <p className="text-white/60 text-sm mb-3">
            Clone the monorepo and run the API locally with full TypeScript source.
          </p>
          <CodeBlock lang="bash">
            {`git clone https://github.com/xshieldai/warrior.git
cd warrior`}
          </CodeBlock>
          <CodeBlock lang="bash">{`pnpm install`}</CodeBlock>
          <CodeBlock lang="bash">{`pnpm dev`}</CodeBlock>
          <p className="text-white/50 text-sm mt-2">
            The API starts on <code className="text-cyan-400">http://localhost:4481</code>. Copy{' '}
            <code className="text-cyan-400">.env.example</code> to{' '}
            <code className="text-cyan-400">.env</code> and fill in your credentials before running.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── REST API table ───────────────────────────────────────────────────────────
interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  auth: string;
  description: string;
}

const REST_ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/risk/score?domain=',
    auth: 'None',
    description: 'Domain risk score (0–100) with categories',
  },
  {
    method: 'GET',
    path: '/ioc/feed?format=hosts',
    auth: 'None',
    description: 'IOC blocklist in hosts-file format',
  },
  {
    method: 'POST',
    path: '/auth/magic-link',
    auth: 'None',
    description: 'Request a passwordless login link via email',
  },
  {
    method: 'GET',
    path: '/auth/verify?token=',
    auth: 'None',
    description: 'Verify a magic-link token and receive JWT',
  },
  {
    method: 'POST',
    path: '/auth/register',
    auth: 'None',
    description: 'Register a new account with email + password',
  },
  {
    method: 'GET',
    path: '/brand/report?brandTerms=',
    auth: 'None',
    description: 'Brand impersonation and typosquat check',
  },
  {
    method: 'GET',
    path: '/risk/narrative?domain=',
    auth: 'API Key',
    description: 'AI-generated threat narrative (STARTER+)',
  },
  {
    method: 'GET',
    path: '/risk/cert-stream?domain=',
    auth: 'None',
    description: 'Server-Sent Events stream of CT log certificates',
  },
  {
    method: 'GET',
    path: '/risk/registrant?domain=',
    auth: 'API Key (STARTER+)',
    description: 'WHOIS pivot — find all domains by registrant',
  },
  {
    method: 'POST',
    path: '/enterprise/onboarding',
    auth: 'None',
    description: 'Submit an enterprise inquiry',
  },
  {
    method: 'GET',
    path: '/download/ankrshield.apk',
    auth: 'None',
    description: 'Download the AnkrShield Android APK',
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  POST: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  DELETE: 'bg-red-500/15 text-red-300 border border-red-500/30',
};

function RestApiTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.04] text-white/40 text-xs uppercase tracking-widest">
            <th className="px-4 py-3 text-left font-semibold w-16">Method</th>
            <th className="px-4 py-3 text-left font-semibold">Endpoint</th>
            <th className="px-4 py-3 text-left font-semibold w-44">Auth</th>
            <th className="px-4 py-3 text-left font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {REST_ENDPOINTS.map((ep, i) => (
            <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition">
              <td className="px-4 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${METHOD_COLORS[ep.method]}`}
                >
                  {ep.method}
                </span>
              </td>
              <td className="px-4 py-3">
                <code
                  style={{ background: '#0d1117', color: '#7ee787' }}
                  className="text-xs px-2 py-1 rounded font-mono"
                >
                  {ep.path}
                </code>
              </td>
              <td className="px-4 py-3 text-white/50 text-xs">{ep.auth}</td>
              <td className="px-4 py-3 text-white/70">{ep.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Env vars table ───────────────────────────────────────────────────────────
const ENV_VARS: { name: string; description: string }[] = [
  { name: 'DATABASE_URL', description: 'PostgreSQL connection string for the xShield database' },
  { name: 'ANKR_WIRE_URL', description: 'URL for the @ankr/wire notification broker' },
  {
    name: 'STRIPE_SECRET_KEY',
    description: 'Stripe secret key for billing (sk_live_... or sk_test_...)',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    description: 'Stripe webhook signing secret for /billing/webhook',
  },
  {
    name: 'APP_URL',
    description: 'Public base URL of your deployment (e.g. https://xshieldai.com)',
  },
  { name: 'PORT', description: 'HTTP port for the Warrior API server (default 4481)' },
  {
    name: 'APK_PATH',
    description: 'Filesystem path to the AnkrShield APK served at /download/ankrshield.apk',
  },
  { name: 'XSHIELD_URL', description: 'Internal URL when the web dashboard calls the Warrior API' },
];

function EnvTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.04] text-white/40 text-xs uppercase tracking-widest">
            <th className="px-4 py-3 text-left font-semibold">Variable</th>
            <th className="px-4 py-3 text-left font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {ENV_VARS.map((v, i) => (
            <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition">
              <td className="px-4 py-3">
                <code
                  style={{ background: '#0d1117', color: '#7ee787' }}
                  className="text-xs px-2 py-1 rounded font-mono"
                >
                  {v.name}
                </code>
              </td>
              <td className="px-4 py-3 text-white/60 text-sm">{v.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sidebar ToC ──────────────────────────────────────────────────────────────
const TOC = [
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'rest-api', label: 'REST API Reference' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'sdk', label: 'AnkrShield SDK' },
  { id: 'env-vars', label: 'Environment Variables' },
];

function Sidebar() {
  return (
    <aside className="hidden xl:block w-56 shrink-0">
      <div className="sticky top-10">
        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">
          On this page
        </p>
        <ul className="space-y-2">
          {TOC.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-sm text-white/50 hover:text-cyan-400 transition block py-0.5"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
          <a
            href="https://github.com/xshieldai/warrior"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-white/30 hover:text-white/60 transition"
          >
            GitHub Repository
          </a>
          <a
            href="mailto:support@xshieldai.com"
            className="block text-xs text-white/30 hover:text-white/60 transition"
          >
            support@xshieldai.com
          </a>
        </div>
      </div>
    </aside>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Docs() {
  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      <Nav />

      <div className="max-w-7xl mx-auto px-6 py-12 flex gap-12">
        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Page title */}
          <div className="mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest bg-cyan-500/15 border-cyan-500/40 text-cyan-300 mb-4">
              Documentation
            </span>
            <h1 className="text-4xl font-black tracking-tight">xShield Developer Docs</h1>
            <p className="mt-3 text-white/50 text-lg max-w-2xl">
              Everything you need to self-host the xShield Warrior, integrate with the REST API, run
              GraphQL queries, and embed the AnkrShield SDK.
            </p>
          </div>

          {/* ── 1. Quick Start ────────────────────────────────────────────── */}
          <SectionHeading id="quick-start">1. Quick Start</SectionHeading>
          <QuickStart />

          {/* ── 2. REST API Reference ─────────────────────────────────────── */}
          <SectionHeading id="rest-api">2. REST API Reference</SectionHeading>
          <p className="text-white/50 text-sm mb-4">
            All endpoints are available on{' '}
            <code className="text-cyan-400">https://xshieldai.com/api</code> or your self-hosted
            instance at <code className="text-cyan-400">http://localhost:4481</code>. Authenticated
            endpoints require an <code className="text-cyan-400">X-API-Key</code> header.
          </p>
          <RestApiTable />

          <SubHeading>Example — fetch a risk score</SubHeading>
          <CodeBlock lang="bash">
            {`curl "https://xshieldai.com/api/risk/score?domain=malware-test.example.com"`}
          </CodeBlock>
          <SubHeading>Example — AI narrative (API key required)</SubHeading>
          <CodeBlock lang="bash">
            {`curl "https://xshieldai.com/api/risk/narrative?domain=malware-test.example.com" \\
  -H "X-API-Key: xsh_your_key_here"`}
          </CodeBlock>

          {/* ── 3. GraphQL ────────────────────────────────────────────────── */}
          <SectionHeading id="graphql">3. GraphQL</SectionHeading>
          <p className="text-white/50 text-sm mb-4">
            The GraphQL endpoint is{' '}
            <code className="text-cyan-400">https://xshieldai.com/api/graphql</code>. Authenticated
            queries pass the API key as an <code className="text-cyan-400">X-API-Key</code> header.
          </p>

          <SubHeading>xshieldScan — unauthenticated risk scan</SubHeading>
          <CodeBlock lang="bash">
            {`curl -X POST https://xshieldai.com/api/graphql \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "query { xshieldScan(domain: \\"example.com\\") { domain riskScore riskLevel categories } }"
  }'`}
          </CodeBlock>

          <SubHeading>xshieldNarrative — AI narrative (STARTER+)</SubHeading>
          <CodeBlock lang="bash">
            {`curl -X POST https://xshieldai.com/api/graphql \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: xsh_your_key_here" \\
  -d '{
    "query": "query { xshieldNarrative(domain: \\"example.com\\") { narrative confidence } }"
  }'`}
          </CodeBlock>

          <SubHeading>xshieldBrandMonitor — brand protection</SubHeading>
          <CodeBlock lang="bash">
            {`curl -X POST https://xshieldai.com/api/graphql \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: xsh_your_key_here" \\
  -d '{
    "query": "query { xshieldBrandMonitor(brandTerms: \\"acme\\") { matches { domain similarity } } }"
  }'`}
          </CodeBlock>

          <SubHeading>xshieldTeams — team management</SubHeading>
          <CodeBlock lang="bash">
            {`curl -X POST https://xshieldai.com/api/graphql \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: xsh_your_key_here" \\
  -d '{
    "query": "query { xshieldTeams { id name members { email role } } }"
  }'`}
          </CodeBlock>

          {/* ── 4. AnkrShield SDK ─────────────────────────────────────────── */}
          <SectionHeading id="sdk">4. AnkrShield SDK</SectionHeading>
          <p className="text-white/50 text-sm mb-4">
            The AnkrShield mobile SDK provides a local IOC blocklist that syncs with the xShield
            feed. Use it inside your React Native app to check domains before making network
            requests.
          </p>

          <SubHeading>Blocklist sync</SubHeading>
          <CodeBlock lang="javascript">
            {`import { syncBlocklist, isDomainBlocked } from './services/ioc-sync';

// Pull the latest IOC feed from xShield (runs in the background every 6 hours)
await syncBlocklist();

// Check whether a domain is in the blocklist before resolving it
const blocked = isDomainBlocked('malware.example.com'); // → true | false

if (blocked) {
  console.warn('Domain is on the IOC blocklist — request blocked.');
}`}
          </CodeBlock>

          <SubHeading>Install (React Native)</SubHeading>
          <CodeBlock lang="bash">{`pnpm add @ankrshield/dns-resolver`}</CodeBlock>

          <SubHeading>Android APK direct download</SubHeading>
          <CodeBlock lang="bash">
            {`curl -L https://xshieldai.com/api/download/ankrshield.apk -o AnkrShield.apk
adb install AnkrShield.apk`}
          </CodeBlock>

          {/* ── 5. Environment Variables ──────────────────────────────────── */}
          <SectionHeading id="env-vars">5. Environment Variables</SectionHeading>
          <p className="text-white/50 text-sm mb-4">
            Copy <code className="text-cyan-400">.env.example</code> to{' '}
            <code className="text-cyan-400">.env</code> in your Warrior root and populate these
            values before starting the server.
          </p>
          <EnvTable />
          <CodeBlock lang="bash">
            {`# Minimal .env for local development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xshield
APP_URL=http://localhost:4481
PORT=4481`}
          </CodeBlock>

          {/* Footer note */}
          <div className="mt-16 mb-4 p-5 rounded-xl border border-white/10 bg-white/[0.02]">
            <p className="text-white/40 text-sm">
              xShield Warrior is open source under the{' '}
              <span className="text-cyan-400 font-semibold">Apache 2.0 licence</span>. Contributions
              welcome.{' '}
              <a
                href="https://github.com/xshieldai/warrior"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                View on GitHub
              </a>
            </p>
          </div>
        </main>

        {/* Sidebar */}
        <Sidebar />
      </div>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/20">
        &copy; {new Date().getFullYear()} xShield AI. All rights reserved.
      </footer>
    </div>
  );
}
