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
