/**
 * DNS Cache Metrics Monitor
 *
 * Real-time monitoring of DNS cache performance:
 * - Hit rate tracking
 * - Cache size monitoring
 * - TTL distribution
 * - Memory usage
 */

import { DNSCache } from '../dist/cache/dns-cache.js';
import Redis from 'ioredis';

async function monitorCache(intervalSeconds: number = 5, duration: number = 60) {
  console.log('=== DNS Cache Metrics Monitor ===\n');

  const cache = new DNSCache();
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  console.log(`Monitoring cache for ${duration} seconds (${intervalSeconds}s intervals)\n`);

  const startTime = Date.now();
  let iteration = 0;

  const interval = setInterval(async () => {
    iteration++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    // Get cache stats
    const stats = await cache.getStats();
    const memoryMB = await cache.getSizeInMB();

    // Get Redis info
    const info = await redis.info('stats');
    const opsMatch = info.match(/instantaneous_ops_per_sec:(\d+)/);
    const opsPerSec = opsMatch ? parseInt(opsMatch[1]) : 0;

    // Display metrics
    console.log(`[${elapsed}s] Cache Metrics:`);
    console.log(`  Hits: ${stats.hits.toLocaleString()}`);
    console.log(`  Misses: ${stats.misses.toLocaleString()}`);
    console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log(`  Size: ${stats.size.toLocaleString()} entries`);
    console.log(`  Avg TTL: ${stats.avgTTL}s`);
    console.log(`  Memory: ${memoryMB.toFixed(2)} MB`);
    console.log(`  Ops/sec: ${opsPerSec}`);
    console.log('');

    // Stop after duration
    if (Date.now() - startTime >= duration * 1000) {
      clearInterval(interval);

      console.log('=== Final Summary ===');
      console.log(`Total requests: ${stats.hits + stats.misses}`);
      console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
      console.log(`Final cache size: ${stats.size.toLocaleString()} entries`);
      console.log(`Average TTL: ${stats.avgTTL}s`);

      // Calculate cache efficiency
      const efficiency = stats.hits > 0 ? ((stats.hits * 100) / (stats.hits + stats.misses)) : 0;
      console.log(`\nCache efficiency: ${efficiency.toFixed(2)}%`);

      if (efficiency < 50) {
        console.log('⚠️  Cache efficiency is low. Consider:');
        console.log('   - Increasing cache TTL');
        console.log('   - Pre-warming popular domains');
        console.log('   - Reviewing query patterns');
      } else if (efficiency < 80) {
        console.log('✓ Cache efficiency is good');
      } else {
        console.log('✓ Cache efficiency is excellent!');
      }

      await cache.close();
      await redis.quit();
    }
  }, intervalSeconds * 1000);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const interval = parseInt(process.argv[2]) || 5;
  const duration = parseInt(process.argv[3]) || 60;

  monitorCache(interval, duration).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { monitorCache };
