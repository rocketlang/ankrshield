/**
 * API Keys Management Page
 *
 * Allows authenticated users to:
 *  - Create named API keys (Starter / Pro tier)
 *  - View existing keys (prefix + metadata, never full key)
 *  - Revoke keys
 *  - Copy the newly-created key (shown once)
 */

import { Key, Plus, Trash2, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

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
    PRO: 'bg-purple-900/50 text-purple-300 border border-purple-500/30',
  };
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${styles[tier] ?? styles.STARTER}`}
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

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);

  const getJwt = () => localStorage.getItem('jwt') ?? '';

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/api-keys', {
        headers: { Authorization: `Bearer ${getJwt()}` },
      });
      if (res.status === 401) throw new Error('Please log in first.');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
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
    setError(null);
    try {
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
      const data = await res.json();
      setCreatedKey(data.key);
      setNewKeyName('');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
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

  const limitsMap = { FREE: '10 / month', STARTER: '500 / month', PRO: 'Unlimited' };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Key className="w-7 h-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Programmatic access to the xShield risk intelligence API.{' '}
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              View API docs <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>

      {/* Newly-created key banner (shown once) */}
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

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Create new key */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Create New Key</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            placeholder="Key name, e.g. CI Pipeline"
            maxLength={64}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
          />
          <select
            value={newKeyTier}
            onChange={(e) => setNewKeyTier(e.target.value as 'STARTER' | 'PRO')}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
          >
            <option value="STARTER">Starter (500/mo)</option>
            <option value="PRO">Pro (Unlimited)</option>
          </select>
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !newKeyName.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition flex items-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Creating…' : 'Create Key'}
          </button>
        </div>
      </div>

      {/* Keys table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Keys</h2>
          <span className="text-sm text-gray-400">{keys.length} active</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No active API keys. Create one above to get started.
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
                      Prefix: <code className="font-mono text-gray-300">{k.prefix}…</code>
                    </span>
                    <span>Limit: {limitsMap[k.tier]}</span>
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
                  {revoking === k.id ? 'Revoking…' : 'Revoke'}
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
          Pass your API key as a Bearer token in the{' '}
          <code className="text-gray-300">Authorization</code> header:
        </p>
        <div className="bg-gray-950 rounded-lg p-4 font-mono text-xs text-green-400 overflow-x-auto">
          <div>curl https://xshieldai.com/api/risk/report?domain=example.com \</div>
          <div className="pl-4">-H &quot;Authorization: Bearer xsh_live_your_key_here&quot;</div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          See the{' '}
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            full API reference
          </a>{' '}
          for all available endpoints and response schemas.
        </p>
      </div>
    </div>
  );
}
