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
