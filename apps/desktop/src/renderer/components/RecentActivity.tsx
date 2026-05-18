/**
 * Recent Activity Component
 */

import { useEffect, useState } from 'react';

export function RecentActivity() {
  const [events, setEvents] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'events' | 'queries'>('events');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();

    // Refresh every 10 seconds
    const interval = setInterval(loadActivity, 10000);

    return () => clearInterval(interval);
  }, []);

  async function loadActivity() {
    try {
      const [eventsResponse, queriesResponse] = await Promise.all([
        window.electronAPI.network.getEvents(10),
        window.electronAPI.dns.getRecentQueries(10),
      ]);

      if (eventsResponse.success && eventsResponse.data) {
        setEvents(eventsResponse.data);
      }

      if (queriesResponse.success && queriesResponse.data) {
        setQueries(queriesResponse.data);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading activity:', error);
      setLoading(false);
    }
  }

  const formatTimestamp = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="recent-activity">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="recent-activity">
      <div className="activity-header">
        <h2>Recent Activity</h2>
        <div className="activity-tabs">
          <button
            className={`tab ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            Network Events
          </button>
          <button
            className={`tab ${activeTab === 'queries' ? 'active' : ''}`}
            onClick={() => setActiveTab('queries')}
          >
            DNS Queries
          </button>
        </div>
      </div>

      {activeTab === 'events' && (
        <div className="events-list">
          {events.length === 0 ? (
            <div className="empty-state">No recent network events</div>
          ) : (
            events.map((event, index) => (
              <div key={index} className="event-item">
                <div className="event-time">{formatTimestamp(event.timestamp)}</div>
                <div className="event-domain">{event.destinationDomain || event.destinationIP}</div>
                <div className="event-protocol">{event.protocol}</div>
                <div className={`event-status ${event.blocked ? 'blocked' : 'allowed'}`}>
                  {event.blocked ? 'Blocked' : 'Allowed'}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'queries' && (
        <div className="queries-list">
          {queries.length === 0 ? (
            <div className="empty-state">No recent DNS queries</div>
          ) : (
            queries.map((query, index) => (
              <div key={query.id || index} className="query-item">
                <div className="query-time">{formatTimestamp(query.timestamp)}</div>
                <div className="query-domain">{query.domain}</div>
                <div className="query-type">{query.queryType}</div>
                <div className={`query-status ${query.blocked ? 'blocked' : 'allowed'}`}>
                  {query.blocked ? 'Blocked' : 'Allowed'}
                  {query.cached && <span className="cached-badge">Cached</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
