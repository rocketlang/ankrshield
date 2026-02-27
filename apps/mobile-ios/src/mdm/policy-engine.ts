/**
 * MDM Policy Engine — A7
 * Handles enrollment, compliance checks, and blocklist sync for corporate MDM.
 * Uses MdmStorage (backed by Android SharedPreferences via MdmStorageModule).
 */
import { MdmStorage } from './storage';
import type { DeviceEnrollment, MdmPolicy, MdmQrPayload } from './types';

const ENROLLMENT_KEY = 'mdm_enrollment';
const BLOCKLIST_KEY = 'mdm_blocklist';
const POLICY_KEY = 'mdm_policy';

// IOC feed endpoint on the xShield public API
const IOC_FEED_URL = 'https://xshieldai.com/api/v1/ioc/feed';

// ---------------------------------------------------------------------------
// Compliance result type
// ---------------------------------------------------------------------------
export interface ComplianceResult {
  status: 'compliant' | 'partial' | 'non_compliant';
  violations: string[];
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getOrCreateDeviceId(): Promise<string> {
  const DEVICE_ID_KEY = 'xshield_device_id';
  const existing = await MdmStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  await MdmStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

// ---------------------------------------------------------------------------
// MdmPolicyEngine
// ---------------------------------------------------------------------------

export class MdmPolicyEngine {
  async enrollFromQr(qrData: string): Promise<DeviceEnrollment> {
    let payload: MdmQrPayload;
    try {
      payload = JSON.parse(qrData) as MdmQrPayload;
    } catch {
      throw new Error('Invalid QR code — could not parse JSON.');
    }
    if (payload.type !== 'ankrshield_mdm_v1') {
      throw new Error(`Unrecognised QR type: ${payload.type}. Expected ankrshield_mdm_v1.`);
    }
    const policy = payload.policy;
    if (!policy || !policy.policyId || !policy.orgName) {
      throw new Error('Malformed policy in QR code — missing policyId or orgName.');
    }
    const deviceId = await getOrCreateDeviceId();
    const now = new Date().toISOString();
    await MdmStorage.setItem(POLICY_KEY, JSON.stringify(policy));
    const { status } = await this._evaluateCompliance(policy);
    const enrollment: DeviceEnrollment = {
      deviceId,
      enrolledAt: now,
      policyId: policy.policyId,
      orgName: policy.orgName,
      complianceStatus: status,
      lastChecked: now,
    };
    await MdmStorage.setItem(ENROLLMENT_KEY, JSON.stringify(enrollment));
    if (policy.customBlocklist && policy.customBlocklist.length > 0) {
      const existing = await this._loadBlocklist();
      const merged = Array.from(new Set([...existing, ...policy.customBlocklist]));
      await MdmStorage.setItem(BLOCKLIST_KEY, JSON.stringify(merged));
    }
    return enrollment;
  }

  async getEnrollment(): Promise<DeviceEnrollment | null> {
    const raw = await MdmStorage.getItem(ENROLLMENT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DeviceEnrollment;
    } catch {
      return null;
    }
  }

  async checkCompliance(): Promise<ComplianceResult> {
    const policyRaw = await MdmStorage.getItem(POLICY_KEY);
    if (!policyRaw) {
      return {
        status: 'non_compliant',
        violations: ['No MDM policy found — device is not enrolled.'],
        recommendations: ['Scan your organisation QR code to enrol this device.'],
      };
    }
    const policy = JSON.parse(policyRaw) as MdmPolicy;
    const result = await this._evaluateCompliance(policy);
    const enrollment = await this.getEnrollment();
    if (enrollment) {
      enrollment.complianceStatus = result.status;
      enrollment.lastChecked = new Date().toISOString();
      await MdmStorage.setItem(ENROLLMENT_KEY, JSON.stringify(enrollment));
    }
    return result;
  }

  async syncBlocklist(apiKey: string): Promise<string[]> {
    if (!apiKey) throw new Error('API key is required for blocklist sync.');
    const url = `${IOC_FEED_URL}?format=domains&apiKey=${encodeURIComponent(apiKey)}`;
    let domains: string[] = [];
    try {
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`xShield API returned ${response.status}: ${response.statusText}`);
      }
      const data: unknown = await response.json();
      if (Array.isArray(data)) {
        domains = data as string[];
      } else if (
        data !== null &&
        typeof data === 'object' &&
        'domains' in data &&
        Array.isArray((data as Record<string, unknown>).domains)
      ) {
        domains = (data as Record<string, unknown>).domains as string[];
      } else {
        throw new Error('Unexpected API response format.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Blocklist sync failed: ${msg}`);
    }
    const existing = await this._loadBlocklist();
    const merged = Array.from(new Set([...existing, ...domains]));
    await MdmStorage.setItem(BLOCKLIST_KEY, JSON.stringify(merged));
    return merged;
  }

  async unenroll(): Promise<void> {
    await MdmStorage.multiRemove([ENROLLMENT_KEY, BLOCKLIST_KEY, POLICY_KEY]);
  }

  private async _loadBlocklist(): Promise<string[]> {
    const raw = await MdmStorage.getItem(BLOCKLIST_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  private async _evaluateCompliance(policy: MdmPolicy): Promise<ComplianceResult> {
    const violations: string[] = [];
    const recommendations: string[] = [];
    for (const rule of policy.rules) {
      switch (rule.type) {
        case 'require_screen_lock':
          if (rule.severity === 'block') {
            recommendations.push(
              'Enable a PIN or biometric lock (Settings > Security > Screen Lock).'
            );
          }
          break;
        case 'min_pin_length': {
          const minLen = parseInt(rule.value, 10);
          if (!isNaN(minLen) && minLen > 4) {
            recommendations.push(
              `Your organisation requires a minimum PIN length of ${minLen} digits.`
            );
          }
          break;
        }
        case 'require_vpn':
          if (rule.severity === 'block') {
            violations.push('Always-on VPN is required by your organisation.');
            recommendations.push('Enable DNS VPN from the xShield main screen.');
          }
          break;
        case 'block_sideloading':
          if (rule.severity === 'block') {
            recommendations.push(
              'Disable "Install unknown apps" in Settings > Apps > Special App Access.'
            );
          }
          break;
        case 'max_risk_score_allowed': {
          const max = parseInt(rule.value, 10);
          if (!isNaN(max) && max < 100) {
            recommendations.push(
              `Your organisation requires a maximum risk score of ${max}. Run a scan to verify.`
            );
          }
          break;
        }
        case 'block_domain':
        case 'allow_domain_only':
          break;
      }
    }
    let status: 'compliant' | 'partial' | 'non_compliant';
    if (violations.length === 0) {
      status = 'compliant';
    } else if (violations.length <= 1) {
      status = 'partial';
    } else {
      status = 'non_compliant';
    }
    return { status, violations, recommendations };
  }
}

// Singleton export
export const mdmPolicyEngine = new MdmPolicyEngine();
