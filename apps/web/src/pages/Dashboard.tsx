/**
 * Dashboard Page — wired to real xShield GraphQL data
 *
 * Queries used:
 *   API_KEY_INFO_QUERY   → user info + quota
 *   XSHIELD_STATUS_QUERY → platform stats (totalScans, activeWatches, sources)
 *   WATCHES_QUERY        → watched domains list
 *   IOC_FEED_QUERY       → recent threat feed
 *
 * Auth: X-API-Key from localStorage('ankrshield_api_key') sent via Apollo link.
 * If no key is stored, an inline setup card is shown.
 */

import { useQuery } from '@apollo/client';
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
} from 'lucide-react';
import { useState, useCallback } from 'react';

import CertStreamWidget from '../components/CertStreamWidget';
import DomainScanWidget from '../components/DomainScanWidget';
import ContentWrapper from '../components/layout/ContentWrapper';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import {
  API_KEY_INFO_QUERY,
  XSHIELD_STATUS_QUERY,
  WATCHES_QUERY,
  IOC_FEED_QUERY,
} from '../graphql/queries';

// ─── Tier badge colours ────────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    FREE: 'bg-gray-700/60 text-gray-300 border-gray-600/40',
    STARTER: 'bg-blue-900/50 text-blue-300 border-blue-500/30',
    PRO: 'bg-violet-900/50 text-violet-300 border-violet-500/30',
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

// ─── Risk level helpers ────────────────────────────────────────────────────────
function getRiskLevelStyle(level: string) {
  const l = (level || '').toUpperCase();
  if (l === 'LOW' || l === 'MINIMAL')
    return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30';
  if (l === 'MODERATE') return 'bg-yellow-900/40 text-yellow-300 border-yellow-500/30';
  if (l === 'ELEVATED') return 'bg-orange-900/40 text-orange-300 border-orange-500/30';
  if (l === 'HIGH') return 'bg-red-900/40 text-red-300 border-red-500/30';
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

// ─── API Key Setup Card (Task 7) ───────────────────────────────────────────────
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

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    localStorage.getItem('ankrshield_api_key')
  );

  const handleKeySet = useCallback(() => {
    setApiKey(localStorage.getItem('ankrshield_api_key'));
  }, []);

  const skip = !apiKey;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const {
    data: keyData,
    loading: keyLoading,
    error: keyError,
  } = useQuery(API_KEY_INFO_QUERY, { skip });

  const { data: statusData, loading: statusLoading } = useQuery(XSHIELD_STATUS_QUERY, { skip });

  const { data: watchesData, loading: watchesLoading } = useQuery(WATCHES_QUERY, { skip });

  const { data: iocData, loading: iocLoading } = useQuery(IOC_FEED_QUERY, {
    variables: { limit: 20 },
    skip,
  });

  // ── Derived values ────────────────────────────────────────────────────────────
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

  const quotaPercent =
    keyInfo && keyInfo.monthlyQuota > 0
      ? Math.min(100, Math.round((keyInfo.usedThisMonth / keyInfo.monthlyQuota) * 100))
      : 0;

  const maskedKey = keyInfo?.keyPrefix
    ? `${keyInfo.keyPrefix}••••••••`
    : apiKey
      ? `${apiKey.slice(0, 12)}••••••••`
      : null;

  // ── Stats cards ───────────────────────────────────────────────────────────────
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
        {/* Header */}
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

        {/* API Key Setup — shown when no key is stored */}
        {!apiKey && <ApiKeySetupCard onKeySet={handleKeySet} />}

        {/* API key error */}
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

        {/* Quota bar */}
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
            </CardBody>
          </Card>
        )}

        {/* Stats Grid */}
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

        {/* Domain Risk Scanner */}
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

        {/* Bottom grid: Watched Domains + Recent IOC Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Watched Domains */}
          <Card className="bg-gray-900">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Watched Domains</h2>
                <Badge variant="info">{watches.length} active</Badge>
              </div>
            </CardHeader>
            <CardBody>
              {watchesLoading && watches.length === 0 ? (
                <div className="space-y-3 animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-800 rounded-lg" />
                  ))}
                </div>
              ) : watches.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">
                  {apiKey ? (
                    <>
                      <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No domains watched yet.{' '}
                      <a href="/onboarding" className="text-violet-400 hover:text-violet-300">
                        Add one
                      </a>
                    </>
                  ) : (
                    'Connect an API key to see watches.'
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {watches.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between p-3 bg-gray-800 rounded-lg gap-3"
                    >
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

        {/* Certificate Transparency Stream — shown when there are watched domains */}
        {watches.length > 0 && watches[0]?.domain && (
          <CertStreamWidget domain={watches[0].domain} />
        )}

        {/* Intelligence Sources */}
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
