/**
 * Privacy Engine Types
 * Type definitions for tracker classification and privacy analysis
 */

/**
 * Tracker information from classification
 */
export interface TrackerInfo {
  isTracker: boolean;
  domain?: string;
  category?: string;
  vendor?: string;
  threatLevel?: number; // 1-10
  riskScore?: number; // 0-100
  source?: string;
  blocked?: boolean;
}

/**
 * Tracker category types
 */
export type TrackerCategory =
  | 'advertising'
  | 'analytics'
  | 'social'
  | 'telemetry'
  | 'malware'
  | 'phishing'
  | 'cryptomining'
  | 'fingerprinting'
  | 'cdn'
  | 'other';

/**
 * Risk level classification
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Vendor statistics
 */
export interface VendorStats {
  vendor: string;
  domains: number;
  requests: number;
  blocked: number;
  dataTransferred: number;
  riskScore: number;
  topDomains: string[];
}

/**
 * Tracker statistics
 */
export interface TrackerStats {
  domain: string;
  category: string;
  vendor?: string;
  requests: number;
  blocked: number;
  dataTransferred: number;
  riskScore: number;
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * Time range for queries
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Classification result
 */
export interface ClassificationResult {
  domain: string;
  tracker: TrackerInfo | null;
  cached: boolean;
  lookupTime: number; // milliseconds
}

/**
 * Batch classification result
 */
export interface BatchClassificationResult {
  results: Map<string, TrackerInfo>;
  totalTime: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Import statistics
 */
export interface ImportStats {
  source: string;
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  duration: number;
}

/**
 * Vendor hierarchy
 */
export interface VendorHierarchy {
  id: string;
  name: string;
  parent?: string;
  domains: string[];
  category: TrackerCategory;
}

/**
 * Privacy score level
 */
export type PrivacyLevel = 'excellent' | 'good' | 'poor' | 'critical';

/**
 * Trend direction
 */
export type TrendDirection = 'improving' | 'worsening' | 'stable';

/**
 * Privacy score
 */
export interface PrivacyScore {
  userId: string;
  timestamp: Date;
  totalScore: number; // 0-100
  networkScore: number; // 0-100
  dnsScore: number; // 0-100
  appScore: number; // 0-100
  aiScore?: number; // 0-100 (future)
  level: PrivacyLevel;
  trend?: ScoreTrend;
}

/**
 * Score component
 */
export interface ScoreComponent {
  name: string;
  score: number;
  weight: number; // 0-1
  contributionToTotal: number;
}

/**
 * Score breakdown
 */
export interface ScoreBreakdown {
  totalScore: number;
  components: ScoreComponent[];
  topIssues: PrivacyIssue[];
  recommendations: string[];
}

/**
 * Privacy issue
 */
export interface PrivacyIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedDomains?: string[];
  recommendation: string;
}

/**
 * Score trend
 */
export interface ScoreTrend {
  direction: TrendDirection;
  change: number;
  percentageChange: number;
  comparisonPeriod: string;
}

/**
 * Score history entry
 */
export interface ScoreHistory {
  timestamp: Date;
  score: number;
  level: PrivacyLevel;
}

/**
 * Trend comparison
 */
export interface Trend {
  current: number;
  previous: number;
  change: number;
  percentageChange: number;
  direction: TrendDirection;
  period: string;
}

/**
 * Anomaly detection result
 */
export interface Anomaly {
  timestamp: Date;
  score: number;
  expectedScore: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Report period
 */
export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

/**
 * Daily report
 */
export interface DailyReport {
  userId: string;
  date: Date;
  privacyScore: number;
  topTrackers: TrackerStats[];
  blockedConnections: number;
  totalConnections: number;
  trend: ScoreTrend;
  summary: string;
}

/**
 * Weekly report
 */
export interface WeeklyReport {
  userId: string;
  startDate: Date;
  endDate: Date;
  averageScore: number;
  topTrackers: TrackerStats[];
  topApps: AppStats[];
  weekOverWeek: Trend;
  notableEvents: string[];
  summary: string;
  recommendations: string[];
}

/**
 * Monthly report
 */
export interface MonthlyReport {
  userId: string;
  month: number;
  year: number;
  averageScore: number;
  scoreHistory: ScoreHistory[];
  totalTrackers: number;
  totalDataToTrackers: number;
  topVendors: VendorStats[];
  monthOverMonth: Trend;
  summary: string;
  recommendations: string[];
}

/**
 * App statistics
 */
export interface AppStats {
  appId: string;
  appName: string;
  trackerCount: number;
  requests: number;
  dataTransferred: number;
  riskScore: number;
}

/**
 * Comparison result
 */
export interface Comparison {
  range1: TimeRange;
  range2: TimeRange;
  score1: number;
  score2: number;
  change: number;
  percentageChange: number;
  direction: TrendDirection;
  significance: 'significant' | 'moderate' | 'minimal';
}

/**
 * Recommendation
 */
export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  actionable: boolean;
  estimatedImpact: number; // 0-100 (score improvement)
}
