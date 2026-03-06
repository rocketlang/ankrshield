/**
 * Vendor Analyzer
 * Groups trackers by parent company and calculates vendor statistics
 */

import { PrismaClient } from '@prisma/client';

import type { VendorStats, VendorHierarchy, TimeRange } from '../types';

/**
 * Vendor Analyzer
 * Provides vendor attribution and statistics
 */
export class VendorAnalyzer {
  private vendorHierarchy: Map<string, VendorHierarchy> = new Map();

  constructor(private prisma: PrismaClient) {
    this.initializeVendorHierarchy();
  }

  /**
   * Initialize vendor hierarchy
   */
  private initializeVendorHierarchy(): void {
    // Google/Alphabet
    this.vendorHierarchy.set('Google', {
      id: 'google',
      name: 'Google (Alphabet)',
      domains: [
        'google.com',
        'google-analytics.com',
        'googletagmanager.com',
        'googlesyndication.com',
        'doubleclick.net',
        'youtube.com',
        'gstatic.com',
        'googleapis.com',
        'googleadservices.com',
        'googlevideo.com',
      ],
      category: 'advertising',
    });

    // Facebook/Meta
    this.vendorHierarchy.set('Facebook', {
      id: 'facebook',
      name: 'Facebook (Meta)',
      domains: [
        'facebook.com',
        'facebook.net',
        'fbcdn.net',
        'instagram.com',
        'whatsapp.com',
        'messenger.com',
        'connect.facebook.net',
        'fbsbx.com',
      ],
      category: 'social',
    });

    // Amazon
    this.vendorHierarchy.set('Amazon', {
      id: 'amazon',
      name: 'Amazon',
      domains: [
        'amazon.com',
        'amazon-adsystem.com',
        'amazonpay.com',
        'cloudfront.net',
        'amazonaws.com',
        'ssl-images-amazon.com',
      ],
      category: 'advertising',
    });

    // Microsoft
    this.vendorHierarchy.set('Microsoft', {
      id: 'microsoft',
      name: 'Microsoft',
      domains: [
        'microsoft.com',
        'bing.com',
        'msn.com',
        'live.com',
        'outlook.com',
        'office.com',
        'skype.com',
        'linkedin.com',
        'msecnd.net',
      ],
      category: 'advertising',
    });

    // Apple
    this.vendorHierarchy.set('Apple', {
      id: 'apple',
      name: 'Apple',
      domains: ['apple.com', 'icloud.com', 'apple-cloudkit.com', 'mzstatic.com', 'itunes.com'],
      category: 'telemetry',
    });

    // Twitter/X
    this.vendorHierarchy.set('Twitter', {
      id: 'twitter',
      name: 'Twitter (X)',
      domains: ['twitter.com', 'twimg.com', 't.co', 'x.com'],
      category: 'social',
    });

    // TikTok/Bytedance
    this.vendorHierarchy.set('TikTok', {
      id: 'tiktok',
      name: 'TikTok (Bytedance)',
      domains: ['tiktok.com', 'musical.ly', 'byteoversea.com', 'tiktokcdn.com'],
      category: 'social',
    });

    // Adobe
    this.vendorHierarchy.set('Adobe', {
      id: 'adobe',
      name: 'Adobe',
      domains: ['adobe.com', 'omniture.com', 'demdex.net', 'adobedtm.com', '2o7.net'],
      category: 'analytics',
    });

    // Yahoo/Verizon Media
    this.vendorHierarchy.set('Yahoo', {
      id: 'yahoo',
      name: 'Yahoo (Verizon Media)',
      domains: ['yahoo.com', 'aol.com', 'tumblr.com', 'flickr.com', 'yimg.com'],
      category: 'advertising',
    });

    // Cloudflare (CDN)
    this.vendorHierarchy.set('Cloudflare', {
      id: 'cloudflare',
      name: 'Cloudflare',
      domains: ['cloudflare.com', 'cloudflareinsights.com', 'cdnjs.cloudflare.com'],
      category: 'cdn',
    });
  }

