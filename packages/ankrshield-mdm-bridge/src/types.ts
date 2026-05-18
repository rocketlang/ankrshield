/**
 * Shared types for the AnkrShield MDM Bridge SDK.
 */

// ── Device state reported back to MDM console ─────────────────────────────────

export interface AnkrShieldDeviceState {
  deviceId: string;
  enrolledAt: string; // ISO-8601
  lastCheckin: string;
  platform: 'android' | 'ios';
  osVersion: string;
  appVersion: string;
  // Compliance
  isCompliant: boolean;
  complianceDetails: ComplianceDetail[];
  // Threat summary
  threatsDetected: number;
  lastThreatAt: string | null;
  dnsBlockedToday: number;
  // Protection status
  vpnActive: boolean;
  avScanClean: boolean;
  dpdpScore: number; // 0-100
}

export interface ComplianceDetail {
  checkId: string;
  label: string;
  pass: boolean;
  severity: 'info' | 'warning' | 'critical';
}

// ── Intune ────────────────────────────────────────────────────────────────────

export interface IntuneConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Intune compliance policy ID to write results into */
  policyId: string;
}

export interface IntuneCompliancePayload {
  /** Microsoft Graph device management object ID */
  deviceId: string;
  compliant: boolean;
  details: ComplianceDetail[];
  reportedAt: string;
}

export interface IntunePolicyPush {
  deviceId: string;
  settings: {
    blocklistEnabled: boolean;
    avScanSchedule: 'daily' | 'weekly' | 'manual';
    dpdpMinScore: number;
    allowedDnsProviders: string[];
    vpnRequired: boolean;
    antiTheftEnabled: boolean;
  };
}

// ── Workspace ONE (VMware) ────────────────────────────────────────────────────

export interface WorkspaceOneConfig {
  apiUrl: string; // e.g. https://as.awmdm.com
  apiKey: string;
  username: string;
  password: string;
  /** WS1 organization group ID */
  ogId: string;
}

export interface WS1CompliancePayload {
  SerialNumber: string;
  ComplianceStatus: 'Compliant' | 'NonCompliant' | 'Unknown';
  Reason: string;
}

// ── Bridge server request/response ────────────────────────────────────────────

export interface BridgeEvent {
  type: 'threat' | 'scan_complete' | 'policy_update' | 'device_checkin';
  deviceId: string;
  payload: Record<string, unknown>;
  ts: string;
}
