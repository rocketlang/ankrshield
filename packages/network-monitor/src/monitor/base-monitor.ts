/**
 * Base Network Monitor
 * Abstract base class for platform-specific network monitoring implementations
 */

import EventEmitter from 'events';
import {
  MonitorConfig,
  MonitorEvents,
  NetworkFlow,
  NetworkPacket,
  NetworkStats,
  Platform,
  ConnectionState,
  Protocol,
  PermissionError,
} from '../types';

export abstract class BaseNetworkMonitor extends EventEmitter {
  protected config: Required<MonitorConfig>;
  protected running: boolean = false;
  protected platform: Platform;
  protected flows: Map<string, NetworkFlow> = new Map();
  protected stats: NetworkStats;

  constructor(config: Partial<MonitorConfig> = {}) {
    super();

    this.platform = process.platform as Platform;

    // Default configuration
    this.config = {
      interfaces: config.interfaces || [],
      capturePayload: config.capturePayload ?? false,
      maxPayloadSize: config.maxPayloadSize ?? 1500,

      excludeLocalhost: config.excludeLocalhost ?? true,
      excludePrivateIps: config.excludePrivateIps ?? false,
      portFilter: config.portFilter || [],
      protocolFilter: config.protocolFilter || [],

      batchSize: config.batchSize ?? 100,
      flushInterval: config.flushInterval ?? 5000,
      maxFlows: config.maxFlows ?? 10000,

      enableAppAttribution: config.enableAppAttribution ?? true,
      enableSNIExtraction: config.enableSNIExtraction ?? true,
      enableGeoLocation: config.enableGeoLocation ?? true,
      enableTrackerDetection: config.enableTrackerDetection ?? true,

      dnsResolverEnabled: config.dnsResolverEnabled ?? true,
      loggingEnabled: config.loggingEnabled ?? true,

      redis: config.redis || { host: 'localhost', port: 6379, db: 0 },
      database: config.database || { connectionString: '' },
    };

    this.stats = this.initStats();
  }

  /**
   * Initialize statistics
   */
  private initStats(): NetworkStats {
    return {
      totalFlows: 0,
      activeFlows: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      totalPackets: 0,
      flowsByProtocol: {} as Record<Protocol, number>,
      topApps: [],
      topDomains: [],
      trackerConnections: 0,
      blockedConnections: 0,
      avgPrivacyRisk: 0,
    };
  }

  /**
   * Start network monitoring
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Monitor is already running');
    }

    // Check permissions
    const hasPermissions = await this.checkPermissions();
    if (!hasPermissions) {
      throw new PermissionError(
        `Insufficient permissions to monitor network traffic on ${this.platform}. ` +
          this.getPermissionInstructions(),
        this.platform
      );
    }

    // Platform-specific initialization
    await this.initialize();

    this.running = true;
    this.emit('started');

    // Start flow cleanup timer
    this.startFlowCleanup();
  }

  /**
   * Stop network monitoring
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Platform-specific cleanup
    await this.cleanup();

    // Close all active flows
    for (const flow of this.flows.values()) {
      flow.state = ConnectionState.CLOSED;
      flow.endTime = new Date();
      this.emit('flowClosed', flow);
    }

    this.flows.clear();
    this.emit('stopped');
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current statistics
   */
  getStats(): NetworkStats {
    this.stats.activeFlows = this.flows.size;
    return { ...this.stats };
  }

  /**
   * Get active flows
   */
  getActiveFlows(): NetworkFlow[] {
    return Array.from(this.flows.values());
  }

  /**
   * Get flow by ID
   */
  getFlow(flowId: string): NetworkFlow | undefined {
    return this.flows.get(flowId);
  }

  /**
   * Handle incoming packet
   */
  protected handlePacket(packet: NetworkPacket): void {
    if (!this.running) return;

    // Apply filters
    if (!this.shouldProcessPacket(packet)) {
      return;
    }

    this.emit('packet', packet);

    // Update or create flow
    const flowId = this.generateFlowId(packet);
    let flow = this.flows.get(flowId);

    if (!flow) {
      flow = this.createFlow(packet, flowId);
      this.flows.set(flowId, flow);
      this.stats.totalFlows++;
      this.emit('flow', flow);
    } else {
      this.updateFlow(flow, packet);
    }

    // Update statistics
    this.updateStats(packet);

    // Check flow limit
    if (this.flows.size > this.config.maxFlows) {
      this.cleanupStaleFlows();
    }
  }

