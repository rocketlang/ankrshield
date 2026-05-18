// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — root CA generator (pure function)
//
// @rule:ASD-002 — every install has its own root CA
// @rule:ASD-YK-007 — root CA install consent is its own ceremony
//
// Pure cert generation. No filesystem, no keychain — those live in ca-store.ts.
// 10-year validity per Vivechana Decision 1 (lifetime-of-install, no rotation).

import crypto from 'node:crypto';

import forge from 'node-forge';

import type { RootCA } from './types.js';

export interface GenerateRootCAOptions {
  /** RSA modulus bits. Defaults to 4096 per ASD-002 spirit (long-lived root). */
  keyBits?: number;
  /** Validity in years. Defaults to 10 (lifetime-of-install per Decision 1). */
  validityYears?: number;
  /**
   * Subject CN. Defaults to a generic install-specific string. Made deterministic
   * by appending an 8-char random tail so each install's CN is visually unique
   * in the user's trust store.
   */
  commonName?: string;
  /** Override for tests. */
  now?: Date;
}

/**
 * Generate a fresh self-signed root CA suitable for signing per-host TLS leaf
 * certs minted by the proxy's CONNECT handler (P2 work, not in T-002).
 *
 * Returns the cert PEM + key PEM + sha256 fingerprint + dates. The caller
 * (ca-store) is responsible for putting the key into the OS keychain and the
 * cert onto disk.
 */
export function generateRootCA(opts: GenerateRootCAOptions = {}): RootCA {
  const keyBits = opts.keyBits ?? 4096;
  const validityYears = opts.validityYears ?? 10;
  const now = opts.now ?? new Date();

  // Random tail so two installs on the same hostname never share a CN.
  const tail = crypto.randomBytes(4).toString('hex');
  const commonName = opts.commonName ?? `ankrshield desktop root CA (${tail})`;

  // node-forge RSA keypair. Synchronous; ~1-2s for 4096-bit on a modern laptop.
  const keypair = forge.pki.rsa.generateKeyPair({ bits: keyBits, e: 0x10001 });

  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  // 16-byte random serial — must be positive, so mask the high bit.
  const serialBytes = crypto.randomBytes(16);
  serialBytes[0] = serialBytes[0]! & 0x7f;
  cert.serialNumber = serialBytes.toString('hex');

  cert.validity.notBefore = new Date(now);
  cert.validity.notAfter = new Date(now);
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + validityYears);

  const subjectAttrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: 'xShieldAI' },
    { name: 'organizationalUnitName', value: 'ankrshield-desktop' },
  ];
  cert.setSubject(subjectAttrs);
  // Self-signed: issuer == subject.
  cert.setIssuer(subjectAttrs);

  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      // Root may only sign leaf certs, not other CAs.
      pathLenConstraint: 0,
      critical: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
  ]);

  cert.sign(keypair.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keypair.privateKey);

  // Fingerprint = SHA-256 of the DER bytes (industry standard for cert IDs).
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fingerprintSha256 = crypto
    .createHash('sha256')
    .update(Buffer.from(der, 'binary'))
    .digest('hex');

  return {
    certPem,
    keyPem,
    fingerprintSha256,
    generatedAt: now.toISOString(),
    validUntil: cert.validity.notAfter.toISOString(),
  };
}
