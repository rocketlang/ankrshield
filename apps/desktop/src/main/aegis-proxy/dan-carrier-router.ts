// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — DAN carrier router (ASD-T-017)
//
// Picks the carrier set per hold based on the app's stored dan_carrier policy.
// Behaviour:
//
//   policy = 'os'         → [OS]
//   policy = 'wa' (set)   → [WA, OS]   (WA primary, OS fallback)
//   policy = 'wa' (unset) → [OS]       (silent fallback when creds missing)
//   policy = 'tg' (set)   → [TG, OS]
//   policy = 'tg' (unset) → [OS]
//
// OS is always fanned out alongside WA/TG so the user can decide on the
// device even if the messaging carrier has a delivery delay. Configurable
// at construction time so tests + future Pro-tier flags can disable the
// OS fallback if desired.
//
// @rule:ASD-008 — DAN gate routes through user-chosen carrier
// @rule:ASD-004 — credentials missing → fall back to OS, never silently drop

import type { DanNotifier } from './pending-dan-queue.js';
import type { DanCarrier as DanCarrierChoice } from './apps-policy.js';
import { OsNotificationDanCarrier } from './dan-carrier-os.js';
import { WhatsAppDanCarrier } from './dan-carrier-wa.js';
import { TelegramDanCarrier } from './dan-carrier-tg.js';
import {
  getWhatsAppCreds,
  getTelegramCreds,
  type WhatsAppCredentials,
  type TelegramCredentials,
} from './dan-carrier-credentials.js';

export interface DanCarrierRouterOptions {
  /** Override OS carrier (default: new OsNotificationDanCarrier()). */
  osCarrier?: DanNotifier;
  /** Override WhatsApp carrier (default: lazy from credentials helper). */
  whatsAppCarrier?: DanNotifier;
  /** Override Telegram carrier (default: lazy from credentials helper). */
  telegramCarrier?: DanNotifier;
  /**
   * Whether to fan-out to OS alongside WA/TG. Defaults to true — a remote
   * notification on a phone you've left in another room should not be the
   * only signal.
   */
  fanOutOsAlongside?: boolean;
  /**
   * Credential probes for fallback decisions. Defaults to keychain readers.
   * Tests can swap in null-returning fns to simulate unconfigured creds.
   */
  hasWhatsAppCreds?: () => boolean;
  hasTelegramCreds?: () => boolean;
}

export class DanCarrierRouter {
  private readonly osCarrier: DanNotifier;
  private readonly whatsAppCarrier: DanNotifier;
  private readonly telegramCarrier: DanNotifier;
  private readonly fanOutOsAlongside: boolean;
  private readonly hasWhatsAppCreds: () => boolean;
  private readonly hasTelegramCreds: () => boolean;

  constructor(opts: DanCarrierRouterOptions = {}) {
    this.osCarrier = opts.osCarrier ?? new OsNotificationDanCarrier();
    this.whatsAppCarrier = opts.whatsAppCarrier ?? new WhatsAppDanCarrier();
    this.telegramCarrier = opts.telegramCarrier ?? new TelegramDanCarrier();
    this.fanOutOsAlongside = opts.fanOutOsAlongside ?? true;
    this.hasWhatsAppCreds = opts.hasWhatsAppCreds ?? defaultHasWhatsApp;
    this.hasTelegramCreds = opts.hasTelegramCreds ?? defaultHasTelegram;
  }

  /**
   * Pick the active carriers for a hold given the app's chosen carrier.
   * Always returns at least one carrier (OS is the floor) unless the OS
   * carrier was explicitly nulled via options — caller is responsible for
   * checking emptiness in that pathological case.
   */
  carriersFor(choice: DanCarrierChoice): DanNotifier[] {
    const out: DanNotifier[] = [];
    if (choice === 'wa') {
      if (this.hasWhatsAppCreds()) out.push(this.whatsAppCarrier);
    } else if (choice === 'tg') {
      if (this.hasTelegramCreds()) out.push(this.telegramCarrier);
    }
    // OS appended last so it remains visible to the user even when remote
    // carriers fire successfully; ordering doesn't affect delivery latency.
    if (choice === 'os' || this.fanOutOsAlongside || out.length === 0) {
      out.push(this.osCarrier);
    }
    return out;
  }
}

function defaultHasWhatsApp(): boolean {
  return isUsable(getWhatsAppCreds());
}

function defaultHasTelegram(): boolean {
  return isUsable(getTelegramCreds());
}

function isUsable<T>(v: T | null): v is T {
  return v !== null;
}

export const __probes = { defaultHasWhatsApp, defaultHasTelegram };
export type { WhatsAppCredentials, TelegramCredentials };
