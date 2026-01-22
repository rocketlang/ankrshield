/**
 * Network Privacy Monitor
 * Unified interface combining network monitoring, DNS resolution, and privacy analysis
 */

import EventEmitter from 'events';
import { BaseNetworkMonitor } from '../monitor/base-monitor';
import { createNetworkMonitor } from '../monitor/factory';
import { DNSCorrelator } from './dns-correlator';
import { TrackerEnricher } from './tracker-enricher';
import { PrivacyScorer, updateFlowWithScore } from './privacy-scorer';
import { NetworkFlow, MonitorConfig, NetworkPacket } from '../types';
import { PrismaClient } from '@prisma/client';

/**
 * Privacy Monitor Events
 */
export interface PrivacyMonitorEvents {
  packet: (packet: NetworkPacket) => void;
  enrichedFlow: (flow: NetworkFlow) => void;
  trackerDetected: (flow: NetworkFlow) => void;
  blockedConnection: (flow: NetworkFlow) => void;
  highRiskFlow: (flow: NetworkFlow) => void;
  stats: (stats: PrivacyStats) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}

/**
 * Privacy Statistics
 */
export interface PrivacyStats {
  totalFlows: number;
  trackerFlows: number;
  blockedFlows: number;
  highRiskFlows: number;
  avgPrivacyScore: number;
  topTrackers: Array<{ domain: string; count: number }>;
  topApps: Array<{ app: string; privacyScore: number }>;
}

/**
 * Network Privacy Monitor Configuration
 */
export interface PrivacyMonitorConfig extends Partial<MonitorConfig> {
  enableDNSCorrelation?: boolean;
  enableTrackerEnrichment?: boolean;
  enablePrivacyScoring?: boolean;
  prisma?: PrismaClient;
}

/**
 * Network Privacy Monitor
 * Combines network monitoring with DNS correlation and privacy analysis
 */
export class NetworkPrivacyMonitor extends EventEmitter {
  private networkMonitor: BaseNetworkMonitor;
  private dnsCorrelator: DNSCorrelator;
  private trackerEnricher: TrackerEnricher;
  private privacyScorer: PrivacyScorer;

  private config: Required<PrivacyMonitorConfig>;
  private enrichedFlows: NetworkFlow[] = [];
  private trackerDomains: Map<string, number> = new Map();
  private appScores: Map<string, number[]> = new Map();

  constructor(config: PrivacyMonitorConfig = {}) {
    super();

    this.config = {
      ...config,
      enableDNSCorrelation: config.enableDNSCorrelation ?? true,
      enableTrackerEnrichment: config.enableTrackerEnrichment ?? true,
      enablePrivacyScoring: config.enablePrivacyScoring ?? true,
      prisma: config.prisma,
    } as Required<PrivacyMonitorConfig>;

    // Initialize components
    this.networkMonitor = createNetworkMonitor(config);
    this.dnsCorrelator = new DNSCorrelator();
    this.trackerEnricher = new TrackerEnricher(config.prisma);
    this.privacyScorer = new PrivacyScorer();

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Forward network monitor events
    this.networkMonitor.on('packet', (packet: NetworkPacket) => {
      this.emit('packet', packet);
    });

    this.networkMonitor.on('flow', async (flow: NetworkFlow) => {
      // Enrich flow with DNS, tracker, and privacy data
      const enrichedFlow = await this.enrichFlow(flow);
      this.handleEnrichedFlow(enrichedFlow);
    });

    this.networkMonitor.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.networkMonitor.on('started', () => {
      this.emit('started');
    });

    this.networkMonitor.on('stopped', () => {
      this.emit('stopped');
    });
  }

  /**
   * Enrich flow with all available data
   */
  private async enrichFlow(flow: NetworkFlow): Promise<NetworkFlow> {
    // Step 1: DNS correlation
    if (this.config.enableDNSCorrelation) {
      flow = this.dnsCorrelator.correlateFlow(flow);
    }

    // Step 2: Tracker enrichment
    if (this.config.enableTrackerEnrichment && flow.domain) {
      flow = await this.trackerEnricher.enrichFlow(flow);
    }

    // Step 3: Privacy scoring
    if (this.config.enablePrivacyScoring) {
      flow = updateFlowWithScore(flow, this.privacyScorer);
    }

    return flow;
  }

