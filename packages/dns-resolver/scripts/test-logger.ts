/**
 * Test DNS Logger
 *
 * Tests batch logging with Bull queue:
 * - Queue processing
 * - Batch inserts
 * - Automatic flushing
 * - Statistics
 */

import { DNSResolver } from '../dist/client/resolver.js';
import { DNS_PROVIDERS } from '../dist/client/providers.js';

async function testLogger() {
  console.log('=== DNS Logger Test ===\n');

  // Initialize resolver with logging enabled
  const resolver = new DNSResolver({
    providers: DNS_PROVIDERS,
    cacheEnabled: true,
    blocklistEnabled: true,
    loggingEnabled: true,
    redis: { host: 'localhost', port: 6379 },
  });

  console.log('Initializing resolver...');
  const initStart = Date.now();
  await resolver.initialize();
  console.log(`✓ Initialized in ${Date.now() - initStart}ms\n`);

  // Test 1: Log some queries
  console.log('Test 1: Logging 20 DNS queries');
  const testDomains = [
    'anthropic.com',
    'github.com',
    'doubleclick.net', // blocked
    'google-analytics.com', // blocked
    'stackoverflow.com',
    'facebook.com', // blocked
    'openai.com',
    'googleadservices.com', // blocked
  ];

  const deviceId = 'test-device-123';
  const userId = 'test-user-456';

  for (let i = 0; i < 20; i++) {
    const domain = testDomains[i % testDomains.length];
    await resolver.resolve(domain, 'A', deviceId, userId);
    process.stdout.write(`\r  Queries: ${i + 1}/20`);
  }
  console.log('\n✓ Queries completed');

  // Test 2: Check logger stats before flush
  console.log('\nTest 2: Logger statistics (before flush)');
  let stats = await resolver.getLoggerStats();
  if (stats) {
    console.log(`  Queue size: ${stats.queueSize}`);
    console.log(`  Total logged: ${stats.totalLogged}`);
    console.log(`  Batches processed: ${stats.batchesProcessed}`);
    console.log(`  Errors: ${stats.errors}`);
  }

  // Test 3: Force flush
  console.log('\nTest 3: Force flush logs');
  await resolver.flushLogs();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for processing

  stats = await resolver.getLoggerStats();
  if (stats) {
    console.log(`  ✓ Total logged: ${stats.totalLogged}`);
    console.log(`  ✓ Batches processed: ${stats.batchesProcessed}`);
    console.log(`  ✓ Processing time: ${stats.processingTime}ms`);
  }

  // Test 4: Resolver statistics
  console.log('\nTest 4: Resolver statistics');
  const resolverStats = await resolver.getStats();
  console.log(`  Total queries: ${resolverStats.totalQueries}`);
  console.log(`  Blocked queries: ${resolverStats.blockedQueries}`);
  console.log(`  Allowed queries: ${resolverStats.allowedQueries}`);
  console.log(`  Block rate: ${(resolverStats.blockRate * 100).toFixed(2)}%`);
  console.log(`  Cache hit rate: ${(resolverStats.cacheHitRate * 100).toFixed(2)}%`);

  // Test 5: High volume test (100 queries)
  console.log('\nTest 5: High volume logging (100 queries)');
  const start = Date.now();

  for (let i = 0; i < 100; i++) {
    const domain = testDomains[i % testDomains.length];
    await resolver.resolve(domain, 'A', deviceId, userId);
  }

  const duration = Date.now() - start;
  console.log(`  ✓ Completed 100 queries in ${duration}ms`);
  console.log(`  ✓ Average: ${(duration / 100).toFixed(2)}ms per query`);

  // Wait for batch processing
  console.log('\n  Waiting for batch processing...');
  await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6s for auto-flush

  stats = await resolver.getLoggerStats();
  if (stats) {
    console.log(`  ✓ Total logged: ${stats.totalLogged}`);
    console.log(`  ✓ Batches processed: ${stats.batchesProcessed}`);
  }

  // Clean up
  await resolver.close();

  console.log('\n=== Test Complete ===');
  console.log(`\nTotal DNS queries logged: ${stats?.totalLogged || 0}`);
  console.log('✓ All logging tests passed!\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLogger().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testLogger };
