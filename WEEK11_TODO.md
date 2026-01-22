# Week 11-12: Advanced Privacy Scoring

**Timeline:** Apr 2 - Apr 16, 2026 (Accelerated: Jan 22, 2026)
**Status:** In Progress
**Package:** `@ankrshield/privacy-engine` (extended)

---

## Overview

Week 11-12 builds on the tracker classification system from Week 9-10 to create comprehensive, real-time privacy scores that aggregate data across multiple dimensions: network activity, DNS queries, app behavior, and (future) AI agent monitoring. This phase implements TimescaleDB continuous aggregates for performance, trend analysis, and automated privacy reporting.

---

## Objectives

1. Design and implement multi-dimensional privacy scoring algorithm
2. Create TimescaleDB continuous aggregates for efficient queries
3. Build trend analysis engine for historical comparisons
4. Implement automated privacy report generation
5. Extend GraphQL API with privacy score queries
6. Achieve >90% test coverage
7. Optimize for real-time updates and historical analysis

---

## Architecture

### Privacy Score Components

```
Total Privacy Score (0-100) = Weighted Average of:
├── Network Score (40%)      # Network traffic privacy
├── DNS Score (30%)          # DNS query privacy
├── App Score (20%)          # Application behavior privacy
└── AI Score (10%)           # AI agent monitoring (Week 17-20)

Each component scored 0-100 where:
- 0-30: Excellent privacy
- 31-60: Good privacy
- 61-80: Poor privacy
- 81-100: Critical privacy issues
```

### Network Score Calculation

```
Network Score = Base + Tracker Rate + Risk Level + Data Transfer

Components:
- Base: 0 (starting point)
- Tracker Rate: (trackers_contacted / total_connections) * 60
- Risk Level: avg(tracker_risk_scores) * 0.3
- Data Transfer: log10(bytes_to_trackers) * 5
```

### DNS Score Calculation

```
DNS Score = Base + Block Rate + Tracker Queries + Diversity

Components:
- Base: 0 (starting point)
- Block Rate: (blocked_queries / total_queries) * 50
- Tracker Queries: (tracker_queries / total_queries) * 40
- Diversity: (unique_trackers / total_queries) * 10
```

### App Score Calculation

```
App Score = Base + App Tracker Rate + Permission Risk

Components:
- Base: 0 (starting point)
- App Tracker Rate: (apps_with_trackers / total_apps) * 60
- Permission Risk: avg(app_permission_scores) * 40
```

---

## Tasks Breakdown

### Phase 1: Privacy Score Calculator (Days 1-3)

**Create:** `packages/privacy-engine/src/scoring/privacy-calculator.ts`

**Features:**
- Multi-dimensional score calculation
- Component score aggregation
- Real-time score updates
- Historical score tracking
- Configurable weights

**Methods:**
```typescript
class PrivacyCalculator {
  async calculateNetworkScore(userId: string, timeRange: TimeRange): Promise<number>
  async calculateDNSScore(userId: string, timeRange: TimeRange): Promise<number>
  async calculateAppScore(userId: string, timeRange: TimeRange): Promise<number>
  async calculateTotalScore(userId: string, timeRange: TimeRange): Promise<PrivacyScore>
  async getScoreBreakdown(userId: string): Promise<ScoreBreakdown>
}
```

**Database Queries:**
- Aggregate NetworkEvent data by user and time range
- Calculate tracker contact rates
- Compute average risk scores
- Count blocked connections

---

### Phase 2: TimescaleDB Continuous Aggregates (Days 4-6)

**Create:** `prisma/migrations/XXX_privacy_score_aggregates.sql`

**Aggregates:**

1. **Hourly Network Stats:**
```sql
CREATE MATERIALIZED VIEW network_stats_hourly AS
SELECT
  time_bucket('1 hour', timestamp) AS hour,
  "userId",
  COUNT(*) as total_connections,
  SUM(CASE WHEN blocked THEN 1 ELSE 0 END) as blocked_connections,
  COUNT(DISTINCT CASE WHEN tracker_detected THEN domain END) as unique_trackers,
  SUM(bytes_in + bytes_out) as total_bytes,
  AVG(risk_score) as avg_risk_score
FROM "NetworkEvent"
WHERE timestamp > NOW() - INTERVAL '90 days'
GROUP BY hour, "userId"
WITH DATA;
```

