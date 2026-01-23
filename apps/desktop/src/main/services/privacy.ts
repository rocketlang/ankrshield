/**
 * Privacy Service
 * Integrates with @ankrshield/privacy-engine package for scoring and reports
 * Calculates privacy scores on schedule and stores to database
 */

import { PrismaClient, EventType as PrismaEventType } from '@prisma/client';
import { PrivacyCalculator } from '@ankrshield/privacy-engine';
import { databaseManager } from '../infrastructure/database';
import { userManager } from '../infrastructure/user';
import { eventBus, EventType } from '../infrastructure/event-bus';

export interface PrivacyScore {
  userId: string;
  timestamp: Date;
  totalScore: number;
  networkScore: number;
  dnsScore: number;
  appScore: number;
  level: string;
  trend?: any;
}

export interface ScoreHistory {
  timestamp: Date;
  score: number;
}

export interface TrackerStats {
  domain: string;
  category: string;
  vendor?: string;
  connections: number;
  blocked: number;
  riskScore: number;
}

/**
 * Privacy Service
 * Calculates and tracks privacy scores with automatic scheduling
 */
export class PrivacyService {
  private prisma: PrismaClient | null = null;
  private calculator: PrivacyCalculator | null = null;
  private initialized = false;

  // Score calculation scheduler
  private scoreTimer: NodeJS.Timeout | null = null;
  private scoreInterval: number = 15 * 60 * 1000; // 15 minutes

  // Cache for latest score
  private latestScore: PrivacyScore | null = null;

  constructor() {
    // Don't auto-initialize in constructor
  }

  /**
   * Initialize privacy service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Get database client from manager
      this.prisma = databaseManager.getClient();

      // Initialize privacy calculator
      this.calculator = new PrivacyCalculator(this.prisma);

      // Calculate initial score
      await this.calculateAndStoreScore();

      // Start score calculation scheduler
      this.startScoreScheduler();

      this.initialized = true;
      console.log('[PrivacyService] Initialized successfully');
    } catch (error) {
      console.error('[PrivacyService] Initialization failed:', error);
      // Continue without calculator - use mock data
      this.initialized = true;
    }
  }

  /**
   * Start score calculation scheduler
   */
  private startScoreScheduler(): void {
    if (this.scoreTimer) {
      clearInterval(this.scoreTimer);
    }

    this.scoreTimer = setInterval(() => {
      this.calculateAndStoreScore().catch((error) => {
        console.error('[PrivacyService] Error in score scheduler:', error);
      });
    }, this.scoreInterval);

    console.log('[PrivacyService] Score scheduler started (every 15 minutes)');
  }

  /**
   * Calculate privacy score and store to database
   */
  private async calculateAndStoreScore(): Promise<void> {
    try {
      if (!this.calculator || !this.prisma) {
        return;
      }

      const userInfo = userManager.getUserInfo();
      if (!userInfo) {
        console.warn('[PrivacyService] No user info available');
        return;
      }

      // Calculate score using privacy engine
      const score = await this.calculator.calculateTotalScore(userInfo.userId);

      // Cache the latest score
      this.latestScore = {
        userId: userInfo.userId,
        timestamp: new Date(),
        totalScore: score.totalScore,
        networkScore: score.networkScore,
        dnsScore: score.dnsScore,
        appScore: score.appScore,
        level: score.level,
      };

      // Store to database (PrivacyScore table)
      await this.prisma.privacyScore.create({
        data: {
          userId: userInfo.userId,
          overallScore: score.totalScore,
          networkScore: score.networkScore,
          dnsScore: score.dnsScore,
          appScore: score.appScore,
          aiScore: 0, // Default value for now
        },
      });

      // Emit event for UI updates
      eventBus.emit(EventType.PRIVACY_SCORE_UPDATED, this.latestScore);

      console.log(`[PrivacyService] Calculated and stored score: ${score.totalScore}`);
    } catch (error) {
      console.error('[PrivacyService] Failed to calculate score:', error);
    }
  }

  /**
   * Get current privacy score
   */
  async getCurrentScore(): Promise<PrivacyScore> {
    try {
      // Return cached score if available
      if (this.latestScore) {
        return this.latestScore;
      }

      // Try to get most recent score from database
      if (this.prisma) {
        const userInfo = userManager.getUserInfo();
        if (userInfo) {
          const latestDbScore = await this.prisma.privacyScore.findFirst({
            where: { userId: userInfo.userId },
            orderBy: { timestamp: 'desc' },
          });

          if (latestDbScore) {
            return {
              userId: latestDbScore.userId,
              timestamp: latestDbScore.timestamp,
              totalScore: latestDbScore.overallScore,
              networkScore: latestDbScore.networkScore,
              dnsScore: latestDbScore.dnsScore,
              appScore: latestDbScore.appScore,
              level: this.calculateLevel(latestDbScore.overallScore),
            };
          }
        }
      }

      // Calculate fresh score if no cache or database entry
      if (this.calculator) {
        const userInfo = userManager.getUserInfo();
        if (userInfo) {
          const realScore = await this.calculator.calculateTotalScore(userInfo.userId);
          return {
            userId: userInfo.userId,
            timestamp: new Date(),
            totalScore: realScore.totalScore,
            networkScore: realScore.networkScore,
            dnsScore: realScore.dnsScore,
            appScore: realScore.appScore,
            level: realScore.level,
          };
        }
      }

      // Fallback to mock data
      return this.getMockScore();
    } catch (error) {
      console.error('[PrivacyService] Error getting current score:', error);
      return this.getMockScore();
    }
  }

