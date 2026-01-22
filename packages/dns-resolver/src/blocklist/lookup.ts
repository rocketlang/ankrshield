/**
 * Fast Domain Lookup
 *
 * Uses Bloom filter + Trie for efficient domain matching:
 * 1. Bloom filter for quick rejection (if not in filter, definitely not blocked)
 * 2. Trie for exact and wildcard matching (if in filter, check trie for confirmation)
 */

import bloomFilters from 'bloom-filters';
import TrieSearch from 'trie-search';

const { BloomFilter } = bloomFilters;

interface DomainEntry {
  domain: string;
  category?: string;
  threatLevel?: string;
}

export class DomainLookup {
  private bloomFilter: any;  // BloomFilter instance
  private trie: TrieSearch<DomainEntry>;
  private domainsLoaded: number = 0;

  constructor(expectedElements: number = 250000, falsePositiveRate: number = 0.01) {
    // Initialize Bloom filter with expected number of elements
    this.bloomFilter = BloomFilter.create(expectedElements, falsePositiveRate);

    // Initialize Trie for exact matching
    this.trie = new TrieSearch<DomainEntry>('domain', {
      ignoreCase: true,
      splitOnRegEx: /[^a-zA-Z0-9.-]/,
    });
  }

  /**
   * Add a domain to the lookup structures
   */
  async addDomain(domain: string, metadata?: { category?: string; threatLevel?: string }): Promise<void> {
    // Add to Bloom filter (fast membership check)
    this.bloomFilter.add(domain);

    // Add to Trie (for exact matching and autocomplete)
    this.trie.add({
      domain,
      category: metadata?.category,
      threatLevel: metadata?.threatLevel,
    });

    this.domainsLoaded++;
  }

  /**
   * Add multiple domains in bulk
   */
  async addDomains(domains: Array<{ domain: string; category?: string; threatLevel?: string }>): Promise<void> {
    for (const entry of domains) {
      await this.addDomain(entry.domain, entry);
    }
  }

  /**
   * Check if a domain is blocked
   * Uses 2-stage lookup:
   * 1. Bloom filter check (fast, may have false positives)
   * 2. Trie exact match (confirms the result)
   */
  async isBlocked(domain: string): Promise<boolean> {
    // Normalize domain
    const normalizedDomain = domain.toLowerCase().trim();

    // Stage 1: Bloom filter (O(k) where k is number of hash functions)
    if (!this.bloomFilter.has(normalizedDomain)) {
      // Definitely not blocked
      return false;
    }

    // Stage 2: Trie exact match (O(m) where m is length of domain)
    const results = this.trie.get(normalizedDomain);

    // Check for exact match
    const exactMatch = results.some(r => r.domain === normalizedDomain);
    if (exactMatch) {
      return true;
    }

    // Check wildcard patterns (e.g., subdomain.example.com blocked by *.example.com)
    return this.checkWildcardMatch(normalizedDomain);
  }

  /**
   * Check for wildcard domain matches
   * Example: ads.example.com should match *.example.com
   */
  private checkWildcardMatch(domain: string): boolean {
    const parts = domain.split('.');

    // Check each parent domain level
    for (let i = 1; i < parts.length; i++) {
      const parentDomain = parts.slice(i).join('.');
      const wildcard = `*.${parentDomain}`;

      const results = this.trie.get(wildcard);
      if (results.some(r => r.domain === wildcard)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get domain metadata if blocked
   */
  async getDomainInfo(domain: string): Promise<DomainEntry | null> {
    const normalizedDomain = domain.toLowerCase().trim();

    if (!this.bloomFilter.has(normalizedDomain)) {
      return null;
    }

    const results = this.trie.get(normalizedDomain);
    const exactMatch = results.find(r => r.domain === normalizedDomain);

    return exactMatch || null;
  }

  /**
   * Get statistics about the lookup structures
   */
  getStats() {
    return {
      domainsLoaded: this.domainsLoaded,
      bloomFilterSize: this.bloomFilter.length,
      bloomFilterFalsePositiveRate: this.bloomFilter.rate(),
    };
  }

  /**
   * Clear all data
   */
  clear() {
    // Create new instances
    this.bloomFilter = BloomFilter.create(250000, 0.01);
    this.trie = new TrieSearch<DomainEntry>('domain', {
      ignoreCase: true,
      splitOnRegEx: /[^a-zA-Z0-9.-]/,
    });
    this.domainsLoaded = 0;
  }
}

export { DomainEntry };
