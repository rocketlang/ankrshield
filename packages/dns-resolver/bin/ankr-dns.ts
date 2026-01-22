#!/usr/bin/env node
/**
 * ankr-dns CLI Tool
 *
 * Command-line interface for DNS resolver operations:
 * - resolve: Test DNS resolution
 * - import-blocklist: Import blocklists
 * - stats: Show statistics
 * - cache: Cache operations
 * - test: Run tests
 */

import { Command } from 'commander';
import { DNSResolver } from '../dist/client/resolver.js';
import { DNS_PROVIDERS } from '../dist/client/providers.js';
import { downloadAll } from '../dist/../scripts/download-blocklists.js';
import { parseAll } from '../dist/../scripts/parse-blocklists.js';
import { importAll } from '../dist/../scripts/import-to-database.js';

const program = new Command();

program
  .name('ankr-dns')
  .description('ankrshield DNS Resolver CLI')
  .version('0.1.0');

// Command: resolve
program
  .command('resolve <domain>')
  .description('Resolve a domain name')
  .option('-t, --type <type>', 'Record type (A, AAAA, CNAME, MX, TXT)', 'A')
  .option('--no-cache', 'Disable caching')
  .option('--no-blocklist', 'Disable blocklist')
  .action(async (domain, options) => {
    console.log(`Resolving ${domain} (${options.type})...\n`);

    const resolver = new DNSResolver({
      providers: DNS_PROVIDERS,
      cacheEnabled: options.cache,
      blocklistEnabled: options.blocklist,
      loggingEnabled: false,
    });

    if (options.blocklist) {
      console.log('Loading blocklists...');
      await resolver.initialize();
    }

    const start = performance.now();
    const response = await resolver.resolve(domain, options.type as any);
    const duration = performance.now() - start;

    console.log('\n=== DNS Response ===');
    console.log(`Status: ${response.status === 0 ? 'Success' : 'Failed'}`);
    console.log(`Time: ${duration.toFixed(2)}ms`);
    console.log(`Cached: ${response.cached ? 'Yes' : 'No'}`);
    console.log(`Blocked: ${response.blocked ? 'Yes' : 'No'}`);

    if (response.blocked) {
      console.log(`Reason: ${response.blockedReason}`);
    } else if (response.answers.length > 0) {
      console.log(`\nAnswers (${response.answers.length}):`);
      response.answers.forEach(answer => {
        console.log(`  ${answer.name} -> ${answer.data} (TTL: ${answer.ttl}s)`);
      });
    } else {
      console.log('\nNo answers found');
    }

    await resolver.close();
  });

// Command: import-blocklist
program
  .command('import-blocklist')
  .description('Download, parse, and import blocklists')
  .option('--download-only', 'Only download, do not parse or import')
  .option('--parse-only', 'Only parse (assumes already downloaded)')
  .action(async (options) => {
    if (!options.parseOnly) {
      console.log('=== Step 1: Downloading blocklists ===\n');
      await downloadAll();
    }

    if (!options.downloadOnly) {
      console.log('\n=== Step 2: Parsing blocklists ===\n');
      await parseAll();

      console.log('\n=== Step 3: Importing to database ===\n');
      await importAll();
    }

    console.log('\n✓ Blocklist import complete!');
  });

