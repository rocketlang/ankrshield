/**
 * DPDP Act 2023 Compliance Scanner
 * Scans Android app permissions and metadata for Digital Personal Data Protection Act violations.
 */

import type { DpdpCheckResult, DpdpViolation, DpdpRequirement, DpdpScanInput } from './types';

// ─── Permission to section mapping ────────────────────────────────────────────

interface PermissionCheck {
  permission: string;
  section: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  penaltyScore: number;
}

const PERMISSION_CHECKS: PermissionCheck[] = [
  {
    permission: 'READ_SMS',
    section: 'Section 4',
    description:
      'READ_SMS allows reading SMS messages containing personal and financial data. Requires explicit consent as per DPDP Act Section 4.',
    severity: 'critical',
    penaltyScore: 20,
  },
  {
    permission: 'RECEIVE_SMS',
    section: 'Section 4',
    description:
      'RECEIVE_SMS enables interception of incoming messages. Requires explicit consent as per DPDP Act Section 4.',
    severity: 'critical',
    penaltyScore: 20,
  },
  {
    permission: 'READ_CONTACTS',
    section: 'Section 4',
    description:
      'READ_CONTACTS accesses personal contact data of third parties. Requires consent from all parties per DPDP Act Section 4.',
    severity: 'high',
    penaltyScore: 15,
  },
  {
    permission: 'READ_CALL_LOG',
    section: 'Section 4',
    description:
      'READ_CALL_LOG accesses call history — sensitive personal data under DPDP Act Section 4.',
    severity: 'high',
    penaltyScore: 15,
  },
  {
    permission: 'ACCESS_FINE_LOCATION',
    section: 'Section 4',
    description:
      'ACCESS_FINE_LOCATION is sensitive personal data under DPDP Act Section 4 — requires specific, informed consent.',
    severity: 'high',
    penaltyScore: 15,
  },
  {
    permission: 'CAMERA',
    section: 'Section 4',
    description:
      'CAMERA access can capture biometric data. Requires explicit consent under DPDP Act Section 4.',
    severity: 'medium',
    penaltyScore: 10,
  },
  {
    permission: 'RECORD_AUDIO',
    section: 'Section 4',
    description:
      'RECORD_AUDIO can capture conversations. Requires explicit consent under DPDP Act Section 4.',
    severity: 'medium',
    penaltyScore: 10,
  },
  {
    permission: 'READ_EXTERNAL_STORAGE',
    section: 'Section 8',
    description:
      'READ_EXTERNAL_STORAGE may violate data minimization principle under DPDP Act Section 8(3).',
    severity: 'low',
    penaltyScore: 5,
  },
  {
    permission: 'PROCESS_OUTGOING_CALLS',
    section: 'Section 4',
    description:
      'PROCESS_OUTGOING_CALLS intercepts outgoing call data — personal data requiring consent under DPDP Act Section 4.',
    severity: 'high',
    penaltyScore: 15,
  },
  {
    permission: 'BIND_DEVICE_ADMIN',
    section: 'Section 9',
    description:
      'BIND_DEVICE_ADMIN grants excessive device control — high risk for apps used by children per DPDP Act Section 9.',
    severity: 'critical',
    penaltyScore: 25,
  },
];

// Permissions that are critical for children-targeted apps
const CHILDREN_SENSITIVE_PERMISSIONS = [
  'CAMERA',
  'RECORD_AUDIO',
  'READ_CONTACTS',
  'ACCESS_FINE_LOCATION',
  'READ_SMS',
];

// ─── DpdpScanner class ────────────────────────────────────────────────────────

export class DpdpScanner {
  /**
   * Check app permissions against DPDP requirements and return violations.
   */
  checkPermissions(permissions: string[]): DpdpViolation[] {
    const violations: DpdpViolation[] = [];
    // Normalise: strip "android.permission." prefix
    const normalised = permissions.map((p) =>
      p.replace('android.permission.', '').replace('android.Manifest.permission.', '')
    );

    for (const check of PERMISSION_CHECKS) {
      if (normalised.includes(check.permission)) {
        violations.push({
          section: check.section,
          description: check.description,
          severity: check.severity,
          permission: check.permission,
        });
      }
    }

    return violations;
  }

  /**
   * Check for Section 9 violations (children data processing).
   * If the app targets children and requests sensitive permissions, it must
   * obtain verifiable parental consent.
   */
  checkChildrenCompliance(permissions: string[], targetsChildren: boolean): DpdpViolation[] {
    if (!targetsChildren) return [];

    const violations: DpdpViolation[] = [];
    const normalised = permissions.map((p) =>
      p.replace('android.permission.', '').replace('android.Manifest.permission.', '')
    );

    for (const perm of CHILDREN_SENSITIVE_PERMISSIONS) {
      if (normalised.includes(perm)) {
        violations.push({
          section: 'Section 9',
          description:
            perm +
            ' permission requested in a children-targeted app requires verifiable parental consent under DPDP Act Section 9.',
          severity: 'critical',
          permission: perm,
        });
      }
    }

    return violations;
  }

