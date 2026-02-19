/**
 * Onboarding Wizard — 3-step post-signup flow
 *
 *  Step 1 — Scan your domain      → GET /risk/score → show score
 *  Step 2 — Set up alerts         → save Slack webhook (optional)
 *  Step 3 — Enable monitoring     → POST /watch/domain
 *  Done   — "You're protected"    → links to report + dashboard
 */

import {
  Shield,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Bell,
  Eye,
  Zap,
  ChevronRight,
  ExternalLink,
  SkipForward,
} from 'lucide-react';
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useUser } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL ?? 'https://xshieldai.com/api';

// ── Shared helpers ────────────────────────────────────────────────────────────

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('ankrshield_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
}

// ── Score colour / label helpers ──────────────────────────────────────────────

function scoreColor(level: string) {
  if (level === 'MINIMAL')
    return {
      ring: 'ring-green-500',
      text: 'text-green-400',
      bg: 'bg-green-500/10',
      label: 'text-green-300',
    };
  if (level === 'LOW')
    return {
      ring: 'ring-yellow-500',
      text: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      label: 'text-yellow-300',
    };
  if (level === 'MEDIUM')
    return {
      ring: 'ring-orange-500',
      text: 'text-orange-400',
      bg: 'bg-orange-500/10',
      label: 'text-orange-300',
    };
  if (level === 'HIGH')
    return {
      ring: 'ring-red-500',
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      label: 'text-red-300',
    };
  return { ring: 'ring-red-600', text: 'text-red-300', bg: 'bg-red-600/10', label: 'text-red-200' };
}

