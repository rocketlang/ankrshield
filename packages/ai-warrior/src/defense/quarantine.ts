/**
 * @ankrshield/ai-warrior — Agent Quarantine
 *
 * Tracks which agents have been quarantined and why.
 * In a full implementation this would also revoke OS-level permissions
 * via the platform monitor. For MVP: registry + signal to the policy engine.
 */

import { randomUUID } from 'node:crypto';
import type { AttackChain, QuarantinedAgent } from '../types';

export class AgentQuarantine {
  private quarantined: Map<string, QuarantinedAgent> = new Map();

  /**
   * Quarantine an agent. Idempotent — re-quarantine updates the reason.
   */
  quarantine(agentId: string, chain: AttackChain): QuarantinedAgent {
    const existing = this.quarantined.get(agentId);

    if (existing) {
      // Update reason with latest chain
      existing.reason = this.buildReason(chain);
      existing.attackChainId = chain.id;
      return existing;
    }

    const agentName = chain.events.find((e) => e.agentId === agentId)?.agentName ?? agentId;

    const record: QuarantinedAgent = {
      agentId,
      agentName,
      quarantinedAt: new Date(),
      reason: this.buildReason(chain),
      attackChainId: chain.id,
      isActive: true,
    };

    this.quarantined.set(agentId, record);
    return record;
  }

  /**
   * Release an agent from quarantine.
   */
  release(agentId: string): boolean {
    const record = this.quarantined.get(agentId);
    if (!record) return false;
    record.isActive = false;
    return true;
  }

  isQuarantined(agentId: string): boolean {
    return this.quarantined.get(agentId)?.isActive === true;
  }

  getAll(): QuarantinedAgent[] {
    return [...this.quarantined.values()];
  }

  getActive(): QuarantinedAgent[] {
    return this.getAll().filter((q) => q.isActive);
  }

  get(agentId: string): QuarantinedAgent | undefined {
    return this.quarantined.get(agentId);
  }

  private buildReason(chain: AttackChain): string {
    return (
      `${chain.attackType.replace(/_/g, ' ')} detected ` +
      `(score ${chain.threatScore}/100) — ${chain.events.length} events correlated. ` +
      `Chain ID: ${chain.id}`
    );
  }

  /**
   * Returns a unique quarantine event ID for audit logging.
   */
  static generateEventId(): string {
    return `qrtn_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
}
