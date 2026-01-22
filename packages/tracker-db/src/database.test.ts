import { describe, expect, it, beforeEach } from 'vitest';

import { TrackerDatabase } from './database';

describe('TrackerDatabase', () => {
  let db: TrackerDatabase;

  beforeEach(() => {
    db = new TrackerDatabase();
  });

  it('should add and lookup trackers', () => {
    const tracker = {
      domain: 'tracker.example.com',
      category: 'advertising',
      vendor: 'Example Corp',
      riskScore: 7,
    };

    db.add(tracker);

    const result = db.lookup('tracker.example.com');
    expect(result).toEqual(tracker);
  });

  it('should return undefined for unknown domains', () => {
    const result = db.lookup('unknown.com');
    expect(result).toBeUndefined();
  });

  it('should correctly identify blocked domains', () => {
    db.add({
      domain: 'ads.example.com',
      category: 'advertising',
      riskScore: 8,
    });

    expect(db.isBlocked('ads.example.com')).toBe(true);
    expect(db.isBlocked('safe.example.com')).toBe(false);
  });
});
