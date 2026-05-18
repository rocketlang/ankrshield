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
