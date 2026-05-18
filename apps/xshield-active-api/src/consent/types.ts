/**
 * Consent Engine Types
 * @rule:XSACT-002 Three consent modes
 * @rule:XSACT-003 Mode 3 always-on
 */

export type ConsentMode = 'mode_1' | 'mode_2' | 'mode_3';
export type SiemType = 'splunk' | 'sentinel' | 'generic';
export type ActionType =
  | 'dmca'
  | 'abuse_report'
  | 'google_safe_browsing'
  | 'cloudflare_report'
  | 'exec_notify'
  | 'iam_reset'
  | 'dns_change'
  | 'internal_alert'
  | 'siem_playbook';

export interface StandingOrder {
  action_type: ActionType;
  trigger_on: string; // e.g. "rogue_domain_found", "credential_leak"
  execution_path: 'option_a' | 'option_b';
  enabled: boolean;
}

export interface ExecutiveContact {
  name: string;
  role: string; // e.g. "CEO", "CISO"
  whatsapp?: string;
  email: string;
}

export interface SiemWebhook {
  type: SiemType;
  endpoint: string; // HEC URL, Sentinel workspace URL, etc.
  token_hash: string; // SHA-256 of token — never stored plain
  enabled: boolean;
}

/** @rule:XSACT-002 Full client consent configuration */
export interface ClientConsentConfig {
  client_id: string;
  mode: ConsentMode;

  // @rule:XSACT-011 Addendum gate
  addendum_signed: boolean;
  addendum_signed_at?: string;
  addendum_signed_by?: string; // email of signatory

  // @rule:XSACT-003 Cannot be false — enforced at write time
  mode_3_always_on: true;

  // Mode 2 standing orders
  standing_orders: StandingOrder[];

  // Option B SIEM config
  siem_webhook: SiemWebhook | null;

  // Mode 3 / Option A notify targets
  executive_contacts: ExecutiveContact[];

  // Jurisdiction for Art.14 auto-inject
  // @rule:INF-XSACT-005
  jurisdiction: 'eu' | 'uk' | 'us' | 'india' | 'other';

  // @rule:XSACT-010 TAXII opt-out default
  taxii_opted_out: boolean;

  created_at: string;
  updated_at: string;
}

/** File-backed store — survives restarts. @see persistence/file-store.ts */
import { FileBackedMap } from '../persistence/file-store.js';
export const consentStore = new FileBackedMap<ClientConsentConfig>('consent-config');

export function getConsentConfig(clientId: string): ClientConsentConfig {
  if (consentStore.has(clientId)) return consentStore.get(clientId)!;

  // @rule:XSACT-002 default config
  // @rule:XSACT-010 taxii_opted_out defaults to false (opt-out participation = on by default)
  const defaults: ClientConsentConfig = {
    client_id: clientId,
    mode: 'mode_1',
    addendum_signed: false,
    mode_3_always_on: true,
    standing_orders: [],
    siem_webhook: null,
    executive_contacts: [],
    jurisdiction: 'other',
    taxii_opted_out: false, // @rule:XSACT-010 — participates by default
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  consentStore.set(clientId, defaults);
  return defaults;
}

/** @rule:XSACT-011 Feature gate — blocks beacon/Mode3/TAXII if addendum not signed */
export function isAddendumSigned(clientId: string): boolean {
  return getConsentConfig(clientId).addendum_signed;
}

/** @rule:XSACT-003 Mode 3 always-on — cannot be overridden */
export function isMode3Active(_clientId: string): true {
  return true;
}
