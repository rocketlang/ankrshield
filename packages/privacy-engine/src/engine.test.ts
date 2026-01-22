import { describe, expect, it } from 'vitest';

import { PrivacyEngine } from './engine';

describe('PrivacyEngine', () => {
  const engine = new PrivacyEngine();

  it('should calculate privacy score based on block rate', () => {
    const score = engine.calculateScore({
      blockedCount: 80,
      allowedCount: 20,
      totalTrackers: 100,
    });

    expect(score).toBe(80); // 80% blocked
  });

  it('should return 100 for perfect privacy', () => {
    const score = engine.calculateScore({
      blockedCount: 100,
      allowedCount: 0,
      totalTrackers: 100,
    });

    expect(score).toBe(100);
  });

  it('should return 0 for no privacy', () => {
    const score = engine.calculateScore({
      blockedCount: 0,
      allowedCount: 100,
      totalTrackers: 100,
    });

    expect(score).toBe(0);
  });

  it('should handle division by zero', () => {
    const score = engine.calculateScore({
      blockedCount: 0,
      allowedCount: 0,
      totalTrackers: 0,
    });

    expect(score).toBe(100); // Default to 100 when no data
  });
});
