/**
 * Dashboard Page with overview stats
 */

import { useQuery } from '@apollo/client';
import { Shield, Activity, Block, TrendingUp } from 'lucide-react';
import ContentWrapper from '../components/layout/ContentWrapper';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import { ME_QUERY, PRIVACY_SCORES_QUERY, NETWORK_EVENTS_QUERY } from '../graphql/queries';

export default function Dashboard() {
  const { data: userData, loading: userLoading } = useQuery(ME_QUERY);
  const { data: scoresData, loading: scoresLoading } = useQuery(PRIVACY_SCORES_QUERY, {
    variables: { limit: 1, period: 'daily' },
  });
  const { data: eventsData, loading: eventsLoading } = useQuery(NETWORK_EVENTS_QUERY, {
    variables: { limit: 10 },
  });

  const user = userData?.me;
  const latestScore = scoresData?.privacyScores?.[0];
  const events = eventsData?.networkEvents || [];

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
      icon: <Block className="w-8 h-8 text-red-400" />,
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
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-400">
            Welcome back, {user?.name || user?.email || 'User'}!
          </p>
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
                      {scoresLoading ? '...' : stat.value.toLocaleString()}
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
            {eventsLoading ? (
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
