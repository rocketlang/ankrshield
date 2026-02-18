/**
 * @ankrshield/ai-warrior
 *
 * LLM-powered threat intelligence engine for ankrshield.
 *
 * Key exports:
 *   AIWarrior          — main orchestrator (start → ingest → listen)
 *   ThreatEvent        — primitive event type (ingested from all sources)
 *   AttackChain        — correlated event group with LLM narrative
 *   HoneypotManager    — deploy/manage decoy files
 *   AgentQuarantine    — track quarantined AI agents
 *   IncidentReporter   — generate structured incident reports
 */

/**
 * @ankrshield/ai-warrior
 *
 * LLM-powered threat intelligence engine for ankrshield.
 *
 * Key exports:
 *   AIWarrior          — main orchestrator (start → ingest → listen)
 *   ScopeEnforcer      — enforce per-agent capability contracts
 *   ThreatEvent        — primitive event type (ingested from all sources)
 *   AttackChain        — correlated event group with LLM narrative
 *   ScopeViolation     — out-of-scope access by an internal/embedded AI agent
 *   HoneypotManager    — deploy/manage decoy files
 *   AgentQuarantine    — track quarantined AI agents
 *   IncidentReporter   — generate structured incident reports
 */

export { AIWarrior } from './warrior';
export { AttackCorrelator } from './analysis/correlator';
export { ThreatNarrator } from './analysis/narrator';
export { AutoPolicyGenerator } from './analysis/policy-gen';
export { HoneypotManager } from './defense/honeypot';
export { AgentQuarantine } from './defense/quarantine';
export { ScopeEnforcer } from './defense/scope-enforcer';
export { IncidentReporter } from './reporting/incident';
export { WarriorLLMClient } from './llm/client';

export type {
  ThreatEvent,
  ThreatSeverity,
  ThreatSource,
  AttackChain,
  AttackType,
  GeneratedPolicy,
  GeneratedPolicyRule,
  PolicyRuleType,
  HoneypotAsset,
  HoneypotType,
  QuarantinedAgent,
  IncidentReport,
  TimelineEntry,
  WarriorConfig,
  WarriorStatus,
  NarrationResult,
  PolicySuggestion,
  ReporterInput,
  // Scope types
  AgentScopeContract,
  ScopeViolation,
  ScopeViolationType,
  ScopeViolationAction,
  BuiltinPresetId,
} from './types';
