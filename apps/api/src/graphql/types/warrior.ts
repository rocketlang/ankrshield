/**
 * AI Warrior GraphQL Types
 *
 * All in-memory domain types from @ankrshield/ai-warrior exposed via GraphQL.
 * These are NOT Prisma models — they live entirely in process memory.
 */

import { builder } from '../builder';
import type {
  ThreatEvent,
  AttackChain,
  GeneratedPolicy,
  GeneratedPolicyRule,
  HoneypotAsset,
  QuarantinedAgent,
  IncidentReport,
  TimelineEntry,
  ScopeViolation,
  WarriorStatus,
} from '@ankrshield/ai-warrior';

// ─── Enums ────────────────────────────────────────────────────────────────────

builder.enumType('ThreatSeverity', {
  values: ['info', 'low', 'warning', 'high', 'critical'] as const,
});

builder.enumType('ThreatSource', {
  values: ['ai-agent', 'network', 'file-system', 'clipboard', 'dns', 'process', 'honeypot'] as const,
});

builder.enumType('AttackType', {
  values: [
    'data_exfiltration',
    'credential_theft',
    'lateral_movement',
    'ransomware',
    'surveillance',
    'supply_chain_compromise',
    'privilege_escalation',
    'honeypot_triggered',
    'unknown',
  ] as const,
});

builder.enumType('PolicyRuleType', {
  values: [
    'deny_file_path',
    'deny_domain',
    'deny_file_type',
    'cap_upload_bytes',
    'require_confirmation',
    'quarantine_agent',
    'block_clipboard',
  ] as const,
});

builder.enumType('HoneypotType', {
  values: ['file', 'directory', 'api-key', 'wallet', 'credential'] as const,
});

builder.enumType('ScopeViolationType', {
  values: [
    'file_out_of_scope',
    'file_explicitly_denied',
    'domain_not_allowed',
    'upload_size_exceeded',
    'clipboard_not_permitted',
    'screenshot_not_permitted',
    'after_hours_access',
    'off_day_access',
  ] as const,
});

builder.enumType('ScopeViolationAction', {
  values: ['ALERT', 'BLOCK', 'QUARANTINE'] as const,
});

// ─── ThreatEvent ──────────────────────────────────────────────────────────────

builder.objectRef<ThreatEvent>('ThreatEvent').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    timestamp: t.expose('timestamp', { type: 'DateTime' }),
    source: t.expose('source', { type: 'ThreatSource' }),
    severity: t.expose('severity', { type: 'ThreatSeverity' }),
    agentId: t.exposeString('agentId', { nullable: true }),
    agentName: t.exposeString('agentName', { nullable: true }),
    action: t.exposeString('action'),
    resource: t.exposeString('resource'),
    byteCount: t.exposeInt('byteCount', { nullable: true }),
    isBlocked: t.exposeBoolean('isBlocked'),
    blockReason: t.exposeString('blockReason', { nullable: true }),
  }),
});

// ─── AttackChain ─────────────────────────────────────────────────────────────

builder.objectRef<AttackChain>('AttackChain').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    detectedAt: t.expose('detectedAt', { type: 'DateTime' }),
    startTime: t.expose('startTime', { type: 'DateTime' }),
    endTime: t.expose('endTime', { type: 'DateTime' }),
    attackType: t.expose('attackType', { type: 'AttackType' }),
    threatScore: t.exposeFloat('threatScore'),
    narrative: t.exposeString('narrative'),
    technicalSummary: t.exposeString('technicalSummary'),
    affectedAssets: t.exposeStringList('affectedAssets'),
    suggestedActions: t.exposeStringList('suggestedActions'),
    autoActionsApplied: t.exposeStringList('autoActionsApplied'),
    events: t.field({
      type: ['ThreatEvent'],
      resolve: (chain) => chain.events,
    }),
  }),
});

// ─── GeneratedPolicyRule ──────────────────────────────────────────────────────

builder.objectRef<GeneratedPolicyRule>('GeneratedPolicyRule').implement({
  fields: (t) => ({
    type: t.expose('type', { type: 'PolicyRuleType' }),
    value: t.exposeString('value'),
    reason: t.exposeString('reason'),
  }),
});

// ─── GeneratedPolicy ─────────────────────────────────────────────────────────

builder.objectRef<GeneratedPolicy>('GeneratedPolicy').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description'),
    triggeredBy: t.exposeString('triggeredBy'),
    confidence: t.exposeFloat('confidence'),
    autoApplied: t.exposeBoolean('autoApplied'),
    requiresApproval: t.exposeBoolean('requiresApproval'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    rules: t.field({
      type: ['GeneratedPolicyRule'],
      resolve: (policy) => policy.rules,
    }),
  }),
});

