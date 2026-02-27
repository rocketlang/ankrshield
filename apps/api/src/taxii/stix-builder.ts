/**
 * STIX 2.1 Bundle Builder
 *
 * Converts an xShield RiskReport into a standards-compliant STIX 2.1 Bundle.
 *
 * STIX 2.1 object types produced:
 *   - bundle           — root container
 *   - identity         — xShield as the producing organisation
 *   - domain-name      — the scanned domain as an indicator
 *   - threat-actor     — generic attribution when risk >= HIGH
 *   - attack-pattern   — MITRE ATT&CK techniques from mitreMapping
 *   - course-of-action — remediation recommendations
 *   - relationship     — links between the objects above
 */

import { randomUUID } from 'crypto';

import type { RiskReport } from '@ankrshield/risk-intelligence';

// ---------------------------------------------------------------------------
// STIX type definitions (minimal subset for STIX 2.1 compliance)
// ---------------------------------------------------------------------------

export interface StixObject {
  type: string;
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixObject[];
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

/** Generate a STIX 2.1 compliant ID: <type>--<uuid4> */
function stixId(type: string): string {
  return `${type}--${randomUUID()}`;
}

/** ISO-8601 timestamp (STIX uses millisecond precision) */
function now(): string {
  return new Date().toISOString().replace(/(\.\d{3})Z$/, '.000Z');
}

// ---------------------------------------------------------------------------
// xShield producer identity (singleton — same ID across all bundles)
// ---------------------------------------------------------------------------

const XSHIELD_IDENTITY_ID = 'identity--a1b2c3d4-0000-4000-8000-xshieldai0001';

function buildIdentity(ts: string): StixObject {
  return {
    type: 'identity',
    spec_version: '2.1',
    id: XSHIELD_IDENTITY_ID,
    created: ts,
    modified: ts,
    name: 'xShield Risk Intelligence',
    identity_class: 'system',
    description:
      'AI-powered cybersecurity platform by ANKR Labs — digital risk intelligence engine.',
    contact_information: 'https://xshieldai.com',
    object_marking_refs: ['marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9'], // TLP:WHITE
  };
}

// ---------------------------------------------------------------------------
// Domain-name indicator
// ---------------------------------------------------------------------------

function buildDomainIndicator(domain: string, riskScore: number, ts: string): StixObject {
  const validFrom = ts;
  // Indicator expires after 90 days
  const validUntil = new Date(Date.now() + 90 * 86400_000)
    .toISOString()
    .replace(/(\.\d{3})Z$/, '.000Z');

  const confidence = Math.min(Math.round(riskScore), 100);

  return {
    type: 'indicator',
    spec_version: '2.1',
    id: stixId('indicator'),
    created: ts,
    modified: ts,
    created_by_ref: XSHIELD_IDENTITY_ID,
    name: `Suspicious domain: ${domain}`,
    description: `Domain flagged by xShield risk engine with score ${riskScore}/100`,
    pattern: `[domain-name:value = '${domain}']`,
    pattern_type: 'stix',
    valid_from: validFrom,
    valid_until: validUntil,
    confidence,
    labels: riskScore >= 75 ? ['malicious-activity'] : ['anomalous-activity'],
    object_marking_refs: ['marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9'],
  };
}

// ---------------------------------------------------------------------------
// Threat actor (generic, for HIGH/CRITICAL risk reports)
// ---------------------------------------------------------------------------

function buildThreatActor(domain: string, riskLevel: string, ts: string): StixObject {
  return {
    type: 'threat-actor',
    spec_version: '2.1',
    id: stixId('threat-actor'),
    created: ts,
    modified: ts,
    created_by_ref: XSHIELD_IDENTITY_ID,
    name: `Unknown threat actor targeting ${domain}`,
    description: `Threat actor inferred from ${riskLevel} risk indicators detected by xShield on domain ${domain}`,
    threat_actor_types: ['criminal'],
    sophistication: riskLevel === 'critical' ? 'advanced' : 'intermediate',
    resource_level: 'individual',
    primary_motivation: 'financial-gain',
    labels: ['threat-actor'],
  };
}

// ---------------------------------------------------------------------------
// Attack patterns from MITRE ATT&CK mappings
// ---------------------------------------------------------------------------

interface MitreMapping {
  techniqueId: string;
  techniqueName: string;
  tacticId: string;
  tacticName: string;
  confidence: string;
  source: string;
}

function buildAttackPatterns(mitreMappings: MitreMapping[], ts: string): StixObject[] {
  const seen = new Set<string>();
  return mitreMappings
    .filter((m) => {
      if (seen.has(m.techniqueId)) return false;
      seen.add(m.techniqueId);
      return true;
    })
    .map((m) => ({
      type: 'attack-pattern',
      spec_version: '2.1',
      id: stixId('attack-pattern'),
      created: ts,
      modified: ts,
      created_by_ref: XSHIELD_IDENTITY_ID,
      name: m.techniqueName,
      description: `MITRE ATT&CK technique ${m.techniqueId} — tactic: ${m.tacticName}`,
      external_references: [
        {
          source_name: 'mitre-attack',
          external_id: m.techniqueId,
          url: `https://attack.mitre.org/techniques/${m.techniqueId.replace('.', '/')}`,
        },
      ],
      kill_chain_phases: [
        {
          kill_chain_name: 'mitre-attack',
          phase_name: m.tacticName.toLowerCase().replace(/\s+/g, '-'),
        },
      ],
    }));
}

// ---------------------------------------------------------------------------
// Course of action from remediation recommendations
// ---------------------------------------------------------------------------

function buildCoursesOfAction(recommendations: string[], ts: string): StixObject[] {
  return recommendations.slice(0, 10).map((rec, idx) => ({
    type: 'course-of-action',
    spec_version: '2.1',
    id: stixId('course-of-action'),
    created: ts,
    modified: ts,
    created_by_ref: XSHIELD_IDENTITY_ID,
    name: `Remediation ${idx + 1}`,
    description: rec,
  }));
}

// ---------------------------------------------------------------------------
// Relationship builder
// ---------------------------------------------------------------------------

function buildRelationship(
  sourceRef: string,
  relationshipType: string,
  targetRef: string,
  ts: string
): StixObject {
  return {
    type: 'relationship',
    spec_version: '2.1',
    id: stixId('relationship'),
    created: ts,
    modified: ts,
    created_by_ref: XSHIELD_IDENTITY_ID,
    relationship_type: relationshipType,
    source_ref: sourceRef,
    target_ref: targetRef,
  };
}

// ---------------------------------------------------------------------------
// Main bundle builder
// ---------------------------------------------------------------------------

/**
 * Build a STIX 2.1 Bundle from a RiskReport.
 *
 * The bundle contains:
 *   - xShield identity
 *   - domain-name indicator
 *   - threat-actor (if HIGH or CRITICAL)
 *   - attack-patterns (one per unique MITRE technique)
 *   - courses-of-action (from recommendations)
 *   - relationship objects linking everything
 */
export function buildStixBundle(
  report: RiskReport & {
    mitreMapping?: MitreMapping[];
    recommendations?: string[];
  }
): StixBundle {
  const ts = now();
  const objects: StixObject[] = [];

  // 1. Producer identity
  const identity = buildIdentity(ts);
  objects.push(identity);

  // 2. Domain indicator
  const indicator = buildDomainIndicator(report.domain, report.riskScore, ts);
  objects.push(indicator);

  // 3. Threat actor (only for HIGH / CRITICAL)
  let threatActor: StixObject | null = null;
  if (report.riskLevel === 'high' || report.riskLevel === 'critical') {
    threatActor = buildThreatActor(report.domain, report.riskLevel, ts);
    objects.push(threatActor);
    // relationship: threat-actor --targets--> indicator
    objects.push(buildRelationship(threatActor.id, 'targets', indicator.id, ts));
  }

  // 4. Attack patterns from MITRE mappings
  const mitreMappings = report.mitreMapping ?? [];
  const attackPatterns = buildAttackPatterns(mitreMappings as MitreMapping[], ts);
  for (const ap of attackPatterns) {
    objects.push(ap);
    // relationship: indicator --indicates--> attack-pattern
    objects.push(buildRelationship(indicator.id, 'indicates', ap.id, ts));
    // If we have a threat actor, also link it to the attack pattern
    if (threatActor) {
      objects.push(buildRelationship(threatActor.id, 'uses', ap.id, ts));
    }
  }

  // 5. Courses of action from recommendations
  const recommendations = report.recommendations ?? [];
  const coursesOfAction = buildCoursesOfAction(recommendations, ts);
  for (const coa of coursesOfAction) {
    objects.push(coa);
    // relationship: course-of-action --mitigates--> indicator
    objects.push(buildRelationship(coa.id, 'mitigates', indicator.id, ts));
  }

  return {
    type: 'bundle',
    id: `bundle--${randomUUID()}`,
    objects,
  };
}
