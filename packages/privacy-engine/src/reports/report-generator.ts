/**
 * Report Generator
 * Generates daily, weekly, and monthly privacy reports
 */

import { PrismaClient } from '@prisma/client';

import { TrendAnalyzer } from '../analysis/trend-analyzer';
import { PrivacyCalculator } from '../scoring/privacy-calculator';
import type {
  DailyReport,
  WeeklyReport,
  MonthlyReport,
  Recommendation,
  TrackerStats,
  AppStats,
  TimeRange,
} from '../types';

/**
 * Report Generator
 * Creates comprehensive privacy reports
 */
export class ReportGenerator {
  constructor(
    private prisma: PrismaClient,
    private calculator: PrivacyCalculator,
    private trendAnalyzer: TrendAnalyzer
  ) {}

  /**
   * Generate daily digest
   */
  async generateDailyDigest(userId: string, date: Date): Promise<DailyReport> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const timeRange: TimeRange = { start: dayStart, end: dayEnd };

    // Calculate today's score
    const todayScore = await this.calculator.calculateTotalScore(userId, timeRange);

    // Get top trackers
    const topTrackers = await this.getTopTrackers(userId, timeRange, 5);

    // Get connection stats
    const stats = await this.getConnectionStats(userId, timeRange);

    // Get trend vs yesterday
    const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayScore = await this.calculator.calculateTotalScore(userId, {
      start: new Date(yesterday.setHours(0, 0, 0, 0)),
      end: new Date(yesterday.setHours(23, 59, 59, 999)),
    });

    const trend = {
      direction:
        todayScore.totalScore > yesterdayScore.totalScore
          ? ('worsening' as const)
          : todayScore.totalScore < yesterdayScore.totalScore
            ? ('improving' as const)
            : ('stable' as const),
      change: todayScore.totalScore - yesterdayScore.totalScore,
      percentageChange:
        yesterdayScore.totalScore > 0
          ? ((todayScore.totalScore - yesterdayScore.totalScore) / yesterdayScore.totalScore) * 100
          : 0,
      comparisonPeriod: 'vs. yesterday',
    };

    // Generate summary
    const summary = this.generateDailySummary(todayScore.totalScore, stats, topTrackers);

