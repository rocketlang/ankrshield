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