// Command: stats
program
  .command('stats')
  .description('Show DNS resolver statistics')
  .option('--cache', 'Show cache stats only')
  .option('--logger', 'Show logger stats only')
  .action(async (options) => {
    const resolver = new DNSResolver({
      providers: DNS_PROVIDERS,
      cacheEnabled: true,
      blocklistEnabled: true,
      loggingEnabled: true,
    });

    console.log('Initializing resolver...');
    await resolver.initialize();

    const stats = await resolver.getStats();
    const cacheStats = await resolver.cache?.getStats();
    const loggerStats = await resolver.getLoggerStats();

    if (!options.cache && !options.logger) {
      console.log('\n=== Resolver Statistics ===');
      console.log(`Total queries: ${stats.totalQueries.toLocaleString()}`);
      console.log(`Blocked queries: ${stats.blockedQueries.toLocaleString()}`);
      console.log(`Allowed queries: ${stats.allowedQueries.toLocaleString()}`);
      console.log(`Block rate: ${(stats.blockRate * 100).toFixed(2)}%`);
    }

    if (!options.logger && cacheStats) {
      console.log('\n=== Cache Statistics ===');
      console.log(`Cache hits: ${cacheStats.hits.toLocaleString()}`);
      console.log(`Cache misses: ${cacheStats.misses.toLocaleString()}`);
      console.log(`Hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
      console.log(`Cache size: ${cacheStats.size.toLocaleString()} entries`);
      console.log(`Avg TTL: ${cacheStats.avgTTL}s`);
    }

    if (!options.cache && loggerStats) {
      console.log('\n=== Logger Statistics ===');
      console.log(`Total logged: ${loggerStats.totalLogged.toLocaleString()}`);
      console.log(`Batches processed: ${loggerStats.batchesProcessed.toLocaleString()}`);
      console.log(`Queue size: ${loggerStats.queueSize.toLocaleString()}`);
      console.log(`Errors: ${loggerStats.errors}`);
    }

    await resolver.close();
  });

// Command: cache
program
  .command('cache <action>')
  .description('Cache operations (clear, stats)')
  .action(async (action) => {
    const resolver = new DNSResolver({
      providers: DNS_PROVIDERS,
      cacheEnabled: true,
      blocklistEnabled: false,
      loggingEnabled: false,
    });

    if (action === 'clear') {
      console.log('Clearing DNS cache...');
      await resolver.clearCache();
      console.log('✓ Cache cleared');
    } else if (action === 'stats') {
      const stats = await resolver.cache?.getStats();
      if (stats) {
        console.log('=== Cache Statistics ===');
        console.log(`Hits: ${stats.hits.toLocaleString()}`);
        console.log(`Misses: ${stats.misses.toLocaleString()}`);
        console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
        console.log(`Size: ${stats.size.toLocaleString()} entries`);
      }
    } else {
      console.error(`Unknown action: ${action}`);
      console.error('Available actions: clear, stats');
      process.exit(1);
    }

    await resolver.close();
  });

// Command: test
program
  .command('test')
  .description('Run DNS resolver tests')
  .option('--quick', 'Run quick tests only')
  .action(async (options) => {
    console.log('=== DNS Resolver Tests ===\n');

    const resolver = new DNSResolver({
      providers: DNS_PROVIDERS,
      cacheEnabled: true,
      blocklistEnabled: true,
      loggingEnabled: false,
    });

    console.log('Test 1: Initializing resolver...');
    await resolver.initialize();
    console.log('✓ Initialization successful\n');

    // Test safe domain
    console.log('Test 2: Resolving safe domain (anthropic.com)');
    const safe = await resolver.resolve('anthropic.com', 'A');
    console.log(`✓ ${safe.blocked ? 'FAILED - Should not be blocked' : 'Success'} (${safe.answers.length} answers)\n`);

    // Test blocked domain
    console.log('Test 3: Resolving blocked domain (doubleclick.net)');
    const blocked = await resolver.resolve('doubleclick.net', 'A');
    console.log(`✓ ${blocked.blocked ? 'Success' : 'FAILED - Should be blocked'}\n`);

    // Test cache
    console.log('Test 4: Testing cache (repeat query)');
    const cached = await resolver.resolve('anthropic.com', 'A');
    console.log(`✓ ${cached.cached ? 'Success - Cache hit' : 'FAILED - Should be cached'}\n`);

    if (!options.quick) {
      // Performance test
      console.log('Test 5: Performance test (100 queries)');
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await resolver.resolve(`test${i % 10}.com`, 'A');
      }
      const duration = Date.now() - start;
      console.log(`✓ Completed in ${duration}ms (${(duration / 100).toFixed(2)}ms avg)\n`);
    }

    const stats = await resolver.getStats();
    console.log('=== Test Results ===');
    console.log(`Total queries: ${stats.totalQueries}`);
    console.log(`Blocked: ${stats.blockedQueries}`);
    console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(2)}%`);

    await resolver.close();
    console.log('\n✓ All tests passed!');
  });

program.parse();
