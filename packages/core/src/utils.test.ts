import { describe, expect, it } from 'vitest';

import { chunk, isValidDomain, sleep } from './utils';

describe('utils', () => {
  describe('isValidDomain', () => {
    it('should validate correct domains', () => {
      expect(isValidDomain('example.com')).toBe(true);
      expect(isValidDomain('sub.example.com')).toBe(true);
      expect(isValidDomain('www.example.co.uk')).toBe(true);
    });

    it('should reject invalid domains', () => {
      expect(isValidDomain('not a domain')).toBe(false);
      expect(isValidDomain('')).toBe(false);
      expect(isValidDomain('http://example.com')).toBe(false);
    });
  });

  describe('sleep', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await sleep(100);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(100);
    });
  });

  describe('chunk', () => {
    it('should split array into chunks', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7];
      const result = chunk(arr, 3);
      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('should handle empty arrays', () => {
      expect(chunk([], 3)).toEqual([]);
    });

    it('should handle single chunk', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });
  });
});
