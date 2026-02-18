/**
 * @ankrshield/ai-warrior — Incident Reporter
 *
 * Aggregates all attack chains, honeypot triggers, generated policies,
 * and quarantined agents for a given time period and produces a structured
 * IncidentReport with LLM-generated executive and technical summaries.
 */

import { randomUUID } from 'node:crypto';
import type {
  AttackChain,
  IncidentReport,
  ReporterInput,
  TimelineEntry,
} from '../types';
import type { WarriorLLMClient } from '../llm/client';
import {
  EXECUTIVE_SUMMARY_SYSTEM_PROMPT,
  TECHNICAL_ANALYSIS_SYSTEM_PROMPT,
  buildExecutiveSummaryPrompt,
  buildTechnicalAnalysisPrompt,
} from '../llm/prompts';

export class IncidentReporter {
  constructor(private llm: WarriorLLMClient) {}

  async generate(input: ReporterInput): Promise<IncidentReport> {
    const riskScore = this.calculateRiskScore(input.attackChains);
    const topThreats = this.extractTopThreats(input.attackChains);
    const timeline = this.buildTimeline(input);
    const recommendations = this.buildRecommendations(input);

    const maxScore = Math.max(0, ...input.attackChains.map((c) => c.threatScore));

    // Generate summaries in parallel
    const [executiveSummary, technicalAnalysis] = await Promise.all([
      this.generateExecutiveSummary(input, maxScore, topThreats),
      this.generateTechnicalAnalysis(input),
    ]);

    return {
      id: `rpt_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      generatedAt: new Date(),
      period: input.period,
      riskScore,
      executiveSummary,
      technicalAnalysis,
      attackChains: input.attackChains,
      honeypotTriggers: input.honeypotTriggers,
      policiesGenerated: input.policiesGenerated,
      quarantinedAgents: input.quarantinedAgents,
      topThreats,
      recommendations,
      timeline,
      totalEventsAnalyzed: input.totalEventsAnalyzed,
      totalAlertsGenerated: input.attackChains.length + input.honeypotTriggers.length,
    };
  }

  // ─── Risk Score ────────────────────────────────────────────────────────────

  private calculateRiskScore(chains: AttackChain[]): number {
    if (chains.length === 0) return 0;

    // Weighted average: 70% max score + 30% frequency penalty
    const maxScore = Math.max(...chains.map((c) => c.threatScore));
    const frequencyPenalty = Math.min(30, chains.length * 3);
    return Math.min(100, Math.round(maxScore * 0.7 + frequencyPenalty));
  }

  // ─── Top Threats ───────────────────────────────────────────────────────────

  private extractTopThreats(chains: AttackChain[]): string[] {
    const counts = new Map<string, number>();

    for (const c of chains) {
      counts.set(c.attackType, (counts.get(c.attackType) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => `${type.replace(/_/g, ' ')} (${count}×)`);
  }

  // ─── Timeline ──────────────────────────────────────────────────────────────

  private buildTimeline(input: ReporterInput): TimelineEntry[] {
    const entries: TimelineEntry[] = [];

    for (const chain of input.attackChains) {
      entries.push({
        timestamp: chain.detectedAt,
        severity: this.scoreToSeverity(chain.threatScore),
        event: `${chain.attackType.replace(/_/g, ' ')} detected (score ${chain.threatScore})`,
        agentName: chain.events.find((e) => e.agentName)?.agentName,
        resource: chain.affectedAssets[0],
      });
    }

    for (const hp of input.honeypotTriggers) {
      if (hp.triggeredAt) {
        entries.push({
          timestamp: hp.triggeredAt,
          severity: 'critical',
          event: `Honeypot triggered: ${hp.name}`,
          agentName: hp.triggeredAgentId,
          resource: hp.path,
        });
      }
    }

    for (const q of input.quarantinedAgents) {
      entries.push({
        timestamp: q.quarantinedAt,
        severity: 'high',
        event: `Agent quarantined: ${q.agentName}`,
        agentName: q.agentName,
      });
    }

    return entries.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  // ─── Recommendations ───────────────────────────────────────────────────────

  private buildRecommendations(input: ReporterInput): string[] {
    const recs: string[] = [];

    if (input.honeypotTriggers.length > 0) {
      recs.push(
        `${input.honeypotTriggers.length} honeypot(s) triggered — at least one agent has demonstrated malicious intent. Audit all AI tools currently installed.`,
      );
    }

    if (input.quarantinedAgents.length > 0) {
      recs.push(
        `${input.quarantinedAgents.length} agent(s) quarantined — review quarantine reasons and consider uninstalling offending tools.`,
      );
    }

    const credentialThefts = input.attackChains.filter(
      (c) => c.attackType === 'credential_theft',
    );
    if (credentialThefts.length > 0) {
      recs.push(
        'Credential theft detected — rotate all API keys, passwords, and SSH keys immediately.',
      );
    }

    const exfiltrations = input.attackChains.filter(
      (c) => c.attackType === 'data_exfiltration',
    );
    if (exfiltrations.length > 0) {
      recs.push(
        `Data exfiltration detected (${exfiltrations.length} chains) — identify what was uploaded and notify affected parties if PII was involved.`,
      );
    }

    if (input.policiesGenerated.filter((p) => p.requiresApproval).length > 0) {
      recs.push(
        `${input.policiesGenerated.filter((p) => p.requiresApproval).length} auto-generated polic${input.policiesGenerated.filter((p) => p.requiresApproval).length === 1 ? 'y requires' : 'ies require'} your approval — review and apply them in the ankrshield dashboard.`,
      );
    }

    if (recs.length === 0) {
      recs.push('No critical actions required. Continue monitoring.');
    }

    return recs;
  }

  // ─── LLM Summaries ─────────────────────────────────────────────────────────

  private async generateExecutiveSummary(
    input: ReporterInput,
    maxScore: number,
    topThreats: string[],
  ): Promise<string> {
    if (input.attackChains.length === 0) {
      return 'No threats were detected during this period. Your AI tools behaved within normal parameters.';
    }

    const prompt = buildExecutiveSummaryPrompt(
      input.period,
      input.attackChains.length,
      maxScore,
      topThreats,
      input.policiesGenerated.length,
      input.quarantinedAgents.length,
    );

    const msg = await this.llm.complete(EXECUTIVE_SUMMARY_SYSTEM_PROMPT, prompt);
    return msg.content.trim() || 'Summary unavailable — see technical analysis.';
  }

  private async generateTechnicalAnalysis(input: ReporterInput): Promise<string> {
    if (input.attackChains.length === 0) {
      return 'No attack chains detected during this reporting period.';
    }

    const msg = await this.llm.complete(
      TECHNICAL_ANALYSIS_SYSTEM_PROMPT,
      buildTechnicalAnalysisPrompt(input.attackChains, input.honeypotTriggers.length),
    );
    return msg.content.trim() || 'Technical analysis unavailable.';
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private scoreToSeverity(score: number): TimelineEntry['severity'] {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'warning';
    if (score >= 20) return 'low';
    return 'info';
  }
}
