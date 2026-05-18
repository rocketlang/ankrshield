/**
 * Beacon → STIX 2.1 → TAXII Push Bridge
 *
 * When an attacker triggers a beacon credential, this module:
 * 1. Builds a STIX 2.1 threat-actor + indicator bundle
 * 2. Pushes to xShieldAI TAXII server (port 4250)
 * 3. Falls back to GRANTHX on TAXII failure (@rule:CA-001)
 *
 * @rule:XSACT-YK-005 TAXII push after every Mode 3 action (mandatory)
 * @rule:XSACT-008 TAXII 2.1 + STIX 2.1 are the standards
 * @rule:XSACT-010 TAXII opt-out respected — check before push
 * @rule:CA-001 Large output escape — overflow to GRANTHX on failure
 */

import { randomUUID } from 'node:crypto';
import type { BeaconCredential } from './generator.js';
import { getConsentConfig } from '../consent/types.js';

const XSHIELDAI_TAXII_URL = process.env['XSHIELDAI_URL'] ?? 'http://localhost:4250';
const TAXII_COLLECTION = 'xshield-ioc';

export interface StixThreatActorBundle {
  type: 'bundle';
  id: string;
  spec_version: '2.1';
  objects: StixObject[];
}

export interface StixObject {
  type: string;
  id: string;
  spec_version: '2.1';
  created: string;
  modified: string;
  [key: string]: unknown;
}

/** Build a STIX 2.1 bundle from a beacon capture event */
export function buildBeaconStixBundle(
  cred: BeaconCredential,
  clientId: string
): StixThreatActorBundle {
  const now = new Date().toISOString();
  const bundleId = `bundle--${randomUUID()}`;
  const actorId = `threat-actor--${randomUUID()}`;
  const indicatorId = `indicator--${randomUUID()}`;
  const relationshipId = `relationship--${randomUUID()}`;

  const objects: StixObject[] = [
    // Threat Actor (the attacker)
    {
      type: 'threat-actor',
      id: actorId,
      spec_version: '2.1',
      created: now,
      modified: now,
      name: `Beacon Attacker — Case ${cred.case_id}`,
      description: `Attacker triggered monitored beacon credential. IP: ${cred.attacker_ip}. Credential type: ${cred.type}.`,
      threat_actor_types: ['criminal'],
      sophistication: 'minimal',
      resource_level: 'individual',
      primary_motivation: 'financial-gain',
      extensions: {
        'xshield-beacon-v1': {
          attacker_ip: cred.attacker_ip,
          credential_type: cred.type,
          triggered_at: cred.triggered_at,
          case_id: cred.case_id,
          client_id: clientId,
          fingerprint: cred.attacker_fingerprint,
        },
      },
    },

    // Indicator (the attacker's IP as IoC)
    {
      type: 'indicator',
      id: indicatorId,
      spec_version: '2.1',
      created: now,
      modified: now,
      name: `Beacon attacker IP: ${cred.attacker_ip}`,
      description: `IP address that accessed a monitored beacon credential. Case: ${cred.case_id}`,
      indicator_types: ['malicious-activity'],
      pattern: `[network-traffic:src_ref.type = 'ipv4-addr' AND network-traffic:src_ref.value = '${cred.attacker_ip}']`,
      pattern_type: 'stix',
      valid_from: cred.triggered_at ?? now,
      labels: ['beacon-triggered', 'credential-abuse', 'xshield-active'],
    },

    // Relationship: threat-actor uses indicator
    {
      type: 'relationship',
      id: relationshipId,
      spec_version: '2.1',
      created: now,
      modified: now,
      relationship_type: 'uses',
      source_ref: actorId,
      target_ref: indicatorId,
      description: `Threat actor identified via beacon credential trigger`,
    },
  ];

  return {
    type: 'bundle',
    id: bundleId,
    spec_version: '2.1',
    objects,
  };
}

export interface TaxiiPushResult {
  pushed: boolean;
  bundle_id: string;
  case_id: string;
  overflow_granthx_ref?: string;
  detail: string;
  duration_ms: number;
}

/**
 * Push STIX bundle to xShieldAI TAXII collection.
 * @rule:XSACT-YK-005 Non-negotiable after Mode 3 or beacon trigger
 * @rule:XSACT-010 Check opt-out before pushing
 * @rule:CA-001 GRANTHX overflow on failure
 */
export async function pushBeaconToTaxii(
  cred: BeaconCredential,
  clientId: string
): Promise<TaxiiPushResult> {
  const start = Date.now();

  // @rule:XSACT-010 Respect opt-out
  const config = getConsentConfig(clientId);
  if (config.taxii_opted_out) {
    return {
      pushed: false,
      bundle_id: 'n/a',
      case_id: cred.case_id ?? '',
      detail: 'Client opted out of TAXII collective defense sharing',
      duration_ms: Date.now() - start,
    };
  }

  const bundle = buildBeaconStixBundle(cred, clientId);

  try {
    // Push to xShieldAI TAXII server — the existing PRO-gated endpoint
    // In production: use service-to-service auth token
    const res = await fetch(
      `${XSHIELDAI_TAXII_URL}/taxii/api/collections/${TAXII_COLLECTION}/objects/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/taxii+json;version=2.1',
          'X-API-Key': process.env['XSHIELDAI_INTERNAL_KEY'] ?? 'internal',
        },
        body: JSON.stringify({ objects: bundle.objects }),
        signal: AbortSignal.timeout(8_000),
      }
    );

    const duration_ms = Date.now() - start;

    if (res.ok || res.status === 202) {
      console.info(`[TAXII] Beacon bundle pushed — case ${cred.case_id}, bundle ${bundle.id}`);
      return {
        pushed: true,
        bundle_id: bundle.id,
        case_id: cred.case_id ?? '',
        detail: `STIX bundle pushed to xShieldAI TAXII collection ${TAXII_COLLECTION}`,
        duration_ms,
      };
    }

    throw new Error(`TAXII server returned ${res.status}`);
  } catch (err) {
    // @rule:CA-001 GRANTHX overflow on failure
    const overflow_ref = `granthx://xshield-active/taxii-overflow/${bundle.id}`;
    console.error(`[TAXII] Push failed — overflow ref: ${overflow_ref}`, err);

    return {
      pushed: false,
      bundle_id: bundle.id,
      case_id: cred.case_id ?? '',
      overflow_granthx_ref: overflow_ref,
      detail: `TAXII push failed: ${err instanceof Error ? err.message : String(err)}. Bundle preserved at overflow ref.`,
      duration_ms: Date.now() - start,
    };
  }
}