  /**
   * Get vendor for domain
   */
  getVendor(domain: string): string | undefined {
    const normalizedDomain = domain.toLowerCase();

    for (const [vendor, info] of this.vendorHierarchy) {
      for (const vendorDomain of info.domains) {
        if (normalizedDomain === vendorDomain || normalizedDomain.endsWith(`.${vendorDomain}`)) {
          return vendor;
        }
      }
    }

    return undefined;
  }

  /**
   * Get vendor statistics for user
   */
  async getVendorStats(userId: string, timeRange: TimeRange): Promise<VendorStats[]> {
    // Query network events grouped by vendor
    const events = await this.prisma.$queryRaw<
      Array<{
        domain: string;
        vendor: string | null;
        requests: bigint;
        blocked: bigint;
        dataTransferred: bigint;
      }>
    >`
      SELECT 
        domain,
        vendor,
        COUNT(*) as requests,
        SUM(CASE WHEN blocked = true THEN 1 ELSE 0 END) as blocked,
        SUM(bytes_in + bytes_out) as dataTransferred
      FROM "NetworkEvent"
      WHERE 
        "userId" = ${userId}
        AND timestamp >= ${timeRange.start}
        AND timestamp <= ${timeRange.end}
        AND domain IS NOT NULL
      GROUP BY domain, vendor
      ORDER BY requests DESC
    `;

    // Group by vendor
    const vendorMap = new Map<string, VendorStats>();

    for (const event of events) {
      const vendor = event.vendor || this.getVendor(event.domain) || 'Unknown';

      if (!vendorMap.has(vendor)) {
        vendorMap.set(vendor, {
          vendor,
          domains: 0,
          requests: 0,
          blocked: 0,
          dataTransferred: 0,
          riskScore: 0,
          topDomains: [],
        });
      }

      const stats = vendorMap.get(vendor)!;
      stats.domains++;
      stats.requests += Number(event.requests);
      stats.blocked += Number(event.blocked);
      stats.dataTransferred += Number(event.dataTransferred);
      stats.topDomains.push(event.domain);
    }

    // Calculate risk scores
    for (const stats of vendorMap.values()) {
      stats.riskScore = this.calculateVendorRisk(stats);
      stats.topDomains = stats.topDomains.slice(0, 5); // Top 5 domains
    }

    return Array.from(vendorMap.values()).sort((a, b) => b.requests - a.requests);
  }

  /**
   * Get top vendors by request count
   */
  async getTopVendors(
    userId: string,
    timeRange: TimeRange,
    limit: number = 10
  ): Promise<VendorStats[]> {
    const stats = await this.getVendorStats(userId, timeRange);
    return stats.slice(0, limit);
  }

  /**
   * Calculate vendor risk score
   */
  private calculateVendorRisk(stats: VendorStats): number {
    let score = 0;

    // Base score
    score += 10;

    // Volume factor (more requests = higher risk)
    if (stats.requests > 1000) {
      score += 20;
    } else if (stats.requests > 100) {
      score += 10;
    }

    // Data transfer factor (more data = higher risk)
    const dataMB = stats.dataTransferred / (1024 * 1024);
    if (dataMB > 100) {
      score += 20;
    } else if (dataMB > 10) {
      score += 10;
    }

    // Block rate factor
    const blockRate = stats.blocked / stats.requests;
    if (blockRate > 0.5) {
      score += 30; // High block rate = high risk
    } else if (blockRate > 0.2) {
      score += 15;
    }

    // Vendor-specific weights
    const vendorWeights: Record<string, number> = {
      Facebook: 15,
      Google: 10,
      Amazon: 8,
      TikTok: 12,
    };

    score += vendorWeights[stats.vendor] || 0;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get vendor hierarchy info
   */
  getVendorInfo(vendor: string): VendorHierarchy | undefined {
    return this.vendorHierarchy.get(vendor);
  }

  /**
   * Get all vendors
   */
  getAllVendors(): VendorHierarchy[] {
    return Array.from(this.vendorHierarchy.values());
  }
}
