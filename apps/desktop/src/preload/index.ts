/**
 * Preload Script
 * Context bridge between main and renderer processes
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose protected methods to renderer via context bridge
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Privacy Score
  getPrivacyScore: () => ipcRenderer.invoke('get-privacy-score'),
  getScoreHistory: (days: number) => ipcRenderer.invoke('get-score-history', days),
  getScoreBreakdown: () => ipcRenderer.invoke('get-score-breakdown'),

  // Protection Status
  getProtectionStatus: () => ipcRenderer.invoke('get-protection-status'),
  getDnsProtectionStatus: () => ipcRenderer.invoke('get-dns-protection-status'),
  toggleProtection: (enabled: boolean) => ipcRenderer.invoke('toggle-protection', enabled),

  // Network Monitoring
  getNetworkEvents: (limit: number) => ipcRenderer.invoke('get-network-events', limit),
  getNetworkStats: () => ipcRenderer.invoke('get-network-stats'),

  // DNS
  getDnsStats: () => ipcRenderer.invoke('get-dns-stats'),
  getDnsQueries: (limit: number) => ipcRenderer.invoke('get-dns-queries', limit),

  // Trackers
  getTopTrackers: (limit: number) => ipcRenderer.invoke('get-top-trackers', limit),
  getTrackerStats: () => ipcRenderer.invoke('get-tracker-stats'),

  // Settings (individual getters/setters)
  settingsGet: (key: string) => ipcRenderer.invoke('settings:get', key),
  settingsSet: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  settingsGetAll: () => ipcRenderer.invoke('settings:getAll'),
  settingsReset: () => ipcRenderer.invoke('settings:reset'),

  // Settings (legacy - full object)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),

  // Notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.send('show-notification', { title, body }),

  // Reports
  generateDailyReport: (date: Date) => ipcRenderer.invoke('generate-daily-report', date),
  generateWeeklyReport: (startDate: Date) =>
    ipcRenderer.invoke('generate-weekly-report', startDate),
  generateMonthlyReport: (month: number, year: number) =>
    ipcRenderer.invoke('generate-monthly-report', month, year),

  // Events (one-way from main to renderer)
  onPrivacyScoreUpdate: (callback: (score: any) => void) => {
    ipcRenderer.on('privacy-score-updated', (_event, score) => callback(score));
  },
  onProtectionToggled: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('protection-toggled', (_event, enabled) => callback(enabled));
  },
  onTrackerBlocked: (callback: (data: any) => void) => {
    ipcRenderer.on('tracker-blocked', (_event, data) => callback(data));
  },

  // ─── Aegis Proxy (ASD-T-008) ─────────────────────────────────────────────
  // Subscribe to live aegis-proxy events (request.observed, response.observed,
  // request.parse_failed, tls.client_error, privacy.blocked). Returns an
  // unsubscribe function.
  //
  // The event shape mirrors AegisProxyEvent in main/aegis-proxy/event-bus.ts.
  // Renderer receives the event as plain JSON via structured clone.
  onAegisProxyEvent: (callback: (event: AegisProxyEventPayload) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: AegisProxyEventPayload) =>
      callback(event);
    ipcRenderer.on('aegis-proxy-event', handler);
    return () => {
      ipcRenderer.off('aegis-proxy-event', handler);
    };
  },

  // ─── Aegis Proxy CA setup (ASD-T-003) ────────────────────────────────────
  // Drives the /setup/root-ca consent ceremony in the renderer.
  aegisProxyGetRootCASetupInfo: () =>
    ipcRenderer.invoke('aegis-proxy:get-root-ca-setup-info') as Promise<RootCASetupInfoPayload>,
  aegisProxyRecordRootCAConsent: (decision: 'allow' | 'deny' | 'skip') =>
    ipcRenderer.invoke('aegis-proxy:root-ca-consent', { decision }) as Promise<{
      ok: true;
      install?: { ok: boolean; error?: string; installedAt?: string };
    }>,

  // ─── TOFU consent (ASD-T-015) ─────────────────────────────────────────────
  aegisProxyListPendingConsents: () =>
    ipcRenderer.invoke('aegis-proxy:list-pending-consents') as Promise<
      Array<{
        pendingId: string;
        appId: string;
        hostname: string;
        heldAt: string;
        timeoutMs: number;
      }>
    >,
  aegisProxyResolvePendingConsent: (input: {
    pendingId: string;
    decision: 'allow' | 'deny';
    hourly_limit_usd?: number;
    pii_policy?: 'redact' | 'block' | 'off';
    dan_carrier?: 'os' | 'wa' | 'tg';
  }) =>
    ipcRenderer.invoke('aegis-proxy:resolve-pending-consent', input) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  aegisProxyListAppPolicies: () =>
    ipcRenderer.invoke('aegis-proxy:list-app-policies') as Promise<
      Record<
        string,
        {
          decision: 'allow' | 'deny';
          decided_at: string;
          hourly_limit_usd: number | null;
          pii_policy: 'redact' | 'block' | 'off';
          dan_carrier: 'os' | 'wa' | 'tg';
        }
      >
    >,
  aegisProxyForgetAppPolicy: (appId: string) =>
    ipcRenderer.invoke('aegis-proxy:forget-app-policy', appId) as Promise<{ ok: boolean }>,
});

// ─── Aegis Proxy CA setup payloads (renderer-side mirror) ───────────────────

export interface RootCASetupInfoPayload {
  ca: {
    fingerprintSha256: string;
    generatedAt: string;
    validUntil: string;
  } | null;
  trustStore: {
    platformSupported: boolean;
    installed: boolean;
    installedAt?: string;
    manualInstallCommand?: string;
    manualRevokeCommand?: string;
  };
  consent: {
    answered: boolean;
    decision: 'allow' | 'deny' | 'skip' | null;
    answeredAt: string | null;
  };
}

// ─── Aegis Proxy event payload (renderer-side mirror) ────────────────────────
// Keep in sync with main/aegis-proxy/event-bus.ts AegisProxyEvent.

export interface AegisProxyObservedRequest {
  provider: 'anthropic' | 'openai' | 'unknown';
  hostname: string;
  path: string;
  method: string;
  model: string | null;
  isStreaming: boolean;
  promptText: string;
  systemPrompt: string | null;
  hasTools: boolean;
  messageCount: number;
  requestBytes: number;
  // ASD-T-006 + T-007: per-app identity enrichment
  appId: string;
  pid: number | null;
  executable: string | null;
}

export interface AegisProxyObservedResponse {
  statusCode: number;
  responseBytes: number;
  promptTokens: number | null;
  completionTokens: number | null;
  finishReason: string | null;
  isStreaming: boolean;
  latencyMs: number;
}

export type AegisProxyEventPayload =
  | {
      kind: 'request.observed';
      requestId: string;
      timestamp: string;
      observation: AegisProxyObservedRequest;
    }
  | {
      kind: 'response.observed';
      requestId: string;
      timestamp: string;
      observation: AegisProxyObservedResponse;
    }
  | {
      kind: 'request.parse_failed';
      requestId: string;
      timestamp: string;
      provider: 'anthropic' | 'openai' | 'unknown';
      hostname: string;
      path: string;
      error: string;
    }
  | {
      kind: 'tls.client_error';
      requestId: string;
      timestamp: string;
      hostname: string;
      error: string;
    }
  | {
      kind: 'privacy.blocked';
      requestId: string;
      timestamp: string;
      hostname: string;
      via: 'http' | 'connect';
    }
  | {
      kind: 'aegis.denied';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      capability_hex: string;
      trust_mask_hex: string;
      reason: string;
    }
  | {
      kind: 'pii.redacted';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      counts: Record<string, number>;
      total: number;
    }
  | {
      kind: 'pii.blocked';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      counts: Record<string, number>;
      total: number;
    }
  | {
      kind: 'budget.throttled';
      requestId: string;
      timestamp: string;
      appId: string;
      hostname: string;
      currentSpendUsd: number;
      hourlyLimitUsd: number;
      bucket: string;
    }
  | {
      kind: 'cost.recorded';
      requestId: string;
      timestamp: string;
      appId: string;
      model: string | null;
      costUsd: number;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | {
      kind: 'consent.pending';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      hostname: string;
      timeoutMs: number;
    }
  | {
      kind: 'consent.resolved';
      requestId: string;
      timestamp: string;
      pendingId: string;
      appId: string;
      decision: 'allow' | 'deny';
      timedOut: boolean;
    };

/**
 * Type definitions for renderer process
 */
