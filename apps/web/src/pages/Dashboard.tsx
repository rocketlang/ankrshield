/**
 * Dashboard Page with overview stats
 */

import { useQuery } from '@apollo/client';
import { useSearchParams } from 'react-router-dom';
import { Shield, Activity, Blocks, TrendingUp, Info } from 'lucide-react';
import ContentWrapper from '../components/layout/ContentWrapper';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
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

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const isDemoMode = searchParams.get('demo') === 'true';

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
  const events = isDemoMode ? DEMO_EVENTS : (eventsData?.networkEvents || []);

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
                  You're viewing ankrshield with sample data. Download the app or create an account to see your real privacy metrics.
                </p>
              </div>
            </div>
          </Alert>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-gray-400">
              Welcome back, {user?.name || user?.email || 'User'}!
            </p>
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
                      {event.isBlocked && (
                        <Badge variant="warning">BLOCKED</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </ContentWrapper>
  );
}