  /**
   * Check data deletion compliance (Section 11 — Right to erasure).
   */
  checkDataDeletion(hasPrivacyPolicy: boolean, hasDataDeletion: boolean): DpdpViolation[] {
    const violations: DpdpViolation[] = [];

    if (!hasPrivacyPolicy) {
      violations.push({
        section: 'Section 6',
        description:
          'No privacy policy found. DPDP Act Section 6 requires Data Fiduciaries to provide clear notice about data processing purposes.',
        severity: 'critical',
      });
    }

    if (!hasDataDeletion) {
      violations.push({
        section: 'Section 11',
        description:
          'No data deletion mechanism found. DPDP Act Section 11 grants Data Principals the right to erasure of personal data.',
        severity: 'high',
      });
    }

    return violations;
  }

  /**
   * Check cross-border data transfer compliance (Section 17).
   */
  checkCrossBorderTransfer(crossBorderTransfer: boolean): DpdpViolation[] {
    if (!crossBorderTransfer) return [];
    return [
      {
        section: 'Section 17',
        description:
          'App transfers data outside India. DPDP Act Section 17 restricts cross-border transfers to countries notified by the Central Government.',
        severity: 'high',
      },
    ];
  }

  /**
   * Full DPDP compliance scan.
   */
  scan(input: DpdpScanInput): DpdpCheckResult {
    const {
      appName,
      packageName,
      permissions,
      hasPrivacyPolicy,
      hasDataDeletion,
      targetsChildren,
      crossBorderTransfer,
    } = input;

    // Collect all violations
    const permissionViolations = this.checkPermissions(permissions);
    const childrenViolations = this.checkChildrenCompliance(permissions, targetsChildren);
    const deletionViolations = this.checkDataDeletion(hasPrivacyPolicy, hasDataDeletion);
    const crossBorderViolations = this.checkCrossBorderTransfer(crossBorderTransfer);

    // Deduplicate violations (children check may overlap with permission check)
    const seen = new Set<string>();
    const allViolations: DpdpViolation[] = [];
    for (const v of [
      ...permissionViolations,
      ...childrenViolations,
      ...deletionViolations,
      ...crossBorderViolations,
    ]) {
      const key = v.section + (v.permission ?? v.description.slice(0, 30));
      if (!seen.has(key)) {
        seen.add(key);
        allViolations.push(v);
      }
    }

    // Build requirements checklist
    const requirements: DpdpRequirement[] = [
      {
        requirement: 'Privacy Policy (Section 6)',
        status: hasPrivacyPolicy ? 'met' : 'unmet',
        details: hasPrivacyPolicy
          ? 'Privacy policy provided — satisfies Section 6 notice requirement.'
          : 'No privacy policy. Must provide notice under Section 6.',
      },
      {
        requirement: 'Data Deletion Mechanism (Section 11)',
        status: hasDataDeletion ? 'met' : 'unmet',
        details: hasDataDeletion
          ? 'Data deletion mechanism present — satisfies Section 11 right to erasure.'
          : 'No data deletion mechanism. Must implement erasure per Section 11.',
      },
      {
        requirement: 'Cross-Border Transfer Controls (Section 17)',
        status: crossBorderTransfer ? 'unmet' : 'met',
        details: crossBorderTransfer
          ? 'Cross-border data transfer detected. Verify destination countries are notified per Section 17.'
          : 'No cross-border transfer declared — Section 17 not applicable.',
      },
      {
        requirement: 'Children Data Processing (Section 9)',
        status: targetsChildren ? 'unmet' : 'met',
        details: targetsChildren
          ? 'App targets children — must obtain verifiable parental consent per Section 9.'
          : 'App does not target children — Section 9 parental consent requirement not applicable.',
      },
      {
        requirement: 'Data Minimization (Section 8)',
        status: permissions.length === 0 ? 'met' : permissions.length > 15 ? 'unmet' : 'unknown',
        details:
          permissions.length > 15
            ? 'Large number of permissions (' +
              permissions.length +
              ') may violate data minimization principle under Section 8(3).'
            : 'Permission count appears reasonable for data minimization under Section 8(3).',
      },
    ];

    // Calculate penalty score
    let penaltyTotal = 0;
    const normalised = permissions.map((p) =>
      p.replace('android.permission.', '').replace('android.Manifest.permission.', '')
    );
    for (const check of PERMISSION_CHECKS) {
      if (normalised.includes(check.permission)) {
        penaltyTotal += check.penaltyScore;
      }
    }
    if (!hasPrivacyPolicy) penaltyTotal += 20;
    if (!hasDataDeletion) penaltyTotal += 15;
    if (crossBorderTransfer) penaltyTotal += 15;
    if (targetsChildren) penaltyTotal += 10;

    const score = Math.max(0, 100 - penaltyTotal);

    // Determine compliance level
    let overallCompliance: 'compliant' | 'partial' | 'non_compliant';
    const hasCritical = allViolations.some((v) => v.severity === 'critical');
    if (hasCritical || score < 40) {
      overallCompliance = 'non_compliant';
    } else if (score >= 80 && allViolations.length === 0) {
      overallCompliance = 'compliant';
    } else {
      overallCompliance = 'partial';
    }

    return {
      appName,
      packageName,
      overallCompliance,
      score,
      violations: allViolations,
      requirements,
    };
  }
}

/**
 * Convenience wrapper — creates a scanner and runs a one-shot scan.
 */
export function scanApp(input: DpdpScanInput): DpdpCheckResult {
  return new DpdpScanner().scan(input);
}
