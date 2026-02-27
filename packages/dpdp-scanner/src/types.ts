/**
 * DPDP Act 2023 (Digital Personal Data Protection Act) compliance types
 */

export interface DpdpCheckResult {
  appName: string;
  packageName: string;
  overallCompliance: 'compliant' | 'partial' | 'non_compliant';
  score: number; // 0-100, higher = more compliant
  violations: DpdpViolation[];
  requirements: DpdpRequirement[];
}

export interface DpdpViolation {
  section: string; // e.g. "Section 4" of DPDP Act 2023
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  permission?: string; // Android permission related to this violation
}

export interface DpdpRequirement {
  requirement: string;
  status: 'met' | 'unmet' | 'unknown';
  details: string;
}

// Key DPDP Act 2023 sections we check:
// Section 4:  Processing of digital personal data — requires consent
// Section 6:  Consent — must be specific, informed, unconditional, unambiguous
// Section 7:  Certain legitimate uses
// Section 8:  Obligations of Data Fiduciary — purpose limitation, data minimization
// Section 9:  Processing of children's data — verifiable parental consent
// Section 11: Right to erasure — must provide deletion mechanism
// Section 17: Cross-border transfers — only to notified countries

export interface DpdpScanInput {
  appName: string;
  packageName: string;
  permissions: string[];
  hasPrivacyPolicy: boolean;
  hasDataDeletion: boolean;
  targetsChildren: boolean;
  crossBorderTransfer: boolean; // transfers data outside India
}
