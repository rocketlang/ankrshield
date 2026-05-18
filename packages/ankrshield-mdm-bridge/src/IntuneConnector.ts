/**
 * IntuneConnector — connects AnkrShield to Microsoft Intune.
 *
 * Capabilities:
 *   1. receivePolicy(req)      — parse an Intune Graph API webhook push and
 *                                return a normalised policy object.
 *   2. reportCompliance(state) — POST device compliance to the Microsoft Graph
 *                                deviceManagement/managedDevices/{id}/updateWindowsDeviceAccount
 *                                endpoint (custom compliance partner model).
 *   3. getAccessToken()        — Client-credentials OAuth2 token cache.
 */

import type {
  AnkrShieldDeviceState,
  ComplianceDetail,
  IntuneConfig,
  IntuneCompliancePayload,
  IntunePolicyPush,
} from './types.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class IntuneConnector {
  private readonly cfg: IntuneConfig;
  private tokenCache: TokenCache | null = null;

  constructor(config: IntuneConfig) {
    this.cfg = config;
  }

  // ── OAuth2 token ──────────────────────────────────────────────────────────

  async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 30_000) {
      return this.tokenCache.token;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });

    const res = await fetch(TOKEN_URL(this.cfg.tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Intune token fetch failed (${res.status}): ${txt}`);
    }

    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return this.tokenCache.token;
  }

  // ── Policy reception ──────────────────────────────────────────────────────
  /**
   * Parse a raw Intune Graph API webhook body and return a normalised
   * IntunePolicyPush. Called from the bridge server's POST /intune/policy route.
   */
  receivePolicy(body: Record<string, unknown>): IntunePolicyPush {
    // Intune sends deviceConfigurationStateChanged notifications.
    // The OEM compliance partner model uses custom properties under "additionalData".
    const deviceId = (body['deviceId'] as string) ?? (body['id'] as string) ?? 'unknown';
    const settings = (body['settings'] as Record<string, unknown>) ?? {};

    return {
      deviceId,
      settings: {
        blocklistEnabled: Boolean(settings['blocklistEnabled'] ?? true),
        avScanSchedule: (settings['avScanSchedule'] as 'daily' | 'weekly' | 'manual') ?? 'daily',
        dpdpMinScore: Number(settings['dpdpMinScore'] ?? 80),
        allowedDnsProviders: (settings['allowedDnsProviders'] as string[]) ?? [
          'cloudflare',
          'google',
        ],
        vpnRequired: Boolean(settings['vpnRequired'] ?? true),
        antiTheftEnabled: Boolean(settings['antiTheftEnabled'] ?? true),
      },
    };
  }

  // ── Compliance reporting ──────────────────────────────────────────────────
  /**
   * Report an AnkrShield device state back to Intune custom compliance.
   * Uses the Graph API: PATCH /deviceManagement/managedDevices/{deviceId}
   *
   * In a production integration you would also call:
   *   POST /deviceManagement/deviceCompliancePolicies/{policyId}/scheduleActionsForRules
   */
  async reportCompliance(state: AnkrShieldDeviceState): Promise<{ ok: boolean; status: number }> {
    const token = await this.getAccessToken();

    const payload: IntuneCompliancePayload = {
      deviceId: state.deviceId,
      compliant: state.isCompliant,
      details: state.complianceDetails,
      reportedAt: new Date().toISOString(),
    };

    // Custom compliance JSON is written as a device note / extension attribute.
    // The proper Graph API for 3P compliance partners requires MDM authority setup;
    // this call writes to the managedDevice's notes field as a lightweight alternative.
    const url = `${GRAPH_BASE}/deviceManagement/managedDevices/${state.deviceId}`;
    const body = {
      notes: JSON.stringify({
        source: 'AnkrShield',
        compliance: payload,
      }),
    };

    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    return { ok: res.ok, status: res.status };
  }

  // ── List managed devices ──────────────────────────────────────────────────

  async listManagedDevices(filter?: string): Promise<unknown[]> {
    const token = await this.getAccessToken();
    const params = new URLSearchParams({
      $select: 'id,deviceName,operatingSystem,complianceState,notes',
    });
    if (filter) params.set('$filter', filter);

    const res = await fetch(`${GRAPH_BASE}/deviceManagement/managedDevices?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`List devices failed (${res.status})`);
    }

    const json = (await res.json()) as { value: unknown[] };
    return json.value;
  }

  // ── Build AnkrShield compliance details ──────────────────────────────────
  /**
   * Helper: convert a raw AnkrShield device health object into ComplianceDetail[].
   * Call this before reportCompliance().
   */
  static buildComplianceDetails(state: AnkrShieldDeviceState): ComplianceDetail[] {
    const details: ComplianceDetail[] = [];

    details.push({
      checkId: 'vpn_active',
      label: 'DNS VPN active',
      pass: state.vpnActive,
      severity: state.vpnActive ? 'info' : 'critical',
    });

    details.push({
      checkId: 'av_clean',
      label: 'AV scan clean',
      pass: state.avScanClean,
      severity: state.avScanClean ? 'info' : 'critical',
    });

    details.push({
      checkId: 'dpdp_score',
      label: `DPDP score ≥ 80 (current: ${state.dpdpScore})`,
      pass: state.dpdpScore >= 80,
      severity: state.dpdpScore >= 80 ? 'info' : 'warning',
    });

    details.push({
      checkId: 'no_threats',
      label: 'No active threats',
      pass: state.threatsDetected === 0,
      severity: state.threatsDetected === 0 ? 'info' : 'critical',
    });

    return details;
  }
}
