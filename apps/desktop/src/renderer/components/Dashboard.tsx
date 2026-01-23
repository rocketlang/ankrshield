/**
 * Main Dashboard Component
 */

import { useEffect, useState } from 'react';
import { PrivacyScoreCard } from './PrivacyScoreCard';
import { StatsGrid } from './StatsGrid';
import { RecentActivity } from './RecentActivity';
import { Header } from './Header';

export function Dashboard() {
  const [score, setScore] = useState<any>(null);
  const [networkStats, setNetworkStats] = useState<any>(null);
  const [dnsStats, setDNSStats] = useState<any>(null);
  const [trackerStats, setTrackerStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    // Refresh every 5 seconds for demo purposes (will be configurable later)
    const interval = setInterval(loadData, 5000);

    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [scoreResponse, networkStatsResponse, dnsStatsResponse] = await Promise.all([
        window.electronAPI.privacy.getScore(),
        window.electronAPI.network.getStats(),
        window.electronAPI.dns.getStats(),
      ]);

      if (scoreResponse.success && scoreResponse.data) {
        setScore(scoreResponse.data);
      }

      if (networkStatsResponse.success && networkStatsResponse.data) {
        setNetworkStats(networkStatsResponse.data);
      }

      if (dnsStatsResponse.success && dnsStatsResponse.data) {
        setDNSStats(dnsStatsResponse.data);
        // DNS stats include tracker info
        setTrackerStats({
          totalTrackers: dnsStatsResponse.data.blockedQueries,
          blocked: dnsStatsResponse.data.blockedQueries,
          topDomains: dnsStatsResponse.data.topDomains || [],
        });
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Header />

      <div className="dashboard-content">
        {score && <PrivacyScoreCard score={score} />}

        {networkStats && dnsStats && trackerStats && (
          <StatsGrid
            networkStats={networkStats}
            dnsStats={dnsStats}
            trackerStats={trackerStats}
          />
        )}

        <RecentActivity />
      </div>
    </div>
  );
}
