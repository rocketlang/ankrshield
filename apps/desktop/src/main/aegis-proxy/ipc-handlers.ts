// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — IPC handlers for the renderer ceremony
//
// @rule:ASD-006 — renderer + main share one process for trust, IPC for messages
// @rule:ASD-012 — root CA install consent is its own ceremony

// electron is CJS — use default-import + destructure so the file loads under
// plain Node ESM too (renderer-bridge.ts has the same pattern).
import electron from 'electron';

import { readRootCAPublic } from './ca-store.js';

const { ipcMain } = electron;
import { installRootCAToTrustStore, getTrustStoreStatus } from './ca-truststore.js';
import { ConsentStore, type ConsentDecision } from './consent-store.js';
import type { AppsPolicyStore, PiiPolicyChoice, DanCarrier } from './apps-policy.js';
import type { PendingConsentQueue, ConsentRequest } from './pending-consent-queue.js';
import type { PendingDanQueue, DanRequest } from './pending-dan-queue.js';
import type { DanDecisionCache } from './dan-decision-cache.js';
import type { DanTimeoutStore } from './dan-timeout-config.js';
import type { BudgetLedger, BudgetConfigResolver } from './budget-ledger.js';
import type { LatencyTracker } from './latency-tracker.js';
import type { EventTallyStore } from './event-tally-store.js';
import { buildAllReportCards, buildReportCard, type ReportCardRow } from './report-card.js';
import type { KillSwitch, KillState, KillStateSnapshot } from './kill-switch.js';
import type { AuditRetentionStore, AuditRetentionConfig } from './audit-retention-config.js';
import type { AuditRetentionWorker } from './audit-retention-worker.js';
import { exportAuditZip, type ExportRange } from './audit-export.js';
import type { RequestLogStore, ReplayEntry } from './request-log-store.js';
import type { RequestAuditStore, RequestAuditReceipt } from './request-audit-store.js';
import {
  RETENTION_DAYS_DEFAULT,
  RETENTION_DAYS_MIN,
  RETENTION_DAYS_MAX,
} from './audit-retention-config.js';
import {
  DAN_TIMEOUT_DEFAULT_MS,
  DAN_TIMEOUT_MIN_MS,
  DAN_TIMEOUT_MAX_MS,
} from './dan-timeout-config.js';
import {
  getWhatsAppCreds,
  setWhatsAppCreds,
  clearWhatsAppCreds,
  getTelegramCreds,
  setTelegramCreds,
  clearTelegramCreds,
  type WhatsAppCredentials,
  type TelegramCredentials,
} from './dan-carrier-credentials.js';

export const ROOT_CA_CEREMONY = 'root-ca-install';

export interface RootCASetupInfo {
  ca: {
    fingerprintSha256: string;
    generatedAt: string;
    validUntil: string;
  } | null;
  trustStore: ReturnType<typeof getTrustStoreStatus>;
  consent: {
    answered: boolean;
    decision: ConsentDecision | null;
    answeredAt: string | null;
  };
}

const consentStore = new ConsentStore();

/**
 * Wire the TOFU consent IPC handlers — needs the live queue + policy store
 * passed in (they're owned by startAegisProxy, not module-level singletons).
 * Returns a teardown to remove the handlers when proxy stops.
 */