2. **Daily Privacy Scores:**
```sql
CREATE MATERIALIZED VIEW privacy_scores_daily AS
SELECT
  time_bucket('1 day', timestamp) AS day,
  "userId",
  -- Network component
  (COUNT(CASE WHEN tracker_detected THEN 1 END)::float / NULLIF(COUNT(*), 0)) * 60 as network_score,
  -- DNS component (join with DNS query logs)
  -- App component (join with app activity)
  -- Total score (weighted average)
FROM "NetworkEvent"
WHERE timestamp > NOW() - INTERVAL '90 days'
GROUP BY day, "userId"
WITH DATA;
```

3. **Refresh Policies:**
```sql
SELECT add_continuous_aggregate_policy('network_stats_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('privacy_scores_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');
```

---

### Phase 3: Trend Analysis Engine (Days 7-9)

**Create:** `packages/privacy-engine/src/analysis/trend-analyzer.ts`

**Features:**
- Week-over-week comparison
- Month-over-month comparison
- Trend direction (improving/worsening)
- Anomaly detection
- Peak usage identification

**Methods:**
```typescript
class TrendAnalyzer {
  async getWeeklyTrend(userId: string): Promise<Trend>
  async getMonthlyTrend(userId: string): Promise<Trend>
  async detectAnomalies(userId: string): Promise<Anomaly[]>
  async getScoreHistory(userId: string, days: number): Promise<ScoreHistory[]>
  async compareTimeRanges(userId: string, range1: TimeRange, range2: TimeRange): Promise<Comparison>
}
```

**Trend Metrics:**
- Absolute change (current - previous)
- Percentage change ((current - previous) / previous * 100)
- Direction (up/down/stable)
- Significance (is change meaningful?)

---

### Phase 4: Privacy Report Generator (Days 10-12)

**Create:** `packages/privacy-engine/src/reports/report-generator.ts`

**Report Types:**

1. **Daily Digest:**
   - Today's privacy score
   - Top 5 trackers contacted
   - Blocked connections count
   - Score trend vs. yesterday

2. **Weekly Summary:**
   - Week's average privacy score
   - Top 10 trackers
   - Top 5 apps by tracker count
   - Week-over-week comparison
   - Notable events (score spikes/drops)

3. **Monthly Report:**
   - Month's privacy score trend
   - Total trackers contacted
   - Total data transferred to trackers
   - Top vendors by data transfer
   - Month-over-month comparison
   - Recommendations for improvement

**Methods:**
```typescript
class ReportGenerator {
  async generateDailyDigest(userId: string, date: Date): Promise<DailyReport>
  async generateWeeklySummary(userId: string, startDate: Date): Promise<WeeklyReport>
  async generateMonthlyReport(userId: string, month: number, year: number): Promise<MonthlyReport>
  async getRecommendations(userId: string): Promise<Recommendation[]>
}
```

**Export Formats:**
- JSON (for API consumption)
- Markdown (for email/display)
- CSV (for data export)

---

### Phase 5: GraphQL API Extensions (Days 13-14)

**File:** `apps/api/src/graphql/schema/privacy-score.ts`

**Schema:**
```graphql
type PrivacyScore {
  userId: ID!
  timestamp: DateTime!
  totalScore: Int!
  networkScore: Int!
  dnsScore: Int!
  appScore: Int!
  aiScore: Int
  level: PrivacyLevel!
  trend: ScoreTrend
}

type ScoreBreakdown {
  totalScore: Int!
  components: [ScoreComponent!]!
  topIssues: [PrivacyIssue!]!
  recommendations: [String!]!
}

type ScoreComponent {
  name: String!
  score: Int!
  weight: Float!
  contributionToTotal: Int!
}

type ScoreTrend {
  direction: TrendDirection!
  change: Int!
  percentageChange: Float!
  comparisonPeriod: String!
}

type PrivacyReport {
  userId: ID!
  period: ReportPeriod!
  startDate: DateTime!
  endDate: DateTime!
  averageScore: Int!
  topTrackers: [TrackerStats!]!
  summary: String!
  recommendations: [String!]!
}

enum PrivacyLevel {
  EXCELLENT
  GOOD
  POOR
  CRITICAL
}

enum TrendDirection {
  IMPROVING
  WORSENING
  STABLE
}

enum ReportPeriod {
  DAILY
  WEEKLY
  MONTHLY
}

type Query {
  privacyScore(userId: ID!): PrivacyScore
  privacyScoreHistory(userId: ID!, days: Int = 30): [PrivacyScore!]!
  privacyScoreBreakdown(userId: ID!): ScoreBreakdown!
  privacyReport(userId: ID!, period: ReportPeriod!, date: DateTime!): PrivacyReport
}

type Subscription {
  privacyScoreUpdated(userId: ID!): PrivacyScore!
}
```

