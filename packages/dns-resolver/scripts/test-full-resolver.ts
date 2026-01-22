/**
 * Test Full DNS Resolver
 *
 * Tests the complete resolver with:
 * - DNS-over-HTTPS queries
 * - Blocklist checking
 * - Redis caching
 * - Performance metrics
 */

import { DNSResolver } from '../dist/client/resolver.js';
import { DNS_PROVIDERS } from '../dist/client/providers.js';

async function testFullResolver() {
  console.log('=== Full DNS Resolver Test ===\n');

  // Initialize resolver with all features enabled
  const resolver = new DNSResolver({
    providers: DNS_PROVIDERS,
    cacheEnabled: true,
    blocklistEnabled: true,
    loggingEnabled: false,
    cacheTTL: { min: 60, max: 86400 },
    redis: {
      host: 'localhost',
      port: 6379,
    },
  });

  console.log('Initializing resolver (loading blocklists)...');
  const initStart = Date.now();
  await resolver.initialize();
  const initTime = Date.now() - initStart;
  console.log(`✓ Initialized in ${initTime}ms\n`);

  // Test 1: Resolve safe domain (should NOT be blocked)
  console.log('Test 1: Resolving safe domain (anthropic.com)');
  let start = performance.now();
  const safeResult1 = await resolver.resolve('anthropic.com', 'A');
  let duration = performance.now() - start;

  console.log(`  Status: ${safeResult1.blocked ? 'BLOCKED ✗' : 'ALLOWED ✓'}`);
  console.log(`  Cached: ${safeResult1.cached ? 'Yes' : 'No'}`);
  console.log(`  Answers: ${safeResult1.answers.length}`);
  console.log(`  Time: ${duration.toFixed(2)}ms`);
  if (safeResult1.answers.length > 0) {
    console.log(`  IP: ${safeResult1.answers[0].data}`);
    console.log(`  TTL: ${safeResult1.answers[0].ttl}s`);
  }

  // Test 2: Resolve same domain (should be cached)
  console.log('\nTest 2: Resolving same domain (should hit cache)');
  start = performance.now();
  const safeResult2 = await resolver.resolve('anthropic.com', 'A');
  duration = performance.now() - start;

  console.log(`  Status: ${safeResult2.blocked ? 'BLOCKED ✗' : 'ALLOWED ✓'}`);
  console.log(`  Cached: ${safeResult2.cached ? 'Yes ✓' : 'No ✗'}`);
  console.log(`  Time: ${duration.toFixed(2)}ms`);

  // Test 3: Resolve blocked domain
  console.log('\nTest 3: Resolving blocked domain (doubleclick.net)');
  start = performance.now();
  const blockedResult = await resolver.resolve('doubleclick.net', 'A');
  duration = performance.now() - start;

  console.log(`  Status: ${blockedResult.blocked ? 'BLOCKED ✓' : 'ALLOWED ✗'}`);
  console.log(`  Reason: ${blockedResult.blockedReason || 'N/A'}`);
  console.log(`  Time: ${duration.toFixed(2)}ms`);

  // Test 4: Multiple queries to test cache hit rate
  console.log('\nTest 4: Running 100 queries (mix of safe and blocked domains)');
  const testDomains = [
    'anthropic.com',
    'github.com',
    'doubleclick.net',
    'google-analytics.com',
    'stackoverflow.com',
    'facebook.com',
    'wikipedia.org',
    'googleadservices.com',
  ];

  const benchStart = Date.now();
  for (let i = 0; i < 100; i++) {
    const domain = testDomains[i % testDomains.length];
    await resolver.resolve(domain, 'A');
  }
  const benchTime = Date.now() - benchStart;

  console.log(`  ✓ Completed 100 queries in ${benchTime}ms`);
  console.log(`  ✓ Average: ${(benchTime / 100).toFixed(2)}ms per query`);

  // Test 5: Get statistics
  console.log('\nTest 5: Resolver Statistics');
  const stats = await resolver.getStats();

  console.log(`  Total queries: ${stats.totalQueries}`);
  console.log(`  Blocked queries: ${stats.blockedQueries}`);
  console.log(`  Allowed queries: ${stats.allowedQueries}`);
  console.log(`  Block rate: ${(stats.blockRate * 100).toFixed(2)}%`);
  console.log(`  Cache hits: ${stats.cacheHits}`);
  console.log(`  Cache misses: ${stats.cacheMisses}`);
  console.log(`  Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(2)}%`);
  console.log(`  Cache size: ${stats.cacheSize} entries`);
  console.log(`  Avg cache TTL: ${stats.avgCacheTTL}s`);

  // Test 6: Test isBlocked method
  console.log('\nTest 6: Testing isBlocked() method');
  const blockedCheck1 = await resolver.isBlocked('doubleclick.net');
  console.log(`  doubleclick.net: ${blockedCheck1.blocked ? 'BLOCKED ✓' : 'ALLOWED ✗'}`);
  console.log(`    Reason: ${blockedCheck1.reason || 'N/A'}`);

  const blockedCheck2 = await resolver.isBlocked('anthropic.com');
  console.log(`  anthropic.com: ${blockedCheck2.blocked ? 'BLOCKED ✗' : 'ALLOWED ✓'}`);

  // Clean up
  await resolver.close();

  console.log('\n=== Test Complete ===');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testFullResolver().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testFullResolver };
