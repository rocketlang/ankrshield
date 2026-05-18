/**
 * Privacy Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyService } from '../privacy.js';

describe('PrivacyService', () => {
  let service: PrivacyService;

  beforeEach(() => {
    service = new PrivacyService();
  });

  it('should get current privacy score', async () => {
    const score = await service.getCurrentScore();
    expect(score).toBeDefined();
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it('should get score history', async () => {
    const history = await service.getScoreHistory(7);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  it('should get score breakdown', async () => {
    const breakdown = await service.getScoreBreakdown();
    expect(breakdown).toBeDefined();
    expect(breakdown.totalScore).toBeDefined();
    expect(Array.isArray(breakdown.components)).toBe(true);
  });

  it('should get top trackers', async () => {
    const trackers = await service.getTopTrackers(5);
    expect(Array.isArray(trackers)).toBe(true);
    expect(trackers.length).toBeLessThanOrEqual(5);
  });

  it('should generate daily report', async () => {
    const report = await service.generateDailyReport(new Date());
    expect(report).toBeDefined();
    expect(report.privacyScore).toBeDefined();
  });
});
