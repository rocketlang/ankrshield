/**
 * Main Dashboard Component
 * Displays privacy score, stats, and recent activity
 */

import {
  usePrivacyScore,
  useNetworkStats,
  useDnsStats,
  useTopTrackers,
  useIsLoading,
  useError,
} from '../stores/appStore';
import { Card, CardHeader, CardTitle, CardBody, Badge, Alert, Loading } from './ui';

export function Dashboard() {
  const privacyScore = usePrivacyScore();
  const networkStats = useNetworkStats();
  const dnsStats = useDnsStats();
  const topTrackers = useTopTrackers();
  const isLoading = useIsLoading();
  const error = useError();

  if (isLoading && !privacyScore) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading message="Loading dashboard data..." />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="danger" title="Error Loading Data">
          {error}
        </Alert>
      )}

      {/* Privacy Score Card */}
      {privacyScore && (
        <Card className="bg-gradient-to-br from-gray-800 to-gray-900">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="text-7xl font-bold text-ankr-green">{privacyScore.totalScore}</div>
              <div className="text-left">
                <div className="text-sm text-gray-400 uppercase tracking-wide">Privacy Score</div>
                <Badge
                  variant={
                    privacyScore.totalScore < 30
                      ? 'success'
                      : privacyScore.totalScore < 60
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {privacyScore.level}
                </Badge>
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-700">
              <div>
                <div className="text-2xl font-semibold text-ankr-blue">
                  {privacyScore.networkScore}
                </div>
                <div className="text-sm text-gray-400">Network</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-ankr-purple">
                  {privacyScore.dnsScore}
                </div>
                <div className="text-sm text-gray-400">DNS</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-ankr-orange">
                  {privacyScore.appScore}
                </div>
                <div className="text-sm text-gray-400">App</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Network Stats */}
        {networkStats && (
          <>
            <Card hover>
              <CardBody>
                <div className="text-3xl font-bold text-white mb-1">
                  {networkStats.totalConnections.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Total Connections</div>
              </CardBody>
            </Card>

            <Card hover>
              <CardBody>
                <div className="text-3xl font-bold text-ankr-red mb-1">
                  {networkStats.blockedConnections.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Blocked</div>
              </CardBody>
            </Card>
          </>
        )}

        {/* DNS Stats */}
        {dnsStats && (
          <>
            <Card hover>
              <CardBody>
                <div className="text-3xl font-bold text-white mb-1">
                  {dnsStats.totalQueries.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">DNS Queries</div>
              </CardBody>
            </Card>

            <Card hover>
              <CardBody>
                <div className="text-3xl font-bold text-ankr-green mb-1">
                  {Math.round(dnsStats.cacheHitRate * 100)}%
                </div>
                <div className="text-sm text-gray-400">Cache Hit Rate</div>
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {/* Top Trackers */}
      {topTrackers && topTrackers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Trackers Blocked</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {topTrackers.map((tracker, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-white">{tracker.domain}</div>
                    <div className="text-sm text-gray-400">
                      {tracker.category} {tracker.vendor && `• ${tracker.vendor}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-white">{tracker.connections}</div>
                      <div className="text-xs text-gray-400">connections</div>
                    </div>
                    <Badge
                      variant={
                        tracker.riskScore >= 80
                          ? 'danger'
                          : tracker.riskScore >= 60
                            ? 'warning'
                            : 'success'
                      }
                    >
                      Risk: {tracker.riskScore}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Empty State */}
      {!networkStats && !dnsStats && !error && !isLoading && (
        <Alert variant="info" title="No Data Yet">
          Network monitoring will begin capturing data shortly. Make some network requests to see
          activity.
        </Alert>
      )}
    </div>
  );
}
