/**
 * Developer Portal — public page
 *
 * Sections (anchor-linked from left nav):
 *   #quickstart  — 30-second curl example + API key CTA
 *   #examples    — language tabs: curl | Python | Node.js | Go
 *   #endpoints   — reference table
 *   #explorer    — live API try-it panel (calls real API from browser)
 *   #webhooks    — setup guide + example payload
 *   #cicd        — GitHub Actions integration walkthrough
 */

import {
  Terminal,
  Zap,
  Globe,
  Key,
  Webhook,
  GitBranch,
  Copy,
  Check,
  Play,
  ChevronRight,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL ?? 'https://xshieldai.com/api';

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={() => void copy()}
      className="absolute top-3 right-3 p-1.5 rounded bg-gray-700/60 hover:bg-gray-600 text-gray-400 hover:text-white transition"
      title="Copy"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────

function Code({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="relative">
      <pre className="bg-[#0d1117] border border-gray-800 rounded-xl p-5 text-sm font-mono text-gray-300 overflow-x-auto leading-relaxed">
        <code>{children.trim()}</code>
      </pre>
      <CopyBtn text={children.trim()} />
      <span className="absolute bottom-3 right-12 text-[10px] text-gray-600 uppercase tracking-widest">
        {lang}
      </span>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 p-2 rounded-lg bg-blue-500/10 text-blue-400">{icon}</span>
        <div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          {subtitle && <p className="text-gray-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// ── Language examples ─────────────────────────────────────────────────────────

const LANG_EXAMPLES: Record<string, { label: string; lang: string; code: string }> = {
  curl: {
    label: 'curl',
    lang: 'bash',
    code: `# Full 13-source risk report
curl "https://xshieldai.com/api/risk/report?domain=example.com" \\
  -H "Authorization: Bearer xsh_live_YOUR_KEY"

# Lightweight score only (faster, use for CI gates)
curl "https://xshieldai.com/api/risk/score?domain=example.com" \\
  -H "Authorization: Bearer xsh_live_YOUR_KEY"`,
  },
  python: {
    label: 'Python',
    lang: 'python',
    code: `import requests

API_KEY = "xsh_live_YOUR_KEY"
BASE    = "https://xshieldai.com/api"

def scan(domain: str) -> dict:
    resp = requests.get(
        f"{BASE}/risk/report",
        params={"domain": domain},
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

report = scan("example.com")
print(f"Risk score : {report['score']}/100")
print(f"Risk level : {report['level']}")
print(f"Narrative  : {report['narrative'][:120]}…")`,
  },
  node: {
    label: 'Node.js',
    lang: 'javascript',
    code: `const BASE    = "https://xshieldai.com/api";
const API_KEY = process.env.XSHIELD_API_KEY;

async function scan(domain) {
  const res = await fetch(\`\${BASE}/risk/report?domain=\${domain}\`, {
    headers: { Authorization: \`Bearer \${API_KEY}\` },
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}

const report = await scan("example.com");
console.log(\`Score: \${report.score}/100 — \${report.level}\`);

// Fail a deployment if score is too high
if (report.score > 70) process.exit(1);`,
  },
  go: {
    label: 'Go',
    lang: 'go',
    code: `package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "os"
)

func main() {
    req, _ := http.NewRequest("GET",
        "https://xshieldai.com/api/risk/score?domain=example.com", nil)
    req.Header.Set("Authorization", "Bearer "+os.Getenv("XSHIELD_API_KEY"))

    resp, err := http.DefaultClient.Do(req)
    if err != nil { panic(err) }
    defer resp.Body.Close()

    var result map[string]any
    json.NewDecoder(resp.Body).Decode(&result)
    fmt.Printf("Score: %v/100\\n", result["score"])
}`,
  },
};

function LangExamples() {
  const [active, setActive] = useState('curl');
  const ex = LANG_EXAMPLES[active];
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {Object.entries(LANG_EXAMPLES).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              active === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Code lang={ex.lang}>{ex.code}</Code>
    </div>
  );
}

// ── Endpoint reference table ──────────────────────────────────────────────────

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/risk/score',
    desc: 'Lightweight 0–100 risk score (fast, ideal for CI gates)',
    auth: 'Optional',
  },
  {
    method: 'GET',
    path: '/risk/report',
    desc: 'Full 13-source risk report with AI narrative',
    auth: 'Optional',
  },
  {
    method: 'GET',
    path: '/risk/ip/:ip',
    desc: 'IP reputation: GreyNoise + OTX + ASN + hosting risk',
    auth: 'Optional',
  },
  {
    method: 'GET',
    path: '/risk/breach',
    desc: 'Credential breach check (HIBP) — ?email=…',
    auth: 'Optional',
  },
  {
    method: 'GET',
    path: '/risk/typosquats',
    desc: 'Live lookalike/typosquat domains — ?domain=…',
    auth: 'Optional',
  },
  {
    method: 'GET',
    path: '/risk/github',
    desc: 'GitHub secret exposure scan — ?org=…',
    auth: 'Required',
  },
  {
    method: 'POST',
    path: '/watch/domain',
    desc: 'Add domain to continuous 5-minute monitoring',
    auth: 'Required',
  },
  {
    method: 'GET',
    path: '/watch/domains',
    desc: 'List all watched domains with latest scores',
    auth: 'Required',
  },
  {
    method: 'DELETE',
    path: '/watch/domain/:domain',
    desc: 'Remove a domain from monitoring',
    auth: 'Required',
  },
  {
    method: 'GET',
    path: '/risk/report/:id/playbook',
    desc: 'One-click remediation playbook for a report',
    auth: 'Required',
  },
  { method: 'POST', path: '/auth/api-keys', desc: 'Create a new API key', auth: 'JWT' },
  { method: 'GET', path: '/auth/api-keys', desc: 'List API keys with usage stats', auth: 'JWT' },
  { method: 'DELETE', path: '/auth/api-keys/:id', desc: 'Revoke an API key', auth: 'JWT' },
];

const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-blue-950 text-blue-300 border-blue-500/20',
  POST: 'bg-green-950 text-green-300 border-green-500/20',
  DELETE: 'bg-red-950 text-red-300 border-red-500/20',
  PUT: 'bg-yellow-950 text-yellow-300 border-yellow-500/20',
};

function EndpointTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            <th className="px-5 py-3 text-left">Method</th>
            <th className="px-5 py-3 text-left">Endpoint</th>
            <th className="px-5 py-3 text-left">Description</th>
            <th className="px-5 py-3 text-left">Auth</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {ENDPOINTS.map(({ method, path, desc, auth }) => (
            <tr key={path + method} className="bg-gray-900/50 hover:bg-gray-800/50 transition">
              <td className="px-5 py-3">
                <span
                  className={`font-mono font-bold text-xs px-2 py-0.5 rounded border ${METHOD_STYLE[method] ?? ''}`}
                >
                  {method}
                </span>
              </td>
              <td className="px-5 py-3">
                <code className="font-mono text-blue-300 text-xs">{path}</code>
              </td>
              <td className="px-5 py-3 text-gray-400">{desc}</td>
              <td className="px-5 py-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    auth === 'Required'
                      ? 'bg-amber-950/60 text-amber-300'
                      : auth === 'JWT'
                        ? 'bg-purple-950/60 text-purple-300'
                        : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {auth}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-3 bg-gray-900 border-t border-gray-800 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          <strong className="text-amber-300">Required</strong> = API key (
          <code className="text-gray-300">xsh_live_…</code>). &nbsp;
          <strong className="text-purple-300">JWT</strong> = dashboard session token. &nbsp;
          <strong className="text-gray-400">Optional</strong> = works without key (free tier, 10
          req/month IP-limited).
        </p>
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
        >
          Full Swagger reference <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

// ── Interactive Explorer ───────────────────────────────────────────────────────

const EXPLORER_ENDPOINTS = [
  { label: 'Risk Score  (fast)', path: '/risk/score', param: 'domain', placeholder: 'example.com' },
  {
    label: 'Full Report (detailed)',
    path: '/risk/report',
    param: 'domain',
    placeholder: 'example.com',
  },
  {
    label: 'IP Reputation',
    path: '/risk/ip/',
    param: 'ip',
    placeholder: '8.8.8.8',
    pathParam: true,
  },
  { label: 'Breach Check', path: '/risk/breach', param: 'email', placeholder: 'user@example.com' },
  {
    label: 'Typosquats',
    path: '/risk/typosquats',
    param: 'domain',
    placeholder: 'yourcompany.com',
  },
];

function Explorer() {
  const [endpointIdx, setEndpointIdx] = useState(0);
  const [paramValue, setParamValue] = useState('example.com');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ status: number; body: unknown } | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ep = EXPLORER_ENDPOINTS[endpointIdx];

  const handleEndpointChange = (idx: number) => {
    setEndpointIdx(idx);
    setParamValue(EXPLORER_ENDPOINTS[idx].placeholder);
    setResponse(null);
    setElapsed(null);
  };

  const handleTry = async () => {
    if (!paramValue.trim()) return;
    setLoading(true);
    setResponse(null);
    setElapsed(null);

    const token = localStorage.getItem('ankrshield_token');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url: string;
    if (ep.pathParam) {
      url = `${API_URL}${ep.path}${encodeURIComponent(paramValue.trim())}`;
    } else {
      url = `${API_URL}${ep.path}?${ep.param}=${encodeURIComponent(paramValue.trim())}`;
    }

    const t0 = performance.now();
    try {
      const res = await fetch(url, { headers });
      const body = await res.json().catch(() => ({ error: 'Non-JSON response' }));
      setElapsed(Math.round(performance.now() - t0));
      setResponse({ status: res.status, body });
    } catch (err) {
      setElapsed(Math.round(performance.now() - t0));
      setResponse({
        status: 0,
        body: { error: err instanceof Error ? err.message : 'Network error' },
      });
    } finally {
      setLoading(false);
    }
  };

  const statusColor =
    response === null
      ? ''
      : response.status >= 200 && response.status < 300
        ? 'text-green-400'
        : response.status === 429
          ? 'text-amber-400'
          : 'text-red-400';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-5 py-3 bg-gray-900 border-b border-gray-800">
        <span className="w-3 h-3 rounded-full bg-red-500/70" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <span className="w-3 h-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-xs text-gray-500 font-mono">xShield API Explorer</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Endpoint selector */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={endpointIdx}
            onChange={(e) => handleEndpointChange(Number(e.target.value))}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition font-mono"
          >
            {EXPLORER_ENDPOINTS.map((e, i) => (
              <option key={e.path} value={i}>
                GET {e.path.replace('/', ' /')} — {e.label}
              </option>
            ))}
          </select>
        </div>

        {/* Param input + send */}
        <div className="flex gap-3">
          <div className="flex-1 flex items-center bg-gray-800 border border-gray-700 rounded-lg px-3 focus-within:border-blue-500 transition">
            <span className="text-gray-500 text-sm mr-2 font-mono shrink-0">{ep.param}=</span>
            <input
              ref={inputRef}
              type="text"
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleTry()}
              placeholder={ep.placeholder}
              className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none font-mono"
            />
          </div>
          <button
            onClick={() => void handleTry()}
            disabled={loading || !paramValue.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition whitespace-nowrap"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Scanning…' : 'Send Request'}
          </button>
        </div>

        {/* Token notice */}
        {!localStorage.getItem('ankrshield_token') && (
          <p className="text-xs text-amber-400/80">
            Not signed in — using free tier (10 requests/month per IP).{' '}
            <Link to="/login" className="underline hover:text-amber-300">
              Sign in
            </Link>{' '}
            to use your API key.
          </p>
        )}

        {/* Response */}
        {(response !== null || loading) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-widest">Response</span>
              {response && (
                <div className="flex items-center gap-3 text-xs">
                  <span className={`font-mono font-bold ${statusColor}`}>
                    HTTP {response.status || 'ERR'}
                  </span>
                  {elapsed !== null && <span className="text-gray-500">{elapsed} ms</span>}
                </div>
              )}
            </div>
            <div className="relative">
              <pre className="bg-[#0d1117] border border-gray-800 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-auto max-h-96 leading-relaxed">
                {loading
                  ? '// Scanning 13 threat intelligence sources…'
                  : JSON.stringify(response?.body, null, 2)}
              </pre>
              {response && <CopyBtn text={JSON.stringify(response.body, null, 2)} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Webhooks section ──────────────────────────────────────────────────────────

const WEBHOOK_PAYLOAD = `{
  "event": "domain.alert",
  "domain": "example.com",
  "alertType": "score_change",
  "previousValue": "34",
  "newValue": "67",
  "riskScore": 67,
  "level": "HIGH",
  "triggeredAt": "2026-02-19T14:30:00Z",
  "reportUrl": "https://xshieldai.com/api/risk/report?domain=example.com",
  "remediation": "https://xshieldai.com/api/risk/report/abc123/playbook"
}`;

const WEBHOOK_VERIFY = `import crypto from 'node:crypto';

// Verify the webhook signature (HMAC-SHA256 of raw body)
export function verifyWebhook(rawBody: Buffer, sigHeader: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(\`sha256=\${expected}\`),
    Buffer.from(sigHeader),
  );
}`;

// ── CI/CD section ─────────────────────────────────────────────────────────────

const CICD_YAML = `name: Security Scan

on:
  push:
    branches: [main]
  pull_request:

jobs:
  risk-scan:
    name: xShield Domain Risk Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Scan domain for threats
        id: xshield
        uses: ankrlabs/xshield-scan@v1
        with:
          domain: 'yourcompany.com'
          api-key: \${{ secrets.XSHIELD_API_KEY }}
          fail-threshold: '70'   # fail if score > 70

      - name: Print risk report
        if: always()
        run: |
          echo "Risk score : \${{ steps.xshield.outputs.risk-score }}"
          echo "Risk level : \${{ steps.xshield.outputs.risk-level }}"
          echo "Full report: \${{ steps.xshield.outputs.report-url }}"`;

// ── Left nav ──────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'quickstart', label: 'Quickstart', icon: <Zap className="w-4 h-4" /> },
  { id: 'examples', label: 'Code Examples', icon: <Terminal className="w-4 h-4" /> },
  { id: 'endpoints', label: 'API Reference', icon: <Globe className="w-4 h-4" /> },
  { id: 'explorer', label: 'Try It', icon: <Play className="w-4 h-4" /> },
  { id: 'webhooks', label: 'Webhooks', icon: <Webhook className="w-4 h-4" /> },
  { id: 'cicd', label: 'CI/CD', icon: <GitBranch className="w-4 h-4" /> },
];

function LeftNav({ active }: { active: string }) {
  return (
    <nav className="space-y-1">
      {NAV.map(({ id, label, icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
            active === id
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          {icon}
          {label}
        </a>
      ))}
      <div className="pt-4 border-t border-gray-800 mt-4 space-y-1">
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-white transition"
        >
          <ExternalLink className="w-4 h-4" />
          Swagger UI
        </a>
        <Link
          to="/api-keys"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-white transition"
        >
          <Key className="w-4 h-4" />
          My API Keys
        </Link>
      </div>
    </nav>
  );
}

// ── Rate limit table ──────────────────────────────────────────────────────────

function RateLimitTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 text-sm">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            <th className="px-5 py-3 text-left">Tier</th>
            <th className="px-5 py-3 text-left">Requests / month</th>
            <th className="px-5 py-3 text-left">Auth</th>
            <th className="px-5 py-3 text-left">Rate limit headers</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60 bg-gray-900/50">
          {[
            { tier: 'Free', req: '10 (IP-based)', auth: 'None', headers: 'Yes' },
            { tier: 'Starter', req: '500', auth: 'API key', headers: 'Yes' },
            { tier: 'Pro', req: 'Unlimited', auth: 'API key', headers: 'Yes' },
            { tier: 'Enterprise', req: 'Custom SLA', auth: 'API key', headers: 'Yes' },
          ].map((r) => (
            <tr key={r.tier}>
              <td className="px-5 py-3 font-medium text-white">{r.tier}</td>
              <td className="px-5 py-3 text-gray-400 font-mono">{r.req}</td>
              <td className="px-5 py-3 text-gray-400">{r.auth}</td>
              <td className="px-5 py-3 text-gray-400">{r.headers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Developers() {
  // Simple active-section tracker based on hash
  const [activeSection, setActiveSection] = useState('quickstart');

  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      {/* Top bar */}
      <header className="border-b border-gray-800 bg-[#080c14]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-400" />
            <span className="text-lg font-bold">xShield</span>
            <ChevronRight className="w-4 h-4 text-gray-600" />
            <span className="text-gray-400 text-sm">Developers</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"
            >
              Swagger <ExternalLink className="w-3 h-3" />
            </a>
            <Link
              to="/api-keys"
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Get API Key
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12 flex gap-12">
        {/* Left nav — sticky */}
        <aside className="w-52 shrink-0 hidden lg:block">
          <div className="sticky top-28">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 px-4">Contents</p>
            <LeftNav active={activeSection} />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-20" onScroll={() => {}}>
          {/* Hero */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
              <Terminal className="w-4 h-4" />
              Developer Documentation
            </div>
            <h1 className="text-4xl font-bold">Build on xShield in 30 seconds</h1>
            <p className="text-xl text-gray-400 max-w-2xl">
              REST API access to 13 threat intelligence sources — IP reputation, breach monitoring,
              typosquat detection, phishing feeds, DNS audits, and AI-generated risk narratives. No
              SDKs required.
            </p>
            <div className="flex gap-3 pt-2">
              <Link
                to="/register"
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg transition"
              >
                Start for free
              </Link>
              <a
                href="#explorer"
                className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold px-6 py-2.5 rounded-lg transition"
                onClick={() => setActiveSection('explorer')}
              >
                Try the API
              </a>
            </div>
          </div>

          {/* 1. Quickstart */}
          <Section
            id="quickstart"
            icon={<Zap className="w-5 h-5" />}
            title="Quickstart"
            subtitle="One curl command to get a full risk report."
          >
            <Code>{`curl "https://xshieldai.com/api/risk/score?domain=example.com" \\
  -H "Authorization: Bearer xsh_live_YOUR_KEY"`}</Code>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-sm font-semibold text-gray-300 mb-3">Example response</p>
              <Code lang="json">{`{
  "domain": "example.com",
  "score": 23,
  "level": "LOW",
  "checkedAt": "2026-02-19T14:30:00Z",
  "reportUrl": "https://xshieldai.com/api/risk/report?domain=example.com"
}`}</Code>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {[
                { label: 'Authentication', value: 'Bearer token in Authorization header' },
                { label: 'Base URL', value: 'https://xshieldai.com/api' },
                { label: 'Response format', value: 'JSON (application/json)' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs mb-1">{label}</p>
                  <p className="font-mono text-gray-200 text-xs">{value}</p>
                </div>
              ))}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-sm font-semibold text-gray-300 mb-3">
                Rate limit response headers
              </p>
              <Code>{`X-RateLimit-Limit: 500
X-RateLimit-Remaining: 482
X-RateLimit-Reset: 1740960000`}</Code>
              <p className="text-xs text-gray-500 mt-3">
                When the limit is exceeded, you receive{' '}
                <code className="text-gray-300">HTTP 429</code> with a{' '}
                <code className="text-gray-300">Retry-After</code> header and an upgrade link.
              </p>
            </div>

            <RateLimitTable />

            <div className="flex items-center gap-3">
              <Link
                to="/api-keys"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
              >
                <Key className="w-4 h-4" />
                Generate your API key
              </Link>
              <Link to="/pricing" className="text-sm text-gray-400 hover:text-white transition">
                View pricing →
              </Link>
            </div>
          </Section>

          {/* 2. Code examples */}
          <Section
            id="examples"
            icon={<Terminal className="w-5 h-5" />}
            title="Code Examples"
            subtitle="Copy-paste examples in your preferred language."
          >
            <LangExamples />

            <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 text-sm">
              <p className="text-amber-300 font-semibold mb-1">Never hardcode your API key</p>
              <p className="text-amber-200/70">
                Use environment variables (<code className="text-amber-200">XSHIELD_API_KEY</code>)
                or a secrets manager. Exposed keys are auto-revoked if detected by our GitHub secret
                scanner.
              </p>
            </div>
          </Section>

          {/* 3. Endpoint reference */}
          <Section
            id="endpoints"
            icon={<Globe className="w-5 h-5" />}
            title="API Reference"
            subtitle="All available endpoints. Full schemas and response examples in Swagger."
          >
            <EndpointTable />

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <p className="text-sm font-semibold text-gray-300">Risk score thresholds</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-center">
                {[
                  {
                    range: '0–14',
                    label: 'MINIMAL',
                    color: 'bg-green-900/40 border-green-500/30 text-green-300',
                  },
                  {
                    range: '15–34',
                    label: 'LOW',
                    color: 'bg-yellow-900/40 border-yellow-500/30 text-yellow-300',
                  },
                  {
                    range: '35–54',
                    label: 'MEDIUM',
                    color: 'bg-orange-900/40 border-orange-500/30 text-orange-300',
                  },
                  {
                    range: '55–74',
                    label: 'HIGH',
                    color: 'bg-red-900/40 border-red-500/30 text-red-300',
                  },
                  {
                    range: '75–100',
                    label: 'CRITICAL',
                    color: 'bg-red-950/60 border-red-500/40 text-red-200',
                  },
                ].map(({ range, label, color }) => (
                  <div key={label} className={`rounded-lg border px-3 py-2 ${color}`}>
                    <div className="font-mono font-bold">{range}</div>
                    <div className="opacity-80">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* 4. Interactive Explorer */}
          <Section
            id="explorer"
            icon={<Play className="w-5 h-5" />}
            title="Try It"
            subtitle="Call the live API directly from your browser. Free tier — no API key needed."
          >
            <Explorer />
          </Section>

          {/* 5. Webhooks */}
          <Section
            id="webhooks"
            icon={<Webhook className="w-5 h-5" />}
            title="Webhooks"
            subtitle="Get real-time alerts when a watched domain's risk changes."
          >
            <div className="space-y-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <p className="text-sm font-semibold text-gray-300">Setup</p>
                <ol className="space-y-3 text-sm text-gray-400">
                  {[
                    'Register a domain for continuous monitoring via POST /watch/domain',
                    'Provide your webhook URL — xShield will POST alerts to it within seconds of detection',
                    'Verify the signature using the HMAC-SHA256 header (X-XShield-Signature)',
                    'Respond with HTTP 200 within 5 seconds; failed deliveries retry 3× with exponential backoff',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-300 mb-2">Example webhook payload</p>
                <Code lang="json">{WEBHOOK_PAYLOAD}</Code>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-300 mb-2">
                  Signature verification (Node.js)
                </p>
                <Code lang="typescript">{WEBHOOK_VERIFY}</Code>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-sm font-semibold text-gray-300 mb-2">Alert types</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['score_change', 'Risk score changed by ≥10 points'],
                    ['new_typosquat', 'New lookalike domain registered'],
                    ['spf_removed', 'SPF record removed from DNS'],
                    ['dmarc_removed', 'DMARC record removed from DNS'],
                    ['phishing_found', 'Phishing URL pointing to your domain'],
                    ['new_breach', 'New credential breach record found'],
                    ['ip_threat', 'Your server IP appeared in threat feeds'],
                    ['caa_removed', 'CAA record removed — cert issuance risk'],
                  ].map(([type, desc]) => (
                    <div key={type} className="flex gap-2">
                      <code className="text-blue-300 shrink-0">{type}</code>
                      <span className="text-gray-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* 6. CI/CD */}
          <Section
            id="cicd"
            icon={<GitBranch className="w-5 h-5" />}
            title="CI/CD Integration"
            subtitle="Fail pull requests automatically if a domain's risk score is too high."
          >
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                {[
                  {
                    title: 'Zero setup',
                    desc: 'No Docker, no dependencies — pure bash + Python (always available on GitHub runners)',
                  },
                  {
                    title: 'Rich summary',
                    desc: 'Writes a Markdown table to the GitHub Step Summary with score, level, and report link',
                  },
                  {
                    title: 'Configurable threshold',
                    desc: 'Set fail-threshold to any score 0–100. Defaults to 70 (HIGH).',
                  },
                ].map(({ title, desc }) => (
                  <div key={title} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="font-semibold text-white mb-1">{title}</p>
                    <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>

              <Code lang="yaml">{CICD_YAML}</Code>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-sm font-semibold text-gray-300 mb-2">Action outputs</p>
                <div className="space-y-2 text-xs font-mono">
                  {[
                    ['risk-score', 'string', 'Numeric risk score, 0–100'],
                    ['risk-level', 'string', 'MINIMAL | LOW | MEDIUM | HIGH | CRITICAL'],
                    ['report-url', 'string', 'URL to the full JSON risk report'],
                  ].map(([name, type, desc]) => (
                    <div key={name} className="flex gap-3 text-gray-400">
                      <span className="text-blue-300 w-28 shrink-0">{name}</span>
                      <span className="text-gray-600 w-12 shrink-0">{type}</span>
                      <span>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/rocketlang/xshield-scan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
                >
                  <GitBranch className="w-4 h-4" />
                  View on GitHub
                </a>
                <Link
                  to="/api-keys"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
                >
                  <Key className="w-4 h-4" />
                  Get your API key
                </Link>
              </div>
            </div>
          </Section>

          {/* Bottom CTA */}
          <div className="border border-blue-500/20 bg-blue-500/5 rounded-2xl p-8 text-center space-y-4">
            <h3 className="text-2xl font-bold">Ready to build?</h3>
            <p className="text-gray-400">
              Free tier — 10 scans/month, no credit card. Upgrade when you need more.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                to="/register"
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition text-lg"
              >
                Start for free
              </Link>
              <Link to="/pricing" className="text-gray-400 hover:text-white transition">
                View pricing →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
