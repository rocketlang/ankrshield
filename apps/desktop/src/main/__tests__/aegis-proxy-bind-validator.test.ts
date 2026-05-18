// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-001 bind validator.
//
// @rule:ASD-001 — proxy must bind only to loopback
// @rule:INF-ASD-001 — non-loopback → fatal exit(78)

import { describe, it, expect } from 'vitest';
import {
  validateBindAddress,
  isLoopbackAddress,
  AegisBindViolation,
} from '../aegis-proxy/bind-validator.js';
import { ASD_PROXY_LOOPBACK_ADDRESSES } from '../aegis-proxy/types.js';

describe('ASD-001 — aegis-proxy bind validator', () => {
  describe('isLoopbackAddress', () => {
    it.each(ASD_PROXY_LOOPBACK_ADDRESSES)('accepts canonical loopback %s', (addr) => {
      expect(isLoopbackAddress(addr)).toBe(true);
    });

    it.each([
      '0.0.0.0',
      '::',
      '10.0.0.1',
      '192.168.1.1',
      '8.8.8.8',
      'localhost', // names are NOT loopback for ASD-001 purposes — must be literal IP
      '127.0.0.2', // wider loopback /8 is intentionally rejected — explicit policy
      '',
    ])('rejects non-loopback %s', (addr) => {
      expect(isLoopbackAddress(addr)).toBe(false);
    });
  });

  describe('validateBindAddress', () => {
    it.each(ASD_PROXY_LOOPBACK_ADDRESSES)('returns silently for loopback %s', (addr) => {
      expect(() => validateBindAddress(addr)).not.toThrow();
    });

    it('throws AegisBindViolation for non-loopback', () => {
      expect(() => validateBindAddress('0.0.0.0')).toThrow(AegisBindViolation);
    });

    it('violation carries ASD-001 code and exit code 78', () => {
      try {
        validateBindAddress('192.168.1.50');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AegisBindViolation);
        const violation = err as AegisBindViolation;
        expect(violation.code).toBe('ASD-001');
        expect(violation.exitCode).toBe(78);
        expect(violation.bindAddress).toBe('192.168.1.50');
        expect(violation.message).toMatch(/ASD-001 violation/);
        expect(violation.message).toMatch(/192\.168\.1\.50/);
      }
    });
  });
});
