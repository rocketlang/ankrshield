/**
 * Dashboard Page with overview stats
 */

import { useQuery } from '@apollo/client';
import { Shield, Activity, Blocks, TrendingUp, Info, Globe } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import ContentWrapper from '../components/layout/ContentWrapper';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import { ME_QUERY, PRIVACY_SCORES_QUERY, NETWORK_EVENTS_QUERY } from '../graphql/queries';

// Mock data for demo mode
const DEMO_USER = { name: 'Demo User', email: 'demo@ankrshield.com' };
const DEMO_SCORE = {
  overallScore: 87,
  totalRequests: 12847,
  blockedRequests: 9234,
  trackersBlocked: 2156,
};
const DEMO_EVENTS = [
  {
    id: '1',
    domain: 'doubleclick.net',
    timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
    eventType: 'TRACKER_BLOCKED',
    isBlocked: true,
  },
  {
    id: '2',
    domain: 'googletagmanager.com',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
    eventType: 'TRACKER_BLOCKED',
    isBlocked: true,
  },
  {
    id: '3',
    domain: 'facebook.com',
    timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
    eventType: 'PIXEL_BLOCKED',
    isBlocked: true,
  },
  {
    id: '4',
    domain: 'cdn.jsdelivr.net',
    timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
    eventType: 'REQUEST_ALLOWED',
    isBlocked: false,
  },
  {
    id: '5',
    domain: 'analytics.google.com',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    eventType: 'TRACKER_BLOCKED',
    isBlocked: true,
  },
  {
    id: '6',
    domain: 'amazon-adsystem.com',
    timestamp: new Date(Date.now() - 20 * 60000).toISOString(),
    eventType: 'AD_BLOCKED',
    isBlocked: true,
  },
  {
    id: '7',
    domain: 'cloudflare.com',
    timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
    eventType: 'REQUEST_ALLOWED',
    isBlocked: false,
  },
  {
    id: '8',
    domain: 'scorecardresearch.com',
    timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
    eventType: 'TRACKER_BLOCKED',
    isBlocked: true,
  },
];