    return {
      userId,
      date,
      privacyScore: todayScore.totalScore,
      topTrackers,
      blockedConnections: stats.blocked,
      totalConnections: stats.total,
      trend,
      summary,
    };
  }

  /**
   * Generate weekly summary
   */
  async generateWeeklySummary(_userId: string, startDate: Date): Promise<WeeklyReport> {
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const timeRange: TimeRange = { start: startDate, end: endDate };

    // Calculate average score
    const weekScore = await this.calculator.calculateTotalScore(userId, timeRange);

    // Get top trackers
    const topTrackers = await this.getTopTrackers(userId, timeRange, 10);

    // Get top apps
    const topApps = await this.getTopApps(userId, timeRange, 5);

    // Get week-over-week trend
    const weekOverWeek = await this.trendAnalyzer.getWeeklyTrend(userId);

    // Generate notable events
    const notableEvents = await this.getNotableEvents(userId, timeRange);

    // Generate summary and recommendations
    const summary = this.generateWeeklySummary(weekScore.totalScore, topTrackers, topApps);
    const recommendations = await this.getRecommendations(userId, weekScore.totalScore);

    return {
      userId,
      startDate,
      endDate,
      averageScore: weekScore.totalScore,
      topTrackers,
      topApps,
      weekOverWeek,
      notableEvents,
      summary,
      recommendations: recommendations.map((r) => r.description),
    };
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport(
    _userId: string,
    month: number,
    year: number
  ): Promise<MonthlyReport> {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const timeRange: TimeRange = { start: monthStart, end: monthEnd };

    // Calculate average score
    const monthScore = await this.calculator.calculateTotalScore(userId, timeRange);

    // Get score history
    const days = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000));
    const scoreHistory = await this.trendAnalyzer.getScoreHistory(userId, days);

    // Get total trackers contacted
    const totalTrackers = await this.getTotalTrackers(userId, timeRange);

    // Get total data to trackers
    const totalDataToTrackers = await this.getTotalDataToTrackers(userId, timeRange);

    // Get top vendors
    const topVendors = await this.getTopVendors(userId, timeRange, 10);

    // Get month-over-month trend
    const monthOverMonth = await this.trendAnalyzer.getMonthlyTrend(userId);

    // Generate summary and recommendations
    const summary = this.generateMonthlySummary(
      monthScore.totalScore,
      totalTrackers,
      totalDataToTrackers
    );
    const recommendations = await this.getRecommendations(userId, monthScore.totalScore);

    return {
      userId,
      month,
      year,
      averageScore: monthScore.totalScore,
      scoreHistory,
      totalTrackers,
      totalDataToTrackers,
      topVendors,
      monthOverMonth,
      summary,
      recommendations: recommendations.map((r) => r.description),
    };
  }

  /**
   * Get recommendations for user
   */
  async getRecommendations(userId: string, score: number): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    if (score > 80) {
      recommendations.push({
        priority: 'high',
        category: 'critical',
        title: 'Enable Tracker Blocking',
        description:
          'Your privacy score is critical. Enable comprehensive tracker blocking immediately.',
        actionable: true,
        estimatedImpact: 40,
      });
    }

    if (score > 60) {
      recommendations.push({
        priority: 'high',
        category: 'network',
        title: 'Use a VPN',
        description: 'Consider using a VPN to protect your network traffic from tracking.',
        actionable: true,
        estimatedImpact: 25,
      });

      recommendations.push({
        priority: 'medium',
        category: 'dns',
        title: 'Enable DNS Filtering',
        description:
          'Enable DNS-level filtering to block tracking domains before they are contacted.',
        actionable: true,
        estimatedImpact: 20,
      });
    }

    if (score > 30) {
      recommendations.push({
        priority: 'medium',
        category: 'apps',
        title: 'Review App Permissions',
        description:
          'Review which apps have network access and consider privacy-friendly alternatives.',
        actionable: true,
        estimatedImpact: 15,
      });
    }

    recommendations.push({
      priority: 'low',
      category: 'general',
      title: 'Regular Privacy Audits',
      description: 'Review your privacy settings weekly to maintain optimal privacy protection.',
      actionable: true,
      estimatedImpact: 10,
    });

    return recommendations;
  }

  /**
   * Get top trackers for time range
   */
  private async getTopTrackers(
    _userId: string,
    _timeRange: TimeRange,
    _limit: number
  ): Promise<TrackerStats[]> {
    // Simplified implementation
    // Real implementation would query NetworkEvent with tracker info
    return [];
  }

  /**
   * Get top apps for time range
   */
  private async getTopApps(
    _userId: string,
    _timeRange: TimeRange,
    _limit: number
  ): Promise<AppStats[]> {
    // Simplified implementation
    return [];
  }

  /**
   * Get connection statistics
   */
  private async getConnectionStats(
    _userId: string,
    _timeRange: TimeRange
  ): Promise<{ total: number; blocked: number }> {
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

    return {
      total: stats._count || 0,
      blocked: 0, // Simplified
    };
  }

  /**
   * Get notable events
   */
  private async getNotableEvents(_userId: string, _timeRange: TimeRange): Promise<string[]> {
    const anomalies = await this.trendAnalyzer.detectAnomalies(userId, 7);
    return anomalies.map((a) => a.description);
  }

  /**
   * Get total trackers contacted
   */
  private async getTotalTrackers(_userId: string, _timeRange: TimeRange): Promise<number> {
    // Simplified implementation
    return 0;
  }

  /**
   * Get total data transferred to trackers
   */
  private async getTotalDataToTrackers(_userId: string, _timeRange: TimeRange): Promise<number> {
    // Simplified implementation
    return 0;
  }

  /**
   * Get top vendors
   */
  private async getTopVendors(
    _userId: string,
    _timeRange: TimeRange,
    _limit: number
  ): Promise<any[]> {
    // Simplified implementation
    return [];
  }

  /**
   * Generate daily summary text
   */
  private generateDailySummary(
    score: number,
    stats: { total: number; blocked: number },
    topTrackers: TrackerStats[]
  ): string {
    let summary = `Privacy Score: ${score}/100 (${this.getScoreLabel(score)}). `;
    summary += `Made ${stats.total} connections today`;

    if (stats.blocked > 0) {
      summary += `, blocked ${stats.blocked} tracking attempts`;
    }

    if (topTrackers.length > 0) {
      summary += `. Top tracker: ${topTrackers[0].domain}`;
    }

    return summary + '.';
  }

  /**
   * Generate weekly summary text
   */
  private generateMonthlySummary(score: number, totalTrackers: number, totalData: number): string {
    let summary = `Average Privacy Score: ${score}/100 this month. `;

    if (totalTrackers > 0) {
      summary += `Contacted ${totalTrackers} tracking domains. `;
    }

    if (totalData > 0) {
      const dataMB = (totalData / (1024 * 1024)).toFixed(2);
      summary += `Transferred ${dataMB} MB to trackers. `;
    }

    return summary;
  }

  /**
   * Get score label
   */
  private getScoreLabel(score: number): string {
    if (score <= 30) return 'Excellent';
    if (score <= 60) return 'Good';
    if (score <= 80) return 'Poor';
    return 'Critical';
  }
}
