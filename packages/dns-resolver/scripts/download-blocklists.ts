/**
 * Blocklist Download Script
 *
 * Downloads blocklists from multiple sources:
 * - Steven Black's hosts
 * - AdGuard DNS filter
 * - EasyList
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Blocklist sources
const BLOCKLIST_SOURCES = [
  {
    name: 'steven-black',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    category: 'ads-tracking',
    format: 'hosts',
  },
  {
    name: 'adguard-dns',
    url: 'https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt',
    category: 'ads-tracking',
    format: 'adguard',
  },
  {
    name: 'easylist',
    url: 'https://easylist.to/easylist/easylist.txt',
    category: 'ads',
    format: 'adblock',
  },
  {
    name: 'easyprivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    category: 'tracking',
    format: 'adblock',
  },
];

// Cache directory
const CACHE_DIR = path.join(__dirname, '../.cache/blocklists');

/**
 * Download a blocklist from URL
 */
async function downloadBlocklist(
  url: string,
  outputPath: string
): Promise<{ success: boolean; size: number; error?: string }> {
  try {
    console.log(`Downloading: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    // Write to file
    fs.writeFileSync(outputPath, text, 'utf-8');

    console.log(`✓ Downloaded: ${path.basename(outputPath)} (${text.length} bytes)`);

    return {
      success: true,
      size: text.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Failed to download ${url}: ${message}`);

    return {
      success: false,
      size: 0,
      error: message,
    };
  }
}

/**
 * Main download function
 */
async function downloadAll() {
  console.log('=== Blocklist Download Started ===\n');

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`Created cache directory: ${CACHE_DIR}\n`);
  }

  const results = [];

  // Download all blocklists
  for (const source of BLOCKLIST_SOURCES) {
    const outputPath = path.join(CACHE_DIR, `${source.name}.txt`);
    const result = await downloadBlocklist(source.url, outputPath);

    results.push({
      name: source.name,
      category: source.category,
      format: source.format,
      ...result,
    });
  }

  // Write metadata
  const metadata = {
    downloadedAt: new Date().toISOString(),
    sources: results,
    totalSize: results.reduce((sum, r) => sum + r.size, 0),
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length,
  };

  const metadataPath = path.join(CACHE_DIR, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  // Summary
  console.log('\n=== Download Summary ===');
  console.log(`Total sources: ${BLOCKLIST_SOURCES.length}`);
  console.log(`Successful: ${metadata.successCount}`);
  console.log(`Failed: ${metadata.failureCount}`);
  console.log(`Total size: ${(metadata.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Cache directory: ${CACHE_DIR}`);
  console.log(`Metadata: ${metadataPath}`);

  if (metadata.failureCount > 0) {
    console.log('\n⚠️  Some downloads failed. Check errors above.');
    process.exit(1);
  }

  console.log('\n✓ All blocklists downloaded successfully!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  downloadAll().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { downloadAll, downloadBlocklist, BLOCKLIST_SOURCES, CACHE_DIR };
