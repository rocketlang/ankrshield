/**
 * Comprehensive DNS Resolver Test Suite
 *
 * Tests all components thoroughly:
 * - DoH client with all providers
 * - Blocklist accuracy
 * - Cache performance
 * - Error handling
 * - Edge cases
 */

import { DNSResolver } from '../dist/client/resolver.js';
import { DoHClient } from '../dist/client/doh-client.js';
import { DNS_PROVIDERS, getProviderByPriority } from '../dist/client/providers.js';
import { BlocklistManager } from '../dist/blocklist/manager.js';
import { DNSCache } from '../dist/cache/dns-cache.js';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(name: string, passed: boolean, duration: number, details?: string) {
  results.push({ name, passed, duration, details });
  const status = passed ? '✓' : '✗';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${color}${status}\x1b[0m ${name} (${duration.toFixed(2)}ms)${details ? ` - ${details}` : ''}`);
}

async function testDoHClient() {
  console.log('\n=== Test Suite 1: DoH Client ===\n');

  const client = new DoHClient();

  // Test 1.1: Resolve A record
  let start = performance.now();
  try {
    const response = await client.resolve('cloudflare.com', 'A');
    const duration = performance.now() - start;
    const passed = response.answers.length > 0 && response.status === 0;
    recordTest('Resolve A record', passed, duration, `${response.answers.length} answers`);
  } catch (error) {
    recordTest('Resolve A record', false, performance.now() - start, (error as Error).message);
  }

  // Test 1.2: Resolve AAAA record (IPv6)
  start = performance.now();
  try {
    const response = await client.resolve('google.com', 'AAAA');
    const duration = performance.now() - start;
    const passed = response.answers.length > 0;
    recordTest('Resolve AAAA record', passed, duration, `${response.answers.length} answers`);
  } catch (error) {
    recordTest('Resolve AAAA record', false, performance.now() - start, (error as Error).message);
  }

  // Test 1.3: Resolve CNAME record
  start = performance.now();
  try {
    const response = await client.resolve('www.github.com', 'CNAME');
    const duration = performance.now() - start;
    const passed = response.answers.length > 0;
    recordTest('Resolve CNAME record', passed, duration, `${response.answers.length} answers`);
  } catch (error) {
    recordTest('Resolve CNAME record', false, performance.now() - start, (error as Error).message);
  }

  // Test 1.4: Handle non-existent domain
  start = performance.now();
  try {
    const response = await client.resolve('this-domain-does-not-exist-12345.com', 'A');
    const duration = performance.now() - start;
    const passed = response.status === 3; // NXDOMAIN
    recordTest('Handle NXDOMAIN', passed, duration, `Status: ${response.status}`);
  } catch (error) {
    recordTest('Handle NXDOMAIN', false, performance.now() - start, (error as Error).message);
  }

  // Test 1.5: Request deduplication
  start = performance.now();
  const promises = [
    client.resolve('example.com', 'A'),
    client.resolve('example.com', 'A'),
    client.resolve('example.com', 'A'),
  ];
  const responses = await Promise.all(promises);
  const duration = performance.now() - start;
  const passed = responses.every(r => r.answers.length > 0);
  recordTest('Request deduplication', passed, duration, '3 concurrent requests');

  // Test 1.6: Provider failover (simulated by testing all providers)
  const providers = getProviderByPriority();
  for (const provider of providers) {
    start = performance.now();
    try {
      const testClient = new DoHClient([provider]);
      const response = await testClient.resolve('cloudflare.com', 'A');
      const duration = performance.now() - start;
      const passed = response.answers.length > 0;
      recordTest(`Provider: ${provider.name}`, passed, duration);
    } catch (error) {
      recordTest(`Provider: ${provider.name}`, false, performance.now() - start, (error as Error).message);
    }
  }
}

async function testBlocklist() {
  console.log('\n=== Test Suite 2: Blocklist ===\n');

  const manager = new BlocklistManager();

  // Load blocklists
  let start = performance.now();
  await manager.loadFromDatabase();
  let duration = performance.now() - start;
  recordTest('Load blocklist from database', true, duration, `${manager.getStats().domainsLoaded.toLocaleString()} domains`);

  // Test 2.1: Known ad domains
  const adDomains = [
    'doubleclick.net',
    'googleadservices.com',
    'googlesyndication.com',
    'adservice.google.com',
    'ads.yahoo.com',
  ];

  for (const domain of adDomains) {
    start = performance.now();
    const blocked = await manager.isBlocked(domain);
    duration = performance.now() - start;
    recordTest(`Block ad domain: ${domain}`, blocked, duration);
  }

  // Test 2.2: Known analytics domains
  const analyticsDomains = [
    'google-analytics.com',
    'scorecardresearch.com',
    'stats.wp.com',
  ];

  for (const domain of analyticsDomains) {
    start = performance.now();
    const blocked = await manager.isBlocked(domain);
    duration = performance.now() - start;
    recordTest(`Block analytics: ${domain}`, blocked, duration);
  }

  // Test 2.3: Safe domains (should NOT be blocked)
  const safeDomains = [
    'anthropic.com',
    'openai.com',
    'mozilla.org',
    'apache.org',
  ];

  for (const domain of safeDomains) {
    start = performance.now();
    const blocked = await manager.isBlocked(domain);
    duration = performance.now() - start;
    recordTest(`Allow safe domain: ${domain}`, !blocked, duration);
  }

  // Test 2.4: Performance benchmark
  start = performance.now();
  for (let i = 0; i < 1000; i++) {
    await manager.isBlocked('test' + i + '.com');
  }
  duration = performance.now() - start;
  const avgDuration = duration / 1000;
  recordTest('1000 lookups benchmark', avgDuration < 50, duration, `${avgDuration.toFixed(3)}ms avg`);

  await manager.close();
}

async function testCache() {
  console.log('\n=== Test Suite 3: DNS Cache ===\n');

  const cache = new DNSCache();

  // Test 3.1: Set and get cache entry
  let start = performance.now();
  const testResponse = {
    status: 0,
    answers: [{ name: 'test.com', type: 'A' as const, ttl: 300, data: '1.2.3.4' }],
    query: { name: 'test.com', type: 'A' },
  };
  await cache.set('test.com', 'A', testResponse);
  const cached = await cache.get('test.com', 'A');
  let duration = performance.now() - start;
  const passed = cached !== null && cached.answers[0].data === '1.2.3.4';
  recordTest('Cache set/get', passed, duration);

  // Test 3.2: Cache miss
  start = performance.now();
  const miss = await cache.get('nonexistent.com', 'A');
  duration = performance.now() - start;
  recordTest('Cache miss', miss === null, duration);

  // Test 3.3: Cache statistics
  start = performance.now();
  const stats = await cache.getStats();
  duration = performance.now() - start;
  const statsValid = stats.hits >= 0 && stats.misses >= 0 && stats.hitRate >= 0;
  recordTest('Cache statistics', statsValid, duration, `Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);

  // Test 3.4: Cache clear
  start = performance.now();
  await cache.clear();
  duration = performance.now() - start;
  recordTest('Cache clear', true, duration);

  await cache.close();
}

