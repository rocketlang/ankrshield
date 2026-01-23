/**
 * TypeScript declarations for Electron API in renderer process
 */

interface ElectronAPI {
  // Privacy Service
  privacy: {
    getScore: () => Promise<IPCResponse<PrivacyScore>>;
    getBreakdown: () => Promise<IPCResponse<ScoreBreakdown>>;
    getHistory: (timeRange?: { start: Date; end: Date }) => Promise<IPCResponse<PrivacyScore[]>>;
  };

  // DNS Service
  dns: {
    getStats: () => Promise<IPCResponse<DNSStats>>;
    getRecentQueries: (limit?: number) => Promise<IPCResponse<DNSQuery[]>>;
    toggleProtection: (enabled: boolean) => Promise<IPCResponse<{ enabled: boolean }>>;
    isProtectionEnabled: () => Promise<IPCResponse<boolean>>;
  };

  // Network Service
  network: {
    getEvents: (limit?: number) => Promise<IPCResponse<NetworkEvent[]>>;
    getStats: () => Promise<IPCResponse<NetworkStats>>;
    toggleProtection: (enabled: boolean) => Promise<IPCResponse<{ enabled: boolean }>>;
    isProtectionEnabled: () => Promise<IPCResponse<boolean>>;
  };

  // App
  app: {
    getVersion: () => Promise<IPCResponse<string>>;
    quit: () => Promise<IPCResponse<void>>;
  };
}

interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Privacy Types
interface PrivacyScore {
  userId: string;
  timestamp: Date;
  totalScore: number;
  networkScore: number;
  dnsScore: number;
  appScore: number;
  level: 'excellent' | 'good' | 'poor' | 'critical';
}

interface ScoreBreakdown {
  totalScore: number;
  components: ScoreComponent[];
  topIssues: PrivacyIssue[];
  recommendations: string[];
}

interface ScoreComponent {
  name: string;
  score: number;
  weight: number;
  contributionToTotal: number;
}

interface PrivacyIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}

// DNS Types
interface DNSStats {
  totalQueries: number;
  blockedQueries: number;
  cacheHits: number;
  cacheMisses: number;
  averageLatency: number;
  topDomains: Array<{ domain: string; count: number }>;
}

interface DNSQuery {
  id: string;
  domain: string;
  queryType: string;
  timestamp: Date;
  blocked: boolean;
  cached: boolean;
  latency: number;
}

// Network Types
interface NetworkEvent {
  id: string;
  timestamp: Date;
  sourceIP: string;
  destinationIP: string;
  destinationDomain: string;
  protocol: string;
  port: number;
  bytesIn: number;
  bytesOut: number;
  blocked: boolean;
}

interface NetworkStats {
  totalConnections: number;
  blockedConnections: number;
  allowedConnections: number;
  totalBytesIn: number;
  totalBytesOut: number;
}

// Extend Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
