// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — public entry point
//
// @rule:ASD-006 — privacy engine and agentic safeguard share the main process
//   This module exports a startProxy() that the main index.ts wires into
//   app.whenReady() alongside the existing privacy-engine subsystems.

export { startAegisProxy } from './server.js';
export { validateBindAddress, isLoopbackAddress, AegisBindViolation } from './bind-validator.js';
export {
  ASD_PROXY_DEFAULT_PORT,
  ASD_PROXY_LOOPBACK_ADDRESSES,
  type AegisProxyConfig,
  type AegisProxyHandle,
  type LoopbackAddress,
} from './types.js';
