/**
 * Analytics Page — wired to real xShield GraphQL data
 *
 * Uses:
 *   XSHIELD_STATUS_QUERY  → platform-wide stats
 *   IOC_FEED_QUERY        → threat distribution (limit 100, minRiskScore 0)
 */

import { useQuery } from '@apollo/client';
import { BarChart2, AlertTriangle, Activity, Globe, TrendingUp } from 'lucide-react';

import ContentWrapper from '../components/layout/ContentWrapper';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import { XSHIELD_STATUS_QUERY, IOC_FEED_QUERY } from '../graphql/queries';

// Parse IOC feed entries: "domain (score:N level:LEVEL)"
interface ParsedIoc {
  domain: string;
  score: number;
  level: string;
}

function parseIocEntry(entry: string): ParsedIoc | null {
  const match = /^(.+?)\s+\(score:(\d+)\s+level:(\S+)\)$/.exec(entry);
  if (!match) return null;
  return { domain: match[1], score: parseInt(match[2], 10), level: match[3] };
}

function getLevelColor(level: string): string {
  const l = (level || '').toUpperCase();
  if (l === 'CRITICAL') return 'bg-rose-500';
  if (l === 'HIGH') return 'bg-red-500';
  if (l === 'ELEVATED') return 'bg-orange-500';
  if (l === 'MODERATE') return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function getLevelTextColor(level: string): string {
  const l = (level || '').toUpperCase();
  if (l === 'CRITICAL') return 'text-rose-300';
  if (l === 'HIGH') return 'text-red-300';
  if (l === 'ELEVATED') return 'text-orange-300';
  if (l === 'MODERATE') return 'text-yellow-300';
  return 'text-emerald-300';
}

// Horizontal bar chart for distribution
function DistributionBar({
  label,
  count,
  total,
  level,
}: {
  label: string;
  count: number;
  total: number;
  level: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={`font-medium ${getLevelTextColor(level)}`}>{label}</span>
        <span className="text-gray-400">
          {count} ({pct}%)
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${getLevelColor(level)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Analytics() {
  const apiKey = localStorage.getItem('ankrshield_api_key');
  const skip = !apiKey;

  const { data: statusData, loading: statusLoading } = useQuery(XSHIELD_STATUS_QUERY, { skip });
  const { data: iocData, loading: iocLoading } = useQuery(IOC_FEED_QUERY, {
    variables: { limit: 100, minRiskScore: 0 },
    skip,
  });

  const status = statusData?.xshieldStatus ?? null;
  const rawFeed: string[] = iocData?.xshieldIocFeed ?? [];
  const parsed = rawFeed.map(parseIocEntry).filter(Boolean) as ParsedIoc[];

  // Compute distribution by level
  const distribution: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    ELEVATED: 0,
    MODERATE: 0,
    LOW: 0,
  };
  for (const ioc of parsed) {
    const l = ioc.level.toUpperCase();
    if (l in distribution) distribution[l]++;
    else distribution['LOW']++;
  }
  const total = parsed.length;

  // Average score
  const avgScore =
    parsed.length > 0 ? Math.round(parsed.reduce((s, i) => s + i.score, 0) / parsed.length) : null;

  // Top 10 highest risk domains
  const topThreats = [...parsed].sort((a, b) => b.score - a.score).slice(0, 10);

  return (
    <ContentWrapper>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-1">Analytics</h1>
          <p className="text-gray-400">Threat intelligence and platform statistics</p>
        </div>

        {/* No API key notice */}
        {!apiKey && (
          <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center text-gray-500 text-sm">
            <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Connect an API key on the{' '}
            <a href="/dashboard" className="text-violet-400 hover:text-violet-300">
              Dashboard
            </a>{' '}
            to see analytics.
          </div>
        )}

        {/* Platform stats */}
        {(statusLoading || status) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Total Scans',
                value: status?.totalScans ?? 0,
                icon: <Activity className="w-6 h-6 text-blue-400" />,
              },
              {
                label: 'Active Watches',
                value: status?.activeWatches ?? 0,
                icon: <Globe className="w-6 h-6 text-violet-400" />,
              },
              {
                label: 'API Keys',
                value: status?.totalApiKeys ?? 0,
                icon: <TrendingUp className="w-6 h-6 text-green-400" />,
              },
              {
                label: 'Avg Risk Score',
                value: iocLoading ? '...' : avgScore !== null ? avgScore : '—',
                icon: <AlertTriangle className="w-6 h-6 text-orange-400" />,
              },
            ].map((s) => (
              <Card key={s.label} className="bg-gray-900">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                      <p className="text-2xl font-bold text-white">
                        {statusLoading && s.label !== 'Avg Risk Score' ? (
                          <span className="animate-pulse bg-gray-700 rounded w-12 h-6 block" />
                        ) : typeof s.value === 'number' ? (
                          s.value.toLocaleString()
                        ) : (
                          s.value
                        )}
                      </p>
                    </div>
                    {s.icon}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* Threat level distribution */}
        {apiKey && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-gray-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">Threat Level Distribution</h2>
                  {parsed.length > 0 && (
                    <span className="ml-auto text-xs text-gray-500">{total} domains analysed</span>
                  )}
                </div>
              </CardHeader>
              <CardBody>
                {iocLoading ? (
                  <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-5 bg-gray-800 rounded" />
                    ))}
                  </div>
                ) : parsed.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">No IOC data available.</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(distribution).map(([level, count]) => (
                      <DistributionBar
                        key={level}
                        label={level}
                        count={count}
                        total={total}
                        level={level}
                      />
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Top risky domains */}
            <Card className="bg-gray-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  <h2 className="text-lg font-semibold">Highest Risk Domains</h2>
                </div>
              </CardHeader>
              <CardBody>
                {iocLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="h-8 bg-gray-800 rounded" />
                    ))}
                  </div>
                ) : topThreats.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">No threat data.</p>
                ) : (
                  <div className="space-y-2">
                    {topThreats.map((t, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-800 rounded-lg"
                      >
                        <span className="text-xs text-gray-500 w-5 shrink-0">{i + 1}</span>
                        <span className="font-mono text-xs text-gray-200 truncate flex-1">
                          {t.domain}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 ${getLevelTextColor(t.level)} bg-gray-900/60 border-gray-700`}
                        >
                          {t.score}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {/* Sources */}
        {status?.sources && status.sources.length > 0 && (
          <Card className="bg-gray-900">
            <CardHeader>
              <h2 className="text-lg font-semibold">Active Intelligence Sources</h2>
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
              {status.version && (
                <p className="mt-3 text-xs text-gray-600">
                  xShield v{status.version} · {status.status} · Last updated{' '}
                  {new Date(status.timestamp).toLocaleString()}
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </ContentWrapper>
  );
}
