// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-002 root CA generator.
//
// @rule:ASD-002 — every install has its own root CA (uniqueness on each call)

import { describe, it, expect } from 'vitest';
import forge from 'node-forge';

import { generateRootCA } from '../aegis-proxy/ca-generator.js';

// RSA-4096 keygen is slow (~1-2s); use a smaller key in unit tests to keep
// the suite responsive. The defaults are still exercised by the runtime
// smoke test in scripts/smoke-ca.mjs.
const FAST_OPTS = { keyBits: 2048, validityYears: 10 };

describe('ASD-002 — root CA generator', () => {
  it('produces a valid PEM cert + key pair', () => {
    const ca = generateRootCA(FAST_OPTS);
    expect(ca.certPem).toMatch(/^-----BEGIN CERTIFICATE-----/);
    expect(ca.certPem).toMatch(/-----END CERTIFICATE-----\r?\n?$/);
    expect(ca.keyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/);
    expect(ca.keyPem).toMatch(/-----END RSA PRIVATE KEY-----\r?\n?$/);
  });

  it('returns a 64-char lowercase hex sha256 fingerprint', () => {
    const ca = generateRootCA(FAST_OPTS);
    expect(ca.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different CA on each call (ASD-002 uniqueness)', () => {
    const a = generateRootCA(FAST_OPTS);
    const b = generateRootCA(FAST_OPTS);
    expect(a.fingerprintSha256).not.toBe(b.fingerprintSha256);
    expect(a.certPem).not.toBe(b.certPem);
    expect(a.keyPem).not.toBe(b.keyPem);
  });

  it('sets validityYears (default 10)', () => {
    const now = new Date('2026-05-18T00:00:00Z');
    const ca = generateRootCA({ ...FAST_OPTS, now });
    expect(ca.generatedAt).toBe('2026-05-18T00:00:00.000Z');
    expect(ca.validUntil).toBe('2036-05-18T00:00:00.000Z');
  });

  it('honours custom validityYears', () => {
    const now = new Date('2026-05-18T00:00:00Z');
    const ca = generateRootCA({ keyBits: 2048, validityYears: 3, now });
    expect(ca.validUntil).toBe('2029-05-18T00:00:00.000Z');
  });

  it('cert parses with CA:TRUE + pathLen 0 + keyCertSign+cRLSign', () => {
    const ca = generateRootCA(FAST_OPTS);
    const cert = forge.pki.certificateFromPem(ca.certPem);

    const basicConstraints = cert.getExtension('basicConstraints') as {
      cA?: boolean;
      pathLenConstraint?: number;
    } | null;
    expect(basicConstraints?.cA).toBe(true);
    expect(basicConstraints?.pathLenConstraint).toBe(0);

    const keyUsage = cert.getExtension('keyUsage') as {
      keyCertSign?: boolean;
      cRLSign?: boolean;
    } | null;
    expect(keyUsage?.keyCertSign).toBe(true);
    expect(keyUsage?.cRLSign).toBe(true);
  });

  it('issuer == subject (self-signed)', () => {
    const ca = generateRootCA(FAST_OPTS);
    const cert = forge.pki.certificateFromPem(ca.certPem);
    const subj = cert.subject.attributes.map((a) => `${a.name}=${a.value}`).sort();
    const iss = cert.issuer.attributes.map((a) => `${a.name}=${a.value}`).sort();
    expect(subj).toEqual(iss);
  });

  it('CN has an install-specific random tail (ASD-002 uniqueness signal)', () => {
    const a = generateRootCA(FAST_OPTS);
    const b = generateRootCA(FAST_OPTS);
    const certA = forge.pki.certificateFromPem(a.certPem);
    const certB = forge.pki.certificateFromPem(b.certPem);
    const cnA = certA.subject.getField('CN').value as string;
    const cnB = certB.subject.getField('CN').value as string;
    expect(cnA).toMatch(/^ankrshield desktop root CA \([0-9a-f]{8}\)$/);
    expect(cnA).not.toBe(cnB);
  });

  it('explicit commonName overrides the default', () => {
    const ca = generateRootCA({ ...FAST_OPTS, commonName: 'test-CA' });
    const cert = forge.pki.certificateFromPem(ca.certPem);
    expect(cert.subject.getField('CN').value).toBe('test-CA');
  });

  it('serial number is non-empty positive hex', () => {
    const ca = generateRootCA(FAST_OPTS);
    const cert = forge.pki.certificateFromPem(ca.certPem);
    expect(cert.serialNumber).toMatch(/^[0-9a-f]+$/);
    expect(cert.serialNumber.length).toBeGreaterThan(0);
    // High bit unset → first hex digit < 8
    expect(parseInt(cert.serialNumber[0]!, 16)).toBeLessThan(8);
  });
});
