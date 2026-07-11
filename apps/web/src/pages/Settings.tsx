/**
 * Settings Page — User configuration + integrations
 *
 * Sections:
 *   1. Slack Integration — connect / disconnect / test
 *   (More integrations can be added as cards below)
 */

import {
  CheckCircle,
  XCircle,
  Send,
  Trash2,
  ExternalLink,
  Download,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useState, useEffect } from 'react';

// ─── Slack section ────────────────────────────────────────────────────────────

interface SlackStatus {
  connected: boolean;
  webhookUrl?: string | null;
  updatedAt?: string;
}

function SlackIntegration() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const jwt = () => localStorage.getItem('jwt') ?? '';

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/slack', {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleSave() {
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      setMsg({
        type: 'error',
        text: 'Must be a Slack incoming webhook URL (starts with https://hooks.slack.com/)',
      });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/integrations/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ webhookUrl }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setMsg({ type: 'success', text: 'Slack webhook saved!' });
      setWebhookUrl('');
      await loadStatus();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/integrations/slack/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setMsg({ type: 'success', text: 'Test message sent to Slack!' });
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Remove Slack integration?')) return;
    setDisconnecting(true);
    setMsg(null);
    try {
      await fetch('/api/integrations/slack', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      setMsg({ type: 'success', text: 'Slack disconnected.' });
      await loadStatus();
    } catch {
      setMsg({ type: 'error', text: 'Disconnect failed' });
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-800 rounded-xl" />;
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Slack logo SVG */}
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
              fill="#4A154B"
            />
          </svg>
          <h2 className="text-lg font-semibold">Slack</h2>
        </div>
        {status?.connected ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
            <CheckCircle className="w-4 h-4" /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <XCircle className="w-4 h-4" /> Not connected
          </span>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Connected state */}
        {status?.connected && (
          <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-300">
                Webhook: <span className="font-mono text-gray-400">{status.webhookUrl}</span>
              </p>
              {status.updatedAt && (
                <p className="text-xs text-gray-600 mt-1">
                  Updated {new Date(status.updatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => void handleTest()}
                disabled={testing}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Send className="w-3.5 h-3.5" />
                {testing ? 'Sending…' : 'Test'}
              </button>
              <button
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950 disabled:opacity-40 px-3 py-1.5 rounded-lg border border-red-500/20 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {disconnecting ? 'Removing…' : 'Disconnect'}
              </button>
            </div>
          </div>
        )}

        {/* Connect / update form */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            {status?.connected ? 'Update webhook URL' : 'Incoming webhook URL'}
          </label>
          <div className="flex gap-3">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition font-mono"
            />
            <button
              onClick={() => void handleSave()}
              disabled={saving || !webhookUrl}
              className="bg-[#4A154B] hover:bg-[#611f5a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition whitespace-nowrap"
            >
              {saving ? 'Saving…' : status?.connected ? 'Update' : 'Connect'}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Create a webhook in your Slack workspace:{' '}
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              api.slack.com/messaging/webhooks <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {/* What you'll get */}
        {!status?.connected && (
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">
              You&apos;ll receive alerts when:
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>📈 A watched domain risk score changes by ≥10 points</li>
              <li>🎭 A new lookalike / typosquat domain is detected</li>
              <li>⚠️ SPF, DMARC, or CAA DNS records go missing</li>
              <li>🎣 A phishing URL pointing to your domain appears</li>
              <li>🔓 A new credential breach is found</li>
              <li>🔴 Your server IP appears in GreyNoise / OTX threat feeds</li>
            </ul>
          </div>
        )}

        {/* Message */}
        {msg && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              msg.type === 'success'
                ? 'bg-green-950 border border-green-500/30 text-green-300'
                : 'bg-red-950 border border-red-500/30 text-red-300'
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Data & Privacy section ───────────────────────────────────────────────────

interface DataSummary {
  apiKeys: number;
  domainWatches: number;
  scanHistory: number;
  onDevice: string[];
  serverSide: string[];
  subProcessors: { name: string; purpose: string; region: string; policy: string }[];
}

function DataPrivacy() {
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const jwt = () => localStorage.getItem('jwt') ?? '';

  useEffect(() => {
    fetch('/api/account/data-summary', { headers: { Authorization: `Bearer ${jwt()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSummary(d))
      .catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/account/export', {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'xshield-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg({ type: 'error', text: 'Export failed — try again.' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        'This will permanently delete your account, all API keys, domain watches, and scan history.\n\nThis cannot be undone. Type "DELETE" to confirm.'
      )
    )
      return;
    const confirm = window.prompt('Type DELETE to confirm:');
    if (confirm !== 'DELETE') return;

    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      localStorage.clear();
      window.location.href = '/';
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Deletion failed' });
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* What we hold */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold">Data We Hold</h2>
        </div>
        <div className="p-6 space-y-4">
          {summary ? (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                ['API Keys', summary.apiKeys],
                ['Watched Domains', summary.domainWatches],
                ['Scan Records', summary.scanHistory],
              ].map(([label, val]) => (
                <div key={label as string} className="bg-gray-800 rounded-lg px-4 py-3 text-center">
                  <div className="text-xl font-bold text-white">{val}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="animate-pulse h-16 bg-gray-800 rounded-lg mb-4" />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-2">
                Stays on your device
              </p>
              <ul className="space-y-1">
                {(
                  summary?.onDevice ?? [
                    'DNS filtering',
                    'Phone risk (free tier)',
                    'SMS analysis',
                    'Permission scan',
                    'Alert classification',
                  ]
                ).map((item) => (
                  <li key={item} className="text-xs text-gray-400 flex items-start gap-1.5">
                    <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-2">
                Sent to our server (paid)
              </p>
              <ul className="space-y-1">
                {(
                  summary?.serverSide ?? [
                    'Domain watch alerts',
                    'Crowd phone risk confidence',
                    'CT live stream',
                    'AI threat narrative',
                  ]
                ).map((item) => (
                  <li key={item} className="text-xs text-gray-400 flex items-start gap-1.5">
                    <span className="text-violet-400 mt-0.5 shrink-0">›</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-processors */}
      {summary?.subProcessors && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold">Sub-Processors</h2>
            <p className="text-xs text-gray-500 mt-1">
              Third-party APIs called during a domain scan. All are industry-standard security
              intelligence services.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Service', 'Purpose', 'Region', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.subProcessors.map((sp) => (
                  <tr key={sp.name} className="border-b border-gray-800/50">
                    <td className="px-6 py-3 font-medium text-white">{sp.name}</td>
                    <td className="px-6 py-3 text-gray-400">{sp.purpose}</td>
                    <td className="px-6 py-3 text-gray-500">{sp.region}</td>
                    <td className="px-6 py-3">
                      <a
                        href={sp.policy}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        Privacy Policy <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Your rights */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">Your Rights (DPDP Act 2023)</h2>
          <p className="text-xs text-gray-500 mt-1">
            India's Digital Personal Data Protection Act gives you the following rights.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Preparing…' : 'Export My Data'}
            </button>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-semibold px-4 py-2.5 rounded-lg text-sm transition"
            >
              <ExternalLink className="w-4 h-4" />
              Privacy Policy
            </a>
            <a
              href="mailto:privacy@xshieldai.com"
              className="flex items-center gap-2 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-semibold px-4 py-2.5 rounded-lg text-sm transition"
            >
              Grievance Officer
            </a>
          </div>
          <p className="text-xs text-gray-600">
            Data export delivered as JSON within seconds. Deletion requests are processed
            immediately. Grievance Officer response within 30 days as required by DPDP Act Section
            13.
          </p>

          {msg && (
            <div
              className={`rounded-lg px-4 py-3 text-sm font-medium ${msg.type === 'success' ? 'bg-green-950 border border-green-500/30 text-green-300' : 'bg-red-950 border border-red-500/30 text-red-300'}`}
            >
              {msg.text}
            </div>
          )}

          {/* Danger zone */}
          <div className="mt-4 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold text-red-400">Danger Zone</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Permanently delete your account, all API keys, domain watches, and scan history. This
              cannot be undone.
            </p>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950 disabled:opacity-40 px-3 py-2 rounded-lg border border-red-500/30 transition font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? 'Deleting…' : 'Delete My Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState<'integrations' | 'privacy'>('integrations');

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">
          Configure integrations, alerts, and privacy preferences.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {(
          [
            ['integrations', 'Integrations'],
            ['privacy', 'Data & Privacy'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
              tab === key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'integrations' && (
        <section className="space-y-4">
          <SlackIntegration />
          {(['WhatsApp', 'Telegram', 'Jira', 'PagerDuty'] as const).map((name) => (
            <div
              key={name}
              className="bg-gray-900 border border-gray-800 rounded-xl px-6 py-4 flex items-center justify-between opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded bg-gray-700" />
                <span className="font-medium">{name}</span>
              </div>
              <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">
                Coming soon
              </span>
            </div>
          ))}
        </section>
      )}

      {tab === 'privacy' && <DataPrivacy />}
    </div>
  );
}