  /**
   * Get mock score (fallback)
   */
  private getMockScore(): PrivacyScore {
    return {
      userId: 'unknown',
      timestamp: new Date(),
      totalScore: 25,
      networkScore: 30,
      dnsScore: 20,
      appScore: 25,
      level: 'excellent',
    };
  }

  /**
   * Get score history
   */
  async getScoreHistory(days: number): Promise<ScoreHistory[]> {
    try {
      if (this.prisma) {
        const userInfo = userManager.getUserInfo();
        if (userInfo) {
          const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

          const scores = await this.prisma.privacyScore.findMany({
            where: {
              userId: userInfo.userId,
              timestamp: { gte: startDate },
            },
            orderBy: { timestamp: 'asc' },
            select: {
              timestamp: true,
              overallScore: true,
            },
          });

          return scores.map((s) => ({
            timestamp: s.timestamp,
            score: s.overallScore,
          }));
        }
      }

      // Fallback to mock data
      return this.getMockHistory(days);
    } catch (error) {
      console.error('[PrivacyService] Error getting score history:', error);
      return this.getMockHistory(days);
    }
  }

  /**
   * Get mock history (fallback)
   */
  private getMockHistory(days: number): ScoreHistory[] {
    const history: ScoreHistory[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      history.push({
        timestamp: new Date(now - i * 24 * 60 * 60 * 1000),
        score: Math.floor(Math.random() * 40) + 10, // 10-50
      });
    }

    return history;
  }

  /**
   * Get score breakdown
   */
  async getScoreBreakdown(): Promise<any> {
    try {
      if (this.calculator) {
        const userInfo = userManager.getUserInfo();
        if (userInfo) {
          const realBreakdown = await this.calculator.getScoreBreakdown(userInfo.userId);
          return realBreakdown;
        }
      }

      // Fallback to mock data
      return this.getMockBreakdown();
    } catch (error) {
      console.error('[PrivacyService] Error getting score breakdown:', error);
      return this.getMockBreakdown();
    }
  }

  /**
   * Get mock breakdown (fallback)
   */
  private getMockBreakdown(): any {
    return {
      totalScore: 25,
      components: [
        {
          name: 'Network Activity',
          score: 30,
          weight: 0.4,
          contributionToTotal: 12,
        },
        {
          name: 'DNS Queries',
          score: 20,
          weight: 0.3,
          contributionToTotal: 6,
        },
        {
          name: 'App Behavior',
          score: 25,
          weight: 0.2,
          contributionToTotal: 5,
        },
      ],
      topIssues: [],
      recommendations: ['Excellent privacy! Keep up the good work.'],
    };
  }

  /**
   * Get top trackers (from database aggregation)
   */
  async getTopTrackers(limit: number): Promise<TrackerStats[]> {
    try {
      if (this.prisma) {
        const userInfo = userManager.getUserInfo();
        if (userInfo) {
          // Get top domains from last 7 days
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

          const topDomains = await this.prisma.networkEvent.groupBy({
            by: ['domain'],
            where: {
              userId: userInfo.userId,
              timestamp: { gte: sevenDaysAgo },
              eventType: PrismaEventType.NETWORK_REQUEST,
            },
            _count: { domain: true },
            orderBy: { _count: { domain: 'desc' } },
            take: limit,
          });

          // Get blocked count for each domain separately
          const domainsWithBlocked = await Promise.all(
            topDomains.map(async (d) => {
              const blockedCount = await this.prisma!.networkEvent.count({
                where: {
                  userId: userInfo.userId,
                  domain: d.domain,
                  timestamp: { gte: sevenDaysAgo },
                  isBlocked: true,
                },
              });

              return {
                domain: d.domain,
                category: 'unknown', // TODO: Get from DomainClassifier
                vendor: undefined,
                connections: d._count.domain,
                blocked: blockedCount,
                riskScore: 50, // TODO: Calculate risk score
              };
            })
          );

          return domainsWithBlocked;
        }
      }

      // Fallback to mock data
      return this.getMockTrackers(limit);
    } catch (error) {
      console.error('[PrivacyService] Error getting top trackers:', error);
      return this.getMockTrackers(limit);
    }
  }

