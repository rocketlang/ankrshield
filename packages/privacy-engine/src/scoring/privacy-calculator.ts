/**
 * Privacy Calculator
 * Calculates multi-dimensional privacy scores
 */

import { PrismaClient } from '@prisma/client';
import type {
  PrivacyScore,
  PrivacyLevel,
  TimeRange,
  ScoreBreakdown,
  ScoreComponent,
  PrivacyIssue,
  ScoreTrend,
  TrendDirection,
} from '../types';

/**
 * Score calculation weights
 */
interface ScoreWeights {
  network: number;
  dns: number;
  app: number;
  ai: number;
}

/**
 * Privacy Calculator
 * Calculates comprehensive privacy scores across multiple dimensions
 */
export class PrivacyCalculator {
  private weights: ScoreWeights = {
    network: 0.4, // 40%
    dns: 0.3, // 30%
    app: 0.2, // 20%
    ai: 0.1, // 10% (future)
  };

  constructor(private prisma: PrismaClient) {}

  /**
   * Calculate total privacy score for user
   */
  async calculateTotalScore(
    userId: string,
    timeRange?: TimeRange
  ): Promise<PrivacyScore> {
    const range = timeRange || this.getDefaultTimeRange();

    // Calculate component scores in parallel
    const [networkScore, dnsScore, appScore] = await Promise.all([
      this.calculateNetworkScore(userId, range),
      this.calculateDNSScore(userId, range),
      this.calculateAppScore(userId, range),
    ]);

    // Calculate weighted total
    const totalScore = Math.round(
      networkScore * this.weights.network +
        dnsScore * this.weights.dns +
        appScore * this.weights.app
    );

    // Get level
    const level = this.getPrivacyLevel(totalScore);

    // Get trend (compare with previous period)
    const trend = await this.getScoreTrend(userId, totalScore, range);

    return {
      userId,
      timestamp: new Date(),
      totalScore,
      networkScore,
      dnsScore,
      appScore,
      level,
      trend,
    };
  }