export interface ElectronAPI {
  // Privacy Score
  getPrivacyScore: () => Promise<any>;
  getScoreHistory: (days: number) => Promise<any[]>;
  getScoreBreakdown: () => Promise<any>;

  // Protection Status
  getProtectionStatus: () => Promise<boolean>;
  getDnsProtectionStatus: () => Promise<boolean>;
  toggleProtection: (enabled: boolean) => Promise<any>;

  // Network Monitoring
  getNetworkEvents: (limit: number) => Promise<any[]>;
  getNetworkStats: () => Promise<any>;

  // DNS
  getDnsStats: () => Promise<any>;
  getDnsQueries: (limit: number) => Promise<any[]>;

  // Trackers
  getTopTrackers: (limit: number) => Promise<any[]>;
  getTrackerStats: () => Promise<any>;

  // Settings (individual)
  settingsGet: (key: string) => Promise<any>;
  settingsSet: (key: string, value: any) => Promise<void>;
  settingsGetAll: () => Promise<any>;
  settingsReset: () => Promise<void>;

  // Settings (legacy)
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;

  // Notifications
  showNotification: (title: string, body: string) => void;

  // Reports
  generateDailyReport: (date: Date) => Promise<any>;
  generateWeeklyReport: (startDate: Date) => Promise<any>;
  generateMonthlyReport: (month: number, year: number) => Promise<any>;

