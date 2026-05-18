/**
 * Splunk HEC Connector — Option B, first SIEM target
 * @rule:XSACT-005 Client-side actions use Option B
 * @rule:XSACT-YK-007 Token never stored plain — hash only in consent store
 * @rule:CA-001 GRANTHX overflow on failure (large output escape)
 * @rule:CA-004 duration_ms in every response
 *
 * Splunk HEC: POST JSON to https://your-splunk:8088/services/collector
 * Authorization: Splunk <HEC_TOKEN>
 */

export interface SplunkEvent {
  time?: number; // epoch seconds
  host?: string;
  source?: string;
  sourcetype?: string;
  index?: string;
  event: Record<string, unknown>;
}

export interface SiemPushResult {
  success: boolean;
  siem_type: 'splunk';
  status_code?: number;
  detail: string;
  duration_ms: number;
  overflow_granthx_ref?: string; // @rule:CA-001
  timestamp: string;
}

/**
 * Push a threat alert to Splunk via HEC.
 * Token is passed by caller (retrieved from consent store, never persisted here).
 * @rule:XSACT-YK-007
 */
export async function pushToSplunk(
  hecUrl: string,
  token: string,
  threatPayload: Record<string, unknown>,
  retries = 3
): Promise<SiemPushResult> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  const splunkEvent: SplunkEvent = {
    time: Math.floor(Date.now() / 1000),
    host: 'xshield-active',
    source: 'xshieldai',
    sourcetype: 'xshield:threat:alert',
    index: 'security',
    event: {
      ...threatPayload,
      // @rule:CA-004 telemetry minimum
      _meta: {
        service: 'xshield-active',
        computed_at: timestamp,
        trust_mask_applied: 1,
      },
    },
  };

  let lastError: string = '';
  let delay = 500;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(hecUrl, {
        method: 'POST',
        headers: {
          Authorization: `Splunk ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(splunkEvent),
        signal: AbortSignal.timeout(10_000),
      });

      const duration_ms = Date.now() - start;

      if (res.ok) {
        return {
          success: true,
          siem_type: 'splunk',
          status_code: res.status,
          detail: `Alert pushed to Splunk HEC (attempt ${attempt})`,
          duration_ms,
          timestamp,
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

  // All retries failed — @rule:CA-001 GRANTHX overflow
  const duration_ms = Date.now() - start;
  const overflow_ref = `granthx://xshield-active/siem-overflow/${Date.now()}`;
  console.error(
    `[Splunk] Push failed after ${retries} attempts. Overflow ref: ${overflow_ref}. Last error: ${lastError}`
  );

  return {
    success: false,
    siem_type: 'splunk',
    detail: `Push failed after ${retries} retries: ${lastError}`,
    duration_ms,
    overflow_granthx_ref: overflow_ref,
    timestamp,
  };
}
