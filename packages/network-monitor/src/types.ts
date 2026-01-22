/**
 * Network Monitor Types
 * Comprehensive type definitions for network traffic monitoring
 */

/**
 * Network protocols
 */
export enum Protocol {
  TCP = 'TCP',
  UDP = 'UDP',
  ICMP = 'ICMP',
  HTTP = 'HTTP',
  HTTPS = 'HTTPS',
  DNS = 'DNS',
  QUIC = 'QUIC',
  WEBSOCKET = 'WEBSOCKET',
  WEBRTC = 'WEBRTC',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Traffic direction
 */
export enum Direction {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
  BIDIRECTIONAL = 'BIDIRECTIONAL',
}

/**
 * Connection state
 */
export enum ConnectionState {
  NEW = 'NEW',
  ESTABLISHED = 'ESTABLISHED',
  CLOSED = 'CLOSED',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Platform types
 */
export type Platform = 'darwin' | 'win32' | 'linux';

/**
 * Network packet information
 */
export interface NetworkPacket {
  timestamp: Date;
  sourceIp: string;
  sourcePort: number;
  destinationIp: string;
  destinationPort: number;
  protocol: Protocol;
  direction: Direction;
  length: number;
  flags?: string[];
  payload?: Buffer;
}

/**
 * Application information
 */
export interface AppInfo {
  pid: number;
  name: string;
  executablePath: string;
  bundleId?: string; // macOS
  packageName?: string; // Android/Linux
  version?: string;
  icon?: string;
}

/**
 * TLS/SNI information
 */
export interface TLSInfo {
  sni?: string; // Server Name Indication
  alpn?: string[]; // Application-Layer Protocol Negotiation
  tlsVersion?: string;
  cipherSuite?: string;
  certificateFingerprint?: string;
}

/**
 * HTTP request information
 */
export interface HTTPInfo {
  method?: string;
  host?: string;
  path?: string;
  queryString?: string;
  userAgent?: string;
  referer?: string;
  contentType?: string;
  statusCode?: number;
}

/**
 * Geolocation information
 */
export interface GeoLocation {
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
}

/**
 * Tracker/Privacy information
 */
export interface TrackerInfo {
  isTracker: boolean;
  category?: string; // 'advertising', 'analytics', 'social', 'malware', etc.
  vendor?: string; // 'Google', 'Facebook', etc.
  threatLevel?: number; // 0-10
  source?: string; // Which blocklist detected it
  blocked?: boolean;
}

/**
 * Network flow (aggregated connection)
 */
export interface NetworkFlow {
  // Connection tuple
  flowId: string; // Unique flow ID
  sourceIp: string;
  sourcePort: number;
  destinationIp: string;
  destinationPort: number;
  protocol: Protocol;
  direction: Direction;

  // Timing
  startTime: Date;
  endTime?: Date;
  lastSeen: Date;
  duration?: number; // milliseconds

  // State
  state: ConnectionState;

  // Traffic statistics
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;

  // Application
  app?: AppInfo;

  // Protocol-specific data
  domain?: string; // DNS-resolved or SNI-extracted domain
  tls?: TLSInfo;
  http?: HTTPInfo;

  // Enrichment
  geo?: GeoLocation;
  tracker?: TrackerInfo;

  // Device association
  deviceId?: string;
  userId?: string;

  // Privacy score
  privacyRisk?: number; // 0-100, higher = more privacy concern
}

/**
 * Network statistics
 */
export interface NetworkStats {
  totalFlows: number;
  activeFlows: number;
  totalBytesIn: number;
  totalBytesOut: number;
  totalPackets: number;
  flowsByProtocol: Record<Protocol, number>;
  topApps: Array<{ app: string; flows: number; bytes: number }>;
  topDomains: Array<{ domain: string; flows: number }>;
  trackerConnections: number;
  blockedConnections: number;
  avgPrivacyRisk: number;
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  // Capture settings
  interfaces?: string[]; // Network interfaces to monitor (empty = all)
  capturePayload?: boolean; // Capture packet payloads (default: false for privacy)
  maxPayloadSize?: number; // Max payload bytes to capture

  // Filtering
  excludeLocalhost?: boolean; // Ignore localhost traffic
  excludePrivateIps?: boolean; // Ignore private IP ranges
  portFilter?: number[]; // Only monitor these ports
  protocolFilter?: Protocol[]; // Only monitor these protocols

  // Performance
  batchSize?: number; // Events to batch before processing (default: 100)
  flushInterval?: number; // Auto-flush interval in ms (default: 5000)
  maxFlows?: number; // Max concurrent flows to track (default: 10000)

  // Features
  enableAppAttribution?: boolean; // Resolve app names (default: true)
  enableSNIExtraction?: boolean; // Extract SNI from TLS (default: true)
  enableGeoLocation?: boolean; // Lookup IP geolocation (default: true)
  enableTrackerDetection?: boolean; // Check against blocklists (default: true)

  // Integration
  dnsResolverEnabled?: boolean; // Link with DNS resolver (default: true)
  loggingEnabled?: boolean; // Log to database (default: true)

  // Storage
  redis?: {
    host: string;
    port: number;
    db?: number;
  };
  database?: {
    connectionString: string;
  };
}

/**
 * Platform-specific capture options
 */
export interface CaptureOptions {
  // libpcap (Linux/macOS)
  pcapFilter?: string; // BPF filter expression
  promiscuous?: boolean; // Promiscuous mode
  snaplen?: number; // Snapshot length (bytes)

  // WinDivert (Windows)
  winDivertFilter?: string; // WinDivert filter
  priority?: number; // Filter priority

  // Permissions
  requiresRoot?: boolean; // Requires root/admin
  checkPermissions?: boolean; // Check permissions before start
}

/**
 * Event types emitted by NetworkMonitor
 */
export interface MonitorEvents {
  packet: (packet: NetworkPacket) => void;
  flow: (flow: NetworkFlow) => void;
  flowClosed: (flow: NetworkFlow) => void;
  stats: (stats: NetworkStats) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}

/**
 * Error types
 */
export class NetworkMonitorError extends Error {
  constructor(
    message: string,
    public code: string,
    public platform?: Platform
  ) {
    super(message);
    this.name = 'NetworkMonitorError';
  }
}

export class PermissionError extends NetworkMonitorError {
  constructor(message: string, platform?: Platform) {
    super(message, 'PERMISSION_DENIED', platform);
    this.name = 'PermissionError';
  }
}

export class UnsupportedPlatformError extends NetworkMonitorError {
  constructor(platform: string) {
    super(
      `Platform '${platform}' is not supported`,
      'UNSUPPORTED_PLATFORM',
      platform as Platform
    );
    this.name = 'UnsupportedPlatformError';
  }
}

export class CaptureError extends NetworkMonitorError {
  constructor(message: string, platform?: Platform) {
    super(message, 'CAPTURE_ERROR', platform);
    this.name = 'CaptureError';
  }
}
