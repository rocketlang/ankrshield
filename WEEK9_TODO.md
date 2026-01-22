# Week 9-10: Tracker Classification

**Timeline:** Mar 19 - Apr 2, 2026
**Status:** Planning
**Package:** `@ankrshield/privacy-engine`

---

## Overview

Week 9-10 focuses on building a comprehensive tracker classification system that categorizes domains into advertising, analytics, social media, malware, and other privacy-impacting categories. This phase integrates with the existing DNS resolver and network monitor to provide real-time tracker detection and vendor attribution.

---

## Objectives

1. Import and normalize multiple tracker databases
2. Implement efficient domain classification system
3. Build vendor attribution and grouping
4. Create risk scoring algorithm for trackers
5. Provide GraphQL API for tracker queries
6. Optimize for high-performance lookups (100k+ queries/min)

---

## Tasks Breakdown

### Phase 1: Tracker Database (Days 1-3)

**Import Tracker Lists:**

- [ ] Download and parse Disconnect Tracker Protection list
  - [ ] Parse JSON format
  - [ ] Extract categories and vendors
  - [ ] Normalize domain format
- [ ] Download and parse Privacy Badger list
  - [ ] Parse format
  - [ ] Extract tracking patterns
- [ ] Download and parse uBlock Origin filters
  - [ ] Parse EasyList format
  - [ ] Extract domain rules
  - [ ] Handle wildcards and patterns
- [ ] Additional sources:
  - [ ] EasyPrivacy
  - [ ] Fanboy's Annoyance List
  - [ ] AdGuard filters

**Database Schema:**

Already exists in Prisma schema - verify and extend if needed:

```prisma
model Tracker {
  id          String       @id @default(cuid())
  domain      String       @unique
  category    String?      // advertising, analytics, social, malware, etc.
  vendor      String?      // Google, Facebook, Amazon, etc.
  threatLevel ThreatLevel? @default(MEDIUM)
  sources     String[]     // List source names
  description String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([category])
  @@index([vendor])
  @@index([threatLevel])
}
```

**Tasks:**

- [ ] Create import script: `packages/privacy-engine/scripts/import-trackers.ts`
- [ ] Implement parser for each format
- [ ] Deduplicate entries across sources
- [ ] Assign categories (advertising, analytics, social, telemetry, malware, cdn)
- [ ] Map to parent vendors (Google = youtube.com, google-analytics.com, etc.)
- [ ] Populate Tracker table
- [ ] Add indexes for fast lookup
- [ ] Test with sample data

**Expected Output:**

- 1M+ tracker domains in database
- Categorized and vendor-attributed
- Import script that can be run daily for updates

---

### Phase 2: Domain Classifier (Days 4-6)

**Create Package:**

- [ ] Create `packages/privacy-engine` package
- [ ] Setup TypeScript configuration
- [ ] Add dependencies:
  - [ ] `@prisma/client`
  - [ ] `ioredis` (caching)
  - [ ] `tldts` (domain parsing)

**Classifier Implementation:**

File: `packages/privacy-engine/src/classifier.ts`

```typescript
export class DomainClassifier {
  constructor(
    private prisma: PrismaClient,
    private cache: Redis
  ) {}

  async classify(domain: string): Promise<TrackerInfo | null>;
  async batchClassify(domains: string[]): Promise<Map<string, TrackerInfo>>;
  private checkDatabase(domain: string): Promise<Tracker | null>;
  private checkPatterns(domain: string): boolean;
  private extractBaseDomain(domain: string): string;
}
```

**Tasks:**

- [ ] Implement `DomainClassifier` class
- [ ] Database lookup with Prisma
- [ ] Handle subdomains (check parent domain if subdomain not found)
- [ ] Pattern matching for wildcards (e.g., `*.doubleclick.net`)
- [ ] Redis caching layer (5-minute TTL)
- [ ] Batch classification for performance
- [ ] Handle edge cases:
  - [ ] Invalid domains
  - [ ] New/unknown domains
  - [ ] CDNs vs trackers
- [ ] Unit tests

**Performance Requirements:**

- Single lookup: <5ms (cached), <20ms (database)
- Batch lookup (100 domains): <100ms
- Cache hit rate: >90%

---

### Phase 3: Vendor Analysis (Days 7-9)

**Vendor Grouping:**

File: `packages/privacy-engine/src/vendor-analyzer.ts`

