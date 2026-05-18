/**
 * @ankrshield/ai-warrior — Threat Narrator
 *
 * Uses the LLM to enrich an AttackChain with plain-English and technical narratives.
 * Mutates chain.narrative and chain.technicalSummary in place.
 */

import type { AttackChain, NarrationResult } from '../types';
import type { WarriorLLMClient } from '../llm/client';
import { NARRATION_SYSTEM_PROMPT, buildNarrationPrompt } from '../llm/prompts';

const NARRATION_FALLBACK: NarrationResult = {
  narrative: 'Suspicious AI agent activity was detected. Review the event log for details.',
  technicalSummary: 'LLM narration unavailable — see raw event list for technical details.',
  severity: 'warning',
  attackType: 'unknown',
  affectedAssets: [],
  suggestedActions: [
    'Review the agent activity log',
    'Consider restricting agent permissions temporarily',
  ],
};

export class ThreatNarrator {
  constructor(private llm: WarriorLLMClient) {}

  /**
   * Narrate an attack chain.
   * Enriches chain.narrative, chain.technicalSummary, and chain.suggestedActions.
   * Returns the chain for convenience.
   */
  async narrate(chain: AttackChain): Promise<AttackChain> {
    const agentName = chain.events.find((e) => e.agentName)?.agentName ?? 'Unknown Agent';

    const result = await this.llm.completeJSON<NarrationResult>(
      NARRATION_SYSTEM_PROMPT,
      buildNarrationPrompt(agentName, chain.events),
      NARRATION_FALLBACK
    );

    chain.narrative = result.narrative;
    chain.technicalSummary = result.technicalSummary;

    // Override attack type only if LLM is more specific
    if (result.attackType !== 'unknown' && chain.attackType === 'unknown') {
      chain.attackType = result.attackType;
    }

    // Merge affected assets
    const merged = new Set([...chain.affectedAssets, ...result.affectedAssets]);
    chain.affectedAssets = [...merged];

    // Use LLM-suggested actions if they came back
    if (result.suggestedActions.length > 0) {
      chain.suggestedActions = result.suggestedActions;
    }

    return chain;
  }
}
