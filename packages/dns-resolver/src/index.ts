/**
 * @ankrshield/dns-resolver
 * DNS-over-HTTPS resolver with blocklist support, caching, and logging
 */

// Main resolver
export * from './client/resolver';
export * from './client/doh-client';
export * from './client/providers';

// Blocklist management
export * from './blocklist/manager';
export * from './blocklist/lookup';

// Caching
export * from './cache/dns-cache';

// Logging
export * from './logger/dns-logger';

// Legacy export (for backwards compatibility) - using type-only export to avoid conflicts
export type { DNSResolverOptions } from './resolver';

// Types
export interface DNSRecord {
  name: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT';
  ttl: number;
  data: string;
}

export interface DNSResponse {
  status: number;
  answers: DNSRecord[];
  authority?: DNSRecord[];
  additional?: DNSRecord[];
  query: {
    name: string;
    type: string;
  };
}

export interface BlocklistEntry {
  domain: string;
  category: string;
  threatLevel: number;
  source: string;
}

export interface DNSResolverConfig {
  providers: DNSProvider[];
  cacheEnabled: boolean;
  cacheTTL?: { min: number; max: number };
  blocklistEnabled: boolean;
  loggingEnabled: boolean;
  redis?: {
    host: string;
    port: number;
  };
}

export interface DNSProvider {
  name: string;
  url: string;
  priority: number;
}