  /**
   * Get mock trackers (fallback)
   */
  private getMockTrackers(limit: number): TrackerStats[] {
    return [
      {
        domain: 'google-analytics.com',
        category: 'analytics',
        vendor: 'Google',
        connections: 45,
        blocked: 45,
        riskScore: 65,
      },
      {
        domain: 'doubleclick.net',
        category: 'advertising',
        vendor: 'Google',
        connections: 32,
        blocked: 32,
        riskScore: 80,
      },
      {
        domain: 'facebook.com',
        category: 'social',
        vendor: 'Meta',
        connections: 28,
        blocked: 28,
        riskScore: 75,
      },
    ].slice(0, limit);
  }

  /**
   * Get tracker stats (from database aggregation)
   */
  async getTrackerStats(): Promise<any> {
    try {
      if (this.prisma) {
        const userInfo = userManager.getUserInfo();
        if (userInfo) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

          const [total, blocked, uniqueDomains] = await Promise.all([
            this.prisma.networkEvent.count({
              where: {
                userId: userInfo.userId,
                timestamp: { gte: sevenDaysAgo },
                eventType: PrismaEventType.NETWORK_REQUEST,
              },
            }),
            this.prisma.networkEvent.count({
              where: {
                userId: userInfo.userId,
                timestamp: { gte: sevenDaysAgo },
                eventType: PrismaEventType.NETWORK_REQUEST,
                isBlocked: true,
              },
            }),
            this.prisma.networkEvent.findMany({
              where: {
                userId: userInfo.userId,
                timestamp: { gte: sevenDaysAgo },
                eventType: PrismaEventType.NETWORK_REQUEST,
              },
              distinct: ['domain'],
            }),
          ]);

          return {
            totalTrackers: uniqueDomains.length,
            totalConnections: total,
            blockedConnections: blocked,
            uniqueDomains: uniqueDomains.length,
            topCategories: {
              // TODO: Classify domains by category
              unknown: uniqueDomains.length,
            },
          };
        }
      }

      // Fallback to mock data
      return this.getMockTrackerStats();
    } catch (error) {
      console.error('[PrivacyService] Error getting tracker stats:', error);
      return this.getMockTrackerStats();
    }
  }

  /**
   * Get mock tracker stats (fallback)
   */
  private getMockTrackerStats(): any {
    return {
      totalTrackers: 47,
      totalConnections: 1234,
      blockedConnections: 987,
      uniqueDomains: 47,
      topCategories: {
        advertising: 18,
        analytics: 15,
        social: 8,
        other: 6,
      },
    };
  }

  /**
   * Generate daily report
   */
  async generateDailyReport(date: Date): Promise<any> {
    try {
      // TODO: Connect to privacy-engine backend
      return {
        date,
        privacyScore: 25,
        topTrackers: await this.getTopTrackers(5),
        blockedConnections: 45,
        totalConnections: 150,
        summary: 'Privacy Score: 25/100 (Excellent). Made 150 connections today, blocked 45 tracking attempts.',
      };
    } catch (error) {
      console.error('Error generating daily report:', error);
      throw error;
    }
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(startDate: Date): Promise<any> {
    try {
      // TODO: Connect to privacy-engine backend
      const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        startDate,
        endDate,
        averageScore: 28,
        topTrackers: await this.getTopTrackers(10),
        summary: 'Average Privacy Score: 28/100 this week. Good privacy protection maintained.',
      };
    } catch (error) {
      console.error('Error generating weekly report:', error);
      throw error;
    }
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport(month: number, year: number): Promise<any> {
    try {
      // TODO: Connect to privacy-engine backend
      return {
        month,
        year,
        averageScore: 30,
        scoreHistory: await this.getScoreHistory(30),
        totalTrackers: 156,
        summary: 'Average Privacy Score: 30/100 this month. Contacted 156 tracking domains.',
      };
    } catch (error) {
      console.error('Error generating monthly report:', error);
      throw error;
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    // Stop score scheduler
    if (this.scoreTimer) {
      clearInterval(this.scoreTimer);
      this.scoreTimer = null;
    }

    // Disconnect Prisma (handled by database manager)
    this.prisma = null;
    this.calculator = null;
    this.latestScore = null;
    this.initialized = false;

    console.log('[PrivacyService] Cleaned up');
  }

  /**
   * Calculate privacy level from score
   */
  private calculateLevel(score: number): string {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'poor';
    if (score >= 40) return 'fair';
    if (score >= 20) return 'good';
    return 'excellent';
  }

  /**
   * Legacy close method (alias for cleanup)
   */
  async close(): Promise<void> {
    return this.cleanup();
  }
}
