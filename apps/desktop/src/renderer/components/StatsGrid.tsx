/**
 * Stats Grid Component
 */

interface StatsGridProps {
  networkStats: {
    totalConnections: number;
    blockedConnections: number;
    activeConnections: number;
  };
  dnsStats: {
    totalQueries: number;
    blockedQueries: number;
    cacheHits: number;
  };
  trackerStats: {
    totalTrackers: number;
    blockedConnections: number;
  };
}

export function StatsGrid({
  networkStats,
  dnsStats,
  trackerStats,
}: StatsGridProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const stats = [
    {
      label: 'Trackers Blocked',
      value: formatNumber(networkStats.blockedConnections),
      color: '#4CAF50',
    },
    {
      label: 'Total Connections',
      value: formatNumber(networkStats.totalConnections),
      color: '#2196F3',
    },
    {
      label: 'DNS Queries Blocked',
      value: formatNumber(dnsStats.blockedQueries),
      color: '#9C27B0',
    },
    {
      label: 'Active Connections',
      value: formatNumber(networkStats.activeConnections),
      color: '#FF9800',
    },
    {
      label: 'DNS Cache Hits',
      value: formatNumber(dnsStats.cacheHits),
      color: '#00BCD4',
    },
    {
      label: 'Unique Trackers',
      value: formatNumber(trackerStats.totalTrackers),
      color: '#F44336',
    },
  ];

  return (
    <div className="stats-grid">
      {stats.map((stat, index) => (
        <div key={index} className="stat-card">
          <div className="stat-value" style={{ color: stat.color }}>
            {stat.value}
          </div>
          <div className="stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
