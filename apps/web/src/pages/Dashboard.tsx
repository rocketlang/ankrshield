/**
 * Dashboard Page — xShield X4 enhanced dashboard
 *
 * Queries used:
 *   API_KEY_INFO_QUERY    → user info + quota
 *   XSHIELD_STATUS_QUERY  → platform stats (totalScans, activeWatches, sources)
 *   WATCHES_QUERY         → watched domains list
 *   IOC_FEED_QUERY        → recent threat feed
 *   SCAN_HISTORY_QUERY    → 30-day risk posture history
 *
 * Auth: X-API-Key from localStorage('ankrshield_api_key') sent via Apollo link.
 * If no key is stored, an inline setup card is shown.
 */

import { useQuery, useMutation } from '@apollo/client';
import {
  Shield,
  Activity,
  Eye,
  AlertTriangle,
  Info,
  Globe,
  Key,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Pause,
  Play,
  Trash2,
  Bell,
  X,
  Cpu,
} from 'lucide-react';
import { useState, useCallback } from 'react';

import CertStreamWidget from '../components/CertStreamWidget';
import DomainScanWidget from '../components/DomainScanWidget';
import MitreHeatmap from '../components/MitreHeatmap';
import RiskGauge from '../components/RiskGauge';
import RiskTrendChart from '../components/RiskTrendChart';
import ContentWrapper from '../components/layout/ContentWrapper';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import {
  API_KEY_INFO_QUERY,
  XSHIELD_STATUS_QUERY,
  WATCHES_QUERY,
  IOC_FEED_QUERY,
  SCAN_HISTORY_QUERY,
} from '../graphql/queries';
import {
  ADD_WATCH_MUTATION,
  PAUSE_WATCH_MUTATION,
  RESUME_WATCH_MUTATION,
  REMOVE_WATCH_MUTATION,
} from '../graphql/mutations';

