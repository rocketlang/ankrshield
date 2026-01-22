/**
 * DNS-over-HTTPS Client
 *
 * Implements RFC 8484 DNS-over-HTTPS with:
 * - Multiple provider support
 * - Automatic retry with exponential backoff
 * - Provider failover on timeout
 * - Request deduplication
 */

import { DNSResponse, DNSProvider } from '../index';
import { getProviderByPriority } from './providers';

interface PendingRequest {
  promise: Promise<DNSResponse>;
  timestamp: number;
}

export class DoHClient {
  private providers: DNSProvider[];
  private timeout: number;
  private maxRetries: number;
  private pendingRequests: Map<string, PendingRequest>;

  constructor(
    providers?: DNSProvider[],
    options?: { timeout?: number; maxRetries?: number }
  ) {
    this.providers = providers || getProviderByPriority();
    this.timeout = options?.timeout || 5000;
    this.maxRetries = options?.maxRetries || 3;
    this.pendingRequests = new Map();
  }

  /**
   * Resolve a domain name using DNS-over-HTTPS
   */
  async resolve(
    domain: string,
    recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' = 'A'
  ): Promise<DNSResponse> {
    const cacheKey = `${domain}:${recordType}`;

    // Check for pending request (deduplication)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending.promise;
    }

    // Create new request
    const promise = this.resolveWithRetry(domain, recordType);
    this.pendingRequests.set(cacheKey, { promise, timestamp: Date.now() });

    try {
      const response = await promise;
      return response;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Resolve with automatic retry and provider failover
   */
  private async resolveWithRetry(
    domain: string,
    recordType: string,
    retryCount = 0
  ): Promise<DNSResponse> {
    const provider = this.providers[retryCount % this.providers.length];

    try {
      return await this.queryProvider(provider, domain, recordType);
    } catch (error) {
      if (retryCount < this.maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.resolveWithRetry(domain, recordType, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Query a specific DNS provider
   */
  private async queryProvider(
    provider: DNSProvider,
    domain: string,
    recordType: string
  ): Promise<DNSResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = new URL(provider.url);
      url.searchParams.set('name', domain);
      url.searchParams.set('type', recordType);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/dns-json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`DNS query failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseDNSResponse(data, domain, recordType);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse DNS response from provider
   */
  private parseDNSResponse(data: any, domain: string, recordType: string): DNSResponse {
    return {
      status: data.Status || 0,
      answers: (data.Answer || []).map((answer: any) => ({
        name: answer.name,
        type: this.getRecordType(answer.type),
        ttl: answer.TTL,
        data: answer.data,
      })),
      authority: (data.Authority || []).map((auth: any) => ({
        name: auth.name,
        type: this.getRecordType(auth.type),
        ttl: auth.TTL,
        data: auth.data,
      })),
      additional: (data.Additional || []).map((add: any) => ({
        name: add.name,
        type: this.getRecordType(add.type),
        ttl: add.TTL,
        data: add.data,
      })),
      query: {
        name: domain,
        type: recordType,
      },
    };
  }

  /**
   * Convert numeric record type to string
   */
  private getRecordType(type: number): 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' {
    const types: Record<number, 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT'> = {
      1: 'A',
      5: 'CNAME',
      15: 'MX',
      16: 'TXT',
      28: 'AAAA',
    };
    return types[type] || 'A';
  }

  /**
   * Clean up old pending requests
   */
  cleanupPendingRequests(maxAge = 30000) {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > maxAge) {
        this.pendingRequests.delete(key);
      }
    }
  }
}