```typescript
export class VendorAnalyzer {
  async getVendorStats(userId: string, timeRange: TimeRange): Promise<VendorStats[]>;
  async getTopVendors(userId: string, limit: number): Promise<Vendor[]>;
  async getVendorTimeline(userId: string, vendorId: string): Promise<Timeline>;
  private groupByVendor(trackers: Tracker[]): Map<string, Tracker[]>;
}
```

**Tasks:**

- [ ] Implement vendor grouping logic
- [ ] Create vendor hierarchy (parent companies)
  - [ ] Google (Alphabet)
  - [ ] Facebook (Meta)
  - [ ] Amazon
  - [ ] Microsoft
  - [ ] Apple
  - [ ] Bytedance
  - [ ] Others
- [ ] Calculate per-vendor statistics:
  - [ ] Total requests
  - [ ] Blocked requests
  - [ ] Data transferred
  - [ ] Domains contacted
- [ ] Create TimescaleDB continuous aggregates for vendor stats
- [ ] Cache vendor stats (1-hour TTL)
- [ ] Unit tests

---

### Phase 4: Risk Scoring (Days 10-11)

**Risk Algorithm:**

File: `packages/privacy-engine/src/risk-scorer.ts`

```typescript
export class RiskScorer {
  calculateRisk(tracker: Tracker): number; // 0-100
  getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical';
  private getCategoryWeight(category: string): number;
  private getVendorWeight(vendor: string): number;
}
```

**Risk Formula:**

```
Risk Score = Base Score + Category Weight + Vendor Weight + Threat Level

Base Score: 10 (all trackers have some risk)

Category Weights:
- malware: 80
- phishing: 90
- cryptomining: 70
- advertising: 40
- fingerprinting: 50
- analytics: 25
- social: 20
- telemetry: 15
- cdn: 5

Vendor Weights (data collection history):
- Facebook/Meta: +15
- Google: +10
- Amazon: +8
- Others: +0

Threat Level (from database):
- CRITICAL: +40
- HIGH: +30
- MEDIUM: +15
- LOW: +5

Risk Levels:
- Low: 0-30
- Medium: 31-60
- High: 61-80
- Critical: 81-100
```

**Tasks:**

- [ ] Implement risk scoring algorithm
- [ ] Test with known trackers
- [ ] Calibrate weights based on privacy research
- [ ] Add to tracker classification flow
- [ ] Store risk scores in database
- [ ] Unit tests

---

### Phase 5: GraphQL API (Days 12-13)

**Schema Extensions:**

File: `apps/api/src/graphql/schema/tracker.ts`

