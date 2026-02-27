/**
 * MDM Lite — Type definitions
 * A7: Mobile Device Management for xShield corporate deployments
 */

export interface MdmPolicy {
  policyId: string;
  orgName: string;
  version: number;
  createdAt: string;
  rules: MdmRule[];
  apiKey?: string; // xShield API key for IOC sync
  customBlocklist?: string[]; // org-specific domains to block
}

export interface MdmRule {
  ruleId: string;
  type: MdmRuleType;
  value: string;
  severity: 'block' | 'warn' | 'monitor';
}

export type MdmRuleType =
  | 'require_screen_lock' // enforce PIN/biometric
  | 'min_pin_length' // minimum PIN digits
  | 'block_domain' // block specific domain in DNS
  | 'allow_domain_only' // allowlist mode
  | 'require_vpn' // require DNS VPN always-on
  | 'block_sideloading' // prevent unknown sources installs
  | 'max_risk_score_allowed'; // if device risk score > N, alert

export interface DeviceEnrollment {
  deviceId: string; // unique device identifier
  enrolledAt: string;
  policyId: string;
  orgName: string;
  complianceStatus: 'compliant' | 'partial' | 'non_compliant';
  lastChecked: string;
}

export interface MdmQrPayload {
  type: 'ankrshield_mdm_v1';
  policy: MdmPolicy;
}
