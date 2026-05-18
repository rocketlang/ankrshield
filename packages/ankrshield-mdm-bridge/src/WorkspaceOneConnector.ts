/**
 * WorkspaceOneConnector — connects AnkrShield to VMware Workspace ONE (WS1).
 *
 * Capabilities:
 *   1. receivePolicy(req)      — parse a WS1 webhook and return normalised policy.
 *   2. reportCompliance(state) — push compliance to WS1 via REST API v2.
 *   3. searchDevice(serial)    — look up a device by serial number.
 */

import type {
  AnkrShieldDeviceState,
  WS1CompliancePayload,
  WorkspaceOneConfig,
  IntunePolicyPush,
} from './types.js';

export class WorkspaceOneConnector {
  private readonly cfg: WorkspaceOneConfig;
  private readonly authHeader: string;

  constructor(config: WorkspaceOneConfig) {
    this.cfg = config;
    // WS1 REST API: Basic auth + aw-tenant-code header
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.authHeader = `Basic ${creds}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      'aw-tenant-code': this.cfg.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  // ── Policy reception ──────────────────────────────────────────────────────
  /**
   * WS1 sends custom app configuration via OEM channel or Workspace ONE SDK.
   * This parses the raw JSON body (from a webhook or SDK callback) into a
   * normalised IntunePolicyPush (shared type — same fields).
   */
  receivePolicy(body: Record<string, unknown>): IntunePolicyPush {
    const deviceId = (body['deviceUuid'] as string) ?? (body['deviceId'] as string) ?? 'unknown';
    const cfg = (body['configuration'] as Record<string, unknown>) ?? {};

    return {
      deviceId,
      settings: {
        blocklistEnabled: Boolean(cfg['blocklistEnabled'] ?? true),
        avScanSchedule: (cfg['avScanSchedule'] as 'daily' | 'weekly' | 'manual') ?? 'daily',
        dpdpMinScore: Number(cfg['dpdpMinScore'] ?? 80),
        allowedDnsProviders: (cfg['allowedDnsProviders'] as string[]) ?? ['cloudflare'],
        vpnRequired: Boolean(cfg['vpnRequired'] ?? true),
        antiTheftEnabled: Boolean(cfg['antiTheftEnabled'] ?? true),
      },
    };
  }

  // ── Compliance reporting ──────────────────────────────────────────────────
  /**
   * POST device compliance to WS1 via:
   *   POST {apiUrl}/api/mdm/devices/compliance/bulk
   */
  async reportCompliance(state: AnkrShieldDeviceState): Promise<{ ok: boolean; status: number }> {
    const deviceInfo = await this.searchDevice(state.deviceId).catch(() => null);
    const serialNumber =
      ((deviceInfo as Record<string, unknown>)?.['SerialNumber'] as string) ?? state.deviceId;

    const payload: WS1CompliancePayload = {
      SerialNumber: serialNumber,
      ComplianceStatus: state.isCompliant ? 'Compliant' : 'NonCompliant',
      Reason: state.isCompliant
        ? 'AnkrShield: all security checks passed'
        : `AnkrShield: ${state.complianceDetails
            .filter((d) => !d.pass)
            .map((d) => d.label)
            .join('; ')}`,
    };

    const url = `${this.cfg.apiUrl}/api/mdm/devices/compliance/bulk`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ Devices: [payload] }),
      signal: AbortSignal.timeout(15_000),
    });

    return { ok: res.ok, status: res.status };
  }

  // ── Device lookup ─────────────────────────────────────────────────────────

  async searchDevice(deviceIdOrSerial: string): Promise<unknown> {
    const url = `${this.cfg.apiUrl}/api/mdm/devices?searchBy=Uuid&id=${encodeURIComponent(deviceIdOrSerial)}`;
    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`WS1 device lookup failed (${res.status})`);
    return res.json();
  }

  // ── Send custom app config ────────────────────────────────────────────────
  /**
   * Push AnkrShield policy settings to a device via WS1 custom app config.
   * Used to remotely update blocklist settings, VPN requirements, etc.
   */
  async pushAppConfig(deviceId: string, config: Record<string, unknown>): Promise<boolean> {
    const url = `${this.cfg.apiUrl}/api/mdm/devices/${deviceId}/customattributes`;
    const payload = {
      CustomAttributes: [
        {
          Name: 'AnkrShieldConfig',
          Value: JSON.stringify(config),
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    return res.ok;
  }
}
