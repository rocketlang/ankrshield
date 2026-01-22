#!/usr/bin/env tsx
/**
 * Tracker Import Script
 * Downloads and imports tracker lists from multiple sources
 */

import { PrismaClient, ThreatLevel } from '@prisma/client';
import type { ImportStats } from '../src/types';

const prisma = new PrismaClient();

interface TrackerEntry {
  domain: string;
  category?: string;
  vendor?: string;
  threatLevel?: ThreatLevel;
  source: string;
}

/**
 * Import trackers from various sources
 */
async function importTrackers(): Promise<void> {
  console.log('=== Tracker Import ===\n');

  const stats: ImportStats[] = [];

  // Source 1: Disconnect Tracking Protection (sample data)
  stats.push(await importDisconnect());

  // Source 2: EasyList/EasyPrivacy (sample data)
  stats.push(await importEasyList());

  // Source 3: Known trackers (curated list)
  stats.push(await importKnownTrackers());

  // Print summary
  console.log('\n=== Import Summary ===');
  for (const stat of stats) {
    console.log(`\n${stat.source}:`);
    console.log(`  Total: ${stat.total}`);
    console.log(`  Imported: ${stat.imported}`);
    console.log(`  Skipped: ${stat.skipped}`);
    console.log(`  Errors: ${stat.errors}`);
    console.log(`  Duration: ${stat.duration}ms`);
  }

  const totalImported = stats.reduce((sum, s) => sum + s.imported, 0);
  console.log(`\n✓ Total trackers imported: ${totalImported}`);
}

/**
 * Import from Disconnect list
 */
async function importDisconnect(): Promise<ImportStats> {
  const startTime = Date.now();
  const source = 'Disconnect Tracking Protection';

  console.log(`Importing from ${source}...`);

  // Sample Disconnect data
  const trackers: TrackerEntry[] = [
    // Google trackers
    {
      domain: 'google-analytics.com',
      category: 'analytics',
      vendor: 'Google',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'googletagmanager.com',
      category: 'analytics',
      vendor: 'Google',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'googlesyndication.com',
      category: 'advertising',
      vendor: 'Google',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'doubleclick.net',
      category: 'advertising',
      vendor: 'Google',
      threatLevel: 'HIGH',
      source,
    },
    {
      domain: 'googleadservices.com',
      category: 'advertising',
      vendor: 'Google',
      threatLevel: 'MEDIUM',
      source,
    },

    // Facebook trackers
    {
      domain: 'facebook.com',
      category: 'social',
      vendor: 'Facebook',
      threatLevel: 'HIGH',
      source,
    },
    {
      domain: 'facebook.net',
      category: 'social',
      vendor: 'Facebook',
      threatLevel: 'HIGH',
      source,
    },
    {
      domain: 'connect.facebook.net',
      category: 'social',
      vendor: 'Facebook',
      threatLevel: 'HIGH',
      source,
    },

    // Amazon trackers
    {
      domain: 'amazon-adsystem.com',
      category: 'advertising',
      vendor: 'Amazon',
      threatLevel: 'MEDIUM',
      source,
    },

    // Microsoft trackers
    {
      domain: 'bing.com',
      category: 'advertising',
      vendor: 'Microsoft',
      threatLevel: 'LOW',
      source,
    },

    // Adobe trackers
    {
      domain: 'omniture.com',
      category: 'analytics',
      vendor: 'Adobe',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'demdex.net',
      category: 'analytics',
      vendor: 'Adobe',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: '2o7.net',
      category: 'analytics',
      vendor: 'Adobe',
      threatLevel: 'MEDIUM',
      source,
    },
  ];

  return await batchImport(trackers, source, startTime);
}

/**
 * Import from EasyList
 */
async function importEasyList(): Promise<ImportStats> {
  const startTime = Date.now();
  const source = 'EasyList/EasyPrivacy';

  console.log(`Importing from ${source}...`);

  // Sample EasyList data
  const trackers: TrackerEntry[] = [
    {
      domain: 'adservice.google.com',
      category: 'advertising',
      vendor: 'Google',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'pagead2.googlesyndication.com',
      category: 'advertising',
      vendor: 'Google',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'facebook.com',
      category: 'social',
      vendor: 'Facebook',
      threatLevel: 'HIGH',
      source,
    },
    {
      domain: 'twitter.com',
      category: 'social',
      vendor: 'Twitter',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'linkedin.com',
      category: 'social',
      vendor: 'Microsoft',
      threatLevel: 'MEDIUM',
      source,
    },
  ];

  return await batchImport(trackers, source, startTime);
}

/**
 * Import known trackers (curated list)
 */
async function importKnownTrackers(): Promise<ImportStats> {
  const startTime = Date.now();
  const source = 'Known Trackers Database';

  console.log(`Importing from ${source}...`);

  const trackers: TrackerEntry[] = [
    // Analytics
    {
      domain: 'mixpanel.com',
      category: 'analytics',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'segment.com',
      category: 'analytics',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'amplitude.com',
      category: 'analytics',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'hotjar.com',
      category: 'analytics',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'fullstory.com',
      category: 'analytics',
      threatLevel: 'MEDIUM',
      source,
    },

    // Advertising
    {
      domain: 'adnxs.com',
      category: 'advertising',
      vendor: 'AppNexus',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'rubiconproject.com',
      category: 'advertising',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'pubmatic.com',
      category: 'advertising',
      threatLevel: 'MEDIUM',
      source,
    },

    // Fingerprinting
    {
      domain: 'fingerprintjs.com',
      category: 'fingerprinting',
      threatLevel: 'HIGH',
      source,
    },

    // Social
    {
      domain: 'addthis.com',
      category: 'social',
      threatLevel: 'MEDIUM',
      source,
    },
    {
      domain: 'sharethis.com',
      category: 'social',
      threatLevel: 'MEDIUM',
      source,
    },

    // CDNs (low risk)
    {
      domain: 'cloudflare.com',
      category: 'cdn',
      threatLevel: 'LOW',
      source,
    },
    {
      domain: 'cloudfront.net',
      category: 'cdn',
      vendor: 'Amazon',
      threatLevel: 'LOW',
      source,
    },
    {
      domain: 'fastly.net',
      category: 'cdn',
      threatLevel: 'LOW',
      source,
    },
  ];

  return await batchImport(trackers, source, startTime);
}

/**
 * Batch import trackers
 */
async function batchImport(
  trackers: TrackerEntry[],
  source: string,
  startTime: number
): Promise<ImportStats> {
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const tracker of trackers) {
    try {
      // Check if already exists
      const existing = await prisma.tracker.findUnique({
        where: { domain: tracker.domain },
      });

      if (existing) {
        // Update sources if needed
        if (!existing.sources.includes(source)) {
          await prisma.tracker.update({
            where: { domain: tracker.domain },
            data: {
              sources: [...existing.sources, source],
            },
          });
          imported++;
        } else {
          skipped++;
        }
      } else {
        // Create new
        await prisma.tracker.create({
          data: {
            domain: tracker.domain,
            category: tracker.category,
            vendor: tracker.vendor,
            threatLevel: tracker.threatLevel || 'MEDIUM',
            sources: [source],
          },
        });
        imported++;
      }
    } catch (error) {
      console.error(`Error importing ${tracker.domain}:`, error);
      errors++;
    }
  }

  return {
    source,
    total: trackers.length,
    imported,
    skipped,
    errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Main execution
 */
importTrackers()
  .then(() => {
    console.log('\n✓ Import complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Import failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
