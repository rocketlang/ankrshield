/**
 * @ankrshield/ai-warrior — Auto Policy Generator
 *
 * Given an AttackChain, generates a set of targeted block rules via LLM.
 * Falls back to heuristic rules if LLM is unavailable.
 */

import { randomUUID } from 'node:crypto';
import type { AttackChain, GeneratedPolicy, GeneratedPolicyRule, PolicySuggestion } from '../types';
import type { WarriorLLMClient } from '../llm/client';
import { POLICY_SYSTEM_PROMPT, buildPolicyPrompt } from '../llm/prompts';

export class AutoPolicyGenerator {
  constructor(private llm: WarriorLLMClient) {}

  /**
   * Generate a policy for an attack chain.
   * Returns null if no rules could be generated.
   */
  async generate(chain: AttackChain, autoApply = false): Promise<GeneratedPolicy | null> {
    if (chain.events.length === 0) return null;

    // Try LLM-generated policy first
    const suggestion = await this.llm.completeJSON<PolicySuggestion>(
      POLICY_SYSTEM_PROMPT,
      buildPolicyPrompt(chain),
      this.buildFallbackSuggestion(chain)
    );

    const rules = this.validateRules(suggestion.rules);
    if (rules.length === 0) return null;

    return {
      id: randomUUID(),
      name: suggestion.name || this.defaultPolicyName(chain),
      description: suggestion.description || `Auto-generated policy for ${chain.attackType} attack`,
      triggeredBy: chain.id,
      rules,
      confidence: Math.min(100, Math.max(0, suggestion.confidence ?? 60)),
      autoApplied: autoApply && !suggestion.requiresApproval,
      requiresApproval: suggestion.requiresApproval ?? true,
      createdAt: new Date(),
    };
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  private validateRules(rules: GeneratedPolicyRule[]): GeneratedPolicyRule[] {
    const validTypes = new Set<string>([
      'deny_file_path',
      'deny_domain',
      'deny_file_type',
      'cap_upload_bytes',
      'require_confirmation',
      'quarantine_agent',
      'block_clipboard',
    ]);

    return (rules ?? [])
      .filter((r) => r && validTypes.has(r.type) && r.value && r.reason)
      .slice(0, 5); // cap at 5 rules
  }

  // ─── Heuristic Fallback ───────────────────────────────────────────────────────
  // Used when LLM is unavailable or returns bad JSON.

  private buildFallbackSuggestion(chain: AttackChain): PolicySuggestion {
    const rules: GeneratedPolicyRule[] = [];

    // Block domains that were accessed
    const uploadedDomains = chain.events
      .filter((e) => e.action === 'NETWORK_UPLOAD')
      .map((e) => {
        try {
          return new URL(e.resource.startsWith('http') ? e.resource : `https://${e.resource}`)
            .hostname;
        } catch {
          return e.resource;
        }
      })
      .filter(Boolean);

    for (const domain of [...new Set(uploadedDomains)].slice(0, 3)) {
      rules.push({
        type: 'deny_domain',
        value: domain,
        reason: `Agent uploaded data to ${domain} during ${chain.attackType} attack`,
      });
    }

    // Block sensitive file paths that were accessed
    const sensitiveFiles = chain.events
      .filter(
        (e) =>
          e.action === 'FILE_READ' && /\.env|\.pem|\.key|password|secret|api.?key/i.test(e.resource)
      )
      .map((e) => e.resource)
      .slice(0, 2);

    for (const fp of sensitiveFiles) {
      rules.push({
        type: 'deny_file_path',
        value: fp,
        reason: `Sensitive file accessed during ${chain.attackType} attack`,
      });
    }

    // Quarantine on honeypot trigger or very high score
    if (chain.attackType === 'honeypot_triggered' || chain.threatScore >= 90) {
      rules.push({
        type: 'quarantine_agent',
        value: chain.events.find((e) => e.agentId)?.agentId ?? 'unknown',
        reason: `Agent triggered honeypot or reached critical threat score (${chain.threatScore})`,
      });
    }

    return {
      name: this.defaultPolicyName(chain),
      description: `Heuristic policy for ${chain.attackType}`,
      rules,
      confidence: 55,
      requiresApproval: true,
    };
  }

  private defaultPolicyName(chain: AttackChain): string {
    const type = chain.attackType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const date = new Date().toISOString().split('T')[0];
    return `Auto: Block ${type} — ${date}`;
  }
}
