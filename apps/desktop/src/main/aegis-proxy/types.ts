// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — shared types

// Port 4857 chosen 2026-05-18 after R-008 caught collision: 4445 was already
// allocated to ai.vyomoBlackbox in /root/.ankr/config/ports.json. 4857 sits
// next to security.kavachos_tls_proxy (4856) — same intent (TLS-terminating
// agent proxy), different surface (desktop vs cluster).
export const ASD_PROXY_DEFAULT_PORT = 4857;

export const ASD_PROXY_LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'] as const;

export type LoopbackAddress = (typeof ASD_PROXY_LOOPBACK_ADDRESSES)[number];

export interface AegisProxyConfig {
  bindAddress: string;
  bindPort: number;
}

export interface AegisProxyHandle {
  config: Readonly<AegisProxyConfig>;
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