  /**
   * Generate unique flow ID from packet
   */
  private generateFlowId(packet: NetworkPacket): string {
    return `${packet.protocol}:${packet.sourceIp}:${packet.sourcePort}:${packet.destinationIp}:${packet.destinationPort}`;
  }

  /**
   * Create new flow from packet
   */
  private createFlow(packet: NetworkPacket, flowId: string): NetworkFlow {
    return {
      flowId,
      sourceIp: packet.sourceIp,
      sourcePort: packet.sourcePort,
      destinationIp: packet.destinationIp,
      destinationPort: packet.destinationPort,
      protocol: packet.protocol,
      direction: packet.direction,
      startTime: packet.timestamp,
      lastSeen: packet.timestamp,
      state: ConnectionState.NEW,
      bytesIn: packet.direction === 'INBOUND' ? packet.length : 0,
      bytesOut: packet.direction === 'OUTBOUND' ? packet.length : 0,
      packetsIn: packet.direction === 'INBOUND' ? 1 : 0,
      packetsOut: packet.direction === 'OUTBOUND' ? 1 : 0,
    };
  }

  /**
   * Update existing flow with new packet
   */
  private updateFlow(flow: NetworkFlow, packet: NetworkPacket): void {
    flow.lastSeen = packet.timestamp;
    flow.state = ConnectionState.ESTABLISHED;

    if (packet.direction === 'INBOUND') {
      flow.bytesIn += packet.length;
      flow.packetsIn++;
    } else {
      flow.bytesOut += packet.length;
      flow.packetsOut++;
    }

    this.emit('flow', flow);
  }

  /**
   * Update global statistics
   */
  private updateStats(packet: NetworkPacket): void {
    this.stats.totalPackets++;

    if (packet.direction === 'INBOUND') {
      this.stats.totalBytesIn += packet.length;
    } else {
      this.stats.totalBytesOut += packet.length;
    }

    // Update protocol counts
    this.stats.flowsByProtocol[packet.protocol] =
      (this.stats.flowsByProtocol[packet.protocol] || 0) + 1;
  }

  /**
   * Check if packet should be processed
   */
  private shouldProcessPacket(packet: NetworkPacket): boolean {
    // Filter localhost
    if (
      this.config.excludeLocalhost &&
      (packet.sourceIp === '127.0.0.1' ||
        packet.destinationIp === '127.0.0.1' ||
        packet.sourceIp === '::1' ||
        packet.destinationIp === '::1')
    ) {
      return false;
    }

    // Filter private IPs
    if (this.config.excludePrivateIps && this.isPrivateIp(packet.destinationIp)) {
      return false;
    }

    // Port filter
    if (
      this.config.portFilter.length > 0 &&
      !this.config.portFilter.includes(packet.destinationPort)
    ) {
      return false;
    }

    // Protocol filter
    if (
      this.config.protocolFilter.length > 0 &&
      !this.config.protocolFilter.includes(packet.protocol)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Check if IP is private
   */
  private isPrivateIp(ip: string): boolean {
    // IPv4 private ranges
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31) return true;
    if (ip.startsWith('192.168.')) return true;

    // IPv6 private ranges
    if (ip.startsWith('fd') || ip.startsWith('fc')) return true;

    return false;
  }

  /**
   * Cleanup stale flows
   */
  private cleanupStaleFlows(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds

    for (const [flowId, flow] of this.flows.entries()) {
      const age = now - flow.lastSeen.getTime();
      if (age > timeout) {
        flow.state = ConnectionState.TIMEOUT;
        flow.endTime = new Date();
        this.emit('flowClosed', flow);
        this.flows.delete(flowId);
      }
    }
  }

  /**
   * Start periodic flow cleanup
   */
  private startFlowCleanup(): void {
    setInterval(() => {
      if (this.running) {
        this.cleanupStaleFlows();
      }
    }, 30000); // Every 30 seconds
  }

  // Abstract methods to be implemented by platform-specific classes

  /**
   * Check if current user has required permissions
   */
  protected abstract checkPermissions(): Promise<boolean>;

  /**
   * Get platform-specific permission instructions
   */
  protected abstract getPermissionInstructions(): string;

  /**
   * Initialize platform-specific monitoring
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Cleanup platform-specific resources
   */
  protected abstract cleanup(): Promise<void>;

  /**
   * Typed event emitter
   */
  on<K extends keyof MonitorEvents>(event: K, listener: MonitorEvents[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof MonitorEvents>(
    event: K,
    ...args: Parameters<MonitorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
