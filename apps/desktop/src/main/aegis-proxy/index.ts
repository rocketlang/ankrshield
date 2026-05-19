// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — public entry point
//
// @rule:ASD-006 — privacy engine and agentic safeguard share the main process
//   This module exports a startProxy() that the main index.ts wires into
//   app.whenReady() alongside the existing privacy-engine subsystems.

export { startAegisProxy } from './server.js';
export { validateBindAddress, isLoopbackAddress, AegisBindViolation } from './bind-validator.js';
export { generateRootCA, type GenerateRootCAOptions } from './ca-generator.js';
export {
  mintLeafCert,
  LeafCertCache,
  type MintLeafCertOptions,
  type LeafCertCacheOptions,
} from './leaf-cert.js';
export { anthropicAdapter } from './observer-anthropic.js';
export { openaiAdapter } from './observer-openai.js';
export { pickAdapter, ALL_ADAPTERS } from './observer-dispatcher.js';
export type {
  Provider,
  ObservedRequest,
  ObservedResponse,
  ParsedRequest,
  ProviderAdapter,
  ResponseObserver,
  RawRequestSnapshot,
} from './observer-types.js';
export {
  resolveAppId,
  normaliseAppId,
  parseLinuxSsOutput,
  parseMacLsofOutput,
  parseWindowsNetstatForPid,
  parseWindowsTasklistOutput,
  type AppIdentity,
  type ResolveAppIdOptions,
} from './app-identifier.js';
export { AppsStore, type AppRecord, type AppsMap, type AppsStoreOptions } from './apps-store.js';
export {
  AegisProxyEventBus,
  type AegisProxyEvent,
  type AegisProxyEventListener,
} from './event-bus.js';
export { attachAegisProxyToRenderer, AEGIS_PROXY_IPC_CHANNEL } from './renderer-bridge.js';
export {
  installRootCAToTrustStore,
  getTrustStoreStatus,
  LINUX_TRUST_STORE_PATH,
  type TrustStoreInstallResult,
  type TrustStoreStatus,
} from './ca-truststore.js';
export {
  ConsentStore,
  type ConsentRecord,
  type ConsentDecision,
  type ConsentStoreOptions,
} from './consent-store.js';
export {
  registerAegisProxyIpcHandlers,
  unregisterAegisProxyIpcHandlers,
  registerTofuConsentHandlers,
  ROOT_CA_CEREMONY,
  type RootCASetupInfo,
} from './ipc-handlers.js';
export {
  AppsPolicyStore,
  type AppPolicy,
  type PolicyMap,
  type Decision,
  type PiiPolicyChoice,
  type DanCarrier,
} from './apps-policy.js';
export {
  PendingConsentQueue,
  type ConsentRequest,
  type ConsentInput,
  type ConsentOutcome,
} from './pending-consent-queue.js';
export {
  categorizeTool,
  categorizeHighRiskTools,
  extractToolDeclarations,
  HIGH_CATEGORIES,
  type DanCategory,
  type ToolDeclaration,
  type CategorizedTool,
} from './dan-categorizer.js';
export {
  PendingDanQueue,
  type DanRequest,
  type DanOutcome,
  type DanNotifier,
  type PendingDanQueueOptions,
} from './pending-dan-queue.js';
export { OsNotificationDanCarrier, type OsNotificationCarrierOptions } from './dan-carrier-os.js';
export { WhatsAppDanCarrier, type WhatsAppDanCarrierOptions } from './dan-carrier-wa.js';
export { TelegramDanCarrier, type TelegramDanCarrierOptions } from './dan-carrier-tg.js';
export { DanCarrierRouter, type DanCarrierRouterOptions } from './dan-carrier-router.js';
export {
  getWhatsAppCreds,
  setWhatsAppCreds,
  clearWhatsAppCreds,
  getTelegramCreds,
  setTelegramCreds,
  clearTelegramCreds,
  type WhatsAppCredentials,
  type TelegramCredentials,
} from './dan-carrier-credentials.js';
export {
  DanDecisionCache,
  type CachedDanDecision,
  type DanDecisionCacheOptions,
} from './dan-decision-cache.js';
export {
  registerDanGateHandlers,
  registerDanCarrierCredsHandlers,
  registerDanTimeoutHandlers,
  registerConsentDialogHandlers,
  registerBudgetPanelHandlers,
  registerAegisLatencyHandlers,
  registerReportCardHandlers,
  registerKillSwitchHandlers,
  registerAuditRetentionHandlers,
  registerAuditExportHandlers,
  registerReplayHandlers,
  registerRequestAuditHandlers,
  registerDidacticModeHandlers,
  type BudgetSummaryRow,
} from './ipc-handlers.js';
export {
  RequestLogStore,
  type ReplayEntry,
  type RequestLogStoreOptions,
} from './request-log-store.js';
export {
  RequestAuditStore,
  type RequestAuditReceipt,
  type RequestAuditStoreOptions,
} from './request-audit-store.js';
export {
  DidacticModeStore,
  type DidacticState,
  type DidacticModeStoreOptions,
} from './didactic-mode-store.js';
export {
  RULES_CATALOG,
  RULE_IDS,
  getRule,
  rulesByLayer,
  type RuleExplanation,
} from './rules-catalog.js';
export {
  exportAuditZip,
  type ExportRange,
  type ExportOptions,
  type ExportResult,
} from './audit-export.js';
export { ZipWriter, crc32, toDosTime, type ZipEntry, type ZipWriterOptions } from './zip-writer.js';
export {
  AuditRetentionStore,
  RETENTION_DAYS_DEFAULT,
  RETENTION_DAYS_MIN,
  RETENTION_DAYS_MAX,
  type AuditRetentionConfig,
  type AuditRetentionStoreOptions,
} from './audit-retention-config.js';
export {
  AuditRetentionWorker,
  isoWeekKey,
  type AuditRetentionWorkerOptions,
  type RetentionStats,
} from './audit-retention-worker.js';
export {
  KillSwitch,
  type KillState,
  type KillStateSnapshot,
  type KillSwitchOptions,
  type InFlightSocket,
  type ThrottleConfig,
} from './kill-switch.js';
export {
  EventTallyStore,
  type DayBucket,
  type AppDayMap,
  type EventTallyStoreOptions,
} from './event-tally-store.js';
export {
  scorePosture,
  type AxisKey,
  type AxisScore,
  type PostureScore,
  type PostureScoreInputs,
} from './hanumang-mandate-vendored.js';
export {
  buildReportCard,
  buildAllReportCards,
  type ReportCardRow,
  type BuildReportCardOptions,
} from './report-card.js';
export {
  LatencyTracker,
  nowMs,
  type LatencyStatsSnapshot,
  type LatencyTrackerOptions,
} from './latency-tracker.js';
export {
  BudgetLedger,
  BudgetConfigResolver,
  hourBucket,
  type AppHourSpend,
  type BudgetConfig,
  type LedgerMap,
} from './budget-ledger.js';
export { StreamingPiiRedactor, type StreamingPiiRedactorOptions } from './pii-stream-redactor.js';
export {
  PassThroughStreamRewriter,
  AnthropicStreamRewriter,
  OpenAIStreamRewriter,
  makeStreamRewriter,
  type StreamRewriter,
} from './pii-stream-rewriter.js';
export {
  DanTimeoutStore,
  DAN_TIMEOUT_DEFAULT_MS,
  DAN_TIMEOUT_MIN_MS,
  DAN_TIMEOUT_MAX_MS,
  type DanTimeoutConfigShape,
  type DanTimeoutStoreOptions,
} from './dan-timeout-config.js';
export {
  ensureRootCA,
  readRootCAPublic,
  deleteRootCA,
  type EnsureRootCAResult,
} from './ca-store.js';
export {
  ASD_PROXY_DEFAULT_PORT,
  ASD_PROXY_LOOPBACK_ADDRESSES,
  ASD_CA_KEYCHAIN_SERVICE,
  ASD_CA_KEYCHAIN_ACCOUNT,
  type AegisProxyConfig,
  type AegisProxyHandle,
  type LoopbackAddress,
  type RootCA,
  type RootCAPublic,
  type LeafCert,
  type IsBlockedFn,
} from './types.js';
