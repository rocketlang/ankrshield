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
  ProviderAdapter,
  ResponseObserver,
  RawRequestSnapshot,
} from './observer-types.js';
export {
  AegisProxyEventBus,
  type AegisProxyEvent,
  type AegisProxyEventListener,
} from './event-bus.js';
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
} from './types.js';
