/**
 * Warrior Service — GraphQL client for AI Warrior data
 */
import { GRAPHQL_URL } from '../config';

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export interface WarriorStatus {
  isRunning: boolean;
  eventsIngested: number;
  attackChainsDetected: number;
  policiesGenerated: number;
  honeypotTriggers: number;
  quarantinedAgents: number;
  scopeViolations: number;
  uptimeMs: number;
}

export interface AttackChain {
  id: string;
  detectedAt: string;
  attackType: string;
  threatScore: number;
  narrative: string;
  affectedAssets: string[];
  suggestedActions: string[];
  autoActionsApplied: string[];
}

export interface QuarantinedAgent {
  agentId: string;
  agentName: string;
  quarantinedAt: string;
  reason: string;
  attackChainId: string;
  isActive: boolean;
}

export interface ScopeViolation {
  agentId: string;
  agentName: string;
  violationType: string;
  action: string;
  resource: string;
  reason: string;
  timestamp: string;
}

export interface HoneypotAsset {
  id: string;
  type: string;
  path: string;
  name: string;
  triggered: boolean;
  triggeredAt?: string;
}

export class WarriorService {
  async getStatus(): Promise<WarriorStatus> {
    const data = await gql(`
      query {
        warriorStatus {
          isRunning eventsIngested attackChainsDetected
          policiesGenerated honeypotTriggers quarantinedAgents
          scopeViolations uptimeMs
        }
      }
    `);
    return (data as { warriorStatus: WarriorStatus }).warriorStatus;
  }

  async getAttackChains(limit = 20): Promise<AttackChain[]> {
    const data = await gql(
      `
      query($limit: Int) {
        attackChains(limit: $limit) {
          id detectedAt attackType threatScore narrative
          affectedAssets suggestedActions autoActionsApplied
        }
      }
    `,
      { limit }
    );
    return (data as { attackChains: AttackChain[] }).attackChains;
  }

  async getQuarantinedAgents(): Promise<QuarantinedAgent[]> {
    const data = await gql(`
      query {
        quarantinedAgents(activeOnly: false) {
          agentId agentName quarantinedAt reason attackChainId isActive
        }
      }
    `);
    return (data as { quarantinedAgents: QuarantinedAgent[] }).quarantinedAgents;
  }

  async getScopeViolations(limit = 50): Promise<ScopeViolation[]> {
    const data = await gql(
      `
      query($limit: Int) {
        scopeViolations(limit: $limit) {
          agentId agentName violationType action resource reason timestamp
        }
      }
    `,
      { limit }
    );
    return (data as { scopeViolations: ScopeViolation[] }).scopeViolations;
  }

  async getHoneypots(): Promise<HoneypotAsset[]> {
    const data = await gql(`
      query {
        honeypotAssets {
          id type path name triggered triggeredAt
        }
      }
    `);
    return (data as { honeypotAssets: HoneypotAsset[] }).honeypotAssets;
  }

  async releaseAgent(agentId: string): Promise<boolean> {
    const data = await gql(
      `
      mutation($agentId: String!) {
        releaseAgent(agentId: $agentId)
      }
    `,
      { agentId }
    );
    return (data as { releaseAgent: boolean }).releaseAgent;
  }

  async deployHoneypots(): Promise<boolean> {
    const data = await gql(`mutation { deployDefaultHoneypots }`);
    return (data as { deployDefaultHoneypots: boolean }).deployDefaultHoneypots;
  }

  formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  threatColor(score: number): string {
    if (score >= 85) return '#f44336';
    if (score >= 65) return '#FF9800';
    if (score >= 45) return '#FFC107';
    return '#4CAF50';
  }
}
