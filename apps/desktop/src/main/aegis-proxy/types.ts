// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — shared types

// Port 4857 chosen 2026-05-18 after R-008 caught collision: 4445 was already
// allocated to ai.vyomoBlackbox in /root/.ankr/config/ports.json. 4857 sits
// next to security.kavachos_tls_proxy (4856) — same intent (TLS-terminating
// agent proxy), different surface (desktop vs cluster).
export const ASD_PROXY_DEFAULT_PORT = 4857;

export const ASD_PROXY_LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'] as const;

export type LoopbackAddress = (typeof ASD_PROXY_LOOPBACK_ADDRESSES)[number];

/**
 * Privacy-engine block check. Returns true to deny the request before any
 * leaf-cert mint or upstream forward. Per ASD-010 / INF-ASD-009 this runs
 * BEFORE the AEGIS path. Failures are caught by the caller and treated as
 * fail-open (allow) so a downed privacy engine doesn't kill LLM traffic;
 * see also feedback in main/index.ts where this is wired to dnsService.
 */
export type IsBlockedFn = (hostname: string) => Promise<boolean>;

export interface AegisProxyConfig {
  bindAddress: string;
  bindPort: number;
  /**
   * Optional privacy-engine block check. If omitted, the proxy treats every
   * host as not-blocked (P1 P0 fallback when privacy engine isn't wired).
   */
  isBlocked?: IsBlockedFn;
}

export interface AegisProxyHandle {
  config: Readonly<AegisProxyConfig>;
  /** Subscribe to live request/response observation events from the proxy. */
  events: import('./event-bus.js').AegisProxyEventBus;
  /** Per-app TOFU policy store (decisions + budget + pii + dan). */
  appsPolicy: import('./apps-policy.js').AppsPolicyStore;
  /** Pending-consent queue for unseen-app first requests. */
  pendingConsent: import('./pending-consent-queue.js').PendingConsentQueue;
  /** Per-app hourly budget ledger (ASD-T-014) — exposed for ASD-T-020 BudgetPanel. */
  budgetLedger: import('./budget-ledger.js').BudgetLedger;
  /** Per-app budget config (cap) resolver (ASD-T-014 / ASD-T-020). */
  budgetConfig: import('./budget-ledger.js').BudgetConfigResolver;
  /** Pending-DAN queue for HIGH-category tool requests (ASD-T-016). */
  pendingDan: import('./pending-dan-queue.js').PendingDanQueue;
  /** Session-scoped DAN decision cache (ASD-T-016). */
  danDecisionCache: import('./dan-decision-cache.js').DanDecisionCache;
  /** DAN timeout config store (ASD-T-018). */
  danTimeoutStore: import('./dan-timeout-config.js').DanTimeoutStore;
  /** AEGIS gate latency tracker — NFR-1 source of truth (ASD-T-022). */
  aegisLatency: import('./latency-tracker.js').LatencyTracker;
  /** Per-app per-day event tally for the HanumanG report card (ASD-T-024). */
  eventTally: import('./event-tally-store.js').EventTallyStore;
  /** Per-app + global PAUSE/THROTTLE/LOCK state machine (ASD-T-026 + T-027). */
  killSwitch: import('./kill-switch.js').KillSwitch;
  /** Audit retention config store (ASD-T-028). */
  auditRetention: import('./audit-retention-config.js').AuditRetentionStore;
  /** Audit retention worker — prune + gzip + weekly digest (ASD-T-028). */
  auditWorker: import('./audit-retention-worker.js').AuditRetentionWorker;
  /** Rolling in-memory event log for /replay UI (ASD-T-030). */
  requestLog: import('./request-log-store.js').RequestLogStore;
  /** Persisted per-request audit receipts (ASD-T-031 / FR-13). */
  requestAudit: import('./request-audit-store.js').RequestAuditStore;
  /** Didactic-mode toggle (ASD-T-033 / FR-18). */
  didacticMode: import('./didactic-mode-store.js').DidacticModeStore;
  /** DAN inbound (reply-to-approve) config store (ASD-T-034). */
  danInbound: import('./dan-inbound-config.js').DanInboundConfigStore;
  /** Telegram getUpdates poller for DAN reply-to-approve (ASD-T-034). */
  tgInboundPoller: import('./dan-inbound-poller.js').TelegramInboundPoller;
  stop(): Promise<void>;
}

// ─── Root CA (ASD-002, ASD-003) ───────────────────────────────────────────────

export const ASD_CA_KEYCHAIN_SERVICE = 'ankrshield-ca';
export const ASD_CA_KEYCHAIN_ACCOUNT = 'root-key';

export interface RootCA {
  /** PEM-encoded X.509 cert. Public. Safe to write to disk. */
  certPem: string;
  /** PEM-encoded private key. SENSITIVE — only ever lives in OS keychain. */
  keyPem: string;
  /** Lowercase hex SHA-256 fingerprint of the DER cert (colon-free). */
  fingerprintSha256: string;
  /** ISO-8601 UTC. */
  generatedAt: string;
  /** ISO-8601 UTC; cert's notAfter. */
  validUntil: string;
}

/** Cert + metadata only; key stays in keychain. Returned by load operations. */
export type RootCAPublic = Omit<RootCA, 'keyPem'>;

// ─── Leaf certs (ASD-T-002b TLS termination) ──────────────────────────────────

export interface LeafCert {
  /** PEM-encoded X.509 cert for one hostname; signed by the install's root CA. */
  certPem: string;
  /** PEM-encoded RSA-2048 private key. Held in-memory only; never persisted. */
  keyPem: string;
  /** The hostname this cert covers (also in SAN). */
  hostname: string;
  /** ISO-8601 UTC; cert's notAfter. Leaf certs are short-lived (default 24h). */
  validUntil: string;
}
