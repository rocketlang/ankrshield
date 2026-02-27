/**
 * API Keys Management Page
 *
 * Wired to xShield GraphQL:
 *  - xshieldApiKeyInfo  → current key details (tier, quota, prefix)
 *  - xshieldCreateApiKey mutation → create new key
 *  - REST /api/auth/api-keys (DELETE) → revoke key (REST endpoint)
 *
 * Auth: X-API-Key header via Apollo link (apollo.ts)
 */

import { useQuery, useMutation, gql } from '@apollo/client';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  ArrowUpRight,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { API_KEY_INFO_QUERY } from '../graphql/queries';

// ─── xShieldCreateApiKey mutation ─────────────────────────────────────────────

const CREATE_XSHIELD_KEY_MUTATION = gql`
  mutation CreateXShieldApiKey($name: String!, $tier: String) {
    xshieldCreateApiKey(name: $name, tier: $tier) {
      id
      name
      key
      keyPrefix
      tier
      monthlyQuota
      createdAt
    }
  }
`;

// ─── REST key list (separate from xshieldApiKeyInfo) ─────────────────────────
interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  tier: 'FREE' | 'STARTER' | 'PRO';
  monthlyRequestCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

// ─── Tier badge ───────────────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    FREE: 'bg-gray-700/60 text-gray-300',
    STARTER: 'bg-blue-900/50 text-blue-300 border border-blue-500/30',
    PRO: 'bg-violet-900/50 text-violet-300 border border-violet-500/30',
  };
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${styles[(tier ?? '').toUpperCase()] ?? styles.STARTER}`}
    >
      {tier}
    </span>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={() => void handleCopy()}
      className="ml-2 p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ─── Current key info panel (from GraphQL) ────────────────────────────────────
function CurrentKeyPanel() {
  const apiKey = localStorage.getItem('ankrshield_api_key');

  const { data, loading, error, refetch } = useQuery(API_KEY_INFO_QUERY, {
    skip: !apiKey,
  });

  const keyInfo = data?.xshieldApiKeyInfo ?? null;

  if (!apiKey) {
    return (
      <div className="bg-violet-950/20 border border-violet-500/30 rounded-xl p-6">
        <p className="text-sm text-gray-400">
          No API key connected.{' '}
          <a href="/dashboard" className="text-violet-400 hover:text-violet-300 underline">
            Connect one on the Dashboard
          </a>
          .
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-700 rounded w-1/3" />
        <div className="h-3 bg-gray-700 rounded w-1/2" />
        <div className="h-2 bg-gray-700 rounded-full" />
      </div>
    );
  }

  if (error || !keyInfo) {
    return (
      <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-5 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
        <span className="text-sm text-red-300">
          Could not load key info: {error?.message ?? 'Unknown error'}.{' '}
          <button onClick={() => void refetch()} className="underline hover:no-underline">
            Retry
          </button>
        </span>
      </div>
    );
  }

  const quotaPercent =
    keyInfo.monthlyQuota > 0
      ? Math.min(100, Math.round((keyInfo.usedThisMonth / keyInfo.monthlyQuota) * 100))
      : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{keyInfo.name || 'Unnamed Key'}</p>
          <p className="text-sm text-gray-400">{keyInfo.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <TierBadge tier={keyInfo.tier} />
          {!keyInfo.isActive && (
            <span className="text-xs text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
              Inactive
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-sm text-gray-300 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
          {keyInfo.keyPrefix}••••••••
        </span>
        <CopyButton text={apiKey} />
        <button
          onClick={() => void refetch()}
          className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Quota */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Monthly quota</span>
          <span>
            <span className="text-white font-semibold">
              {keyInfo.usedThisMonth.toLocaleString()}
            </span>{' '}
            / {keyInfo.monthlyQuota.toLocaleString()} scans
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${
              quotaPercent >= 90
                ? 'bg-red-500'
                : quotaPercent >= 70
                  ? 'bg-orange-500'
                  : 'bg-violet-500'
            }`}
            style={{ width: `${quotaPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-600">
          {quotaPercent}% used · Resets {new Date(keyInfo.quotaResetAt).toLocaleDateString()}
        </p>
      </div>

      {/* Created date */}
      <p className="mt-3 text-xs text-gray-600">
        Created {new Date(keyInfo.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}

// ─── Team Billing Section (self-contained — runs its own GraphQL query) ──────
function TeamBillingSection() {
  const apiKey = localStorage.getItem('ankrshield_api_key');
  const { data } = useQuery(API_KEY_INFO_QUERY, { skip: !apiKey });
  const keyInfo = data?.xshieldApiKeyInfo ?? null;
  const tier = keyInfo?.tier ?? null;
  if (!apiKey) return null;
  return <TeamBillingPanel tier={tier} keyInfo={keyInfo} />;
}

// ─── Team Billing Panel ───────────────────────────────────────────────────────
function TeamBillingPanel({ tier, keyInfo }: { tier: string | null; keyInfo: any }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'STARTER',
          email: keyInfo?.email ?? '',
          apiKeyId: keyInfo?.id ?? '',
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { url?: string; checkoutUrl?: string };
      const url = data.url ?? data.checkoutUrl;
      if (url) window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiKeyId = keyInfo?.id ?? '';
      const res = await fetch(`/api/billing/portal?apiKeyId=${encodeURIComponent(apiKeyId)}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { portalUrl?: string; url?: string };
      const url = data.portalUrl ?? data.url;
      if (url) window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal');
    } finally {
      setLoading(false);
    }
  };

  const normalizedTier = (tier ?? 'FREE').toUpperCase();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="w-5 h-5 text-violet-400" />
        <h2 className="text-lg font-semibold">Team Plan</h2>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-400 bg-red-950/30 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {normalizedTier === 'FREE' && (
            <>
              <p className="text-sm text-gray-300 font-medium">You are on the Free plan</p>
              <p className="text-xs text-gray-500 mt-0.5">
                10 scans / month · No team sharing · No watch alerts
              </p>
            </>
          )}
          {normalizedTier === 'STARTER' && (
            <>
              <p className="text-sm text-gray-300 font-medium">Starter plan · 500 scans / month</p>
              <p className="text-xs text-gray-500 mt-0.5">Team sharing · Watch alerts enabled</p>
            </>
          )}
          {normalizedTier === 'PRO' && (
            <>
              <p className="text-sm text-gray-300 font-medium">Pro plan · Unlimited scans</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Full team access · Priority support · TAXII feed
              </p>
            </>
          )}
        </div>

        {normalizedTier === 'FREE' ? (
          <button
            onClick={() => void handleUpgrade()}
            disabled={loading || !keyInfo}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition whitespace-nowrap"
          >
            <ArrowUpRight className="w-4 h-4" />
            {loading ? 'Redirecting...' : 'Upgrade to STARTER — $99/mo for your whole team'}
          </button>
        ) : (
          <button
            onClick={() => void handleManageBilling()}
            disabled={loading || !keyInfo}
            className="flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-5 py-2.5 rounded-lg text-sm transition whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            {loading ? 'Opening...' : 'Manage Billing'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyTier, setNewKeyTier] = useState<'STARTER' | 'PRO'>('STARTER');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);

  // GraphQL mutation for creating key via xShield API
  const [createXShieldKey] = useMutation(CREATE_XSHIELD_KEY_MUTATION);

  const getJwt = () =>
    localStorage.getItem('ankrshield_token') ?? localStorage.getItem('jwt') ?? '';

  const getApiKey = () => localStorage.getItem('ankrshield_api_key') ?? '';

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/api-keys', {
        headers: { Authorization: `Bearer ${getJwt()}` },
      });
      if (res.status === 401) throw new Error('Please log in first.');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { keys?: ApiKeyRecord[] };
      setKeys(data.keys ?? []);
    } catch (err) {
      // Silently ignore if the REST endpoint is not available
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setCreatedKey(null);
    setCreateError(null);
    try {
      // Prefer GraphQL mutation if an API key is available
      const apiKey = getApiKey();
      if (apiKey) {
        const result = await createXShieldKey({
          variables: { name: newKeyName.trim(), tier: newKeyTier },
        });
        const newKey = result.data?.xshieldCreateApiKey?.key;
        if (newKey) {
          setCreatedKey(newKey);
          setNewKeyName('');
          await loadKeys();
          return;
        }
      }
      // Fallback: REST endpoint
      const res = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getJwt()}`,
        },
        body: JSON.stringify({ name: newKeyName.trim(), tier: newKeyTier }),
      });
      if (res.status === 401) throw new Error('Please log in first.');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { key?: string };
      setCreatedKey(data.key ?? null);
      setNewKeyName('');
      await loadKeys();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/auth/api-keys/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getJwt()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setRevoking(null);
    }
  };

  const limitsMap: Record<string, string> = {
    FREE: '10 / month',
    STARTER: '500 / month',
    PRO: 'Unlimited',
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Key className="w-7 h-7 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Programmatic access to the xShield risk intelligence API.{' '}
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-1"
            >
              View API docs <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>

      {/* Current key info (from xshieldApiKeyInfo GraphQL) */}
      <div>
        <h2 className="text-base font-semibold text-gray-300 mb-3">Active Key</h2>
        <CurrentKeyPanel />
      </div>

      {/* Team billing upgrade / manage */}
      <TeamBillingSection />

      {/* Newly-created key banner */}
      {createdKey && (
        <div className="bg-green-950 border border-green-500/40 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-green-300 mb-2">
                Copy your API key — it won&apos;t be shown again
              </p>
              <div className="flex items-center bg-gray-900 rounded-lg px-4 py-2.5 font-mono text-sm text-white break-all">
                <span className="flex-1">{createdKey}</span>
                <CopyButton text={createdKey} />
              </div>
            </div>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* General error */}
      {error && (
        <div className="bg-red-950 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Create new key */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Create New Key</h2>
        {createError && (
          <div className="mb-3 text-sm text-red-400 bg-red-950/30 border border-red-500/20 rounded-lg px-4 py-2">
            {createError}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            placeholder="Key name, e.g. CI Pipeline"
            maxLength={64}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
          />
          <select
            value={newKeyTier}
            onChange={(e) => setNewKeyTier(e.target.value as 'STARTER' | 'PRO')}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition"
          >
            <option value="STARTER">Starter (500/mo)</option>
            <option value="PRO">Pro (Unlimited)</option>
          </select>
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !newKeyName.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition flex items-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Creating...' : 'Create Key'}
          </button>
        </div>
      </div>

      {/* Keys table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold">All Keys</h2>
          <span className="text-sm text-gray-400">{keys.length} active</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No keys visible via REST endpoint. Create one above or check API docs.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {keys.map((k) => (
              <div key={k.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white truncate">{k.name}</span>
                    <TierBadge tier={k.tier} />
                  </div>
                  <div className="text-xs text-gray-500 space-x-3">
                    <span>
                      Prefix: <code className="font-mono text-gray-300">{k.prefix}...</code>
                    </span>
                    <span>Limit: {limitsMap[k.tier] ?? k.tier}</span>
                    <span>Requests this month: {k.monthlyRequestCount}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && (
                      <> · Last used {new Date(k.lastUsedAt).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void handleRevoke(k.id)}
                  disabled={revoking === k.id}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950 disabled:opacity-40 px-3 py-1.5 rounded-lg border border-red-500/20 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {revoking === k.id ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage guide */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-3">Usage</h2>
        <p className="text-sm text-gray-400 mb-3">
          Pass your API key as an <code className="text-gray-300">X-API-Key</code> header:
        </p>
        <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs text-green-400 overflow-x-auto">
          <div>curl https://xshieldai.com/api/risk/report?domain=example.com \</div>
          <div className="pl-4">-H &quot;X-API-Key: xsk_live_your_key_here&quot;</div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          See the{' '}
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300"
          >
            full API reference
          </a>{' '}
          for all available endpoints and response schemas.
        </p>
      </div>
    </div>
  );
}
