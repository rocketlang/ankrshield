/**
 * Privacy Scorer
 * Calculates privacy risk scores for network flows
 */

import { NetworkFlow } from '../types';

/**
 * Privacy Score Calculator
 * Assigns a privacy risk score (0-100) based on multiple factors
 */
export class PrivacyScorer {
  /**
   * Calculate privacy risk score for a flow
   *
   * Score breakdown:
   * - 0-20: Low risk (normal browsing, CDNs)
   * - 21-50: Medium risk (analytics, social media widgets)
   * - 51-80: High risk (advertising trackers, fingerprinting)
   * - 81-100: Critical risk (malware, known privacy violations)
   */
  calculateScore(flow: NetworkFlow): number {
    let score = 0;

    // Base score for any network connection
    score += 5;

    // Tracker category scoring
    if (flow.tracker?.isTracker) {
      score += this.getTrackerCategoryScore(flow.tracker.category);
    }

    // Threat level scoring
    if (flow.tracker?.threatLevel !== undefined) {
      score += flow.tracker.threatLevel * 5; // 0-10 threat level * 5 = 0-50 points
    }

    // Protocol scoring (HTTPS is safer than HTTP)
    if (flow.protocol === 'HTTP') {
      score += 15; // HTTP is less secure
    } else if (flow.protocol === 'HTTPS') {
      score += 5; // HTTPS is more secure
    }

    // Unknown/suspicious protocols
    if (flow.protocol === 'UNKNOWN') {
      score += 20;
    }

    // TLS version scoring (older = higher risk)
    if (flow.tls?.tlsVersion) {
      score += this.getTLSVersionScore(flow.tls.tlsVersion);
    }

    // Data volume scoring (large uploads = higher risk)
    const totalBytes = flow.bytesIn + flow.bytesOut;
    if (totalBytes > 10 * 1024 * 1024) {
      // >10 MB
      score += 10;
    } else if (totalBytes > 1 * 1024 * 1024) {
      // >1 MB
      score += 5;
    }

    // Outbound data (exfiltration risk)
    if (flow.bytesOut > flow.bytesIn && flow.bytesOut > 100 * 1024) {
      // >100 KB outbound
      score += 10;
    }

    // Blocked connections
    if (flow.tracker?.blocked) {
      score += 30; // High risk if blocked
    }

    // Cap score at 100
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get score based on tracker category
   */
  private getTrackerCategoryScore(category?: string): number {
    if (!category) return 10;

    const categoryScores: Record<string, number> = {
      advertising: 40,
      analytics: 25,
      social: 20,
      'social-media': 20,
      fingerprinting: 50,
      malware: 80,
      phishing: 90,
      cryptomining: 70,
      telemetry: 15,
      cdn: 5,
      'content-delivery': 5,
      unknown: 15,
    };

    return categoryScores[category.toLowerCase()] || 15;
  }

  /**
   * Get score based on TLS version
   */
  private getTLSVersionScore(version: string): number {
    if (version.includes('SSL')) return 30; // SSL is deprecated
    if (version.includes('TLS 1.0')) return 20;
    if (version.includes('TLS 1.1')) return 15;
    if (version.includes('TLS 1.2')) return 5;
    if (version.includes('TLS 1.3')) return 0; // TLS 1.3 is secure

    return 10; // Unknown version
  }

  /**
   * Calculate aggregate privacy score for multiple flows
   */
  calculateAggregateScore(flows: NetworkFlow[]): number {
    if (flows.length === 0) return 0;

    // Calculate individual scores
    const scores = flows.map((flow) => this.calculateScore(flow));

    // Weight recent flows more heavily
    const weightedSum = scores.reduce((sum, score, index) => {
      const weight = Math.exp(-index / flows.length); // Exponential decay
      return sum + score * weight;
    }, 0);

    const weightSum = scores.reduce((sum, _, index) => {
      return sum + Math.exp(-index / flows.length);
    }, 0);

    return Math.round(weightedSum / weightSum);
  }

  /**
   * Calculate privacy score for an application
   */
  calculateAppScore(flows: NetworkFlow[], appName: string): number {
    const appFlows = flows.filter((flow) => flow.app?.name === appName);
    return this.calculateAggregateScore(appFlows);
  }

  /**
   * Get privacy risk level
   */
  getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score <= 20) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 80) return 'high';
    return 'critical';
  }

  /**
   * Get privacy report for flows
   */
  getPrivacyReport(flows: NetworkFlow[]): {
    overallScore: number;
    riskLevel: string;
    trackerCount: number;
    blockedCount: number;
    highRiskFlows: number;
    categoryBreakdown: Record<string, number>;
    topRiskyDomains: Array<{ domain: string; score: number }>;
  } {
    const scores = flows.map((flow) => {
      const score = this.calculateScore(flow);
      return { flow, score };
    });

    const overallScore = this.calculateAggregateScore(flows);
    const trackerCount = flows.filter((f) => f.tracker?.isTracker).length;
    const blockedCount = flows.filter((f) => f.tracker?.blocked).length;
    const highRiskFlows = scores.filter((s) => s.score > 50).length;

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const flow of flows) {
      if (flow.tracker?.category) {
        categoryBreakdown[flow.tracker.category] =
          (categoryBreakdown[flow.tracker.category] || 0) + 1;
      }
    }

    // Top risky domains
    const topRiskyDomains = scores
      .filter((s) => s.flow.domain)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((s) => ({
        domain: s.flow.domain!,
        score: s.score,
      }));

    return {
      overallScore,
      riskLevel: this.getRiskLevel(overallScore),
      trackerCount,
      blockedCount,
      highRiskFlows,
      categoryBreakdown,
      topRiskyDomains,
    };
  }
}

/**
 * Update flow with privacy score
 */
export function updateFlowWithScore(
  flow: NetworkFlow,
  scorer: PrivacyScorer
): NetworkFlow {
  flow.privacyRisk = scorer.calculateScore(flow);
  return flow;
}
