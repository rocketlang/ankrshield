/**
 * Risk Scorer
 * Calculates privacy risk scores for trackers
 */

import type { TrackerInfo, RiskLevel } from '../types';

/**
 * Risk Scorer
 * Provides privacy risk scoring for trackers
 */
export class RiskScorer {
  /**
   * Calculate risk score for tracker
   * Returns score from 0-100
   */
  calculateRisk(tracker: TrackerInfo): number {
    if (!tracker.isTracker) {
      return 0;
    }

    let score = 0;

    // Base score for all trackers
    score += 10;

    // Category weight
    score += this.getCategoryWeight(tracker.category);

    // Vendor weight
    score += this.getVendorWeight(tracker.vendor);

    // Threat level (1-10 scale from database)
    if (tracker.threatLevel !== undefined) {
      score += tracker.threatLevel * 4; // 1-10 -> 4-40 points
    }

    // Blocked status (already blocked = high risk)
    if (tracker.blocked) {
      score += 25;
    }

    // Cap at 0-100
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get risk level from score
   */
  getRiskLevel(score: number): RiskLevel {
    if (score >= 81) return 'critical';
    if (score >= 61) return 'high';
    if (score >= 31) return 'medium';
    return 'low';
  }

  /**
   * Get category weight
   */
  private getCategoryWeight(category?: string): number {
    if (!category) return 15;

    const categoryWeights: Record<string, number> = {
      malware: 80,
      phishing: 90,
      cryptomining: 70,
      fingerprinting: 50,
      advertising: 40,
      analytics: 25,
      social: 20,
      telemetry: 15,
      cdn: 5,
      other: 15,
    };

    return categoryWeights[category.toLowerCase()] || 15;
  }

  /**
   * Get vendor weight based on data collection practices
   */
  private getVendorWeight(vendor?: string): number {
    if (!vendor) return 0;

    const vendorWeights: Record<string, number> = {
      Facebook: 15,
      'Facebook (Meta)': 15,
      Meta: 15,
      Google: 10,
      'Google (Alphabet)': 10,
      Alphabet: 10,
      Amazon: 8,
      TikTok: 12,
      'TikTok (Bytedance)': 12,
      Bytedance: 12,
      Yahoo: 7,
      'Yahoo (Verizon Media)': 7,
      Microsoft: 5,
      Apple: 3,
    };

    return vendorWeights[vendor] || 0;
  }

  /**
   * Calculate aggregate risk for multiple trackers
   */
  calculateAggregateRisk(trackers: TrackerInfo[]): number {
    if (trackers.length === 0) return 0;

    const scores = trackers.map((t) => this.calculateRisk(t));

    // Use weighted average with diminishing returns
    const sorted = scores.sort((a, b) => b - a);
    let totalScore = 0;
    let weight = 1.0;

    for (const score of sorted) {
      totalScore += score * weight;
      weight *= 0.8; // Diminishing weight for additional trackers
    }

    return Math.min(100, Math.max(0, Math.round(totalScore)));
  }

  /**
   * Get risk explanation
   */
  getRiskExplanation(tracker: TrackerInfo): string[] {
    const explanations: string[] = [];

    if (!tracker.isTracker) {
      return ['This domain is not identified as a tracker'];
    }

    // Category
    if (tracker.category) {
      const categoryExplanations: Record<string, string> = {
        malware: 'Known malware distribution domain',
        phishing: 'Known phishing or scam site',
        cryptomining: 'Performs cryptocurrency mining in browser',
        fingerprinting: 'Tracks users through browser fingerprinting',
        advertising: 'Serves targeted advertising',
        analytics: 'Collects usage analytics and statistics',
        social: 'Social media tracking and sharing',
        telemetry: 'Collects telemetry and diagnostic data',
        cdn: 'Content delivery network (low risk)',
      };
      explanations.push(
        categoryExplanations[tracker.category.toLowerCase()] ||
          `Category: ${tracker.category}`
      );
    }

    // Vendor
    if (tracker.vendor) {
      explanations.push(`Operated by: ${tracker.vendor}`);
    }

    // Threat level
    if (tracker.threatLevel !== undefined) {
      if (tracker.threatLevel >= 8) {
        explanations.push('High threat level');
      } else if (tracker.threatLevel >= 5) {
        explanations.push('Medium threat level');
      }
    }

    // Blocked status
    if (tracker.blocked) {
      explanations.push('Connection was blocked for protection');
    }

    return explanations;
  }

  /**
   * Compare risk of two trackers
   */
  compareRisk(a: TrackerInfo, b: TrackerInfo): number {
    return this.calculateRisk(b) - this.calculateRisk(a);
  }
}
