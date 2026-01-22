/**
 * DNS-over-HTTPS Provider Configuration
 *
 * Supports multiple DoH providers with automatic failover
 */

import { DNSProvider } from '../index';

export const DNS_PROVIDERS: DNSProvider[] = [
  {
    name: 'Cloudflare',
    url: 'https://cloudflare-dns.com/dns-query',
    priority: 1,
  },
  {
    name: 'Google',
    url: 'https://dns.google/resolve',
    priority: 2,
  },
  {
    name: 'Quad9',
    url: 'https://dns.quad9.net/dns-query',
    priority: 3,
  },
];

export function getProvider(name: string): DNSProvider | undefined {
  return DNS_PROVIDERS.find(p => p.name === name);
}

export function getDefaultProvider(): DNSProvider {
  return DNS_PROVIDERS[0];
}

export function getProviderByPriority(): DNSProvider[] {
  return [...DNS_PROVIDERS].sort((a, b) => a.priority - b.priority);
}
