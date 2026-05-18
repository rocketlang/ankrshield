// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — per-host TLS leaf cert minting + LRU cache
//
// @rule:ASD-002 — leaf certs are signed by the per-install root CA
// @rule:ASD-004 — failure mode is deny (mint failures surface, never silent)
//
// Leaf certs are short-lived (default 24h) and key material lives only in
// memory inside the LeafCertCache. Cache eviction frees the key automatically.

import crypto from 'node:crypto';

import forge from 'node-forge';

import type { LeafCert, RootCA } from './types.js';

export interface MintLeafCertOptions {
  hostname: string;
  rootCA: RootCA;
  /** Defaults to 24. Bounded by host hygiene; long-lived leafs are a smell. */
  validityHours?: number;
  /** Defaults to 2048. Faster than 4096 since leaves are short-lived. */
  keyBits?: number;
  /** Override for tests. */
  now?: Date;
}

/**
 * Mint a leaf TLS certificate for one hostname, signed by the install's root CA.
 * Pure function; caller owns lifetime + cache.
 */
export function mintLeafCert(opts: MintLeafCertOptions): LeafCert {
  const validityHours = opts.validityHours ?? 24;
  const keyBits = opts.keyBits ?? 2048;
  const now = opts.now ?? new Date();

  const rootCert = forge.pki.certificateFromPem(opts.rootCA.certPem);
  const rootKey = forge.pki.privateKeyFromPem(opts.rootCA.keyPem);

  const leafKeyPair = forge.pki.rsa.generateKeyPair({ bits: keyBits, e: 0x10001 });

  const cert = forge.pki.createCertificate();
  cert.publicKey = leafKeyPair.publicKey;
  // Positive serial number.
  const serialBytes = crypto.randomBytes(16);
  serialBytes[0] = serialBytes[0]! & 0x7f;
  cert.serialNumber = serialBytes.toString('hex');

  cert.validity.notBefore = new Date(now);
  cert.validity.notAfter = new Date(now);
  cert.validity.notAfter.setHours(cert.validity.notAfter.getHours() + validityHours);

  cert.setSubject([{ name: 'commonName', value: opts.hostname }]);
  // Issuer is the root CA's subject.
  cert.setIssuer(rootCert.subject.attributes);

  // SAN must include the hostname per RFC 6125 — modern clients ignore CN.
  // type 2 = DNS, type 7 = IP. We detect IP vs DNS.
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$|:/i.test(opts.hostname);
  const altNames = isIp ? [{ type: 7, ip: opts.hostname }] : [{ type: 2, value: opts.hostname }];

  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames,
    },
  ]);

  cert.sign(rootKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(leafKeyPair.privateKey),
    hostname: opts.hostname,
    validUntil: cert.validity.notAfter.toISOString(),
  };
}

export interface LeafCertCacheOptions {
  rootCA: RootCA;
  /** Defaults to 256 — modern dev session shouldn't exceed this. */
  maxEntries?: number;
  /** Mint a new cert when remaining lifetime drops below this. Default 60s. */
  refreshIfExpiringWithinMs?: number;
  /** Cert TTL passed through to mintLeafCert. Default 24 hours. */
  validityHours?: number;
}

/**
 * Per-process LRU cache of leaf certs. Touch on hit; mint on miss or near-expiry;
 * evict oldest when over capacity. Holds key material in memory.
 */
export class LeafCertCache {
  private readonly map = new Map<string, LeafCert>();
  private readonly maxEntries: number;
  private readonly refreshIfExpiringWithinMs: number;
  private readonly validityHours: number;
  private readonly rootCA: RootCA;

  constructor(opts: LeafCertCacheOptions) {
    this.rootCA = opts.rootCA;
    this.maxEntries = opts.maxEntries ?? 256;
    this.refreshIfExpiringWithinMs = opts.refreshIfExpiringWithinMs ?? 60_000;
    this.validityHours = opts.validityHours ?? 24;
  }

  size(): number {
    return this.map.size;
  }

  getOrMint(hostname: string): LeafCert {
    const existing = this.map.get(hostname);
    const expiringSoon =
      existing &&
      new Date(existing.validUntil).getTime() - Date.now() < this.refreshIfExpiringWithinMs;

    if (existing && !expiringSoon) {
      // Touch — move to end.
      this.map.delete(hostname);
      this.map.set(hostname, existing);
      return existing;
    }

    const fresh = mintLeafCert({
      hostname,
      rootCA: this.rootCA,
      validityHours: this.validityHours,
    });
    this.map.set(hostname, fresh);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    return fresh;
  }

  clear(): void {
    this.map.clear();
  }
}