**Resolvers:**
- `privacyScore` - Get current privacy score
- `privacyScoreHistory` - Get historical scores
- `privacyScoreBreakdown` - Get detailed breakdown
- `privacyReport` - Generate privacy report
- `privacyScoreUpdated` - Subscribe to score updates

---

### Phase 6: Real-Time Score Updates (Days 15-16)

**Create:** `packages/privacy-engine/src/realtime/score-updater.ts`

**Features:**
- Event-driven score updates
- Incremental score calculation
- WebSocket notifications
- Score cache management

**Integration Points:**
- NetworkMonitor: On new flow detected
- DNSResolver: On DNS query completed
- TrackerEnricher: On tracker identified

**Methods:**
```typescript
class ScoreUpdater {
  onNetworkEvent(event: NetworkEvent): void
  onDNSQuery(query: DNSQuery): void
  async recalculateScore(userId: string): Promise<PrivacyScore>
  async notifySubscribers(userId: string, score: PrivacyScore): void
}
```

---

### Phase 7: Testing (Days 17-18)

**Tests:**

1. **Unit Tests:**
   - Privacy score calculation (all components)
   - Trend analysis
   - Report generation
   - Score breakdown

2. **Integration Tests:**
   - End-to-end score calculation from network events
   - GraphQL queries
   - Real-time updates
   - Continuous aggregate queries

3. **Performance Tests:**
   - Score calculation for 1M+ events
   - Historical query performance
   - Aggregate refresh time
   - API response times

**Coverage Target:** >90%

---

### Phase 8: Documentation (Days 19-20)

**Documents:**
- Privacy score algorithm explanation
- API documentation
- Report format specifications
- TimescaleDB aggregate documentation
- Performance tuning guide

---

## Deliverables

- [ ] PrivacyCalculator with multi-dimensional scoring
- [ ] TimescaleDB continuous aggregates (hourly, daily)
- [ ] TrendAnalyzer with week/month comparisons
- [ ] ReportGenerator with daily/weekly/monthly reports
- [ ] GraphQL API with 5+ new queries
- [ ] Real-time score updates via WebSocket
- [ ] 90%+ test coverage
- [ ] Complete documentation

---

## Performance Targets

- Privacy score calculation: <100ms
- Historical query (30 days): <200ms
- Report generation: <500ms
- Real-time update latency: <50ms
- Aggregate refresh: <1 minute (hourly), <5 minutes (daily)

---

## Dependencies

**Requires:**
- Week 9-10: Tracker Classification ✅
- Week 7-8: Network Monitor ✅
- Week 5-6: DNS Resolver ✅
- TimescaleDB ✅
- Redis (caching) ✅

**Blocks:**
- Week 15-16: Dashboard UI (needs privacy score API)
- Week 17-20: AI Agent Monitoring (AI score component)

---

## Success Criteria

- [ ] Can calculate privacy score in <100ms
- [ ] Historical scores queryable for 90 days
- [ ] Trends accurately detect improvements/regressions
- [ ] Reports generated for daily/weekly/monthly periods
- [ ] Real-time updates working via WebSocket
- [ ] GraphQL API functional
- [ ] 90%+ test coverage
- [ ] All deliverables complete

---

**Status:** Ready to begin
**Next Action:** Create PrivacyCalculator class

---

*Created: January 22, 2026*
*Owner: ankrshield Engineering Team*
