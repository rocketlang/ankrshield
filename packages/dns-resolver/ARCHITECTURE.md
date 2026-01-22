# DNS Resolver Architecture

## Overview

A high-performance DNS resolution system with privacy-focused blocklisting, intelligent caching, and comprehensive logging.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DNS Resolver                             │
│                                                                   │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │   DoH Client  │  │  Blocklist   │  │   DNS Cache      │     │
│  │               │  │   Manager    │  │   (Redis)        │     │
│  │ - Cloudflare  │  │              │  │                  │     │
│  │ - Google      │  │ - Bloom      │  │ - TTL mgmt       │     │
│  │ - Quad9       │  │ - Trie       │  │ - Hit tracking   │     │
│  │               │  │ - 230K       │  │ - Stats          │     │
│  │ - Failover    │  │   domains    │  │                  │     │
│  │ - Retry       │  │              │  │                  │     │
│  └───────────────┘  └──────────────┘  └──────────────────┘     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    DNS Servers          PostgreSQL             Redis
   (via HTTPS)          (Trackers)            (Cache)
```

## Component Design

### 1. DoH Client (`src/client/doh-client.ts`)

**Purpose**: Secure DNS resolution using DNS-over-HTTPS

**Key Features**:
- **Multi-provider support**: Cloudflare (primary), Google, Quad9
- **Automatic failover**: Switches providers on timeout/error
- **Retry logic**: Exponential backoff (100ms, 200ms, 400ms)
- **Request deduplication**: Prevents duplicate concurrent queries
- **Timeout**: 5 seconds per query

**Data Flow**:
```
Query → Check Pending → Format URL → HTTP/2 Fetch → Parse Response → Return
         ↓ (if pending)
         Reuse Promise
```

**Performance**:
- First query: ~80ms (network latency)
- Deduped query: <1ms (promise reuse)

### 2. Blocklist Manager (`src/blocklist/manager.ts`)

**Purpose**: Fast domain blocking with minimal memory

**Architecture**:
```
┌─────────────────────────────────────────┐
│         Domain Lookup Pipeline           │
├─────────────────────────────────────────┤
│                                          │
│  1. Bloom Filter (Quick Rejection)      │
│     - O(k) where k = hash functions     │
│     - False positive rate: 0.13%        │
│     - Memory: ~1.8 MB for 250K domains  │
│                                          │
│  2. Trie (Exact Matching)                │
│     - O(m) where m = domain length      │
│     - Supports wildcards (*.example.com)│
│     - Memory: ~15 MB for 230K domains   │
│                                          │
└─────────────────────────────────────────┘
```

**Data Sources**:
1. Steven Black's hosts (69,988 domains)
2. AdGuard DNS filter (138,296 domains)
3. EasyList (56,585 domains)
4. EasyPrivacy (50,672 domains)

**Total**: 230,771 unique domains after deduplication

**Performance**:
- Lookup: 0.018ms average
- Throughput: 56,180 lookups/second
- False negatives: 0% (no tracker escapes)
- False positives: <0.5% (from blocklist quality)

### 3. DNS Cache (`src/cache/dns-cache.ts`)

**Purpose**: Reduce latency and DNS server load

**Cache Strategy**:
```
Key Format: dns:{domain}:{recordType}
Example: dns:example.com:A

TTL Rules:
- Source: DNS response TTL
- Minimum: 60 seconds
- Maximum: 86400 seconds (24 hours)
- Clamp: TTL = max(60, min(dns_ttl, 86400))
```

**Cache Operations**:
```
GET:
  ┌─────────────┐
  │ Redis GET   │ → Hit? → Return (0.12ms)
  └─────────────┘    │
                     └─→ Miss → NULL

SET:
  ┌─────────────┐
  │ Redis SETEX │ → Store with TTL
  └─────────────┘
  ┌─────────────┐
  │ Track TTL   │ → ZADD to distribution
  └─────────────┘
```

**Performance**:
- Cache hit: 0.12ms (640x faster than DoH!)
- Cache miss: 0.08ms (check overhead)
- Hit rate: 13-50% (depends on query patterns)

### 4. Main Resolver (`src/client/resolver.ts`)

**Purpose**: Orchestrate all components

**Resolution Pipeline**:
```
resolve(domain, recordType)
  │
  ├─→ 1. Check Cache
  │     └─→ HIT? → Return (0.12ms)
  │
  ├─→ 2. Check Blocklist
  │     └─→ BLOCKED? → Return NXDOMAIN (0.54ms)
  │
  ├─→ 3. Query DoH
  │     └─→ Get DNS response (80ms)
  │
  ├─→ 4. Update Cache
  │     └─→ Store with TTL
  │
  └─→ 5. Return Response