// ─── HoneypotAsset ────────────────────────────────────────────────────────────

builder.objectRef<HoneypotAsset>('HoneypotAsset').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    type: t.expose('type', { type: 'HoneypotType' }),
    path: t.exposeString('path'),
    name: t.exposeString('name'),
    triggered: t.exposeBoolean('triggered'),
    triggeredAt: t.expose('triggeredAt', { type: 'DateTime', nullable: true }),
    triggeredAgentId: t.exposeString('triggeredAgentId', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

// ─── QuarantinedAgent ────────────────────────────────────────────────────────

builder.objectRef<QuarantinedAgent>('QuarantinedAgent').implement({
  fields: (t) => ({
    agentId: t.exposeString('agentId'),
    agentName: t.exposeString('agentName'),
    quarantinedAt: t.expose('quarantinedAt', { type: 'DateTime' }),
    reason: t.exposeString('reason'),
    attackChainId: t.exposeString('attackChainId'),
    isActive: t.exposeBoolean('isActive'),
  }),
});

// ─── ScopeViolation ──────────────────────────────────────────────────────────

builder.objectRef<ScopeViolation>('WarriorScopeViolation').implement({
  fields: (t) => ({
    agentId: t.exposeString('agentId'),
    agentName: t.exposeString('agentName'),
    violationType: t.expose('violationType', { type: 'ScopeViolationType' }),
    action: t.expose('action', { type: 'ScopeViolationAction' }),
    resource: t.exposeString('resource'),
    reason: t.exposeString('reason'),
    timestamp: t.expose('timestamp', { type: 'DateTime' }),
  }),
});

// ─── TimelineEntry ────────────────────────────────────────────────────────────

builder.objectRef<TimelineEntry>('TimelineEntry').implement({
  fields: (t) => ({
    timestamp: t.expose('timestamp', { type: 'DateTime' }),
    severity: t.expose('severity', { type: 'ThreatSeverity' }),
    event: t.exposeString('event'),
    agentName: t.exposeString('agentName', { nullable: true }),
    resource: t.exposeString('resource', { nullable: true }),
  }),
});

// ─── IncidentReport ───────────────────────────────────────────────────────────

builder.objectRef<IncidentReport>('IncidentReport').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    generatedAt: t.expose('generatedAt', { type: 'DateTime' }),
    riskScore: t.exposeFloat('riskScore'),
    executiveSummary: t.exposeString('executiveSummary'),
    technicalAnalysis: t.exposeString('technicalAnalysis'),
    topThreats: t.exposeStringList('topThreats'),
    recommendations: t.exposeStringList('recommendations'),
    totalEventsAnalyzed: t.exposeInt('totalEventsAnalyzed'),
    totalAlertsGenerated: t.exposeInt('totalAlertsGenerated'),
    attackChains: t.field({
      type: ['AttackChain'],
      resolve: (r) => r.attackChains,
    }),
    honeypotTriggers: t.field({
      type: ['HoneypotAsset'],
      resolve: (r) => r.honeypotTriggers,
    }),
    policiesGenerated: t.field({
      type: ['GeneratedPolicy'],
      resolve: (r) => r.policiesGenerated,
    }),
    quarantinedAgents: t.field({
      type: ['QuarantinedAgent'],
      resolve: (r) => r.quarantinedAgents,
    }),
    timeline: t.field({
      type: ['TimelineEntry'],
      resolve: (r) => r.timeline,
    }),
  }),
});

// ─── WarriorStatus ────────────────────────────────────────────────────────────

builder.objectRef<WarriorStatus>('WarriorStatus').implement({
  fields: (t) => ({
    isRunning: t.exposeBoolean('isRunning'),
    eventsIngested: t.exposeInt('eventsIngested'),
    attackChainsDetected: t.exposeInt('attackChainsDetected'),
    policiesGenerated: t.exposeInt('policiesGenerated'),
    honeypotTriggers: t.exposeInt('honeypotTriggers'),
    quarantinedAgents: t.exposeInt('quarantinedAgents'),
    scopeViolations: t.exposeInt('scopeViolations'),
    lastReportAt: t.expose('lastReportAt', { type: 'DateTime', nullable: true }),
    uptimeMs: t.exposeFloat('uptimeMs'),
  }),
});

// ─── WarriorEvent (for polling/subscription) ──────────────────────────────────

interface WarriorEventRecord {
  type: string;
  at: Date;
}

builder.objectRef<WarriorEventRecord>('WarriorEvent').implement({
  fields: (t) => ({
    type: t.exposeString('type'),
    at: t.expose('at', { type: 'DateTime' }),
  }),
});
