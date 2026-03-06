/**
 * Trend Analyzer
 * Analyzes privacy score trends and detects anomalies
 */

import { PrismaClient } from '@prisma/client';

import { PrivacyCalculator } from '../scoring/privacy-calculator';
import type { Trend, TrendDirection, Anomaly, ScoreHistory, TimeRange, Comparison } from '../types';

/**
 * Trend Analyzer
 * Provides trend analysis and anomaly detection for privacy scores
 */
export class TrendAnalyzer {
  constructor(
    private prisma: PrismaClient,
    private calculator: PrivacyCalculator
  ) {}

  /**
   * Get weekly trend (this week vs last week)
   */
  async getWeeklyTrend(userId: string): Promise<Trend> {
    const now = new Date();
    const thisWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeekRange: TimeRange = {
      start: thisWeekStart,
      end: now,
    };

    const lastWeekRange: TimeRange = {
      start: lastWeekStart,
      end: thisWeekStart,
    };

    return this.comparePeriods(userId, thisWeekRange, lastWeekRange, 'week');
  }

  /**
   * Get monthly trend (this month vs last month)
   */
  async getMonthlyTrend(userId: string): Promise<Trend> {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const thisMonthRange: TimeRange = {
      start: thisMonthStart,
      end: now,
    };

    const lastMonthRange: TimeRange = {
      start: lastMonthStart,
      end: lastMonthEnd,
    };

    return this.comparePeriods(userId, thisMonthRange, lastMonthRange, 'month');
  }

  /**
   * Compare two time periods
   */
  private async comparePeriods(
    userId: string,
    currentRange: TimeRange,
    previousRange: TimeRange,
    period: string
  ): Promise<Trend> {
    const [currentScore, previousScore] = await Promise.all([
      this.calculator.calculateTotalScore(userId, currentRange),
      this.calculator.calculateTotalScore(userId, previousRange),
    ]);

    const change = currentScore.totalScore - previousScore.totalScore;
    const percentageChange =
      previousScore.totalScore > 0 ? (change / previousScore.totalScore) * 100 : 0;

    let direction: TrendDirection = 'stable';
    if (Math.abs(change) >= 5) {
      direction = change > 0 ? 'worsening' : 'improving';
    }

    return {
      current: currentScore.totalScore,
      previous: previousScore.totalScore,
      change,
      percentageChange: Math.round(percentageChange * 10) / 10,
      direction,
      period,
    };
  }

  /**
   * Detect anomalies in privacy score
   */
  async detectAnomalies(userId: string, days: number = 30): Promise<Anomaly[]> {
    const history = await this.getScoreHistory(userId, days);

    if (history.length < 7) {
      return []; // Need at least 7 days for anomaly detection
    }

    // Calculate average and standard deviation
    const scores = history.map((h) => h.score);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies (scores more than 2 standard deviations from mean)
    const anomalies: Anomaly[] = [];

    for (const entry of history) {
      const deviation = Math.abs(entry.score - avg);
      const zScore = stdDev > 0 ? deviation / stdDev : 0;

      if (zScore > 2) {
        anomalies.push({
          timestamp: entry.timestamp,
          score: entry.score,
          expectedScore: Math.round(avg),
          deviation: Math.round(deviation),
          severity: zScore > 3 ? 'high' : zScore > 2.5 ? 'medium' : 'low',
          description: `Privacy score ${entry.score > avg ? 'spike' : 'drop'} detected (${Math.round(deviation)} points from average)`,
        });
      }
    }

    return anomalies.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get score history
   */
  async getScoreHistory(userId: string, days: number = 30): Promise<ScoreHistory[]> {
    const history: ScoreHistory[] = [];
    const now = new Date();

    // Calculate score for each day
    for (let i = 0; i < days; i++) {
      const dayEnd = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(dayEnd.getTime() - 24 * 60 * 60 * 1000);

      const score = await this.calculator.calculateTotalScore(userId, {
        start: dayStart,
        end: dayEnd,
      });

      history.push({
        timestamp: dayStart,
        score: score.totalScore,
        level: score.level,
      });
    }

    return history.reverse(); // Oldest first
  }

  /**
   * Compare two custom time ranges
   */
  async compareTimeRanges(
    userId: string,
    range1: TimeRange,
    range2: TimeRange
  ): Promise<Comparison> {
    const [score1Result, score2Result] = await Promise.all([
      this.calculator.calculateTotalScore(userId, range1),
      this.calculator.calculateTotalScore(userId, range2),
    ]);

    const score1 = score1Result.totalScore;
    const score2 = score2Result.totalScore;
    const change = score1 - score2;
    const percentageChange = score2 > 0 ? (change / score2) * 100 : 0;

    let direction: TrendDirection = 'stable';
    if (Math.abs(change) >= 5) {
      direction = change > 0 ? 'worsening' : 'improving';
    }

    // Determine significance
    let significance: 'significant' | 'moderate' | 'minimal' = 'minimal';
    if (Math.abs(change) >= 20) {
      significance = 'significant';
    } else if (Math.abs(change) >= 10) {
      significance = 'moderate';
    }

    return {
      range1,
      range2,
      score1,
      score2,
      change,
      percentageChange: Math.round(percentageChange * 10) / 10,
      direction,
      significance,
    };
  }

  /**
   * Get score trend line (for charting)
   */
  async getScoreTrendLine(
    userId: string,
    days: number = 30
  ): Promise<Array<{ date: Date; score: number }>> {
    const history = await this.getScoreHistory(userId, days);
    return history.map((h) => ({
      date: h.timestamp,
      score: h.score,
    }));
  }

  /**
   * Calculate moving average
   */
  calculateMovingAverage(
    data: Array<{ date: Date; score: number }>,
    window: number = 7
  ): Array<{ date: Date; score: number; movingAverage: number }> {
    const result: Array<{ date: Date; score: number; movingAverage: number }> = [];

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - window + 1);
      const windowData = data.slice(start, i + 1);
      const average = windowData.reduce((sum, d) => sum + d.score, 0) / windowData.length;

      result.push({
        date: data[i].date,
        score: data[i].score,
        movingAverage: Math.round(average),
      });
    }

    return result;
  }
}