export function registerTofuConsentHandlers(
  pendingConsent: PendingConsentQueue,
  appsPolicy: AppsPolicyStore
): () => void {
  ipcMain.handle('aegis-proxy:list-pending-consents', (): ConsentRequest[] => {
    return pendingConsent.list();
  });

  ipcMain.handle(
    'aegis-proxy:resolve-pending-consent',
    (
      _e,
      input: {
        pendingId: string;
        decision: 'allow' | 'deny';
        hourly_limit_usd?: number;
        pii_policy?: PiiPolicyChoice;
        dan_carrier?: DanCarrier;
      }
    ): { ok: boolean; error?: string } => {
      if (input.decision === 'allow') {
        const hl = input.hourly_limit_usd ?? 0;
        if (!Number.isFinite(hl) || hl <= 0) {
          return {
            ok: false,
            error:
              'ASD-005: allow decision requires hourly_limit_usd > 0 (no unbounded allow per Vivechana Decision 2).',
          };
        }
      }
      const applied = pendingConsent.resolve(input.pendingId, {
        decision: input.decision,
        hourly_limit_usd: input.hourly_limit_usd,
        pii_policy: input.pii_policy,
        dan_carrier: input.dan_carrier,
      });
      return applied
        ? { ok: true }
        : { ok: false, error: 'pendingId unknown (already resolved or expired)' };
    }
  );

  ipcMain.handle('aegis-proxy:list-app-policies', () => appsPolicy.getAll());

  ipcMain.handle('aegis-proxy:forget-app-policy', (_e, appId: string): { ok: boolean } => {
    return { ok: appsPolicy.forget(appId) };
  });

  return () => {
    ipcMain.removeHandler('aegis-proxy:list-pending-consents');
    ipcMain.removeHandler('aegis-proxy:resolve-pending-consent');
    ipcMain.removeHandler('aegis-proxy:list-app-policies');
    ipcMain.removeHandler('aegis-proxy:forget-app-policy');
  };
}

/**
 * Wire the ConsentDialog → main-process bridge (ASD-T-019). Two operations:
 *   - record-impression: ConsentDialog mounted, user is being shown the
 *     ceremony's purpose/consequences/revocation. PRAMANA-shape record.
 *   - record-decision: user clicked allow/deny/skip on the dialog. Returns
 *     the created record's id so the dialog can attach it to subsequent
 *     business calls (consent_record_id round-trip per FR-21).
 *
 * The store is module-scoped (consentStore) so the renderer can call into
 * a single source of truth. Returns a teardown for symmetry with the other
 * register* helpers, though the audit dir is process-global.
 */
export function registerConsentDialogHandlers(): () => void {
  ipcMain.handle(
    'aegis-proxy:record-consent-impression',
    async (
      _e,
      input: {
        ceremony: string;
        subject: Record<string, unknown>;
        context: { purpose: string; consequences: string; revocation_path: string };
      }
    ): Promise<{ ok: true; consent_record_id: string }> => {
      const rec = await consentStore.record({
        ceremony: input.ceremony,
        decision: 'impression',
        subject: input.subject,
        context: input.context,
      });
      return { ok: true, consent_record_id: rec.consent_record_id };
    }
  );

  ipcMain.handle(
    'aegis-proxy:record-consent-decision',
    async (
      _e,
      input: {
        ceremony: string;
        decision: ConsentDecision;
        subject: Record<string, unknown>;
        context: { purpose: string; consequences: string; revocation_path: string };
        /** If provided, links this decision record back to the impression. */
        impression_consent_record_id?: string;
      }
    ): Promise<{ ok: true; consent_record_id: string }> => {
      const subject = input.impression_consent_record_id
        ? { ...input.subject, impression_consent_record_id: input.impression_consent_record_id }
        : input.subject;
      const rec = await consentStore.record({
        ceremony: input.ceremony,
        decision: input.decision,
        subject,
        context: input.context,
      });
      return { ok: true, consent_record_id: rec.consent_record_id };
    }
  );

  return () => {
    ipcMain.removeHandler('aegis-proxy:record-consent-impression');
    ipcMain.removeHandler('aegis-proxy:record-consent-decision');
  };
}

/**
 * Wire DAN gate IPC for the renderer's DanInbox component (ASD-T-016).
 * Returns a teardown to remove handlers when the proxy stops.
 */