function scoreEmoji(level: string) {
  if (level === 'MINIMAL') return '🟢';
  if (level === 'LOW') return '🟡';
  if (level === 'MEDIUM') return '🟠';
  if (level === 'HIGH') return '🔴';
  return '🚨';
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex items-center gap-2 mb-10">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                done
                  ? 'bg-blue-600 text-white'
                  : active
                    ? 'bg-blue-600 text-white ring-4 ring-blue-500/30'
                    : 'bg-gray-800 text-gray-500 border border-gray-700'
              }`}
            >
              {done ? <CheckCircle2 className="w-4 h-4" /> : n}
            </div>
            {n < total && (
              <div className={`flex-1 h-0.5 ${done ? 'bg-blue-600' : 'bg-gray-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Scan your domain ──────────────────────────────────────────────────

interface ScanResult {
  domain: string;
  riskScore: number;
  riskLevel: string;
  factorCount: number;
  durationMs: number;
}

function Step1({ onComplete }: { onComplete: (domain: string, result: ScanResult) => void }) {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleScan = async (e?: FormEvent) => {
    e?.preventDefault();
    const d = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!d) return setError('Enter your domain, e.g. yourcompany.com');
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res = await authFetch(`/risk/score?domain=${encodeURIComponent(d)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ScanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed — try again');
    } finally {
      setLoading(false);
    }
  };

  const c = result ? scoreColor(result.riskLevel) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">What domain do you want to protect?</h2>
        <p className="text-gray-400">
          We'll scan it across 13 threat intelligence sources and show you your risk score in
          seconds.
        </p>
      </div>

      <form onSubmit={(e) => void handleScan(e)} className="flex gap-3">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="yourcompany.com"
          disabled={loading}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition text-sm"
        />
        <button
          type="submit"
          disabled={loading || !domain.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl text-sm transition whitespace-nowrap"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Scan Now
            </>
          )}
        </button>
      </form>

      {/* Scanning animation */}
      {loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="relative">
              <Shield className="w-12 h-12 text-blue-400 animate-pulse" />
              <Loader2 className="w-5 h-5 text-blue-300 animate-spin absolute -bottom-1 -right-1" />
            </div>
          </div>
          <p className="text-sm text-gray-400">Scanning 13 threat intelligence sources…</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-600">
            {[
              'GreyNoise',
              'AlienVault OTX',
              'Shodan',
              'HIBP',
              'urlscan.io',
              'crt.sh',
              'SPF/DMARC',
              'OpenPhish',
              'Feodo Tracker',
            ].map((s) => (
              <span key={s} className="px-2 py-0.5 rounded bg-gray-800">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-950/40 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && c && (
        <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5`}>
          {/* Score ring */}
          <div className="flex items-center gap-6">
            <div
              className={`w-20 h-20 rounded-full ring-4 ${c.ring} ${c.bg} flex flex-col items-center justify-center shrink-0`}
            >
              <span className={`text-2xl font-black ${c.text}`}>{result.riskScore}</span>
              <span className="text-gray-500 text-xs">/ 100</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{scoreEmoji(result.riskLevel)}</span>
                <span className={`text-lg font-bold ${c.label}`}>{result.riskLevel}</span>
              </div>
              <p className="text-gray-400 text-sm">
                <span className="text-white font-medium">{result.domain}</span> ·{' '}
                {result.factorCount} risk factor{result.factorCount !== 1 ? 's' : ''} detected ·{' '}
                {result.durationMs ? `${(result.durationMs / 1000).toFixed(1)}s` : ''}
              </p>
            </div>
          </div>

          {/* Score guide */}
          <div className="grid grid-cols-5 gap-1 text-xs text-center">
            {[
              {
                range: '0–14',
                label: 'MINIMAL',
                active: result.riskLevel === 'MINIMAL',
                color: 'text-green-400 border-green-500/30 bg-green-500/5',
              },
              {
                range: '15–34',
                label: 'LOW',
                active: result.riskLevel === 'LOW',
                color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5',
              },
              {
                range: '35–54',
                label: 'MEDIUM',
                active: result.riskLevel === 'MEDIUM',
                color: 'text-orange-400 border-orange-500/30 bg-orange-500/5',
              },
              {
                range: '55–74',
                label: 'HIGH',
                active: result.riskLevel === 'HIGH',
                color: 'text-red-400 border-red-500/30 bg-red-500/5',
              },
              {
                range: '75–100',
                label: 'CRITICAL',
                active: result.riskLevel === 'CRITICAL',
                color: 'text-red-300 border-red-600/30 bg-red-600/5',
              },
            ].map(({ range, label, active, color }) => (
              <div
                key={label}
                className={`rounded border px-1 py-1.5 ${color} ${active ? 'ring-1 ring-white/20 font-bold' : 'opacity-40'}`}
              >
                <div className="font-mono text-[10px]">{range}</div>
                <div>{label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => onComplete(result.domain, result)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Set up alerts ─────────────────────────────────────────────────────

function Step2({
  userEmail,
  onComplete,
  onSkip,
}: {
  userEmail: string;
  onComplete: (slackUrl: string | null) => void;
  onSkip: () => void;
}) {
  const [slackUrl, setSlackUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const url = slackUrl.trim();

    if (url) {
      if (!url.startsWith('https://hooks.slack.com/')) {
        return setError('Slack webhook URLs start with https://hooks.slack.com/');
      }
      setSaving(true);
      setError('');
      try {
        const res = await authFetch('/integrations/slack', {
          method: 'POST',
          body: JSON.stringify({ webhookUrl: url }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save Slack integration');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    onComplete(url || null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Get notified instantly</h2>
        <p className="text-gray-400">
          xShield will alert you the moment a threat changes — typosquats, breaches, DNS tampering,
          phishing URLs.
        </p>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
        {/* Email — always on */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold">Email alerts</span>
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
              Always on
            </span>
          </div>
          <p className="text-sm text-gray-300 font-mono bg-gray-800/60 px-3 py-2 rounded-lg">
            {userEmail}
          </p>
          <p className="text-xs text-gray-500">Daily digest + critical-priority instant alerts.</p>
        </div>

        {/* Slack — optional */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#4A154B]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
            <span className="text-sm font-semibold">Slack</span>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              Optional
            </span>
          </div>
          <input
            type="url"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
          />
          <p className="text-xs text-gray-500">
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              How to create a Slack webhook <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-300 bg-red-950/30 border border-red-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Saving…' : slackUrl ? 'Save & Continue' : 'Continue'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </form>

      <button
        onClick={onSkip}
        className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition py-1"
      >
        <SkipForward className="w-4 h-4" />
        Skip for now
      </button>
    </div>
  );
}

// ── Step 3: Enable monitoring ─────────────────────────────────────────────────

function Step3({
  domain,
  scanResult,
  onComplete,
  onSkip,
}: {
  domain: string;
  scanResult: ScanResult;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState('');
  const c = scoreColor(scanResult.riskLevel);

  const handleEnable = async () => {
    setEnabling(true);
    setError('');
    try {
      const res = await authFetch('/watch/domain', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      if (!res.ok) {
        const d = await res.json();
        // 409 = already watching — that's fine
        if (res.status !== 409) throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable monitoring');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Start continuous monitoring</h2>
        <p className="text-gray-400">
          xShield will re-scan <span className="text-white font-medium">{domain}</span> every 5
          minutes and alert you on any change.
        </p>
      </div>

      {/* Domain card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-5">
        <div
          className={`w-16 h-16 rounded-full ring-4 ${c.ring} ${c.bg} flex flex-col items-center justify-center shrink-0`}
        >
          <span className={`text-xl font-black ${c.text}`}>{scanResult.riskScore}</span>
          <span className="text-gray-500 text-[10px]">/ 100</span>
        </div>
        <div>
          <p className="font-bold text-white">{domain}</p>
          <p className={`text-sm font-semibold ${c.label}`}>
            {scoreEmoji(scanResult.riskLevel)} {scanResult.riskLevel}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {scanResult.factorCount} risk factors · scanned just now
          </p>
        </div>
      </div>

      {/* What gets monitored */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-400" />
          What gets checked every 5 minutes
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            'Risk score changes ≥10pts',
            'New lookalike / typosquat domains',
            'SPF / DMARC / CAA removed',
            'New phishing URLs detected',
            'IP listed on threat feeds',
            'New credential breach records',
            'New SSL certificates (crt.sh)',
            'Paste site / data leak appearances',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-xs text-gray-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-950/30 border border-red-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={() => void handleEnable()}
        disabled={enabling}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm"
      >
        {enabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
        {enabling ? 'Enabling…' : 'Enable Monitoring'}
      </button>

      <button
        onClick={onSkip}
        className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition py-1"
      >
        <SkipForward className="w-4 h-4" />
        I'll do this later
      </button>
    </div>
  );
}

// ── Done screen ───────────────────────────────────────────────────────────────

function DoneScreen({ domain, scanResult }: { domain: string; scanResult: ScanResult }) {
  const navigate = useNavigate();
  const c = scoreColor(scanResult.riskLevel);

  return (
    <div className="text-center space-y-8">
      {/* Animated checkmark */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-green-500/10 ring-4 ring-green-500/40 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
          </div>
          {/* Pulse rings */}
          <div className="absolute inset-0 rounded-full ring-4 ring-green-400/20 animate-ping" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-white">You're protected</h2>
        <p className="text-gray-400">
          <span className="text-white font-medium">{domain}</span> is now under continuous
          monitoring.
        </p>
      </div>

      {/* Score card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-5 text-left max-w-sm mx-auto">
        <div
          className={`w-16 h-16 rounded-full ring-4 ${c.ring} ${c.bg} flex flex-col items-center justify-center shrink-0`}
        >
          <span className={`text-xl font-black ${c.text}`}>{scanResult.riskScore}</span>
          <span className="text-gray-500 text-[10px]">/ 100</span>
        </div>
        <div>
          <p className="font-bold text-white">{domain}</p>
          <p className={`text-sm font-semibold ${c.label}`}>
            {scoreEmoji(scanResult.riskLevel)} {scanResult.riskLevel} risk
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {scanResult.factorCount} risk factors found
          </p>
        </div>
      </div>

      {/* What happens next */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-left space-y-2">
        <p className="text-sm font-semibold text-gray-300 mb-3">What happens next</p>
        {[
          { icon: '🔍', text: 'Full report with all 13 sources is available on your dashboard' },
          { icon: '⏰', text: 'Continuous scans run every 5 minutes — alerts fired on change' },
          { icon: '🛡️', text: 'One-click remediation playbooks ready for any open finding' },
          { icon: '📊', text: 'Add more domains or set up integrations from Settings' },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-start gap-3 text-sm text-gray-400">
            <span>{icon}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={`${API_URL}/risk/report?domain=${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold py-3 rounded-xl transition text-sm"
        >
          View full report
          <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition text-sm"
        >
          Go to Dashboard
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 'done';

const STEP_LABELS = ['Scan domain', 'Set up alerts', 'Enable monitoring'];

export default function Onboarding() {
  const navigate = useNavigate();
  const user = useUser();

  const [step, setStep] = useState<WizardStep>(1);
  const [domain, setDomain] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const handleStep1 = (d: string, result: ScanResult) => {
    setDomain(d);
    setScanResult(result);
    setStep(2);
  };

  const handleStep2 = () => setStep(3);
  const handleStep3 = () => setStep('done');

  const stepNum = step === 'done' ? 4 : (step as number);

  return (
    <div className="min-h-screen bg-[#080c14] text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-7 h-7 text-blue-400" />
          <span className="text-lg font-bold">xShield</span>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-300 transition flex items-center gap-1.5"
        >
          <SkipForward className="w-4 h-4" />
          Skip setup
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <p className="text-gray-400 text-sm mb-2">
              Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! Let's get you set up.
            </p>
            {step !== 'done' && (
              <p className="text-xs text-gray-600">
                Step {stepNum} of 3 — {STEP_LABELS[(stepNum as number) - 1]}
              </p>
            )}
          </div>

          {/* Progress */}
          {step !== 'done' && <ProgressBar step={stepNum as number} />}

          {/* Step content */}
          <div className="bg-[#0d1117] border border-gray-800 rounded-2xl p-8 shadow-2xl">
            {step === 1 && <Step1 onComplete={handleStep1} />}
            {step === 2 && (
              <Step2 userEmail={user?.email ?? ''} onComplete={handleStep2} onSkip={handleStep2} />
            )}
            {step === 3 && scanResult && (
              <Step3
                domain={domain}
                scanResult={scanResult}
                onComplete={handleStep3}
                onSkip={handleStep3}
              />
            )}
            {step === 'done' && scanResult && (
              <DoneScreen domain={domain} scanResult={scanResult} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
