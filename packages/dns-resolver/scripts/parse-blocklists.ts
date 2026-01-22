/**
 * Blocklist Parser Script
 *
 * Parses downloaded blocklists in various formats:
 * - hosts file format (0.0.0.0 domain.com)
 * - AdGuard format (||domain.com^)
 * - AdBlock format (||domain.com^$third-party)
 */

import * as fs from 'fs';
import * as path from 'path';
import { CACHE_DIR } from './download-blocklists.js';

interface ParsedDomain {
  domain: string;
  source: string;
  category: string;
  format: string;
}

/**
 * Parse hosts file format
 * Example: 0.0.0.0 doubleclick.net
 */
function parseHostsFormat(content: string, source: string, category: string): ParsedDomain[] {
  const domains: ParsedDomain[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (!line.trim() || line.startsWith('#')) continue;

    // Match: 0.0.0.0 domain.com or 127.0.0.1 domain.com
    const match = line.match(/^(0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/);
    if (match) {
      const domain = match[2].toLowerCase().trim();

      // Skip localhost entries
      if (domain === 'localhost' || domain === 'localhost.localdomain') {
        continue;
      }

      domains.push({
        domain,
        source,
        category,
        format: 'hosts',
      });
    }
  }

  return domains;
}

/**
 * Parse AdGuard DNS filter format
 * Example: ||doubleclick.net^
 */
function parseAdGuardFormat(content: string, source: string, category: string): ParsedDomain[] {
  const domains: ParsedDomain[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (!line.trim() || line.startsWith('!') || line.startsWith('#')) continue;

    // Match: ||domain.com^
    const match = line.match(/^\|\|([^\/\^\$]+)(\^|\$)?/);
    if (match) {
      const domain = match[1].toLowerCase().trim();

      // Skip IP addresses
      if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
        continue;
      }

      domains.push({
        domain,
        source,
        category,
        format: 'adguard',
      });
    }
  }

  return domains;
}

/**
 * Parse AdBlock format
 * Example: ||doubleclick.net^$third-party
 */
function parseAdBlockFormat(content: string, source: string, category: string): ParsedDomain[] {
  const domains: ParsedDomain[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (!line.trim() || line.startsWith('!') || line.startsWith('#')) continue;

    // Match: ||domain.com^ or ||domain.com^$options
    const match = line.match(/^\|\|([^\/\^\$]+)(\^|\$)?/);
    if (match) {
      const domain = match[1].toLowerCase().trim();

      // Skip cosmetic filters (contain ##)
      if (line.includes('##')) continue;

      // Skip IP addresses
      if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
        continue;
      }

      domains.push({
        domain,
        source,
        category,
        format: 'adblock',
      });
    }
  }

  return domains;
}

/**
 * Parse a blocklist file based on format
 */
function parseBlocklist(
  filePath: string,
  format: 'hosts' | 'adguard' | 'adblock',
  source: string,
  category: string
): ParsedDomain[] {
  const content = fs.readFileSync(filePath, 'utf-8');

  switch (format) {
    case 'hosts':
      return parseHostsFormat(content, source, category);
    case 'adguard':
      return parseAdGuardFormat(content, source, category);
    case 'adblock':
      return parseAdBlockFormat(content, source, category);
    default:
      console.warn(`Unknown format: ${format}`);
      return [];
  }
}

/**
 * Main parse function
 */
async function parseAll() {
  console.log('=== Blocklist Parsing Started ===\n');

  // Read metadata
  const metadataPath = path.join(CACHE_DIR, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error('Metadata file not found. Please run download-blocklists.ts first.');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  const allDomains: ParsedDomain[] = [];

  // Parse each blocklist
  for (const sourceInfo of metadata.sources) {
    if (!sourceInfo.success) {
      console.log(`Skipping ${sourceInfo.name} (download failed)`);
      continue;
    }

    const filePath = path.join(CACHE_DIR, `${sourceInfo.name}.txt`);
    console.log(`Parsing: ${sourceInfo.name} (${sourceInfo.format})`);

    const domains = parseBlocklist(
      filePath,
      sourceInfo.format,
      sourceInfo.name,
      sourceInfo.category
    );

    console.log(`  ✓ Parsed ${domains.length.toLocaleString()} domains`);

    // Use concat instead of spread to avoid stack overflow
    for (const domain of domains) {
      allDomains.push(domain);
    }
  }

  // Deduplicate domains
  console.log('\nDeduplicating domains...');
  const uniqueDomains = new Map<string, ParsedDomain>();

  for (const domain of allDomains) {
    if (!uniqueDomains.has(domain.domain)) {
      uniqueDomains.set(domain.domain, domain);
    }
  }

  const uniqueDomainsArray = Array.from(uniqueDomains.values());

  // Write parsed domains as NDJSON (newline-delimited JSON) for better memory efficiency
  const outputPath = path.join(CACHE_DIR, 'parsed-domains.ndjson');
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  for (const domain of uniqueDomainsArray) {
    writeStream.write(JSON.stringify(domain) + '\n');
  }

  // Wait for stream to finish
  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });

  // Also write a simple domain list (one domain per line) for easy imports
  const domainListPath = path.join(CACHE_DIR, 'domains.txt');
  const domainList = uniqueDomainsArray.map(d => d.domain).join('\n');
  fs.writeFileSync(domainListPath, domainList);

  // Summary
  console.log('\n=== Parsing Summary ===');
  console.log(`Total domains parsed: ${allDomains.length.toLocaleString()}`);
  console.log(`Unique domains: ${uniqueDomainsArray.length.toLocaleString()}`);
  console.log(`Duplicate domains removed: ${(allDomains.length - uniqueDomainsArray.length).toLocaleString()}`);
  console.log(`Output files:`);
  console.log(`  - NDJSON: ${outputPath} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  - Domain list: ${domainListPath} (${(fs.statSync(domainListPath).size / 1024 / 1024).toFixed(2)} MB)`);

  console.log('\n✓ Parsing complete!');

  return uniqueDomainsArray;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  parseAll().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { parseAll, parseBlocklist, parseHostsFormat, parseAdGuardFormat, parseAdBlockFormat };