export function registerDanGateHandlers(
  pendingDan: PendingDanQueue,
  danDecisionCache: DanDecisionCache
): () => void {
  ipcMain.handle('aegis-proxy:list-pending-dan', (): DanRequest[] => {
    return pendingDan.list();
  });

  ipcMain.handle(
    'aegis-proxy:resolve-pending-dan',
    (
      _e,
      input: { pendingId: string; decision: 'allow' | 'deny' }
    ): { ok: boolean; error?: string } => {
      if (input.decision !== 'allow' && input.decision !== 'deny') {
        return { ok: false, error: 'decision must be "allow" or "deny"' };
      }
      const ok = pendingDan.resolve(input.pendingId, input.decision);
      return ok
        ? { ok: true }
        : { ok: false, error: 'pendingId unknown (already resolved or expired)' };
    }
  );

  ipcMain.handle(
    'aegis-proxy:forget-dan-cache',
    (_e, appId: string): { ok: boolean; cleared: number } => {
      return { ok: true, cleared: danDecisionCache.forgetApp(appId) };
    }
  );

  return () => {
    ipcMain.removeHandler('aegis-proxy:list-pending-dan');
    ipcMain.removeHandler('aegis-proxy:resolve-pending-dan');
    ipcMain.removeHandler('aegis-proxy:forget-dan-cache');
  };
}

/**
 * Wire DAN timeout config IPC for the Settings page (ASD-T-018).
 * Returns a teardown. Reads + writes pass through the timeout store which
 * clamps to [15s, 120s] per Vivechana Decision 3 — values outside the
 * range are persisted as the clamped value, not rejected.
 */
export function registerDanTimeoutHandlers(store: DanTimeoutStore): () => void {
  ipcMain.handle('aegis-proxy:get-dan-timeout-config', () => ({
    global_ms: store.getGlobal(),
    per_app: store.snapshot().per_app,
    limits: {
      min_ms: DAN_TIMEOUT_MIN_MS,
      max_ms: DAN_TIMEOUT_MAX_MS,
      default_ms: DAN_TIMEOUT_DEFAULT_MS,
    },
  }));

  ipcMain.handle(
    'aegis-proxy:set-dan-timeout-global',
    (_e, ms: number): { ok: boolean; applied_ms: number } => ({
      ok: true,
      applied_ms: store.setGlobal(ms),
    })
  );

  ipcMain.handle(
    'aegis-proxy:set-dan-timeout-override',
    (_e, input: { appId: string; ms: number }): { ok: boolean; applied_ms: number } => ({
      ok: true,
      applied_ms: store.setOverride(input.appId, input.ms),
    })
  );

  ipcMain.handle(
    'aegis-proxy:clear-dan-timeout-override',
    (_e, appId: string): { ok: boolean } => ({
      ok: store.clearOverride(appId),
    })
  );

  return () => {
    ipcMain.removeHandler('aegis-proxy:get-dan-timeout-config');
    ipcMain.removeHandler('aegis-proxy:set-dan-timeout-global');
    ipcMain.removeHandler('aegis-proxy:set-dan-timeout-override');
    ipcMain.removeHandler('aegis-proxy:clear-dan-timeout-override');
  };
}

/**
 * Wire DAN carrier credential management IPC for the Settings page
 * (ASD-T-017). Returns a teardown. Credentials are stored in the OS
 * keychain via dan-carrier-credentials.ts — never echoed back to the
 * renderer for security; status getters only report 'set' / 'unset'.
 */
