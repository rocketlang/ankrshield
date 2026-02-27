/**
 * WatchDetail Page — deep-dive view for a single watched domain.
 *
 * Route: /watch/:watchId  (protected)
 *
 * Shows:
 *   - Domain header with last risk score
 *   - Alert history timeline (WatchAlerts)
 *   - Remediation playbook (STARTER+ only)
 */

import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { ArrowLeft, Shield, Bell } from 'lucide-react';

import AlertTimeline from '../components/AlertTimeline';
import PlaybookViewer from '../components/PlaybookViewer';
import ContentWrapper from '../components/layout/ContentWrapper';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import {
  WATCHES_QUERY,
  WATCH_ALERTS_QUERY,
  PLAYBOOK_QUERY,
} from '../graphql/queries';

export default function WatchDetail() {
  const { watchId } = useParams<{ watchId: string }>();
  const apiKey = localStorage.getItem('ankrshield_api_key');

  // Find the watch from the watches list
  const { data: watchesData } = useQuery(WATCHES_QUERY, { skip: !apiKey });
  const watch = watchesData?.xshieldWatches?.find((w: { id: string }) => w.id === watchId);

  // Load alerts for this watch
  const { data: alertsData, loading: alertsLoading } = useQuery(WATCH_ALERTS_QUERY, {
    variables: { watchId, limit: 50 },
    skip: !watchId || !apiKey,
  });
  const alerts = alertsData?.xshieldWatchAlerts ?? [];

  // Load playbook for this domain (if watch found)
  const { data: playbookData, loading: playbookLoading } = useQuery(PLAYBOOK_QUERY, {
    variables: { domain: watch?.domain },
    skip: !watch?.domain || !apiKey,
    fetchPolicy: 'cache-first',
  });
  const playbook = playbookData?.xshieldPlaybook ?? null;

  // Get API key tier from localStorage or default FREE
  const storedKeyInfo = localStorage.getItem('ankrshield_key_info');
  const tier: string = storedKeyInfo
    ? ((JSON.parse(storedKeyInfo) as { tier?: string }).tier ?? 'FREE')
    : 'FREE';

  // Watch not found after data loaded
  if (!watch && watchesData) {
    return (
      <ContentWrapper>
        <div className="text-center py-20 text-gray-500">Watch not found.</div>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <div className="space-y-6">

        {/* Back button */}
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </a>

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Shield className="w-6 h-6 text-violet-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{watch?.domain ?? 'Loading...'}</h1>
            <p className="text-sm text-gray-400">Domain Watch Detail</p>
          </div>
          {watch?.lastRiskScore != null && (
            <span className="ml-auto text-3xl font-bold text-white shrink-0">
              {watch.lastRiskScore}{' '}
              <span className="text-sm text-gray-500">/ 100</span>
            </span>
          )}
        </div>

        {/* Watch meta row */}
        {watch && (
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <span>
              Status:{' '}
              <span className="text-white font-medium">{watch.status}</span>
            </span>
            {watch.alertThreshold != null && (
              <span>
                Alert threshold:{' '}
                <span className="text-white font-medium">{watch.alertThreshold}</span>
              </span>
            )}
            {watch.createdAt && (
              <span>
                Watching since:{' '}
                <span className="text-white font-medium">
                  {new Date(watch.createdAt as string).toLocaleDateString()}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Alert timeline */}
        <Card className="bg-gray-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold">Alert History</h2>
              <span className="ml-auto text-xs text-gray-500">
                {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </CardHeader>
          <CardBody>
            {alertsLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-800 rounded" />
                ))}
              </div>
            ) : (
              <AlertTimeline alerts={alerts} />
            )}
          </CardBody>
        </Card>

        {/* Playbook */}
        <Card className="bg-gray-900">
          <CardHeader>
            <h2 className="text-lg font-semibold">Remediation Playbook</h2>
          </CardHeader>
          <CardBody>
            {playbookLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-800 rounded" />
                ))}
              </div>
            ) : (
              <PlaybookViewer playbook={playbook} tier={tier} />
            )}
          </CardBody>
        </Card>

      </div>
    </ContentWrapper>
  );
}
