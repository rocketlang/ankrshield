/**
 * Generic JSON Webhook — Option B, third connector
 * Covers: Datadog, PagerDuty, Satark-type aggregators, custom SIEMs
 *
 * @rule:XSACT-005 Client-side actions use Option B
 * @rule:CA-001 GRANTHX overflow on failure
 * @rule:CA-004 duration_ms in every response
 */

export interface GenericWebhookResult {
  success: boolean;
  siem_type: 'generic';
  status_code?: number;
  detail: string;
  duration_ms: number;
  overflow_granthx_ref?: string;
}

export interface GenericWebhookConfig {
  endpoint: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>; // custom headers (auth, content-type overrides)
  wrap_key?: string; // e.g. "data" → { data: payload }
}

/**
 * Push alert to any JSON webhook endpoint.
 * Handles Datadog Events API, PagerDuty Events v2, custom SIEMs.
 */
export async function pushToGenericWebhook(
  config: GenericWebhookConfig,
  threatPayload: Record<string, unknown>,
  retries = 3
): Promise<GenericWebhookResult> {
  const start = Date.now();

  const body = config.wrap_key
    ? JSON.stringify({ [config.wrap_key]: { ...threatPayload, _source: 'xshield-active' } })
    : JSON.stringify({ ...threatPayload, _source: 'xshield-active' });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'xShieldActive/0.1.0',
    ...config.headers,
  };

  let lastError = '';
  let delay = 500;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(config.endpoint, {
        method: config.method ?? 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const duration_ms = Date.now() - start;

      // Accept any 2xx as success
      if (res.status >= 200 && res.status < 300) {
        return {
          success: true,
          siem_type: 'generic',
          status_code: res.status,
          detail: `Alert pushed to ${config.endpoint} (attempt ${attempt})`,
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
    siem_type: 'generic',
    detail: `Generic webhook failed after ${retries} retries to ${config.endpoint}: ${lastError}`,
    duration_ms: Date.now() - start,
    overflow_granthx_ref: overflow_ref,
  };
}

// ─── Platform-specific presets ────────────────────────────────────────────────

/** Datadog Events API v1 preset */
export function datadogPreset(apiKey: string, appKey: string): GenericWebhookConfig {
  return {
    endpoint: 'https://api.datadoghq.com/api/v1/events',
    headers: {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
    },
    wrap_key: undefined,
  };
}

/** PagerDuty Events API v2 preset */
export function pagerdutyPreset(routingKey: string): GenericWebhookConfig {
  return {
    endpoint: 'https://events.pagerduty.com/v2/enqueue',
    headers: {},
    wrap_key: undefined,
  };
}
