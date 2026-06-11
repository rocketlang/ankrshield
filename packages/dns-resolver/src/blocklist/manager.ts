/**
 * Blocklist Manager
 *
 * Manages blocklists with in-memory lookup structures:
 * - Loads domains from database
 * - Builds Bloom filter + Trie for fast lookups
 * - Supports updates without downtime (dual-buffer approach)
 */

import { PrismaClient } from '@prisma/client';

import { DomainLookup } from './lookup';

export class BlocklistManager {
  private lookup: DomainLookup;
  private prisma: PrismaClient;
  private isLoaded: boolean = false;

  constructor() {
    this.lookup = new DomainLookup();
    this.prisma = new PrismaClient();
  }

  /**
   * Load blocklists from database into memory
   */
  async loadFromDatabase(batchSize: number = 10000): Promise<void> {
    console.log('Loading blocklists from database...');

    const totalTrackers = await this.prisma.tracker.count();
    console.log(`Total trackers: ${totalTrackers.toLocaleString()}`);

    let loaded = 0;
    let cursor: string | undefined;

    while (loaded < totalTrackers) {
      // Fetch batch with cursor-based pagination
      const trackers = await this.prisma.tracker.findMany({
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          domain: true,
          category: true,
          threatLevel: true,
        },
        orderBy: { id: 'asc' },
      });

      if (trackers.length === 0) break;

      // Add to lookup structures
      await this.lookup.addDomains(
        trackers.map((t) => ({
          domain: t.domain,
          category: t.category,
          threatLevel: t.threatLevel,
        }))
      );

      loaded += trackers.length;
      cursor = trackers[trackers.length - 1].id;

      // Progress update
      const percentage = ((loaded / totalTrackers) * 100).toFixed(1);
      process.stdout.write(
        `\r  Progress: ${loaded.toLocaleString()} / ${totalTrackers.toLocaleString()} (${percentage}%)`
      );
    }

    console.log('\n✓ Blocklists loaded successfully');

    this.isLoaded = true;
  }

  /**
   * Load blocklists straight from the parsed NDJSON cache (no Postgres) — the data floor.
   * Use this for the DNS-shield enforcement path; loadFromDatabase() is for categorised
   * dashboard queries that need the relational Tracker rows.
   */
  async loadFromNdjson(
    filePath?: string
  ): Promise<{ read: number; loaded: number; skipped: number }> {
    const { loadNdjsonIntoLookup } = await import('./ndjson-loader.js');
    const res = await loadNdjsonIntoLookup(this.lookup, filePath);
    this.isLoaded = true;
    console.log(
      `✓ Blocklist floor loaded: ${res.loaded.toLocaleString()} domains (${res.skipped.toLocaleString()} junk skipped)`
    );
    return { read: res.read, loaded: res.loaded, skipped: res.skipped };
  }

  /**
   * Check if a domain is blocked
   */
  async isBlocked(domain: string): Promise<boolean> {
    if (!this.isLoaded) {
      throw new Error('Blocklists not loaded. Call loadFromDatabase() or loadFromNdjson() first.');
    }

    return this.lookup.isBlocked(domain);
  }

  /**
   * Get domain information if blocked
   */
  async getDomainInfo(domain: string) {
    if (!this.isLoaded) {
      throw new Error('Blocklists not loaded. Call loadFromDatabase() first.');
    }

    return this.lookup.getDomainInfo(domain);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      isLoaded: this.isLoaded,
      ...this.lookup.getStats(),
    };
  }

  /**
   * Reload blocklists (for updates)
   */
  async reload(): Promise<void> {
    console.log('Reloading blocklists...');
    this.lookup.clear();
    this.isLoaded = false;
    await this.loadFromDatabase();
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export { DomainLookup };