  /**
   * Calculate network privacy score
   */
  async calculateNetworkScore(
    userId: string,
    timeRange: TimeRange
  ): Promise<number> {
    // Query network events
    const stats = await this.prisma.networkEvent.aggregate({
      where: {
        userId,
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
      },
      _count: true,
    });

    const totalConnections = stats._count || 0;

    if (totalConnections === 0) {
      return 0; // No connections = excellent privacy
    }

    // Simplified scoring for now (can be enhanced with tracker data)
    // This is a placeholder - real implementation would query tracker info
    let score = 0;

    // Base score calculation
    score += Math.min(totalConnections / 100, 30); // More connections = higher score

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Calculate DNS privacy score
   */
  async calculateDNSScore(
    userId: string,
    timeRange: TimeRange
  ): Promise<number> {
    // Simplified DNS score
    // Real implementation would query DNS-specific events
    return 0; // Placeholder
  }

  /**
   * Calculate app privacy score
   */
  async calculateAppScore(
    userId: string,
    timeRange: TimeRange
  ): Promise<number> {
    // Simplified app score
    // Real implementation would query app-level data
    return 0; // Placeholder
  }

  /**
   * Get detailed score breakdown
   */
  async getScoreBreakdown(userId: string): Promise<ScoreBreakdown> {
    const timeRange = this.getDefaultTimeRange();
    const score = await this.calculateTotalScore(userId, timeRange);

    // Calculate components
    const components: ScoreComponent[] = [
      {
        name: 'Network Activity',
        score: score.networkScore,
        weight: this.weights.network,
        contributionToTotal: Math.round(score.networkScore * this.weights.network),
      },
      {
        name: 'DNS Queries',
        score: score.dnsScore,
        weight: this.weights.dns,
        contributionToTotal: Math.round(score.dnsScore * this.weights.dns),
      },
      {
        name: 'App Behavior',
        score: score.appScore,
        weight: this.weights.app,
        contributionToTotal: Math.round(score.appScore * this.weights.app),
      },
    ];

    // Identify top issues
    const topIssues = await this.identifyTopIssues(userId, timeRange, score);

    // Generate recommendations
    const recommendations = this.generateRecommendations(score, topIssues);

    return {
      totalScore: score.totalScore,
      components,
      topIssues,
      recommendations,
    };
  }

  /**
   * Identify top privacy issues
   */
  private async identifyTopIssues(
    userId: string,
    timeRange: TimeRange,
    score: PrivacyScore
  ): Promise<PrivacyIssue[]> {
    const issues: PrivacyIssue[] = [];

    // Issue 1: High network score
    if (score.networkScore > 60) {
      issues.push({
        type: 'high_tracker_contact',
        severity: score.networkScore > 80 ? 'critical' : 'high',
        description: 'High number of tracker connections detected',
        recommendation: 'Enable tracker blocking or use a VPN',
      });
    }

    // Issue 2: High DNS score
    if (score.dnsScore > 60) {
      issues.push({
        type: 'high_dns_tracking',
        severity: score.dnsScore > 80 ? 'critical' : 'high',
        description: 'Many DNS queries to tracking domains',
        recommendation: 'Use encrypted DNS (DoH/DoT) and enable DNS filtering',
      });
    }

    // Issue 3: High app score
    if (score.appScore > 60) {
      issues.push({
        type: 'high_app_tracking',
        severity: score.appScore > 80 ? 'critical' : 'high',
        description: 'Many apps are contacting trackers',
        recommendation: 'Review app permissions and consider alternatives',
      });
    }

    return issues;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    score: PrivacyScore,
    issues: PrivacyIssue[]
  ): string[] {
    const recommendations: string[] = [];

    if (score.totalScore > 80) {
      recommendations.push('Your privacy score is critical. Immediate action recommended.');
    } else if (score.totalScore > 60) {
      recommendations.push('Your privacy score is poor. Consider improving your privacy settings.');
    } else if (score.totalScore > 30) {
      recommendations.push('Your privacy score is good, but can be improved.');
    } else {
      recommendations.push('Excellent privacy! Keep up the good work.');
    }

    // Add issue-specific recommendations
    for (const issue of issues) {
      recommendations.push(issue.recommendation);
    }

    return recommendations;
  }

  /**
   * Get score trend
   */
  private async getScoreTrend(
    userId: string,
    currentScore: number,
    currentRange: TimeRange
  ): Promise<ScoreTrend | undefined> {
    // Calculate previous period range
    const duration = currentRange.end.getTime() - currentRange.start.getTime();
    const previousRange: TimeRange = {
      start: new Date(currentRange.start.getTime() - duration),
      end: currentRange.start,
    };

    // Calculate previous score
    const previousScore = await this.calculateTotalScore(userId, previousRange);

    const change = currentScore - previousScore.totalScore;
    const percentageChange =
      previousScore.totalScore > 0
        ? (change / previousScore.totalScore) * 100
        : 0;

    let direction: TrendDirection = 'stable';
    if (Math.abs(change) >= 5) {
      // 5 point threshold for significance
      direction = change > 0 ? 'worsening' : 'improving';
    }

    return {
      direction,
      change,
      percentageChange: Math.round(percentageChange * 10) / 10,
      comparisonPeriod: `vs. previous ${Math.round(duration / (24 * 60 * 60 * 1000))} days`,
    };
  }

  /**
   * Get privacy level from score
   */
  private getPrivacyLevel(score: number): PrivacyLevel {
    if (score <= 30) return 'excellent';
    if (score <= 60) return 'good';
    if (score <= 80) return 'poor';
    return 'critical';
  }

  /**
   * Get default time range (last 24 hours)
   */
  private getDefaultTimeRange(): TimeRange {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start, end };
  }

  /**
   * Set custom weights
   */
  setWeights(weights: Partial<ScoreWeights>): void {
    this.weights = { ...this.weights, ...weights };

    // Normalize weights to sum to 1.0
    const total = Object.values(this.weights).reduce((sum, w) => sum + w, 0);
    if (total > 0) {
      this.weights.network /= total;
      this.weights.dns /= total;
      this.weights.app /= total;
      this.weights.ai /= total;
    }
  }
}
