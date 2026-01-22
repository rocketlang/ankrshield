/**
 * Test Blocklist Lookup Performance
 *
 * Tests the Bloom filter + Trie implementation with:
 * - Load time measurement
 * - Lookup performance benchmarks
 * - False positive rate verification
 */

import { BlocklistManager } from '../dist/blocklist/manager.js';

async function testLookup() {
  console.log('=== Blocklist Lookup Performance Test ===\n');

  const manager = new BlocklistManager();

  // Test 1: Load blocklists
  console.log('Test 1: Loading blocklists from database');
  const loadStart = Date.now();
  await manager.loadFromDatabase();
  const loadTime = Date.now() - loadStart;

  console.log(`  ✓ Load time: ${loadTime}ms (${(loadTime / 1000).toFixed(2)}s)`);

  const stats = manager.getStats();
  console.log(`  ✓ Domains loaded: ${stats.domainsLoaded.toLocaleString()}`);
  console.log(`  ✓ Bloom filter false positive rate: ${(stats.bloomFilterFalsePositiveRate * 100).toFixed(4)}%\n`);

  // Test 2: Lookup known blocked domains
  console.log('Test 2: Testing known blocked domains');
  const blockedDomains = [
    'doubleclick.net',
    'googleadservices.com',
    'facebook.com',
    'google-analytics.com',
    'scorecardresearch.com',
  ];

  for (const domain of blockedDomains) {
    const start = performance.now();
    const isBlocked = await manager.isBlocked(domain);
    const duration = performance.now() - start;

    console.log(`  ${isBlocked ? '✓' : '✗'} ${domain}: ${isBlocked ? 'BLOCKED' : 'ALLOWED'} (${duration.toFixed(3)}ms)`);
  }

  // Test 3: Lookup safe domains
  console.log('\nTest 3: Testing safe domains');
  const safeDomains = [
    'github.com',
    'stackoverflow.com',
    'wikipedia.org',
    'cloudflare.com',
    'anthropic.com',
  ];

  for (const domain of safeDomains) {
    const start = performance.now();
    const isBlocked = await manager.isBlocked(domain);
    const duration = performance.now() - start;

    console.log(`  ${!isBlocked ? '✓' : '✗'} ${domain}: ${isBlocked ? 'BLOCKED' : 'ALLOWED'} (${duration.toFixed(3)}ms)`);
  }

  // Test 4: Performance benchmark
  console.log('\nTest 4: Performance benchmark (10,000 lookups)');
  const testDomains = [
    'doubleclick.net',
    'github.com',
    'ads.example.com',
    'safe.example.com',
    'tracker.com',
  ];

  const benchmarkStart = Date.now();
  for (let i = 0; i < 10000; i++) {
    const domain = testDomains[i % testDomains.length];
    await manager.isBlocked(domain);
  }
  const benchmarkTime = Date.now() - benchmarkStart;

  console.log(`  ✓ Total time: ${benchmarkTime}ms`);
  console.log(`  ✓ Average per lookup: ${(benchmarkTime / 10000).toFixed(3)}ms`);
  console.log(`  ✓ Lookups per second: ${Math.round(10000 / (benchmarkTime / 1000)).toLocaleString()}`);

  // Clean up
  await manager.close();

  console.log('\n=== Test Complete ===');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLookup().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testLookup };