```graphql
type Tracker {
  id: ID!
  domain: String!
  category: String
  vendor: String
  threatLevel: ThreatLevel
  riskScore: Int
  sources: [String!]!
  description: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type VendorStats {
  vendor: String!
  domains: Int!
  requests: Int!
  blocked: Int!
  dataTransferred: Int!
  riskScore: Int!
}

type Query {
  tracker(domain: String!): Tracker
  trackers(category: String, vendor: String, limit: Int = 50, offset: Int = 0): [Tracker!]!

  topTrackers(userId: ID!, timeRange: TimeRangeInput!, limit: Int = 10): [TrackerStats!]!

  vendorStats(userId: ID!, timeRange: TimeRangeInput!): [VendorStats!]!
}

input TimeRangeInput {
  start: DateTime!
  end: DateTime!
}

enum ThreatLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

**Tasks:**

- [ ] Create Pothos schema types
- [ ] Implement resolvers:
  - [ ] `tracker(domain)`
  - [ ] `trackers(category, vendor)`
  - [ ] `topTrackers(userId, timeRange)`
  - [ ] `vendorStats(userId, timeRange)`
- [ ] Add authentication guards
- [ ] Add rate limiting
- [ ] Add query complexity limits
- [ ] Test with GraphiQL

---

### Phase 6: Integration (Days 14-15)

**Integrate with Network Monitor:**

File: `packages/network-monitor/src/integration/tracker-enricher.ts`

Already implemented in Week 7-8, verify it works with new classifier:

- [ ] Verify TrackerEnricher uses DomainClassifier
- [ ] Test with real network flows
- [ ] Verify caching works
- [ ] Verify batch operations

**Integrate with DNS Resolver:**

File: `packages/dns-resolver/src/resolver.ts`

- [ ] Add tracker classification to DNS responses
- [ ] Block malicious domains (malware, phishing)
- [ ] Log tracker category in NetworkEvent table
- [ ] Add optional blocking by category

**Update Privacy Scorer:**

File: `packages/network-monitor/src/integration/privacy-scorer.ts`

Already uses tracker info - verify risk scoring alignment:

- [ ] Use new risk scores from RiskScorer
- [ ] Test with various tracker categories
- [ ] Verify privacy score calculation

---

### Phase 7: Testing (Days 16-17)

**Unit Tests:**

- [ ] DomainClassifier
  - [ ] Database lookup
  - [ ] Pattern matching
  - [ ] Subdomain handling
  - [ ] Caching
- [ ] VendorAnalyzer
  - [ ] Vendor grouping
  - [ ] Statistics calculation
- [ ] RiskScorer
  - [ ] Risk calculation
  - [ ] Category weights
  - [ ] Risk levels

**Integration Tests:**

- [ ] Import tracker lists (end-to-end)
- [ ] Classify known trackers
- [ ] Vendor attribution accuracy
- [ ] GraphQL queries
- [ ] Network monitor integration

**Performance Tests:**

- [ ] Single classification: <5ms (cached)
- [ ] Batch classification: <100ms (100 domains)
- [ ] Database query performance
- [ ] Cache hit rate >90%

**Data Quality:**

- [ ] Verify 1M+ trackers imported
- [ ] Check category distribution
- [ ] Check vendor attribution accuracy
- [ ] Spot-check known trackers (Google Analytics, Facebook Pixel, etc.)

---

### Phase 8: Documentation (Days 18-19)

**Technical Documentation:**

- [ ] Architecture overview
- [ ] Database schema
- [ ] API documentation
- [ ] Performance benchmarks

**User Documentation:**

- [ ] Tracker categories explained
- [ ] Risk levels explained
- [ ] Vendor attribution
- [ ] How to interpret tracker data

**Code Documentation:**

- [ ] JSDoc comments
- [ ] Type definitions
- [ ] Usage examples

---

## Deliverables

At the end of Week 9-10, the following should be complete:

- [ ] Tracker database populated with 1M+ domains
- [ ] DomainClassifier working with <5ms lookup time
- [ ] Vendor attribution for top 50+ companies
- [ ] Risk scoring algorithm implemented
- [ ] GraphQL API for tracker queries
- [ ] Integration with DNS resolver and network monitor
- [ ] 90%+ test coverage
- [ ] Documentation complete

---

## Performance Targets

- **Database Size:** 1M+ tracker domains
- **Classification Speed:**
  - Cached: <1ms
  - Database: <20ms
  - Batch (100): <100ms
- **Cache Hit Rate:** >90%
- **Memory Usage:** <200MB (classifier + cache)
- **Accuracy:** >95% for known trackers

---

## Dependencies

**Requires:**

- Week 5-6: DNS Resolver ✅
- Week 7-8: Network Monitor ✅
- Database: PostgreSQL + Prisma ✅
- Cache: Redis ✅

**Blocks:**

- Week 11-12: Privacy Scoring (needs tracker classification)
- Week 15-16: Dashboard UI (needs tracker API)

---

## Risk Mitigation

**Risks:**

1. **Data Quality:** Tracker lists may be outdated or incomplete
   - Mitigation: Use multiple sources, regular updates
2. **Performance:** Large database may slow lookups
   - Mitigation: Aggressive caching, database indexing
3. **False Positives:** Legitimate domains classified as trackers
   - Mitigation: Manual review of high-traffic domains, user feedback

---

## Next Steps After Week 9-10

**Week 11-12: Privacy Scoring**

Build on tracker classification to create comprehensive privacy scores:

- Network score (based on tracker block rate)
- DNS score (DNS queries to trackers)
- App score (app behavior analysis)
- AI score (AI agent safety - Week 17-20)

**Week 13-14: Desktop App**

Use tracker data in desktop UI:

- Real-time tracker alerts
- Vendor breakdown charts
- Top trackers blocked widget

---

## Success Criteria

- [ ] Can classify any domain in <5ms (cached)
- [ ] 1M+ trackers in database
- [ ] Top 50+ vendors attributed
- [ ] GraphQL API functional
- [ ] Zero performance regressions in DNS/network monitor
- [ ] 90%+ test coverage
- [ ] All integration tests passing

---

**Status:** Ready to begin
**Next Action:** Create packages/privacy-engine package and start Phase 1

---

_Created: January 22, 2026_
_Owner: ankrshield Engineering Team_