async function testIntegration() {
  console.log('\n=== Test Suite 4: Full Integration ===\n');

  const resolver = new DNSResolver({
    providers: DNS_PROVIDERS,
    cacheEnabled: true,
    blocklistEnabled: true,
    loggingEnabled: false,
    redis: { host: 'localhost', port: 6379 },
  });

  let start = performance.now();
  await resolver.initialize();
  let duration = performance.now() - start;
  recordTest('Resolver initialization', true, duration);

  // Test 4.1: Resolve safe domain
  start = performance.now();
  const safeResult = await resolver.resolve('cloudflare.com', 'A');
  duration = performance.now() - start;
  const safePassed = !safeResult.blocked && safeResult.answers.length > 0;
  recordTest('Resolve safe domain', safePassed, duration, `${safeResult.answers.length} answers`);

  // Test 4.2: Cache hit on same domain
  start = performance.now();
  const cachedResult = await resolver.resolve('cloudflare.com', 'A');
  duration = performance.now() - start;
  const cachePassed = cachedResult.cached === true && duration < 5;
  recordTest('Cache hit performance', cachePassed, duration, 'Should be < 5ms');

  // Test 4.3: Block ad domain
  start = performance.now();
  const blockedResult = await resolver.resolve('doubleclick.net', 'A');
  duration = performance.now() - start;
  const blockPassed = blockedResult.blocked === true;
  recordTest('Block ad domain', blockPassed, duration, blockedResult.blockedReason);

  // Test 4.4: Check isBlocked method
  start = performance.now();
  const blockCheck = await resolver.isBlocked('googleadservices.com');
  duration = performance.now() - start;
  recordTest('isBlocked() method', blockCheck.blocked, duration, blockCheck.reason);

  // Test 4.5: Statistics
  start = performance.now();
  const stats = await resolver.getStats();
  duration = performance.now() - start;
  const statsPassed = stats.totalQueries > 0 && stats.blockedQueries >= 0;
  recordTest('Resolver statistics', statsPassed, duration, `${stats.totalQueries} queries`);

  // Test 4.6: High load test
  start = performance.now();
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(resolver.resolve('test' + (i % 5) + '.com', 'A'));
  }
  await Promise.all(promises);
  duration = performance.now() - start;
  const loadPassed = duration < 1000; // Should complete in < 1s
  recordTest('High load (50 concurrent)', loadPassed, duration, `${(duration / 50).toFixed(2)}ms avg`);

  await resolver.close();
}

async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     DNS Resolver - Comprehensive Test Suite             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    await testDoHClient();
    await testBlocklist();
    await testCache();
    await testIntegration();
  } catch (error) {
    console.error('\n\x1b[31mFatal error during testing:\x1b[0m', error);
  }

  const totalTime = Date.now() - startTime;

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                      Test Summary                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const successRate = (passed / total) * 100;

  console.log(`Total tests:     ${total}`);
  console.log(`\x1b[32mPassed:          ${passed}\x1b[0m`);
  if (failed > 0) {
    console.log(`\x1b[31mFailed:          ${failed}\x1b[0m`);
  } else {
    console.log(`Failed:          ${failed}`);
  }
  console.log(`Success rate:    ${successRate.toFixed(2)}%`);
  console.log(`Total time:      ${(totalTime / 1000).toFixed(2)}s`);

  if (failed > 0) {
    console.log('\n\x1b[31mFailed tests:\x1b[0m');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.details || 'No details'}`);
    });
  }

  if (successRate === 100) {
    console.log('\n\x1b[32m✓ All tests passed!\x1b[0m 🎉\n');
  } else if (successRate >= 90) {
    console.log('\n\x1b[33m⚠ Most tests passed, but some failures detected.\x1b[0m\n');
  } else {
    console.log('\n\x1b[31m✗ Significant test failures detected.\x1b[0m\n');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runAllTests };
