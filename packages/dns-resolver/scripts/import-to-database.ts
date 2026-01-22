/**
 * Import Blocklists to Database
 *
 * Imports parsed domains into the Tracker table with:
 * - Bulk inserts for performance
 * - Category mapping
 * - Source tracking
 * - Conflict handling (upsert)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, TrackerCategory, ThreatLevel } from '@prisma/client';
import { CACHE_DIR } from './download-blocklists.js';

const prisma = new PrismaClient();

/**
 * Map blocklist categories to TrackerCategory enum
 */
function mapCategory(category: string): TrackerCategory {
  const mapping: Record<string, TrackerCategory> = {
    'ads-tracking': 'ADVERTISING',
    'ads': 'ADVERTISING',
    'tracking': 'ANALYTICS',
    'malware': 'MALWARE',
    'social': 'SOCIAL_MEDIA',
  };

  return mapping[category] || 'OTHER';
}

/**
 * Determine threat level based on category
 */
function getThreatLevel(category: TrackerCategory): ThreatLevel {
  const threatLevels: Partial<Record<TrackerCategory, ThreatLevel>> = {
    MALWARE: 'CRITICAL',
    CRYPTOMINING: 'HIGH',
    FINGERPRINTING: 'HIGH',
    ADVERTISING: 'MEDIUM',
    ANALYTICS: 'MEDIUM',
    SOCIAL_MEDIA: 'LOW',
  };

  return threatLevels[category] || 'MEDIUM';
}

/**
 * Import domains in batches for performance
 */
async function importBatch(domains: any[], batchSize = 1000) {
  const totalDomains = domains.length;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`\nImporting ${totalDomains.toLocaleString()} domains in batches of ${batchSize}...`);

  for (let i = 0; i < totalDomains; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);

    try {
      // Use createMany with skipDuplicates for performance
      const result = await prisma.tracker.createMany({
        data: batch.map(d => {
          const category = mapCategory(d.category);
          return {
            domain: d.domain,
            category,
            threatLevel: getThreatLevel(category),
            sources: [d.source],
            description: `Blocked by ${d.source}`,
          };
        }),
        skipDuplicates: true,
      });

      imported += result.count;

      // Progress update
      const progress = Math.min(i + batchSize, totalDomains);
      const percentage = ((progress / totalDomains) * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${progress.toLocaleString()} / ${totalDomains.toLocaleString()} (${percentage}%)`);
    } catch (error) {
      console.error(`\n  ✗ Error importing batch ${i}-${i + batchSize}:`, error);
      errors++;
    }
  }

  skipped = totalDomains - imported;

  console.log('\n');
  return { imported, skipped, errors };
}

/**
 * Main import function
 */
async function importAll() {
  console.log('=== Blocklist Import to Database ===\n');

  // Read parsed domains
  const ndjsonPath = path.join(CACHE_DIR, 'parsed-domains.ndjson');

  if (!fs.existsSync(ndjsonPath)) {
    console.error('Parsed domains file not found. Please run parse-blocklists.ts first.');
    process.exit(1);
  }

  console.log('Reading parsed domains...');
  const content = fs.readFileSync(ndjsonPath, 'utf-8');
  const lines = content.trim().split('\n');
  const domains = lines.map(line => JSON.parse(line));

  console.log(`✓ Loaded ${domains.length.toLocaleString()} domains`);

  // Check existing count
  const existingCount = await prisma.tracker.count();
  console.log(`Current database has ${existingCount.toLocaleString()} trackers`);

  // Import domains
  const startTime = Date.now();
  const results = await importBatch(domains, 5000);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Get final count
  const finalCount = await prisma.tracker.count();

  // Summary
  console.log('=== Import Summary ===');
  console.log(`Duration: ${duration}s`);
  console.log(`Domains processed: ${domains.length.toLocaleString()}`);
  console.log(`New domains imported: ${results.imported.toLocaleString()}`);
  console.log(`Duplicates skipped: ${results.skipped.toLocaleString()}`);
  console.log(`Errors: ${results.errors}`);
  console.log(`Total trackers in database: ${finalCount.toLocaleString()}`);

  if (results.errors > 0) {
    console.log('\n⚠️  Some batches failed. Check errors above.');
  } else {
    console.log('\n✓ Import complete!');
  }

  await prisma.$disconnect();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importAll().catch(error => {
    console.error('Fatal error:', error);
    prisma.$disconnect();
    process.exit(1);
  });
}

export { importAll, importBatch, mapCategory, getThreatLevel };