  // Events
  onPrivacyScoreUpdate: (callback: (score: any) => void) => void;
  onProtectionToggled: (callback: (enabled: boolean) => void) => void;
  onTrackerBlocked: (callback: (data: any) => void) => void;

  // Aegis Proxy (ASD-T-008)
  onAegisProxyEvent: (callback: (event: AegisProxyEventPayload) => void) => () => void;

  // Aegis Proxy CA setup (ASD-T-003)
  aegisProxyGetRootCASetupInfo: () => Promise<RootCASetupInfoPayload>;
  aegisProxyRecordRootCAConsent: (decision: 'allow' | 'deny' | 'skip') => Promise<{
    ok: true;
    install?: { ok: boolean; error?: string; installedAt?: string };
  }>;

  // TOFU consent (ASD-T-015)
  aegisProxyListPendingConsents: () => Promise<
    Array<{ pendingId: string; appId: string; hostname: string; heldAt: string; timeoutMs: number }>
  >;
  aegisProxyResolvePendingConsent: (input: {
    pendingId: string;
    decision: 'allow' | 'deny';
    hourly_limit_usd?: number;
    pii_policy?: 'redact' | 'block' | 'off';
    dan_carrier?: 'os' | 'wa' | 'tg';
  }) => Promise<{ ok: boolean; error?: string }>;
  aegisProxyListAppPolicies: () => Promise<
    Record<
      string,
      {
        decision: 'allow' | 'deny';
        decided_at: string;
        hourly_limit_usd: number | null;
        pii_policy: 'redact' | 'block' | 'off';
        dan_carrier: 'os' | 'wa' | 'tg';
      }
    >
  >;
  aegisProxyForgetAppPolicy: (appId: string) => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
