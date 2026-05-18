// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-002b leaf cert minter + LRU cache.

import { describe, it, expect, beforeAll } from 'vitest';
import forge from 'node-forge';

import { generateRootCA } from '../aegis-proxy/ca-generator.js';
import { mintLeafCert, LeafCertCache } from '../aegis-proxy/leaf-cert.js';
import type { RootCA } from '../aegis-proxy/types.js';

// Reuse one root CA across all tests; root keygen is slow.
let rootCA: RootCA;
beforeAll(() => {
  rootCA = generateRootCA({ keyBits: 2048, validityYears: 10 });
});

describe('ASD-T-002b — leaf cert minter', () => {
  it('mints a valid PEM cert + key for a hostname', () => {
    const leaf = mintLeafCert({ hostname: 'api.anthropic.com', rootCA, keyBits: 2048 });
    expect(leaf.certPem).toMatch(/^-----BEGIN CERTIFICATE-----/);
    expect(leaf.keyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/);
    expect(leaf.hostname).toBe('api.anthropic.com');
  });

  it('signs leaf with root CA (chain verifies)', () => {
    const leaf = mintLeafCert({ hostname: 'example.com', rootCA, keyBits: 2048 });
    const leafCert = forge.pki.certificateFromPem(leaf.certPem);
    const rootCert = forge.pki.certificateFromPem(rootCA.certPem);

    // Chain verification: root verifies leaf signature.
    expect(rootCert.verify(leafCert)).toBe(true);
  });

  it('issuer of leaf == subject of root', () => {
    const leaf = mintLeafCert({ hostname: 'example.com', rootCA, keyBits: 2048 });
    const leafCert = forge.pki.certificateFromPem(leaf.certPem);
    const rootCert = forge.pki.certificateFromPem(rootCA.certPem);

    const leafIssuer = leafCert.issuer.attributes.map((a) => `${a.name}=${a.value}`).sort();
    const rootSubject = rootCert.subject.attributes.map((a) => `${a.name}=${a.value}`).sort();
    expect(leafIssuer).toEqual(rootSubject);
  });

  it('SAN contains the hostname as DNS entry', () => {
    const leaf = mintLeafCert({ hostname: 'api.openai.com', rootCA, keyBits: 2048 });
    const leafCert = forge.pki.certificateFromPem(leaf.certPem);
    const san = leafCert.getExtension('subjectAltName') as {
      altNames: Array<{ type: number; value?: string; ip?: string }>;
    };
    expect(san.altNames).toHaveLength(1);
    expect(san.altNames[0]!.type).toBe(2); // DNS
    expect(san.altNames[0]!.value).toBe('api.openai.com');
  });

  it('SAN type=7 (IP) when hostname is an IPv4 literal', () => {
    const leaf = mintLeafCert({ hostname: '10.0.0.1', rootCA, keyBits: 2048 });
    const leafCert = forge.pki.certificateFromPem(leaf.certPem);
    const san = leafCert.getExtension('subjectAltName') as {
      altNames: Array<{ type: number; value?: string; ip?: string }>;
    };
    expect(san.altNames[0]!.type).toBe(7); // IP
  });

  it('basicConstraints CA:FALSE + extKeyUsage serverAuth', () => {
    const leaf = mintLeafCert({ hostname: 'example.com', rootCA, keyBits: 2048 });
    const cert = forge.pki.certificateFromPem(leaf.certPem);
    const basic = cert.getExtension('basicConstraints') as { cA?: boolean };
    expect(basic.cA).toBe(false);
    const eku = cert.getExtension('extKeyUsage') as { serverAuth?: boolean };
    expect(eku.serverAuth).toBe(true);
  });

  it('default validity is 24 hours from now', () => {
    const now = new Date('2026-05-18T10:00:00Z');
    const leaf = mintLeafCert({ hostname: 'example.com', rootCA, keyBits: 2048, now });
    expect(leaf.validUntil).toBe('2026-05-19T10:00:00.000Z');
  });

  it('different hostnames produce different leaf certs', () => {
    const a = mintLeafCert({ hostname: 'a.example.com', rootCA, keyBits: 2048 });
    const b = mintLeafCert({ hostname: 'b.example.com', rootCA, keyBits: 2048 });
    expect(a.certPem).not.toBe(b.certPem);
    expect(a.keyPem).not.toBe(b.keyPem);
  });
});

describe('ASD-T-002b — LeafCertCache LRU', () => {
  it('returns same cert object on cache hit', () => {
    const cache = new LeafCertCache({ rootCA });
    const a = cache.getOrMint('example.com');
    const b = cache.getOrMint('example.com');
    expect(b).toBe(a);
    expect(cache.size()).toBe(1);
  });

  it('mints fresh cert on cache miss', () => {
    const cache = new LeafCertCache({ rootCA });
    cache.getOrMint('a.example.com');
    cache.getOrMint('b.example.com');
    expect(cache.size()).toBe(2);
  });

  it('evicts oldest when over maxEntries', () => {
    const cache = new LeafCertCache({ rootCA, maxEntries: 2 });
    cache.getOrMint('a.example.com');
    cache.getOrMint('b.example.com');
    cache.getOrMint('c.example.com');
    expect(cache.size()).toBe(2);
    // 'a' should have been evicted — re-minting yields a new cert object.
    const aAgain = cache.getOrMint('a.example.com');
    const aOnceMore = cache.getOrMint('a.example.com');
    expect(aOnceMore).toBe(aAgain);
  });

  it('touch on hit moves entry to LRU end', () => {
    const cache = new LeafCertCache({ rootCA, maxEntries: 2 });
    const aOriginal = cache.getOrMint('a.example.com');
    cache.getOrMint('b.example.com');
    // Touch 'a' — should NOT be evicted next.
    const aTouched = cache.getOrMint('a.example.com');
    expect(aTouched).toBe(aOriginal);
    cache.getOrMint('c.example.com');
    // 'b' should be evicted, 'a' retained.
    const aStillCached = cache.getOrMint('a.example.com');
    expect(aStillCached).toBe(aOriginal);
  });

  it('refreshes when expiring within refreshIfExpiringWithinMs', () => {
    // Mint with very short validity so refresh fires immediately.
    const cache = new LeafCertCache({
      rootCA,
      validityHours: 1,
      refreshIfExpiringWithinMs: 24 * 60 * 60 * 1000, // 1 day — always "expiring soon"
    });
    const first = cache.getOrMint('example.com');
    const second = cache.getOrMint('example.com');
    expect(second).not.toBe(first); // re-minted because of refresh window
  });

  it('clear() empties the cache', () => {
    const cache = new LeafCertCache({ rootCA });
    cache.getOrMint('a.example.com');
    cache.getOrMint('b.example.com');
    expect(cache.size()).toBe(2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
