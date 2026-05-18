/**
 * Microsoft Sentinel Connector — Option B, second SIEM target
 * @rule:XSACT-005 Client-side actions use Option B
 * @rule:CA-001 GRANTHX overflow on failure
 * @rule:CA-004 duration_ms in every response
 *
 * Sentinel: POST to Log Analytics workspace via Data Collector API
 * POST https://{workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01
 * Authorization: SharedKey {workspaceId}:{signature}
 */

import { createHmac, createHash } from 'node:crypto';

export interface SentinelPushResult {
  success: boolean;
  siem_type: 'sentinel';
  status_code?: number;
  detail: string;
  duration_ms: number;
  overflow_granthx_ref?: string;
}

/** Build Sentinel SharedKey authorization header */
function buildSentinelSignature(
  workspaceId: string,
  sharedKey: string,
  date: string,
  contentLength: number,
  logType: string
): string {
  const stringToSign = [
    'POST',
    String(contentLength),
    'application/json',
    `x-ms-date:${date}`,
    `/api/logs`,
  ].join('\n');

  const signature = createHmac('sha256', Buffer.from(sharedKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');

  return `SharedKey ${workspaceId}:${signature}`;
}

/**
 * Push threat alert to Microsoft Sentinel via Log Analytics Data Collector API.
 * @rule:XSACT-YK-007 Token (sharedKey) provided by caller — never stored here
 */
export async function pushToSentinel(
  workspaceId: string,
  sharedKey: string,
  logType: string = 'xShieldThreat',
  threatPayload: Record<string, unknown>,
  retries = 3
): Promise<SentinelPushResult> {
  const start = Date.now();
  const date = new Date().toUTCString();
  const body = JSON.stringify([
    {
      ...threatPayload,
      TimeGenerated: new Date().toISOString(),
      // @rule:CA-004
      _meta_service: 'xshield-active',
      _meta_trust_mask: 1,
    },
  ]);
  const contentLength = Buffer.byteLength(body, 'utf8');
  const authorization = buildSentinelSignature(
    workspaceId,
    sharedKey,
    date,
    contentLength,
    logType
  );
  const url = `https://${workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;

  let lastError = '';
  let delay = 500;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Log-Type': logType,
          Authorization: authorization,
          'x-ms-date': date,
          'time-generated-field': 'TimeGenerated',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const duration_ms = Date.now() - start;

      if (res.status === 200 || res.status === 202) {
        return {
          success: true,
          siem_type: 'sentinel',
          status_code: res.status,
          detail: `Alert pushed to Sentinel workspace ${workspaceId} (attempt ${attempt})`,
          duration_ms,
        };
      }

      lastError = `HTTP ${res.status}: ${await res.text()}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }

  // @rule:CA-001 GRANTHX overflow
  const overflow_ref = `granthx://xshield-active/siem-overflow/${Date.now()}`;
  return {
    success: false,
    siem_type: 'sentinel',
    detail: `Sentinel push failed after ${retries} retries: ${lastError}`,
    duration_ms: Date.now() - start,
    overflow_granthx_ref: overflow_ref,
  };
}