// ─── Tier badge colours ───────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    FREE:       'bg-gray-700/60 text-gray-300 border-gray-600/40',
    STARTER:    'bg-blue-900/50 text-blue-300 border-blue-500/30',
    PRO:        'bg-violet-900/50 text-violet-300 border-violet-500/30',
    ENTERPRISE: 'bg-amber-900/50 text-amber-300 border-amber-500/30',
  };
  const cls = styles[(tier ?? '').toUpperCase()] ?? styles.STARTER;
  return (
    <span
      className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest border ${cls}`}
    >
      {tier || 'FREE'}
    </span>
  );
}

// ─── Risk level helpers ───────────────────────────────────────────────────────
function getRiskLevelStyle(level: string) {
  const l = (level || '').toUpperCase();
  if (l === 'LOW' || l === 'MINIMAL')
    return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30';
  if (l === 'MODERATE') return 'bg-yellow-900/40 text-yellow-300 border-yellow-500/30';
  if (l === 'ELEVATED') return 'bg-orange-900/40 text-orange-300 border-orange-500/30';
  if (l === 'HIGH')     return 'bg-red-900/40 text-red-300 border-red-500/30';
  if (l === 'CRITICAL') return 'bg-rose-900/40 text-rose-300 border-rose-500/30';
  return 'bg-gray-700/60 text-gray-400 border-gray-600/40';
}

function WatchStatusChip({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE')
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-300">
        <CheckCircle2 className="w-3.5 h-3.5" /> Active
      </span>
    );
  if (s === 'PAUSED')
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-300">
        <RefreshCw className="w-3.5 h-3.5" /> Paused
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-red-300">
      <XCircle className="w-3.5 h-3.5" /> {status}
    </span>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <Card className="bg-gray-900/50">
      <CardBody>
        <div className="animate-pulse space-y-3">
          <div className="h-3 bg-gray-700 rounded w-1/2" />
          <div className="h-8 bg-gray-700 rounded w-1/3" />
        </div>
      </CardBody>
    </Card>
  );
}

// ─── API Key Setup Card ───────────────────────────────────────────────────────
function ApiKeySetupCard({ onKeySet }: { onKeySet: () => void }) {
  const [inputKey, setInputKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = inputKey.trim();
    if (!key) return;
    setTesting(true);
    setTestError(null);
    try {
      const apiUrl =
        (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4270';
      const res = await fetch(`${apiUrl}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ query: '{ xshieldApiKeyInfo { id name email tier isActive } }' }),
      });
      const json = (await res.json()) as {
        data?: { xshieldApiKeyInfo?: { id: string } };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) throw new Error(json.errors[0].message);
      if (!json.data?.xshieldApiKeyInfo?.id) throw new Error('Invalid key or no access');
      localStorage.setItem('ankrshield_api_key', key);
      onKeySet();
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Key validation failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-violet-500/30 bg-violet-950/20">
      <CardBody>
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-violet-900/50 flex items-center justify-center">
            <Key className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white mb-1">Connect your xShield API key</h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter your API key to load your real threat intelligence data. Find it in{' '}
              <a href="/api-keys" className="text-violet-400 hover:text-violet-300 underline">
                API Keys
              </a>
              .
            </p>
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="xsk_live_xxxxxxxxxxxxxxxx"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono"
              />
              <button
                type="submit"
                disabled={testing || !inputKey.trim()}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition whitespace-nowrap"
              >
                {testing ? 'Verifying...' : 'Connect'}
              </button>
              <a
                href="/register"
                className="flex items-center justify-center px-4 py-2 text-sm text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-900/20 transition whitespace-nowrap"
              >
                Get free key
              </a>
            </form>
            {testError && <p className="mt-2 text-xs text-red-400">{testError}</p>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Add Watch inline form ────────────────────────────────────────────────────
interface AddWatchFormProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddWatchForm({ onClose, onAdded }: AddWatchFormProps) {
  const [domain, setDomain] = useState('');
  const [threshold, setThreshold] = useState(50);
  const [webhookUrl, setWebhookUrl] = useState('');

  const [addWatch, { loading, error }] = useMutation(ADD_WATCH_MUTATION, {
    refetchQueries: [{ query: WATCHES_QUERY }],
    onCompleted: () => {
      onAdded();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = domain.trim();
    if (!d) return;
    void addWatch({
      variables: {
        domain: d,
        alertThreshold: threshold,
        webhookUrl: webhookUrl.trim() || undefined,
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-white">Add Domain Watch</p>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Domain input */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Domain *</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          required
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono"
        />
      </div>

      {/* Alert threshold slider */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Alert threshold:{' '}
          <span className="text-white font-semibold">{threshold}</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
        <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
          <span>0 (always)</span>
          <span>100 (critical only)</span>
        </div>
      </div>

      {/* Webhook URL (optional) */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Webhook URL (optional)</label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">{error.message}</p>
      )}

      <button
        type="submit"
        disabled={loading || !domain.trim()}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition"
      >
        {loading ? 'Adding...' : 'Start Watching'}
      </button>
    </form>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    localStorage.getItem('ankrshield_api_key')
  );
  const [showAddWatch, setShowAddWatch] = useState(false);

  const handleKeySet = useCallback(() => {
    setApiKey(localStorage.getItem('ankrshield_api_key'));
  }, []);

  const skip = !apiKey;

  // ── Queries ───────────────────────────────────────────────────────────────
  const {
    data: keyData,
    loading: keyLoading,
    error: keyError,
  } = useQuery(API_KEY_INFO_QUERY, { skip });

  const { data: statusData, loading: statusLoading } = useQuery(XSHIELD_STATUS_QUERY, { skip });

  const {
    data: watchesData,
    loading: watchesLoading,
    refetch: refetchWatches,
  } = useQuery(WATCHES_QUERY, { skip });

  const { data: iocData, loading: iocLoading } = useQuery(IOC_FEED_QUERY, {
    variables: { limit: 20 },
    skip,
  });

  const { data: historyData } = useQuery(SCAN_HISTORY_QUERY, {
    variables: { limit: 30 },
    skip,
  });

  // ── Derived values ────────────────────────────────────────────────────────
  const keyInfo = keyData?.xshieldApiKeyInfo ?? null;
  const status = statusData?.xshieldStatus ?? null;
  const watches: Array<{
    id: string;
    domain: string;
    status: string;
    lastRiskScore: number | null;
    lastRiskLevel: string | null;
    lastScannedAt: string | null;
  }> = watchesData?.xshieldWatches ?? [];
  const iocFeed: string[] = iocData?.xshieldIocFeed ?? [];

  // Scan history — newest first from API, we reverse for the chart (oldest → newest)
  const scanHistory: Array<{
    domain: string;
    riskScore: number;
    riskLevel: string;
    scannedAt: string;
    findingCount: number;
  }> = historyData?.xshieldScanHistory ?? [];
  const latestScore = scanHistory[0]?.riskScore ?? 0;

  const trendData = [...scanHistory]
    .reverse()
    .map((h) => ({ date: h.scannedAt, score: h.riskScore, domain: h.domain }));

  const quotaPercent =
    keyInfo && keyInfo.monthlyQuota > 0
      ? Math.min(100, Math.round((keyInfo.usedThisMonth / keyInfo.monthlyQuota) * 100))
      : 0;

  const maskedKey = keyInfo?.keyPrefix
    ? `${keyInfo.keyPrefix}••••••••`
    : apiKey
      ? `${apiKey.slice(0, 12)}••••••••`
      : null;

  const tier = (keyInfo?.tier ?? 'FREE').toUpperCase();

  // ── Watch mutations ───────────────────────────────────────────────────────
  const [pauseWatch] = useMutation(PAUSE_WATCH_MUTATION, {
    refetchQueries: [{ query: WATCHES_QUERY }],
  });
  const [resumeWatch] = useMutation(RESUME_WATCH_MUTATION, {
    refetchQueries: [{ query: WATCHES_QUERY }],
  });
  const [removeWatch] = useMutation(REMOVE_WATCH_MUTATION, {
    refetchQueries: [{ query: WATCHES_QUERY }],
  });

  const handlePause = (watchId: string) => {
    void pauseWatch({ variables: { watchId } });
  };
  const handleResume = (watchId: string) => {
    void resumeWatch({ variables: { watchId } });
  };
  const handleRemove = (watchId: string, domain: string) => {
    if (window.confirm(`Remove watch for ${domain}? This cannot be undone.`)) {
      void removeWatch({ variables: { watchId } });
    }
  };

  // ── Stats cards ───────────────────────────────────────────────────────────
  const statsCards = [
    {
      label: 'Total Scans',
      value: statusLoading ? null : (status?.totalScans ?? 0),
      icon: <Activity className="w-8 h-8 text-blue-400" />,
      color: 'bg-blue-900/20',
    },
    {
      label: 'Active Watches',
      value: statusLoading ? null : (status?.activeWatches ?? 0),
      icon: <Eye className="w-8 h-8 text-violet-400" />,
      color: 'bg-violet-900/20',
    },
    {
      label: 'Platform API Keys',
      value: statusLoading ? null : (status?.totalApiKeys ?? 0),
      icon: <Key className="w-8 h-8 text-green-400" />,
      color: 'bg-green-900/20',
    },
    {
      label: 'Quota Used',
      value: keyLoading
        ? null
        : keyInfo
          ? `${keyInfo.usedThisMonth.toLocaleString()} / ${keyInfo.monthlyQuota.toLocaleString()}`
          : '—',
      icon: <Shield className="w-8 h-8 text-orange-400" />,
      color: 'bg-orange-900/20',
    },
  ];

  return (
    <ContentWrapper>
      <div className="space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
            <p className="text-gray-400">
              {keyInfo ? (
                <>
                  Welcome, <span className="text-white">{keyInfo.name || keyInfo.email}</span>
                </>
              ) : (
                'xShield Threat Intelligence'
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {keyInfo && (
              <>
                <TierBadge tier={keyInfo.tier} />
                {maskedKey && (
                  <span className="text-xs text-gray-500 font-mono bg-gray-800 px-3 py-1 rounded-full border border-gray-700">
                    {maskedKey}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── API Key Setup — shown when no key is stored ─────────────────── */}
        {!apiKey && <ApiKeySetupCard onKeySet={handleKeySet} />}

        {/* ── API key error ────────────────────────────────────────────────── */}
        {keyError && apiKey && (
          <Alert variant="error">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Could not verify API key: {keyError.message}.{' '}
                <button
                  onClick={() => {
                    localStorage.removeItem('ankrshield_api_key');
                    setApiKey(null);
                  }}
                  className="underline hover:no-underline"
                >
                  Reset key
                </button>
              </span>
            </div>
          </Alert>
        )}

        {/* ── Risk Posture Section (X4) ─────────────────────────────────────── */}
        {apiKey && (
          <Card className="bg-gray-900">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-violet-400" />
                <h2 className="text-xl font-semibold">Risk Posture</h2>
                {scanHistory.length > 0 && (
                  <span className="ml-auto text-xs text-gray-500">
                    {scanHistory.length} scan{scanHistory.length !== 1 ? 's' : ''} in history
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                {/* Left: gauge */}
                <div className="flex justify-center">
                  <RiskGauge score={latestScore} label="Latest Scan Score" size={220} />
                </div>
                {/* Right: trend chart */}
                <div>
                  <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">
                    30-day trend
                  </p>
                  <RiskTrendChart data={trendData} />
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── Quota + Billing Card ──────────────────────────────────────────── */}
        {keyInfo && (
          <Card className="bg-gray-900">
            <CardBody>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium text-white">Monthly quota</p>
                  <p className="text-xs text-gray-500">
                    Resets {new Date(keyInfo.quotaResetAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-sm text-gray-300">
                  <span className="font-bold text-white">
                    {keyInfo.usedThisMonth.toLocaleString()}
                  </span>{' '}
                  / {keyInfo.monthlyQuota.toLocaleString()} scans
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    quotaPercent >= 90
                      ? 'bg-red-500'
                      : quotaPercent >= 70
                        ? 'bg-orange-500'
                        : 'bg-violet-500'
                  }`}
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{quotaPercent}% used</p>

              {/* Tier-specific CTA */}
              {tier === 'FREE' ? (
                <div className="mt-4 rounded-xl bg-violet-950/40 border border-violet-500/30 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <p className="text-sm text-violet-200 flex-1">
                    You're on the <span className="font-bold">FREE</span> plan — 10 scans/month.
                    Upgrade to <span className="font-bold">STARTER</span> for 500 scans, Domain
                    Watch, and Playbooks.
                  </p>
                  <a
                    href="/pricing"
                    className="shrink-0 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm px-4 py-2 rounded-lg transition whitespace-nowrap"
                  >
                    Upgrade — $99/mo
                  </a>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-emerald-300 font-medium">Plan active</span>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* ── Stats Grid ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((stat) =>
            stat.value === null ? (
              <SkeletonCard key={stat.label} />
            ) : (
              <Card key={stat.label} className={stat.color}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400 mb-1">{stat.label}</p>
                      <p className="text-2xl font-bold">
                        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                      </p>
                    </div>
                    {stat.icon}
                  </div>
                </CardBody>
              </Card>
            )
          )}
        </div>

        {/* ── Domain Risk Scanner ──────────────────────────────────────────── */}
        <Card className="bg-gray-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-violet-400" />
              <h2 className="text-xl font-semibold">Domain Risk Scanner</h2>
            </div>
          </CardHeader>
          <CardBody>
            {!apiKey ? (
              <p className="text-sm text-gray-500">Connect an API key above to scan domains.</p>
            ) : (
              <DomainScanWidget initialDomain="xshieldai.com" />
            )}
          </CardBody>
        </Card>

        {/* ── Bottom grid: Watched Domains + Recent IOC Feed ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Watched Domains — interactive */}
          <Card className="bg-gray-900">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Watched Domains</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{watches.length} active</Badge>
                  {apiKey && (
                    <button
                      onClick={() => setShowAddWatch((v) => !v)}
                      title="Add domain to watch"
                      className="flex items-center gap-1.5 text-xs bg-violet-700 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg transition font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Domain
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardBody>
              {/* Inline add-watch form */}
              {showAddWatch && (
                <AddWatchForm
                  onClose={() => setShowAddWatch(false)}
                  onAdded={() => void refetchWatches()}
                />
              )}

              {watchesLoading && watches.length === 0 ? (
                <div className="space-y-3 animate-pulse mt-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-800 rounded-lg" />
                  ))}
                </div>
              ) : watches.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm mt-2">
                  {apiKey ? (
                    <>
                      <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No domains watched yet. Click "Add Domain" above to start.
                    </>
                  ) : (
                    'Connect an API key to see watches.'
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 mt-2">
                  {watches.map((w) => (
                    <div
                      key={w.id}
                      className="p-3 bg-gray-800 rounded-lg"
                    >
                      {/* Top row: domain + score + status */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-white truncate">{w.domain}</p>
                          <p className="text-xs text-gray-500">
                            {w.lastScannedAt
                              ? `Scanned ${new Date(w.lastScannedAt).toLocaleDateString()}`
                              : 'Not yet scanned'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {w.lastRiskScore !== null && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getRiskLevelStyle(w.lastRiskLevel ?? '')}`}
                            >
                              {w.lastRiskScore}
                            </span>
                          )}
                          <WatchStatusChip status={w.status} />
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {w.status.toUpperCase() === 'ACTIVE' ? (
                          <button
                            onClick={() => handlePause(w.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-yellow-900/40 text-yellow-300 hover:bg-yellow-800/50 border border-yellow-700/40 transition"
                          >
                            <Pause className="w-3 h-3" /> Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => handleResume(w.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50 border border-emerald-700/40 transition"
                          >
                            <Play className="w-3 h-3" /> Resume
                          </button>
                        )}

                        <a
                          href={`/watch/${w.id}`}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-blue-900/40 text-blue-300 hover:bg-blue-800/50 border border-blue-700/40 transition"
                        >
                          <Bell className="w-3 h-3" /> Alerts
                        </a>

                        <button
                          onClick={() => handleRemove(w.id, w.domain)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-800/40 border border-red-700/30 transition ml-auto"
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Recent IOC Feed */}
          <Card className="bg-gray-900">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                <h2 className="text-lg font-semibold">Recent Threat Feed</h2>
              </div>
            </CardHeader>
            <CardBody>
              {iocLoading && iocFeed.length === 0 ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-7 bg-gray-800 rounded" />
                  ))}
                </div>
              ) : iocFeed.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {apiKey ? 'No recent IOC data' : 'Connect an API key to see threats.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {iocFeed.map((entry: string, i: number) => {
                    // Format: "domain (score:N level:LEVEL)"
                    const match = /^(.+?)\s+\(score:(\d+)\s+level:(\S+)\)$/.exec(entry);
                    const domain = match ? match[1] : entry;
                    const score = match ? parseInt(match[2], 10) : null;
                    const level = match ? match[3] : 'UNKNOWN';
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-800 rounded-lg text-xs"
                      >
                        <span className="font-mono text-gray-200 truncate flex-1">{domain}</span>
                        {score !== null && (
                          <span
                            className={`px-1.5 py-0.5 rounded border text-xs font-bold shrink-0 ${getRiskLevelStyle(level)}`}
                          >
                            {score}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ── MITRE ATT&CK Coverage (X4) ──────────────────────────────────── */}
        {apiKey && scanHistory.length > 0 && (
          <Card className="bg-gray-900">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h2 className="text-lg font-semibold">MITRE ATT&amp;CK Coverage</h2>
                <span className="ml-auto text-xs text-gray-500">
                  Based on latest scan findings
                </span>
              </div>
            </CardHeader>
            <CardBody>
              <MitreHeatmap findings={[]} />
            </CardBody>
          </Card>
        )}

        {/* ── Certificate Transparency Stream ────────────────────────────── */}
        {watches.length > 0 && watches[0]?.domain && (
          <CertStreamWidget domain={watches[0].domain} />
        )}

        {/* ── Intelligence Sources ────────────────────────────────────────── */}
        {status?.sources && status.sources.length > 0 && (
          <Card className="bg-gray-900">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold">Intelligence Sources</h2>
                {status.version && (
                  <span className="ml-auto text-xs text-gray-500 font-mono">
                    v{status.version} · {status.status}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-2">
                {(status.sources as string[]).map((src: string) => (
                  <span
                    key={src}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-gray-800 border border-gray-700 text-gray-300"
                  >
                    {src}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

      </div>
    </ContentWrapper>
  );
}