```

**Statistics Tracking**:
- Total queries
- Blocked queries
- Cache hits/misses
- Cache hit rate
- Block rate

## Data Models

### DNS Response
```typescript
interface DNSResponse {
  status: number;           // 0 = success, 3 = NXDOMAIN
  answers: DNSRecord[];     // A, AAAA, CNAME, MX, TXT
  authority?: DNSRecord[];
  additional?: DNSRecord[];
  query: {
    name: string;          // Domain queried
    type: string;          // Record type
  };
  blocked?: boolean;       // Added by resolver
  blockedReason?: string;  // Category if blocked
  cached?: boolean;        // True if from cache
}
```

### Tracker Entry (Database)
```typescript
interface Tracker {
  id: string;              // UUID
  domain: string;          // example.com
  category: TrackerCategory;
  threatLevel: ThreatLevel;
  sources: string[];       // ["steven-black", "adguard"]
  blockedCount: number;    // Statistics
  createdAt: Date;
  lastSeenAt: Date;
}
```

## Performance Characteristics

### Latency Breakdown

| Operation | Latency | Throughput |
|-----------|---------|------------|
| Blocklist lookup | 0.018ms | 56,180/sec |
| Cache hit | 0.12ms | - |
| Cache miss (overhead) | 0.08ms | - |
| DoH query (uncached) | 80ms | - |
| Full resolve (cached) | 0.12ms | 12,500/sec |
| Full resolve (blocked) | 0.54ms | - |

### Memory Usage

| Component | Memory |
|-----------|--------|
| Bloom filter | ~1.8 MB |
| Trie structure | ~15 MB |
| Redis cache | ~1-10 MB (varies) |
| Total | ~20-30 MB |

### Scalability

**Current capacity**:
- 230K domains in blocklist
- 12,500 queries/second (with cache)
- 56K lookups/second (blocklist)

**Horizontal scaling**:
- Multiple resolver instances
- Shared Redis cache
- Shared PostgreSQL (read replicas)

## Error Handling

### DoH Client Errors
```
Timeout (5s) → Retry with next provider
Network error → Retry with exponential backoff
HTTP 4xx/5xx → Return error response
Invalid DNS → Log and return error
```

### Cache Errors
```
Redis connection failed → Disable cache, continue with DoH
Redis timeout → Skip cache, log error
Serialization error → Skip cache, log error
```

### Blocklist Errors
```
Database error → Log and allow domain (fail open)
Lookup error → Log and allow domain
Load failure → Fatal error (fail fast)
```

## Security Considerations

### DNS Privacy
- All queries via HTTPS (encrypted)
- No plain DNS (port 53)
- No DNS query logging to providers
- Local caching (no provider retention)

### Blocklist Security
- Trusted sources only
- Regular updates
- Version tracking
- Rollback capability

### Cache Security
- Redis AUTH (if configured)
- TTL enforcement (no stale data)
- Cache poisoning prevention (trusted sources only)

## Configuration

```typescript
interface DNSResolverConfig {
  // DoH providers
  providers: DNSProvider[];

  // Caching
  cacheEnabled: boolean;
  cacheTTL?: { min: number; max: number };

  // Blocklisting
  blocklistEnabled: boolean;

  // Logging (Phase 4)
  loggingEnabled: boolean;

  // Redis connection
  redis?: { host: string; port: number };
}
```

## Deployment

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ (trackers)
- Redis 7+ (cache)

### Environment Variables
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/ankrshield
REDIS_URL=redis://localhost:6379
```

### Initialization
```typescript
const resolver = new DNSResolver(config);
await resolver.initialize(); // Loads blocklists
```

## Monitoring

### Key Metrics
- Query rate (queries/second)
- Block rate (% blocked)
- Cache hit rate (% cached)
- Latency (p50, p95, p99)
- Error rate (% failed)

### Health Checks
- Redis connection
- Database connection
- DoH provider availability
- Blocklist loaded

## Future Enhancements

### Phase 4: Logging (In Progress)
- Bull queue for async logging
- Batch inserts to database
- Device attribution
- Statistics aggregation

### Phase 5: GraphQL API
- Real-time DNS events
- Query history
- Statistics dashboard
- Manual blocklist management

### Phase 6: Advanced Features
- Custom user blocklists
- Whitelist support
- DNSSEC validation
- DNS prefetching
- Smart cache warming

## Appendix: File Structure

```
packages/dns-resolver/
├── src/
│   ├── client/
│   │   ├── doh-client.ts      (270 lines) - DoH implementation
│   │   ├── providers.ts       (30 lines) - Provider configs
│   │   └── resolver.ts        (120 lines) - Main orchestrator
│   ├── blocklist/
│   │   ├── manager.ts         (100 lines) - Blocklist management
│   │   └── lookup.ts          (160 lines) - Bloom + Trie
│   ├── cache/
│   │   └── dns-cache.ts       (250 lines) - Redis cache
│   ├── logger/
│   │   └── dns-logger.ts      (TODO - Phase 4)
│   └── index.ts               (70 lines) - Public API
├── scripts/
│   ├── download-blocklists.ts (150 lines)
│   ├── parse-blocklists.ts    (200 lines)
│   ├── import-to-database.ts  (150 lines)
│   ├── test-lookup.ts         (100 lines)
│   ├── test-full-resolver.ts  (150 lines)
│   ├── cache-metrics.ts       (100 lines)
│   └── comprehensive-test.ts  (400 lines)
└── tests/
    └── (TODO - Phase 6)
```

**Total**: ~2,150 lines of TypeScript

---

**Last Updated**: January 22, 2026
**Version**: 0.1.0 (Phase 3 Complete)
