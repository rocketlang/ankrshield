/**
 * Warrior Service — GraphQL client for AI Warrior data
 */
import { GRAPHQL_URL, API_BASE } from '../config';

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

export interface HoneypotHit {
  ip: string;
  path: string;
  userAgent: string;
  country: string;
  abuseScore: number;
  timestamp: string;
}

export interface PreBlockedIP {
  ip: string;
  abuseScore: number;
  country: string;
  isp: string;
  usageType: string;
  reports: number;
}

export interface EvidenceReport {
  generatedAt: string;
  incidentCount: number;
  summary: string;
  sha256: string;
  certInTemplate: string;
}

export interface RiskScore {
  domain: string;
  score: number;
  level: string;
  categories: string[];
  lastSeen: string;
}

export interface RiskPlaybook {
  domain: string;
  steps: Array<{ title: string; command?: string; description: string }>;
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

  async getHoneypotHits(): Promise<HoneypotHit[]> {
    const res = await fetch(`${API_BASE}/warrior/honeypot-hits`);
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    return Array.isArray(data.hits) ? data.hits : Array.isArray(data) ? data : [];
  }

  async getPreBlockedIPs(): Promise<PreBlockedIP[]> {
    const res = await fetch(`${API_BASE}/warrior/preblocked-ips`);
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    return Array.isArray(data.ips) ? data.ips : Array.isArray(data) ? data : [];
  }

  async getEvidenceReport(): Promise<EvidenceReport | null> {
    const res = await fetch(`${API_BASE}/warrior/evidence-report`);
    if (!res.ok) return null;
    return res.json() as Promise<EvidenceReport>;
  }

  async getRiskScore(domain: string): Promise<RiskScore | null> {
    // GraphQL — xshieldScan is unauthenticated (anonymous free scan)
    try {
      const data = await gql(
        `query($domain: String!) {
          xshieldScan(domain: $domain) {
            domain riskScore riskLevel scannedAt
            findings { source signal severity }
          }
        }`,
        { domain }
      );
      const scan = (data as any)?.xshieldScan;
      if (!scan) return null;
      const categories = [
        ...new Set<string>((scan.findings as any[]).map((f: any) => f.source as string)),
      ];
      return {
        domain: scan.domain,
        score: scan.riskScore,
        level: (scan.riskLevel as string).toLowerCase(),
        categories,
        lastSeen: scan.scannedAt,
      };
    } catch {
      // Fallback to REST for older server versions
      const res = await fetch(`${API_BASE}/risk/score?domain=${encodeURIComponent(domain)}`);
      if (!res.ok) return null;
      return res.json() as Promise<RiskScore>;
    }
  }

  async getRiskPlaybook(domain: string): Promise<RiskPlaybook | null> {
    // REST — public endpoint, returns flat steps[] for mobile
    const res = await fetch(`${API_BASE}/risk/playbook?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) return null;
    return res.json() as Promise<RiskPlaybook>;
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