  /**
   * Handle enriched flow
   */
  private handleEnrichedFlow(flow: NetworkFlow): void {
    // Store enriched flow
    this.enrichedFlows.push(flow);

    // Limit history size
    if (this.enrichedFlows.length > 10000) {
      this.enrichedFlows.shift();
    }

    // Track tracker domains
    if (flow.tracker?.isTracker && flow.domain) {
      const count = this.trackerDomains.get(flow.domain) || 0;
      this.trackerDomains.set(flow.domain, count + 1);
    }

    // Track app scores
    if (flow.app?.name && flow.privacyRisk !== undefined) {
      const scores = this.appScores.get(flow.app.name) || [];
      scores.push(flow.privacyRisk);
      this.appScores.set(flow.app.name, scores);
    }

    // Emit events
    this.emit('enrichedFlow', flow);

    if (flow.tracker?.isTracker) {
      this.emit('trackerDetected', flow);
    }

    if (flow.tracker?.blocked) {
      this.emit('blockedConnection', flow);
    }

    if (flow.privacyRisk && flow.privacyRisk > 50) {
      this.emit('highRiskFlow', flow);
    }
  }

  /**
   * Add DNS resolution
   */
  addDNSResolution(
    domain: string,
    ips: string[],
    ttl: number = 300,
    blocked: boolean = false
  ): void {
    this.dnsCorrelator.addDNSResolution(domain, ips, ttl, blocked);
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    await this.networkMonitor.start();

    // Start DNS cache cleanup
    this.dnsCorrelator.startPeriodicCleanup(60000);
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    await this.networkMonitor.stop();
    await this.trackerEnricher.close();
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.networkMonitor.isRunning();
  }

  /**
   * Get enriched flows
   */
  getEnrichedFlows(): NetworkFlow[] {
    return [...this.enrichedFlows];
  }

  /**
   * Get flows by app
   */
  getFlowsByApp(appName: string): NetworkFlow[] {
    return this.enrichedFlows.filter((flow) => flow.app?.name === appName);
  }

  /**
   * Get tracker flows
   */
  getTrackerFlows(): NetworkFlow[] {
    return this.enrichedFlows.filter((flow) => flow.tracker?.isTracker);
  }

  /**
   * Get blocked flows
   */
  getBlockedFlows(): NetworkFlow[] {
    return this.enrichedFlows.filter((flow) => flow.tracker?.blocked);
  }

  /**
   * Get high risk flows
   */
  getHighRiskFlows(threshold: number = 50): NetworkFlow[] {
    return this.enrichedFlows.filter(
      (flow) => flow.privacyRisk && flow.privacyRisk > threshold
    );
  }

  /**
   * Get privacy statistics
   */
  getPrivacyStats(): PrivacyStats {
    const totalFlows = this.enrichedFlows.length;
    const trackerFlows = this.getTrackerFlows().length;
    const blockedFlows = this.getBlockedFlows().length;
    const highRiskFlows = this.getHighRiskFlows().length;

    // Calculate average privacy score
    const scores = this.enrichedFlows
      .filter((f) => f.privacyRisk !== undefined)
      .map((f) => f.privacyRisk!);

    const avgPrivacyScore =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0;

    // Top trackers
    const topTrackers = Array.from(this.trackerDomains.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    // Top apps by privacy score
    const topApps = Array.from(this.appScores.entries())
      .map(([app, scores]) => ({
        app,
        privacyScore: scores.reduce((sum, s) => sum + s, 0) / scores.length,
      }))
      .sort((a, b) => b.privacyScore - a.privacyScore)
      .slice(0, 10);

    return {
      totalFlows,
      trackerFlows,
      blockedFlows,
      highRiskFlows,
      avgPrivacyScore: Math.round(avgPrivacyScore),
      topTrackers,
      topApps,
    };
  }

  /**
   * Get privacy report
   */
  getPrivacyReport(): ReturnType<PrivacyScorer['getPrivacyReport']> {
    return this.privacyScorer.getPrivacyReport(this.enrichedFlows);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.enrichedFlows = [];
    this.trackerDomains.clear();
    this.appScores.clear();
  }

  /**
   * Typed event emitter
   */
  on<K extends keyof PrivacyMonitorEvents>(
    event: K,
    listener: PrivacyMonitorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof PrivacyMonitorEvents>(
    event: K,
    ...args: Parameters<PrivacyMonitorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
