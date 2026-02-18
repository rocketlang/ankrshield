/**
 * @ankrshield/ai-warrior — Main Orchestrator
 *
 * The AIWarrior ingests ThreatEvents from all sources (AI agents, network monitor,
 * file system hooks, etc.), correlates them into attack chains, narrates them via LLM,
 * generates and optionally applies policies, manages honeypots, quarantines rogue agents,
 * and produces periodic incident reports.
 *
 * Usage:
 *   const warrior = new AIWarrior({ anthropicApiKey: process.env.ANTHROPIC_API_KEY });
 *   await warrior.start();
 *   warrior.on('attack-detected', (chain) => console.log(chain.narrative));
 *   warrior.ingest(event); // feed events from any source
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AIActivity } from '@ankrshield/ai-governance';
import { WarriorLLMClient } from './llm/client';
import { AttackCorrelator } from './analysis/correlator';
import { ThreatNarrator } from './analysis/narrator';
import { AutoPolicyGenerator } from './analysis/policy-gen';
import { HoneypotManager } from './defense/honeypot';
import { AgentQuarantine } from './defense/quarantine';
import { ScopeEnforcer } from './defense/scope-enforcer';
import type { AgentScopeContract, BuiltinPresetId, ScopeViolation } from './defense/scope-enforcer';
import { IncidentReporter } from './reporting/incident';
import type {
  AttackChain,
  GeneratedPolicy,
  HoneypotAsset,
  IncidentReport,
  QuarantinedAgent,
  ResolvedWarriorConfig,
  ThreatEvent,
  ThreatSource,
  WarriorConfig,
  WarriorStatus,
} from './types';

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULTS: Omit<ResolvedWarriorConfig, 'anthropicApiKey'> = {
  model: 'claude-sonnet-4-6',
  correlationWindowMs: 5 * 60_000,   // 5 minutes
  minEventsForChain: 2,
  threatScoreThreshold: 55,
  autoApplyPolicies: false,
  autoQuarantineScore: 88,
  enableHoneypots: true,
  honeypotDirectory: undefined as unknown as string, // resolved at runtime
  honeypotPollIntervalMs: 30_000,
  reportIntervalMs: 24 * 60 * 60_000, // 24 hours
  maxEventBufferSize: 10_000,
};

// ─── Typed EventEmitter Declaration ───────────────────────────────────────────

export declare interface AIWarrior {
  on(event: 'attack-detected', listener: (chain: AttackChain) => void): this;
  on(event: 'policy-generated', listener: (policy: GeneratedPolicy) => void): this;
  on(event: 'honeypot-triggered', listener: (asset: HoneypotAsset) => void): this;
  on(event: 'incident-report', listener: (report: IncidentReport) => void): this;
  on(event: 'agent-quarantined', listener: (quarantined: QuarantinedAgent) => void): this;
  on(event: 'scope-violation', listener: (violation: ScopeViolation) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;

  emit(event: 'attack-detected', chain: AttackChain): boolean;
  emit(event: 'policy-generated', policy: GeneratedPolicy): boolean;
  emit(event: 'honeypot-triggered', asset: HoneypotAsset): boolean;
  emit(event: 'incident-report', report: IncidentReport): boolean;
  emit(event: 'agent-quarantined', quarantined: QuarantinedAgent): boolean;
  emit(event: 'scope-violation', violation: ScopeViolation): boolean;
  emit(event: 'error', err: Error): boolean;
}

// ─── AIWarrior ────────────────────────────────────────────────────────────────

export class AIWarrior extends EventEmitter {
  private config: ResolvedWarriorConfig;

  // Sub-systems
  private llm: WarriorLLMClient;
  private correlator: AttackCorrelator;
  private narrator: ThreatNarrator;
  private policyGen: AutoPolicyGenerator;
  private honeypots: HoneypotManager;
  private quarantine: AgentQuarantine;
  private scopeEnforcer: ScopeEnforcer;
  private reporter: IncidentReporter;

  // State
  private eventBuffer: ThreatEvent[] = [];
  private attackChains: AttackChain[] = [];
  private generatedPolicies: GeneratedPolicy[] = [];

  private correlationTimer?: NodeJS.Timeout;
  private reportTimer?: NodeJS.Timeout;
  private startTime: Date = new Date();
  private eventsIngested = 0;
  private lastReportAt?: Date;
  private running = false;

  // Prevent concurrent correlation runs
  private correlationRunning = false;

  constructor(config: WarriorConfig) {
    super();

    this.config = {
      ...DEFAULTS,
      ...config,
    } as ResolvedWarriorConfig;

    this.llm = new WarriorLLMClient(
      config.anthropicApiKey,
      this.config.model,
    );

    this.correlator = new AttackCorrelator();
    this.narrator = new ThreatNarrator(this.llm);
    this.policyGen = new AutoPolicyGenerator(this.llm);
    this.honeypots = new HoneypotManager(
      this.config.honeypotDirectory || undefined,
      this.config.honeypotPollIntervalMs,
    );
    this.quarantine = new AgentQuarantine();
    this.scopeEnforcer = new ScopeEnforcer();
    this.reporter = new IncidentReporter(this.llm);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startTime = new Date();

    // Deploy honeypots
    if (this.config.enableHoneypots) {
      try {
        await this.honeypots.deploy();
        this.honeypots.on('triggered', (asset) => {
          void this.handleHoneypotTrigger(asset);
        });
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }

    // Correlation loop — runs at 1/5 of the window
    const correlationInterval = Math.max(
      10_000,
      Math.floor(this.config.correlationWindowMs / 5),
    );
    this.correlationTimer = setInterval(() => {
      void this.runCorrelation();
    }, correlationInterval);

    // Periodic reports
    this.reportTimer = setInterval(() => {
      void this.generateReport();
    }, this.config.reportIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.correlationTimer) clearInterval(this.correlationTimer);
    if (this.reportTimer) clearInterval(this.reportTimer);
    if (this.config.enableHoneypots) {
      await this.honeypots.teardown();
    }
  }

  // ─── Event Ingestion ───────────────────────────────────────────────────────

  /**
   * Primary ingestion point. Call this from any event source
   * (AIAgentMonitor, NetworkMonitor, file system hooks, DNS logger, etc.)
   */
  ingest(event: ThreatEvent): void {
    this.eventsIngested++;

    // ── 1. Honeypot intercept ────────────────────────────────────────────────
    if (this.config.enableHoneypots && event.source === 'file-system') {
      if (this.honeypots.isHoneypot(event.resource)) {
        this.honeypots.registerTrigger(event.resource, event.agentId);
        return; // honeypot handler fires the chain
      }
    }

    // ── 2. Scope enforcement ─────────────────────────────────────────────────
    // Check if the agent's action violates its declared scope contract.
    // In-scope actions pass through with zero overhead.
    if (event.agentId && this.scopeEnforcer.hasContract(event.agentId)) {
      const violation = this.scopeEnforcer.evaluate(event);

      if (violation) {
        this.emit('scope-violation', violation);

        // Escalate: convert violation into an elevated ThreatEvent so the
        // correlator can build chains from repeated scope breaches.
        const escalated: ThreatEvent = {
          ...event,
          severity: violation.severity,
          metadata: {
            ...event.metadata,
            scopeViolationType: violation.violationType,
            scopeViolationId: violation.id,
            declaredScope: violation.declaredScope,
          },
        };

        // If the contract says BLOCK or QUARANTINE, mark event blocked
        if (violation.actionTaken === 'BLOCKED' || violation.actionTaken === 'QUARANTINED') {
          escalated.isBlocked = true;
          escalated.blockReason = `Scope violation: ${violation.violationType} — ${violation.declaredScope}`;
        }

        // If contract says QUARANTINE, trigger immediately
        if (violation.actionTaken === 'QUARANTINED') {
          const syntheticChain = this.buildScopeChain(violation, escalated);
          this.attackChains.push(syntheticChain);
          this.emit('attack-detected', syntheticChain);
          const quarantined = this.quarantine.quarantine(event.agentId, syntheticChain);
          this.emit('agent-quarantined', quarantined);
        }

        this.eventBuffer.push(escalated);
      } else {
        // In-scope — normal ingestion
        this.eventBuffer.push(event);
      }
    } else {
      // No contract — normal ingestion
      this.eventBuffer.push(event);
    }

    // ── 3. Bound buffer ──────────────────────────────────────────────────────
    if (this.eventBuffer.length > this.config.maxEventBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.config.maxEventBufferSize);
    }

    // ── 4. Immediate correlation on critical ─────────────────────────────────
    if (event.severity === 'critical' && !this.correlationRunning) {
      void this.runCorrelation();
    }
  }

  /**
   * Convenience adapter: converts an AIActivity from @ankrshield/ai-governance
   * into a ThreatEvent and ingests it.
   */
  ingestAIActivity(activity: AIActivity, agentName = 'Unknown AI Agent'): void {
    this.ingest(AIWarrior.fromAIActivity(activity, agentName));
  }

  // ─── Correlation Loop ──────────────────────────────────────────────────────

  private async runCorrelation(): Promise<void> {
    if (this.correlationRunning) return;
    this.correlationRunning = true;

    try {
      const windowStart = Date.now() - this.config.correlationWindowMs;
      const recentEvents = this.eventBuffer.filter(
        (e) => e.timestamp.getTime() >= windowStart,
      );

      if (recentEvents.length < this.config.minEventsForChain) return;

      // Group by agent
      const byAgent = groupBy(recentEvents, (e) => e.agentId ?? '__global__');

      for (const [agentId, events] of byAgent) {
        if (events.length < this.config.minEventsForChain) continue;

        // Skip already-quarantined agents (they can't generate new chains
        // until released, to avoid alert flooding)
        if (this.quarantine.isQuarantined(agentId)) continue;

        const chain = this.correlator.analyze(agentId, events);
        if (!chain) continue;
        if (chain.threatScore < this.config.threatScoreThreshold) continue;

        // Check we haven't already processed an identical chain
        if (this.isDuplicate(chain)) continue;

        // Narrate via LLM (enriches chain in place)
        await this.narrator.narrate(chain);

        this.attackChains.push(chain);
        this.emit('attack-detected', chain);

        // Auto-generate policy
        const policy = await this.policyGen.generate(
          chain,
          this.config.autoApplyPolicies,
        );
        if (policy) {
          this.generatedPolicies.push(policy);
          this.emit('policy-generated', policy);
        }

        // Auto-quarantine on very high scores
        if (
          chain.threatScore >= this.config.autoQuarantineScore &&
          agentId !== '__global__'
        ) {
          const quarantined = this.quarantine.quarantine(agentId, chain);
          chain.autoActionsApplied.push(`Agent quarantined: ${agentId}`);
          this.emit('agent-quarantined', quarantined);
        }
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.correlationRunning = false;
    }
  }

  // ─── Honeypot Handler ─────────────────────────────────────────────────────

  private async handleHoneypotTrigger(asset: HoneypotAsset): Promise<void> {
    this.emit('honeypot-triggered', asset);

    const syntheticEvent: ThreatEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      source: 'honeypot',
      severity: 'critical',
      agentId: asset.triggeredAgentId,
      action: 'HONEYPOT_TRIGGERED',
      resource: asset.path,
      metadata: { honeypotType: asset.type, honeypotName: asset.name },
      isBlocked: true,
      blockReason: 'Honeypot asset — access indicates malicious intent',
    };

    const chain: AttackChain = {
      id: randomUUID(),
      detectedAt: new Date(),
      startTime: syntheticEvent.timestamp,
      endTime: syntheticEvent.timestamp,
      events: [syntheticEvent],
      attackType: 'honeypot_triggered',
      threatScore: 96,
      narrative:
        `An AI agent accessed a honeypot decoy file (${asset.name}). ` +
        `This strongly indicates the agent was actively scanning for sensitive credentials. ` +
        `No legitimate operation requires accessing this file.`,
      technicalSummary:
        `Honeypot file ${asset.path} (type: ${asset.type}) was accessed. ` +
        `Agent ID: ${asset.triggeredAgentId ?? 'unknown'}. ` +
        `This is a high-confidence indicator of malicious intent or rogue AI behaviour.`,
      affectedAssets: [asset.path],
      suggestedActions: [
        'Quarantine the offending agent immediately',
        'Review all recent file and network activity',
        'Rotate credentials matching the honeypot type',
        'Generate a full incident report',
      ],
      autoActionsApplied: [],
    };

    // Narrate for richer context
    await this.narrator.narrate(chain);

    this.attackChains.push(chain);
    this.emit('attack-detected', chain);

    // Always quarantine on honeypot trigger
    if (asset.triggeredAgentId) {
      const quarantined = this.quarantine.quarantine(asset.triggeredAgentId, chain);
      chain.autoActionsApplied.push(`Agent quarantined: ${asset.triggeredAgentId}`);
      this.emit('agent-quarantined', quarantined);
    }

    // Generate policy
    const policy = await this.policyGen.generate(chain, false);
    if (policy) {
      this.generatedPolicies.push(policy);
      this.emit('policy-generated', policy);
    }
  }

  // ─── Incident Report ───────────────────────────────────────────────────────

  async generateReport(period?: { start: Date; end: Date }): Promise<IncidentReport> {
    const reportPeriod = period ?? { start: this.startTime, end: new Date() };

    const chainsInPeriod = this.attackChains.filter(
      (c) =>
        c.detectedAt >= reportPeriod.start && c.detectedAt <= reportPeriod.end,
    );

    const report = await this.reporter.generate({
      period: reportPeriod,
      attackChains: chainsInPeriod,
      honeypotTriggers: this.honeypots.getTriggeredAssets(),
      policiesGenerated: this.generatedPolicies,
      quarantinedAgents: this.quarantine.getAll(),
      totalEventsAnalyzed: this.eventsIngested,
    });

    this.lastReportAt = new Date();
    this.emit('incident-report', report);
    return report;
  }

  // ─── Status & Accessors ────────────────────────────────────────────────────

  getStatus(): WarriorStatus {
    return {
      isRunning: this.running,
      eventsIngested: this.eventsIngested,
      attackChainsDetected: this.attackChains.length,
      policiesGenerated: this.generatedPolicies.length,
      honeypotTriggers: this.honeypots.getTriggeredAssets().length,
      quarantinedAgents: this.quarantine.getActive().length,
      scopeViolations: this.scopeEnforcer.getTotalViolationCount(),
      lastReportAt: this.lastReportAt,
      uptimeMs: Date.now() - this.startTime.getTime(),
    };
  }

  // ─── Scope Chain Builder ───────────────────────────────────────────────────

  private buildScopeChain(violation: ScopeViolation, event: ThreatEvent): AttackChain {
    return {
      id: randomUUID(),
      detectedAt: new Date(),
      startTime: event.timestamp,
      endTime: event.timestamp,
      events: [event],
      attackType: 'privilege_escalation',
      threatScore: 85,
      narrative:
        `${violation.agentName} (running inside ${violation.parentApp}) ` +
        `violated its declared scope by accessing: ${violation.resource}. ` +
        `This agent was authorized for a specific purpose and attempted to go beyond it.`,
      technicalSummary:
        `Scope contract violation — Type: ${violation.violationType} | ` +
        `Resource: ${violation.resource} | Declared scope: ${violation.declaredScope} | ` +
        `Contract action: QUARANTINE triggered.`,
      affectedAssets: [violation.resource],
      suggestedActions: [
        `Review why ${violation.agentName} accessed ${violation.resource}`,
        `Check if the parent app (${violation.parentApp}) has been compromised`,
        `Consider downgrading the agent's permissions permanently`,
      ],
      autoActionsApplied: [`Agent quarantined: ${violation.agentId}`],
    };
  }

  getAttackChains(): AttackChain[] {
    return [...this.attackChains];
  }

  getGeneratedPolicies(): GeneratedPolicy[] {
    return [...this.generatedPolicies];
  }

  getQuarantinedAgents(): QuarantinedAgent[] {
    return this.quarantine.getAll();
  }

  getHoneypots(): HoneypotAsset[] {
    return this.honeypots.getAll();
  }

  releaseAgent(agentId: string): boolean {
    return this.quarantine.release(agentId);
  }

  // ─── Scope Enforcement API ─────────────────────────────────────────────────

  /**
   * Register a custom scope contract for an AI agent.
   * Call this when you discover a new agent or when the user configures scopes.
   */
  registerScopeContract(contract: AgentScopeContract): void {
    this.scopeEnforcer.registerContract(contract);
  }

  /**
   * Register a built-in preset for a known AI agent (Copilot, Cursor, etc.).
   * Optionally override fields like workspaceRoot or violationAction.
   *
   * Example:
   *   warrior.registerPreset('copilot-1', 'GitHub Copilot', 'github-copilot', {
   *     workspaceRoot: '/home/user/my-project',
   *     violationAction: 'BLOCK',
   *   });
   */
  registerPreset(
    agentId: string,
    agentName: string,
    presetId: BuiltinPresetId,
    overrides?: Partial<AgentScopeContract>,
  ): void {
    this.scopeEnforcer.registerPreset(agentId, agentName, presetId, overrides);
  }

  getScopeViolations(agentId?: string): ScopeViolation[] {
    return this.scopeEnforcer.getViolations(agentId);
  }

  /** Direct access to the ScopeEnforcer for advanced configuration. */
  get scope(): ScopeEnforcer {
    return this.scopeEnforcer;
  }

  /**
   * Access to the honeypot manager for registering custom decoys.
   */
  get honeypotManager(): HoneypotManager {
    return this.honeypots;
  }

  /** Returns all currently quarantined (active) agents. */
  getActiveQuarantinedAgents(): QuarantinedAgent[] {
    return this.quarantine.getActive();
  }

  /**
   * Mark a generated policy as manually applied (clears pending-approval status).
   * Returns true if the policy was found and updated.
   */
  applyPolicy(policyId: string): boolean {
    const policy = this.generatedPolicies.find((p) => p.id === policyId);
    if (!policy) return false;
    policy.autoApplied = true;
    policy.requiresApproval = false;
    return true;
  }

  // ─── Static Adapters ───────────────────────────────────────────────────────

  /**
   * Convert an AIActivity (from @ankrshield/ai-governance) into a ThreatEvent.
   */
  static fromAIActivity(activity: AIActivity, agentName: string): ThreatEvent {
    return {
      id: randomUUID(),
      timestamp: activity.timestamp,
      source: activityTypeToSource(activity.type),
      severity: activityToSeverity(activity),
      agentId: activity.agentId,
      agentName,
      action: activity.type.toUpperCase(),
      resource: activity.details,
      metadata: {},
      isBlocked: false,
    };
  }

  // ─── Duplicate Detection ───────────────────────────────────────────────────

  private isDuplicate(chain: AttackChain): boolean {
    // Simple dedup: if we have a recent chain from the same agent
    // with the same attack type in the last 10 minutes, skip
    const cutoff = Date.now() - 10 * 60_000;
    const agentId = chain.events[0]?.agentId;

    return this.attackChains.some(
      (existing) =>
        existing.events[0]?.agentId === agentId &&
        existing.attackType === chain.attackType &&
        existing.detectedAt.getTime() > cutoff,
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBy<T>(
  arr: T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const group = map.get(k);
    if (group) {
      group.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}

function activityTypeToSource(
  type: AIActivity['type'],
): ThreatSource {
  switch (type) {
    case 'file': return 'file-system';
    case 'network': return 'network';
    case 'clipboard': return 'clipboard';
    default: return 'ai-agent';
  }
}

function activityToSeverity(
  activity: AIActivity,
): ThreatEvent['severity'] {
  // Heuristic: sensitive keywords in details → higher severity
  if (/\.env|\.pem|\.key|wallet|password|secret|api.?key/i.test(activity.details)) {
    return 'high';
  }
  if (activity.type === 'clipboard') return 'warning';
  if (activity.type === 'network') return 'low';
  return 'info';
}
