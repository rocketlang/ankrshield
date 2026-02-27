/**
 * @ankrshield/privacy-engine
 * Tracker classification, vendor attribution, privacy risk scoring, and privacy analytics
 */

// Types
export * from './types';

// Classifier
export * from './classifier/domain-classifier';

// Vendor
export * from './vendor/vendor-analyzer';

// Risk
export * from './risk/risk-scorer';

// Scoring
export * from './scoring/privacy-calculator';

// Analysis
export * from './analysis/trend-analyzer';

// Reports
export * from './reports/report-generator';

// Real-time
export * from './realtime/score-updater';

// Alert hierarchy (AnkrShield seamless mode — 5-level: SILENT/SUBTLE/MEDIUM/HIGH/CRITICAL)
export * from './alert-classifier';
