// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — bind-address validator
//
// @rule:ASD-001 — proxy must bind only to loopback
// @rule:INF-ASD-001 — non-loopback bind → fatal exit(78)

import { ASD_PROXY_LOOPBACK_ADDRESSES, type LoopbackAddress } from './types.js';

export class AegisBindViolation extends Error {
  readonly code = 'ASD-001';
  readonly exitCode = 78;
  constructor(public readonly bindAddress: string) {
    super(
      `ASD-001 violation: aegis-proxy bind_address must be loopback ` +
        `(${ASD_PROXY_LOOPBACK_ADDRESSES.join(' or ')}); got "${bindAddress}". ` +
        `Process will exit with code 78 (EX_CONFIG).`
    );
    this.name = 'AegisBindViolation';
  }
}

export function isLoopbackAddress(addr: string): addr is LoopbackAddress {
  return (ASD_PROXY_LOOPBACK_ADDRESSES as readonly string[]).includes(addr);
}

export function validateBindAddress(addr: string): void {
  if (!isLoopbackAddress(addr)) {
    throw new AegisBindViolation(addr);
  }
}