// ─── Risk level helper ─────────────────────────────────────────────────────────
function getRiskLevel(score: number): { label: string; className: string } {
  if (score <= 14)
    return {
      label: 'Low',
      className: 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/30',
    };
  if (score <= 34)
    return {
      label: 'Moderate',
      className: 'bg-yellow-900/40 text-yellow-300 border border-yellow-500/30',
    };
  if (score <= 54)
    return {
      label: 'Elevated',
      className: 'bg-orange-900/40 text-orange-300 border border-orange-500/30',
    };
  if (score <= 74)
    return { label: 'High', className: 'bg-red-900/40 text-red-300 border border-red-500/30' };
  return { label: 'Critical', className: 'bg-rose-900/40 text-rose-300 border border-rose-500/30' };
}

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const isDemoMode = searchParams.get('demo') === 'true';

  // Domain Risk Monitor state
  const [riskDomain, setRiskDomain] = useState('xshieldai.com');
  const [riskResult, setRiskResult] = useState<{ score: number } | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  async function handleRiskScan() {
    if (!riskDomain.trim()) return;
    setRiskLoading(true);
    setRiskError(null);
    setRiskResult(null);
    try {
      const res = await fetch(`/api/risk/score?domain=${encodeURIComponent(riskDomain.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRiskResult({ score: data.score ?? data.riskScore ?? 0 });
    } catch (err) {
      setRiskError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setRiskLoading(false);
    }
  }

  // Skip API calls in demo mode
  const { data: userData } = useQuery(ME_QUERY, { skip: isDemoMode });
  const { data: scoresData, loading: scoresLoading } = useQuery(PRIVACY_SCORES_QUERY, {
    variables: { limit: 1, period: 'daily' },
    skip: isDemoMode,
  });
  const { data: eventsData, loading: eventsLoading } = useQuery(NETWORK_EVENTS_QUERY, {
    variables: { limit: 10 },
    skip: isDemoMode,
  });

  // Use demo data when in demo mode, otherwise use API data
  const user = isDemoMode ? DEMO_USER : userData?.me;
  const latestScore = isDemoMode ? DEMO_SCORE : scoresData?.privacyScores?.[0];
  const events = isDemoMode ? DEMO_EVENTS : eventsData?.networkEvents || [];

  const stats = [
    {
      label: 'Privacy Score',
      value: latestScore?.overallScore || 0,
      icon: <Shield className="w-8 h-8 text-blue-400" />,
      color: 'bg-blue-900/20',
    },
    {
      label: 'Total Requests',
      value: latestScore?.totalRequests || 0,
      icon: <Activity className="w-8 h-8 text-green-400" />,
      color: 'bg-green-900/20',
    },
    {
      label: 'Blocked Requests',
      value: latestScore?.blockedRequests || 0,
      icon: <Blocks className="w-8 h-8 text-red-400" />,
      color: 'bg-red-900/20',
    },
    {
      label: 'Trackers Blocked',
      value: latestScore?.trackersBlocked || 0,
      icon: <TrendingUp className="w-8 h-8 text-purple-400" />,
      color: 'bg-purple-900/20',
    },
  ];

  return (
    <ContentWrapper>
      <div className="space-y-8">
        {/* Demo Mode Alert */}
        {isDemoMode && (
          <Alert variant="info">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5" />
              <div>
                <p className="font-semibold">Demo Mode Active</p>
                <p className="text-sm">
                  You're viewing ankrshield with sample data. Download the app or create an account
                  to see your real privacy metrics.
                </p>
              </div>
            </div>
          </Alert>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-gray-400">Welcome back, {user?.name || user?.email || 'User'}!</p>
          </div>
          {isDemoMode && (
            <Badge variant="info">
              <Info className="w-4 h-4 inline mr-1" />
              Demo Mode
            </Badge>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card key={stat.label} className={stat.color}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold">
                      {!isDemoMode && scoresLoading ? '...' : stat.value.toLocaleString()}
                    </p>
                  </div>
                  <div>{stat.icon}</div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Recent Network Activity</h2>
          </CardHeader>
          <CardBody>
            {!isDemoMode && eventsLoading ? (
              <p className="text-gray-400">Loading...</p>
            ) : events.length === 0 ? (
              <Alert variant="info">
                No network activity yet. Install a client app to start monitoring.
              </Alert>
            ) : (
              <div className="space-y-3">
                {events.map((event: any) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-4 bg-gray-900 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{event.domain}</p>
                      <p className="text-sm text-gray-400">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge variant={event.eventType.includes('BLOCKED') ? 'danger' : 'success'}>
                        {event.eventType}
                      </Badge>
                      {event.isBlocked && <Badge variant="warning">BLOCKED</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Domain Risk Monitor */}
        <Card className="bg-gray-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold">Domain Risk Monitor</h2>
            </div>
          </CardHeader>
          <CardBody>
            {/* Input row */}
            <div className="flex gap-3">
              <input
                type="text"
                value={riskDomain}
                onChange={(e) => setRiskDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleRiskScan()}
                placeholder="e.g. example.com"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
              <button
                onClick={() => void handleRiskScan()}
                disabled={riskLoading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
              >
                {riskLoading ? 'Scanning…' : 'Scan'}
              </button>
            </div>

            {/* Error state */}
            {riskError && (
              <div className="mt-4">
                <Alert variant="error">{riskError}</Alert>
              </div>
            )}

            {/* Result */}
            {riskResult !== null && (
              <div className="mt-5 p-5 bg-gray-800 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-400 mb-1">
                    Risk Score for <span className="text-white font-medium">{riskDomain}</span>
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-5xl font-black text-white">
                      {riskResult.score}
                      <span className="text-xl font-normal text-gray-500">/100</span>
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${getRiskLevel(riskResult.score).className}`}
                    >
                      {getRiskLevel(riskResult.score).label}
                    </span>
                  </div>
                </div>
                <a
                  href={`/api/risk/playbook?domain=${encodeURIComponent(riskDomain.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm font-semibold whitespace-nowrap transition"
                >
                  Full Playbook →
                </a>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </ContentWrapper>
  );
}