export function registerDanCarrierCredsHandlers(): () => void {
  ipcMain.handle('aegis-proxy:get-dan-carriers-status', () => ({
    whatsapp: getWhatsAppCreds() ? 'set' : 'unset',
    telegram: getTelegramCreds() ? 'set' : 'unset',
  }));

  ipcMain.handle(
    'aegis-proxy:set-whatsapp-creds',
    (_e, creds: WhatsAppCredentials): { ok: boolean; error?: string } => {
      try {
        setWhatsAppCreds(creds);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  ipcMain.handle('aegis-proxy:clear-whatsapp-creds', (): { ok: boolean } => ({
    ok: clearWhatsAppCreds(),
  }));

  ipcMain.handle(
    'aegis-proxy:set-telegram-creds',
    (_e, creds: TelegramCredentials): { ok: boolean; error?: string } => {
      try {
        setTelegramCreds(creds);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  ipcMain.handle('aegis-proxy:clear-telegram-creds', (): { ok: boolean } => ({
    ok: clearTelegramCreds(),
  }));

  return () => {
    ipcMain.removeHandler('aegis-proxy:get-dan-carriers-status');
    ipcMain.removeHandler('aegis-proxy:set-whatsapp-creds');
    ipcMain.removeHandler('aegis-proxy:clear-whatsapp-creds');
    ipcMain.removeHandler('aegis-proxy:set-telegram-creds');
    ipcMain.removeHandler('aegis-proxy:clear-telegram-creds');
  };
}

/**
 * BudgetPanel summary row, one per known app. ASD-T-020 — combines
 * ledger spend (current-hour + last-24h) with the cap from AppsPolicyStore
 * via BudgetConfigResolver. apps with no ledger activity and no policy
 * decision are skipped (not interesting to the panel).
 */
export interface BudgetSummaryRow {
  appId: string;
  hourly_limit_usd: number | null;
  current_hour_usd: number;
  current_hour_requests: number;
  last_24h_usd: number;
  last_24h_requests: number;
}

/**
 * Wire BudgetPanel IPC (ASD-T-020). Reads the merged AppsPolicy +
 * BudgetLedger + BudgetConfig view; writes cap changes back to both
 * AppsPolicyStore (durable per-app decision) AND BudgetConfigResolver
 * (in-memory live resolver) so the next request honours the new cap
 * without a proxy restart.
 *
 * Cap-change writes validate hourly_limit_usd > 0 per ASD-005 (no
 * unbounded allow); pass null to clear the cap (revert to unlimited).
 */
export function registerBudgetPanelHandlers(
  appsPolicy: AppsPolicyStore,
  budgetLedger: BudgetLedger,
  budgetConfig: BudgetConfigResolver
): () => void {
  ipcMain.handle('aegis-proxy:get-budget-summary', (): BudgetSummaryRow[] => {
    const seen = new Set<string>();
    // Union: every app with a policy OR any ledger activity.
    for (const id of Object.keys(appsPolicy.getAll())) seen.add(id);
    for (const id of budgetLedger.knownAppIds()) seen.add(id);
    const out: BudgetSummaryRow[] = [];
    for (const appId of seen) {
      const cap = budgetConfig.resolve(appId).hourly_limit_usd;
      const hour = budgetLedger.currentHourSpend(appId);
      const day = budgetLedger.recentSpend(appId, 24);
      out.push({
        appId,
        hourly_limit_usd: cap,
        current_hour_usd: hour.cost_usd,
        current_hour_requests: hour.request_count,
        last_24h_usd: day.cost_usd,
        last_24h_requests: day.request_count,
      });
    }
    // Sort: apps over cap first, then by 24h spend descending — surfaces
    // problems near the top of the panel.
    out.sort((a, b) => {
      const aOver = a.hourly_limit_usd != null && a.current_hour_usd >= a.hourly_limit_usd ? 1 : 0;
      const bOver = b.hourly_limit_usd != null && b.current_hour_usd >= b.hourly_limit_usd ? 1 : 0;
      if (aOver !== bOver) return bOver - aOver;
      return b.last_24h_usd - a.last_24h_usd;
    });
    return out;
  });

  ipcMain.handle(
    'aegis-proxy:set-budget-cap',
    (
      _e,
      input: { appId: string; hourly_limit_usd: number | null }
    ): { ok: boolean; applied_usd: number | null; error?: string } => {
      if (input.hourly_limit_usd != null) {
        if (!Number.isFinite(input.hourly_limit_usd) || input.hourly_limit_usd <= 0) {
          return {
            ok: false,
            applied_usd: null,
            error: 'ASD-005: cap must be > 0 (use null to clear; no unbounded allow when set).',
          };
        }
      }
      // Update the live resolver so the NEXT request sees the change.
      budgetConfig.setOverride(input.appId, { hourly_limit_usd: input.hourly_limit_usd });
      // Update durable policy too — but only if the app already has one
      // (BudgetPanel must not synthesise TOFU decisions). If no policy,
      // the resolver-only update is the panel's contribution; next TOFU
      // round will pick up the resolver value as a hint.
      const current = appsPolicy.get(input.appId);
      if (current && current.decision === 'allow' && input.hourly_limit_usd != null) {
        appsPolicy.recordAllow(input.appId, {
          hourly_limit_usd: input.hourly_limit_usd,
          pii_policy: current.pii_policy,
          dan_carrier: current.dan_carrier,
        });
      }
      return { ok: true, applied_usd: input.hourly_limit_usd };
    }
  );

  return () => {
    ipcMain.removeHandler('aegis-proxy:get-budget-summary');
    ipcMain.removeHandler('aegis-proxy:set-budget-cap');
  };
}

/**
 * Wire AEGIS latency IPC (ASD-T-022). The renderer polls this at ~1Hz to
 * render the NFR-1 compliance tile (p50/p95/p99 over the last 1000 gate
 * calls). The handler also exposes `nfr1_pass` = p99 < 50ms as the boolean
 * verdict so the UI can colour the tile green/red without re-computing.
 */
export function registerAegisLatencyHandlers(aegisLatency: LatencyTracker): () => void {
  ipcMain.handle('aegis-proxy:get-aegis-latency-snapshot', () => {
    const snap = aegisLatency.snapshot();
    return {
      ...snap,
      label: aegisLatency.label,
      nfr1_threshold_ms: 50,
      nfr1_pass: snap.sampleCount > 0 ? snap.p99 < 50 : true,
    };
  });

  return () => {
    ipcMain.removeHandler('aegis-proxy:get-aegis-latency-snapshot');
  };
}

/**
 * Wire HanumanG report-card IPC (ASD-T-024 / FR-17). Read-only — the card
 * aggregates EventTallyStore + BudgetLedger + AppsPolicy. Two flavours:
 *  - all: every app with policy / tally / ledger activity in the window,
 *    sorted by overall posture ascending (worst first).
 *  - single: one specified app — used by the report-card detail view.
 */
export function registerReportCardHandlers(stores: {
  tally: EventTallyStore;
  ledger: BudgetLedger;
  appsPolicy: AppsPolicyStore;
}): () => void {
  ipcMain.handle(
    'aegis-proxy:get-report-card-all',
    (_e, input?: { windowDays?: number }): ReportCardRow[] => {
      const windowDays = input?.windowDays ?? 1;
      return buildAllReportCards(stores, { windowDays });
    }
  );

  ipcMain.handle(
    'aegis-proxy:get-report-card-app',
    (_e, input: { appId: string; windowDays?: number }): ReportCardRow => {
      return buildReportCard(input.appId, stores, { windowDays: input.windowDays ?? 1 });
    }
  );

  return () => {
    ipcMain.removeHandler('aegis-proxy:get-report-card-all');
    ipcMain.removeHandler('aegis-proxy:get-report-card-app');
  };
}

/**
 * Wire kill-switch IPC (ASD-T-026 + T-027 / FR-15 / ASD-009).
 * State changes propagate the killswitch.changed event via the bus emitter
 * the caller already owns; this handler set just exposes set/get plus a
 * list-in-flight diagnostic.
 *
 * Pure-getter and pure-setter — IPC handler never awaits per-request work
 * so it can never starve the request hot path (FR-15 "doesn't share the
 * request-processing queue" interpretation; documented in kill-switch.ts).
 */
export function registerKillSwitchHandlers(killSwitch: KillSwitch): () => void {
  ipcMain.handle('aegis-proxy:kill-switch-get', () => ({
    global: killSwitch.globalSnapshot(),
    perApp: killSwitch.snapshotAll(),
  }));

  ipcMain.handle(
    'aegis-proxy:kill-switch-set-app',
    (_e, input: { appId: string; state: KillState }): KillStateSnapshot => {
      return killSwitch.setAppState(input.appId, input.state);
    }
  );

  ipcMain.handle(
    'aegis-proxy:kill-switch-set-global',
    (_e, input: { state: KillState }): { state: KillState; changedAt: string } => {
      killSwitch.setGlobalState(input.state);
      return killSwitch.globalSnapshot();
    }
  );

  ipcMain.handle(
    'aegis-proxy:kill-switch-close-app-in-flight',
    (_e, appId: string): { closed: number } => {
      return { closed: killSwitch.closeInFlightFor(appId) };
    }
  );

  return () => {
    ipcMain.removeHandler('aegis-proxy:kill-switch-get');
    ipcMain.removeHandler('aegis-proxy:kill-switch-set-app');
    ipcMain.removeHandler('aegis-proxy:kill-switch-set-global');
    ipcMain.removeHandler('aegis-proxy:kill-switch-close-app-in-flight');
  };
}

/**
 * Wire audit retention IPC (ASD-T-028 / FR-14). Three operations:
 *   - get: current config + limits + last-digest list
 *   - set: partial config update (retention_days, keep_weekly_digests,
 *     compress_prior_day); applies clamping
 *   - run-now: force a heavy-pass tick (for Settings → "Run digest now")
 */
export function registerAuditRetentionHandlers(
  store: AuditRetentionStore,
  worker: AuditRetentionWorker
): () => void {
  ipcMain.handle('aegis-proxy:audit-retention-get', async () => ({
    config: store.get(),
    limits: {
      retention_days_default: RETENTION_DAYS_DEFAULT,
      retention_days_min: RETENTION_DAYS_MIN,
      retention_days_max: RETENTION_DAYS_MAX,
    },
    digests: await worker.listDigests(),
  }));

  ipcMain.handle(
    'aegis-proxy:audit-retention-set',
    (_e, input: Partial<AuditRetentionConfig>): { ok: boolean; applied: AuditRetentionConfig } => ({
      ok: true,
      applied: store.set(input),
    })
  );

  ipcMain.handle('aegis-proxy:audit-retention-run-now', async () => {
    return await worker.runHeavyPass();
  });

  return () => {
    ipcMain.removeHandler('aegis-proxy:audit-retention-get');
    ipcMain.removeHandler('aegis-proxy:audit-retention-set');
    ipcMain.removeHandler('aegis-proxy:audit-retention-run-now');
  };
}

/**
 * Wire audit-export IPC (ASD-T-029 / FR-20). Two operations:
 *   - pick-output-path: shows Electron save-file dialog, returns chosen path
 *     or null on cancel.
 *   - run: kicks off exportAuditZip(outputPath, range) and returns the
 *     result blob (path + bytes + entry count) for the renderer.
 *
 * Split so the renderer can show a "preparing…" state between dialog
 * dismissal and ZIP completion.
 */
export function registerAuditExportHandlers(): () => void {
  ipcMain.handle(
    'aegis-proxy:audit-export-pick-path',
    async (_e, input?: { defaultName?: string }) => {
      // dialog lives on the same electron default-import already destructured.
      const dialog = (electron as { dialog: typeof import('electron').dialog }).dialog;
      const r = await dialog.showSaveDialog({
        title: 'Export audit archive',
        defaultPath:
          input?.defaultName ?? `ankrshield-audit-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
      });
      return { canceled: r.canceled, path: r.canceled ? null : (r.filePath ?? null) };
    }
  );

  ipcMain.handle(
    'aegis-proxy:audit-export-run',
    async (_e, input: { outputPath: string; range?: ExportRange }) => {
      return await exportAuditZip(input.outputPath, input.range ?? {});
    }
  );

  return () => {
    ipcMain.removeHandler('aegis-proxy:audit-export-pick-path');
    ipcMain.removeHandler('aegis-proxy:audit-export-run');
  };
}

/**
 * Wire 24h-replay IPC (ASD-T-030 / FR-16 P3). Two operations:
 *   - list: time-windowed snapshot of replay-worthy events
 *   - range: oldest..newest timestamps in the buffer (drives the scrubber bounds)
 */
export function registerReplayHandlers(log: RequestLogStore): () => void {
  ipcMain.handle(
    'aegis-proxy:replay-list',
    (_e, input?: { since?: string; until?: string }): ReplayEntry[] => {
      return log.list(input ?? {});
    }
  );

  ipcMain.handle('aegis-proxy:replay-range', () => ({
    ...log.range(),
    size: log.size(),
  }));

  return () => {
    ipcMain.removeHandler('aegis-proxy:replay-list');
    ipcMain.removeHandler('aegis-proxy:replay-range');
  };
}

/**
 * Wire request-audit IPC (ASD-T-031 / FR-13). Two operations:
 *   - stats: per-session write + error counters for a renderer tile
 *   - list:  receipts for a given YYYY-MM-DD (diagnostic; not paged — caller
 *            picks a day, store returns chronological order)
 */
export function registerRequestAuditHandlers(store: RequestAuditStore): () => void {
  ipcMain.handle('aegis-proxy:request-audit-stats', () => store.stats());
  ipcMain.handle(
    'aegis-proxy:request-audit-list',
    (_e, input: { date: string }): Promise<RequestAuditReceipt[]> => store.list(input.date)
  );
  return () => {
    ipcMain.removeHandler('aegis-proxy:request-audit-stats');
    ipcMain.removeHandler('aegis-proxy:request-audit-list');
  };
}

export function registerAegisProxyIpcHandlers(): void {
  ipcMain.handle('aegis-proxy:get-root-ca-setup-info', async (): Promise<RootCASetupInfo> => {
    const caPublic = await readRootCAPublic();
    const ts = getTrustStoreStatus();
    const consent = await consentStore.latestForCeremony(ROOT_CA_CEREMONY);
    return {
      ca: caPublic
        ? {
            fingerprintSha256: caPublic.fingerprintSha256,
            generatedAt: caPublic.generatedAt,
            validUntil: caPublic.validUntil,
          }
        : null,
      trustStore: ts,
      consent: {
        answered: consent !== null,
        decision: consent?.decision ?? null,
        answeredAt: consent?.ts ?? null,
      },
    };
  });

  ipcMain.handle(
    'aegis-proxy:root-ca-consent',
    async (
      _e,
      input: { decision: ConsentDecision }
    ): Promise<{ ok: true; install?: { ok: boolean; error?: string; installedAt?: string } }> => {
      const caPublic = await readRootCAPublic();
      const ts = getTrustStoreStatus();

      // Write the consent record FIRST so it exists even if install fails.
      await consentStore.record({
        ceremony: ROOT_CA_CEREMONY,
        decision: input.decision,
        subject: {
          ca_fingerprint_sha256: caPublic?.fingerprintSha256 ?? null,
          ca_path: '~/.ankrshield/ca.crt',
          trust_store_target: ts.installedAt ?? ts.manualInstallCommand ?? null,
          platform: process.platform,
        },
        context: {
          purpose:
            'Authorise ankrshield-desktop to terminate TLS for HTTPS_PROXY traffic via a per-install root CA. Without this, HTTPS CONNECT through the aegis-proxy is refused (501) and the AgentFeed shows only plain-HTTP requests.',
          consequences:
            'The CA can sign certs for any hostname your tools connect to via the proxy. ankrshield-desktop is the only signer; the key lives in the OS keychain only on this machine.',
          revocation_path:
            ts.manualRevokeCommand ??
            'Uninstall ankrshield-desktop or run the platform-specific revoke command from Settings → CA.',
        },
      });

      if (input.decision !== 'allow') {
        // deny / skip — record only, do not run install.
        return { ok: true };
      }

      const install = await installRootCAToTrustStore();
      return { ok: true, install };
    }
  );
}

export function unregisterAegisProxyIpcHandlers(): void {
  ipcMain.removeHandler('aegis-proxy:get-root-ca-setup-info');
  ipcMain.removeHandler('aegis-proxy:root-ca-consent');
}
