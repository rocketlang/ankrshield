# @ankrshield/dns-resolver

DNS-over-HTTPS resolver with blocklist management, caching, and logging for ankrshield.

## Features

### Phase 1: DNS Resolver ✅
- **DoH Client** - DNS-over-HTTPS with multiple provider support (Cloudflare, Google, Quad9)
- **Automatic Failover** - Retry with exponential backoff
- **Request Deduplication** - Prevents duplicate concurrent requests
- **DNS Response Parsing** - Handles A, AAAA, CNAME, MX, TXT records

### Phase 2: Blocklist Management (TODO)
- Import blocklists from multiple sources
- Fast domain lookup with Bloom filter + Trie
- Support for 1M+ domains

### Phase 3: Caching (TODO)
- Redis-based DNS caching
- TTL from DNS responses
- Cache hit/miss tracking

### Phase 4: Logging (TODO)
- Batch logging to database
- Queue-based async processing
- DNS statistics aggregation

## Installation

```bash
pnpm add @ankrshield/dns-resolver
```

## Usage

### Basic DNS Resolution

```typescript
import { DNSResolver, DNS_PROVIDERS } from '@ankrshield/dns-resolver';

const resolver = new DNSResolver({
  providers: DNS_PROVIDERS,
  cacheEnabled: true,
  blocklistEnabled: true,
  loggingEnabled: true,
});

// Resolve a domain
const response = await resolver.resolve('example.com', 'A');
console.log(response.answers);
```

### Using the DoH Client Directly

```typescript
import { DoHClient } from '@ankrshield/dns-resolver';

const client = new DoHClient();
const response = await client.resolve('example.com', 'A');
console.log(response);
```

### Provider Configuration

```typescript
import { getProviderByPriority, getProvider } from '@ankrshield/dns-resolver';

// Get all providers sorted by priority
const providers = getProviderByPriority();

// Get a specific provider
const cloudflare = getProvider('Cloudflare');
```

## API Reference

### DNSResolver

Main resolver class with full pipeline (cache → blocklist → DNS → cache → log).

**Constructor:**
```typescript
constructor(config: DNSResolverConfig)
```

**Methods:**
- `resolve(domain, recordType?, deviceId?)` - Resolve a domain
- `isBlocked(domain)` - Check if domain is blocked
- `getStats()` - Get resolver statistics

### DoHClient

Low-level DNS-over-HTTPS client.

**Methods:**
- `resolve(domain, recordType)` - Query DNS over HTTPS
- `cleanupPendingRequests(maxAge?)` - Clean up stale requests

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Architecture

```
src/
├── client/
│   ├── doh-client.ts      # DoH implementation
│   ├── providers.ts       # Provider configurations
│   └── resolver.ts        # Main resolver
├── blocklist/
│   ├── manager.ts         # Blocklist management
│   └── lookup.ts          # Domain lookup
├── cache/
│   └── dns-cache.ts       # Redis caching
├── logger/
│   └── dns-logger.ts      # Query logging
└── index.ts               # Public exports
```

## Roadmap

- [x] **Phase 1**: DoH client with multiple providers
- [ ] **Phase 2**: Blocklist management with Bloom filter
- [ ] **Phase 3**: Redis caching layer
- [ ] **Phase 4**: Batch logging with Bull queue
- [ ] **Phase 5**: GraphQL API integration
- [ ] **Phase 6**: Unit and integration tests
- [ ] **Phase 7**: CLI tool and automation

## License

MIT
