/**
 * xShield AI — Warrior Command Center
 *
 * Real-time control panel for the AIWarrior threat intelligence engine.
 * Polls warrior status + live events every 10s. Provides one-click controls
 * for quarantine release, policy approval, and honeypot deployment.
 */

import { useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

import {
  WARRIOR_STATUS_QUERY,
  ATTACK_CHAINS_QUERY,
  QUARANTINED_AGENTS_QUERY,
  GENERATED_POLICIES_QUERY,
  HONEYPOT_ASSETS_QUERY,
  SCOPE_VIOLATIONS_QUERY,
  WARRIOR_EVENTS_QUERY,
  RELEASE_AGENT_MUTATION,
  APPLY_POLICY_MUTATION,
  DEPLOY_HONEYPOTS_MUTATION,
} from '../graphql/queries';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const SCORE_COLOR = (score: number) =>
  score >= 80
    ? 'text-red-400 border-red-500/50 bg-red-500/10'
    : score >= 55
      ? 'text-orange-400 border-orange-500/50 bg-orange-500/10'
      : score >= 35
        ? 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10'
        : 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10';

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  low: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  info: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
};

const ATTACK_TYPE_COLOR: Record<string, string> = {
  data_exfiltration: 'text-red-300 bg-red-500/10',
  credential_theft: 'text-orange-300 bg-orange-500/10',
  lateral_movement: 'text-purple-300 bg-purple-500/10',
  ransomware: 'text-red-400 bg-red-600/15',
  surveillance: 'text-yellow-300 bg-yellow-500/10',
  supply_chain_compromise: 'text-pink-300 bg-pink-500/10',
  privilege_escalation: 'text-violet-300 bg-violet-500/10',
  honeypot_triggered: 'text-amber-300 bg-amber-500/10',
  unknown: 'text-gray-400 bg-gray-500/10',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color = 'text-cyan-400',
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="text-center px-4">
      <div className={`text-2xl font-black font-mono ${color}`}>{value}</div>
      <div className="text-gray-500 text-[10px] uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-lg">{icon}</span>
      <h3 className="text-white font-black text-sm uppercase tracking-widest">{title}</h3>
      {count !== undefined && (
        <span className="ml-auto text-xs font-mono text-gray-500">
          {count} item{count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-8 text-gray-600 text-sm">{text}</div>;
}

// ── Attack Chains ─────────────────────────────────────────────────────────────

function AttackChainCard({ chain }: { chain: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-white/10 bg-white/[0.03] rounded-xl p-4 mb-3 last:mb-0">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 text-xs font-black font-mono px-2 py-1 rounded-full border ${SCORE_COLOR(chain.threatScore)}`}
        >
          {chain.threatScore}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase ${ATTACK_TYPE_COLOR[chain.attackType] ?? ATTACK_TYPE_COLOR.unknown}`}
            >
              {chain.attackType?.replace(/_/g, ' ')}
            </span>
            <span className="text-gray-500 text-[10px]">{fmtTimeAgo(chain.detectedAt)}</span>
          </div>
          <p className="text-gray-300 text-xs leading-relaxed">{chain.narrative}</p>
          {chain.affectedAssets?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {chain.affectedAssets.slice(0, 3).map((a: string) => (
                <span
                  key={a}
                  className="text-[10px] font-mono bg-white/[0.05] border border-white/10 text-gray-400 px-1.5 py-0.5 rounded"
                >
                  {a.length > 30 ? '…' + a.slice(-27) : a}
                </span>
              ))}
              {chain.affectedAssets.length > 3 && (
                <span className="text-[10px] text-gray-600">
                  +{chain.affectedAssets.length - 3} more
                </span>
              )}
            </div>
          )}
          {expanded && chain.suggestedActions?.length > 0 && (
            <ol className="mt-3 space-y-1">
              {chain.suggestedActions.map((a: string, i: number) => (
                <li key={i} className="flex gap-2 text-xs text-gray-400">
                  <span className="text-cyan-600 shrink-0">{i + 1}.</span>
                  {a}
                </li>
              ))}
            </ol>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[10px] text-cyan-600 hover:text-cyan-400 transition-colors"
          >
            {expanded ? '▲ collapse' : '▼ actions + details'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quarantined Agents ────────────────────────────────────────────────────────

function QuarantinedAgentRow({
  agent,
  onRelease,
  releasing,
}: {
  agent: any;
  onRelease: (id: string) => void;
  releasing: string | null;
}) {
  return (
    <div className="flex items-start gap-3 border border-red-500/20 bg-red-500/5 rounded-xl p-3 mb-2 last:mb-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-red-300 font-bold text-sm font-mono">{agent.agentName}</span>
          <span className="text-[10px] text-gray-500">{fmtTimeAgo(agent.quarantinedAt)}</span>
          {agent.isActive && (
            <span className="text-[10px] font-bold text-red-400 border border-red-500/30 rounded-full px-1.5 py-0.5">
              ● ACTIVE
            </span>
          )}
        </div>
        <p className="text-gray-400 text-xs mt-1 leading-relaxed">{agent.reason}</p>
      </div>
      {agent.isActive && (
        <button
          onClick={() => onRelease(agent.agentId)}
          disabled={releasing === agent.agentId}
          className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-400 transition-all disabled:opacity-50"
        >
          {releasing === agent.agentId ? '…' : 'Release'}
        </button>
      )}
    </div>
  );
}

// ── Policies ──────────────────────────────────────────────────────────────────

function PolicyCard({
  policy,
  onApprove,
  approving,
}: {
  policy: any;
  onApprove: (id: string) => void;
  approving: string | null;
}) {
  return (
    <div className="border border-white/10 bg-white/[0.03] rounded-xl p-4 mb-3 last:mb-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-white font-bold text-sm">{policy.name}</div>
          <div className="text-gray-400 text-xs mt-0.5">{policy.description}</div>
        </div>
        {policy.requiresApproval && !policy.autoApplied && (
          <button
            onClick={() => onApprove(policy.id)}
            disabled={approving === policy.id}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/35 border border-cyan-500/40 text-cyan-400 transition-all disabled:opacity-50"
          >
            {approving === policy.id ? '…' : 'Approve'}
          </button>
        )}
        {policy.autoApplied && (
          <span className="text-[10px] text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 font-bold shrink-0">
            ✓ Applied
          </span>
        )}
      </div>
      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>Confidence</span>
          <span className="font-mono text-white">{policy.confidence}%</span>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${policy.confidence >= 80 ? 'bg-emerald-500' : policy.confidence >= 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
            style={{ width: `${policy.confidence}%` }}
          />
        </div>
      </div>
      {/* Rules */}
      <div className="space-y-1">
        {policy.rules?.map((rule: any, i: number) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-mono text-purple-400 text-[10px] uppercase bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
              {rule.type?.replace(/_/g, ' ')}
            </span>
            <span className="text-gray-300 font-mono truncate">{rule.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Honeypots ─────────────────────────────────────────────────────────────────

function HoneypotRow({ asset }: { asset: any }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2 mb-1.5 last:mb-0 border ${
        asset.triggered ? 'border-red-500/40 bg-red-500/10' : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <span className="text-lg shrink-0">{asset.triggered ? '🔴' : '🍯'}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-gray-300 truncate">{asset.name}</div>
        <div className="text-[10px] text-gray-600 font-mono truncate">{asset.path}</div>
      </div>
      {asset.triggered ? (
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold text-red-400">TRIGGERED</div>
          {asset.triggeredAt && (
            <div className="text-[10px] text-gray-600">{fmtTimeAgo(asset.triggeredAt)}</div>
          )}
        </div>
      ) : (
        <span className="text-[10px] text-gray-600 shrink-0">watching</span>
      )}
    </div>
  );
}

// ── Scope Violations ──────────────────────────────────────────────────────────

function ViolationRow({ v }: { v: any }) {
  return (
    <div className="grid grid-cols-[120px_1fr_140px_80px_80px] gap-3 items-center py-2.5 border-b border-white/[0.04] last:border-0 text-xs hover:bg-white/[0.02] transition-colors px-2 rounded">
      <span className="font-mono text-gray-300 truncate">{v.agentName}</span>
      <div className="min-w-0">
        <div className="font-mono text-gray-400 truncate">{v.resource}</div>
        <div className="text-gray-600 text-[10px] truncate">
          {v.violationType?.replace(/_/g, ' ')}
        </div>
      </div>
      <span className="text-gray-500 truncate">{v.parentApp}</span>
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border text-center ${SEVERITY_COLOR[v.severity] ?? SEVERITY_COLOR.info}`}
      >
        {v.severity}
      </span>
      <span className="text-[10px] text-gray-500 text-right">{fmtTimeAgo(v.timestamp)}</span>
    </div>
  );
}

// ── Live Events Terminal ──────────────────────────────────────────────────────

const EVENT_ICON: Record<string, string> = {
  'attack-detected': '🚨',
  'policy-generated': '📋',
  'agent-quarantined': '🔒',
  'honeypot-triggered': '🍯',
  'scope-violation': '⚠️',
  'incident-report': '📊',
  'spyware-detected': '🔬',
};

function LiveEventsTerminal({ events }: { events: any[] }) {
  return (
    <div className="bg-[#060b12] border border-white/10 rounded-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        <span className="ml-2 text-gray-500 text-[10px] font-mono">
          warrior-events — live ring buffer
        </span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>
      <div className="p-4 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-gray-700">no events yet — warrior is watching…</div>
        ) : (
          events.map((e: any, i: number) => (
            <div key={i} className="flex gap-3 text-gray-400">
              <span className="text-gray-700 shrink-0">{fmtTime(e.at)}</span>
              <span className="shrink-0">{EVENT_ICON[e.type] ?? '•'}</span>
              <span
                className={
                  e.type.includes('attack') || e.type.includes('quarantine')
                    ? 'text-red-400'
                    : e.type.includes('honeypot')
                      ? 'text-amber-400'
                      : 'text-gray-400'
                }
              >
                {e.type}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const [releasingAgent, setReleasingAgent] = useState<string | null>(null);
  const [approvingPolicy, setApprovingPolicy] = useState<string | null>(null);
  const [deployingHoneypots, setDeployingHoneypots] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok: boolean }[]>([]);

  const toast = (msg: string, ok = true) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  // Queries
  const { data: statusData } = useQuery(WARRIOR_STATUS_QUERY, { pollInterval: 10_000 });
  const { data: chainsData } = useQuery(ATTACK_CHAINS_QUERY, {
    variables: { limit: 8, minThreatScore: 0 },
  });
  const { data: quarantineData, refetch: refetchQuarantine } = useQuery(QUARANTINED_AGENTS_QUERY, {
    variables: { activeOnly: false },
  });
  const { data: policiesData, refetch: refetchPolicies } = useQuery(GENERATED_POLICIES_QUERY, {
    variables: { limit: 10, pendingApprovalOnly: false },
  });
  const { data: honeypotData, refetch: refetchHoneypots } = useQuery(HONEYPOT_ASSETS_QUERY, {
    variables: { triggeredOnly: false },
  });
  const { data: violationsData } = useQuery(SCOPE_VIOLATIONS_QUERY, {
    variables: { limit: 30 },
  });
  const { data: eventsData } = useQuery(WARRIOR_EVENTS_QUERY, {
    variables: { limit: 20 },
    pollInterval: 10_000,
  });

  // Mutations
  const [releaseAgent] = useMutation(RELEASE_AGENT_MUTATION);
  const [applyPolicy] = useMutation(APPLY_POLICY_MUTATION);
  const [deployHoneypots] = useMutation(DEPLOY_HONEYPOTS_MUTATION);

  const handleRelease = async (agentId: string) => {
    setReleasingAgent(agentId);
    try {
      await releaseAgent({ variables: { agentId } });
      await refetchQuarantine();
      toast(`Agent ${agentId} released`);
    } catch {
      toast('Release failed', false);
    } finally {
      setReleasingAgent(null);
    }
  };

  const handleApprove = async (policyId: string) => {
    setApprovingPolicy(policyId);
    try {
      await applyPolicy({ variables: { policyId } });
      await refetchPolicies();
      toast('Policy approved and applied');
    } catch {
      toast('Approve failed', false);
    } finally {
      setApprovingPolicy(null);
    }
  };

  const handleDeployHoneypots = async () => {
    setDeployingHoneypots(true);
    try {
      await deployHoneypots();
      await refetchHoneypots();
      toast('Default honeypots deployed');
    } catch {
      toast('Deploy failed', false);
    } finally {
      setDeployingHoneypots(false);
    }
  };

  const status = statusData?.warriorStatus;
  const chains: any[] = chainsData?.attackChains ?? [];
  const quarantined: any[] = quarantineData?.quarantinedAgents ?? [];
  const policies: any[] = policiesData?.generatedPolicies ?? [];
  const honeypots: any[] = honeypotData?.honeypotAssets ?? [];
  const violations: any[] = violationsData?.scopeViolations ?? [];
  const events: any[] = eventsData?.warriorEvents ?? [];

  const pendingPolicies = policies.filter((p) => p.requiresApproval && !p.autoApplied);
  const triggeredHoneypots = honeypots.filter((h) => h.triggered);
  const activeQuarantine = quarantined.filter((q) => q.isActive);

  return (
    <div className="min-h-screen bg-[#060b12] text-white">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`text-xs font-bold px-4 py-2 rounded-xl border shadow-lg transition-all ${
              t.ok
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-red-500/20 border-red-500/40 text-red-300'
            }`}
          >
            {t.ok ? '✓' : '✗'} {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="border-b border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚔️</span>
              <div>
                <h1 className="text-xl font-black text-white">AI Warrior Command Center</h1>
                <p className="text-gray-500 text-xs mt-0.5">
                  Zero-trust AI agent oversight · Real-time threat correlation
                </p>
              </div>
            </div>
            {/* Running status */}
            {status && (
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${status.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
                />
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${status.isRunning ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {status.isRunning ? 'WARRIOR ONLINE' : 'OFFLINE'}
                </span>
                {status.isRunning && (
                  <span className="text-gray-600 text-xs font-mono ml-2">
                    up {fmtUptime(status.uptimeMs)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status strip */}
      {status && (
        <div className="border-b border-white/[0.06] bg-white/[0.015]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-wrap items-center justify-center gap-0 divide-x divide-white/10">
              <StatPill
                label="Events Ingested"
                value={status.eventsIngested.toLocaleString()}
                color="text-cyan-400"
              />
              <StatPill
                label="Attack Chains"
                value={status.attackChainsDetected}
                color={status.attackChainsDetected > 0 ? 'text-red-400' : 'text-gray-500'}
              />
              <StatPill
                label="Policies Generated"
                value={status.policiesGenerated}
                color="text-purple-400"
              />
              <StatPill
                label="Honeypot Triggers"
                value={status.honeypotTriggers}
                color={status.honeypotTriggers > 0 ? 'text-amber-400' : 'text-gray-500'}
              />
              <StatPill
                label="Active Quarantine"
                value={status.quarantinedAgents}
                color={status.quarantinedAgents > 0 ? 'text-orange-400' : 'text-gray-500'}
              />
              <StatPill
                label="Scope Violations"
                value={status.scopeViolations}
                color={status.scopeViolations > 0 ? 'text-yellow-400' : 'text-gray-500'}
              />
              {pendingPolicies.length > 0 && (
                <StatPill
                  label="Pending Approval"
                  value={pendingPolicies.length}
                  color="text-cyan-300"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Row 1: Attack Chains + Quarantined Agents */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
          {/* Attack Chains */}
          <div className="border border-white/10 bg-white/[0.025] rounded-2xl p-5">
            <SectionHeader icon="🔴" title="Attack Chains" count={chains.length} />
            {chains.length === 0 ? (
              <EmptyState text="No attack chains detected — warrior is watching" />
            ) : (
              chains.map((c) => <AttackChainCard key={c.id} chain={c} />)
            )}
          </div>

          {/* Quarantined Agents */}
          <div className="border border-white/10 bg-white/[0.025] rounded-2xl p-5">
            <SectionHeader icon="🔒" title="Quarantined Agents" count={activeQuarantine.length} />
            {quarantined.length === 0 ? (
              <EmptyState text="No agents quarantined" />
            ) : (
              quarantined.map((q) => (
                <QuarantinedAgentRow
                  key={q.agentId}
                  agent={q}
                  onRelease={handleRelease}
                  releasing={releasingAgent}
                />
              ))
            )}
          </div>
        </div>

        {/* Row 2: Pending Policies + Honeypots */}
        <div className="grid grid-cols-1 lg:grid-cols-[11fr_9fr] gap-6">
          {/* Policies */}
          <div className="border border-white/10 bg-white/[0.025] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📋</span>
              <h3 className="text-white font-black text-sm uppercase tracking-widest">
                Generated Policies
              </h3>
              {pendingPolicies.length > 0 && (
                <span className="ml-2 text-[10px] font-bold text-cyan-400 border border-cyan-500/40 rounded-full px-2 py-0.5 animate-pulse">
                  {pendingPolicies.length} PENDING
                </span>
              )}
              <span className="ml-auto text-xs font-mono text-gray-500">
                {policies.length} total
              </span>
            </div>
            {policies.length === 0 ? (
              <EmptyState text="No policies generated yet" />
            ) : (
              policies.map((p) => (
                <PolicyCard
                  key={p.id}
                  policy={p}
                  onApprove={handleApprove}
                  approving={approvingPolicy}
                />
              ))
            )}
          </div>

          {/* Honeypots */}
          <div className="border border-white/10 bg-white/[0.025] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🍯</span>
              <h3 className="text-white font-black text-sm uppercase tracking-widest">Honeypots</h3>
              {triggeredHoneypots.length > 0 && (
                <span className="ml-2 text-[10px] font-bold text-red-400 border border-red-500/40 rounded-full px-2 py-0.5 animate-pulse">
                  {triggeredHoneypots.length} TRIGGERED
                </span>
              )}
              <button
                onClick={handleDeployHoneypots}
                disabled={deployingHoneypots}
                className="ml-auto text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-400 transition-all disabled:opacity-50"
              >
                {deployingHoneypots ? '…' : '+ Deploy Defaults'}
              </button>
            </div>
            {honeypots.length === 0 ? (
              <EmptyState text='No honeypots deployed — click "Deploy Defaults"' />
            ) : (
              honeypots.map((h) => <HoneypotRow key={h.id} asset={h} />)
            )}
          </div>
        </div>

        {/* Scope Violations */}
        <div className="border border-white/10 bg-white/[0.025] rounded-2xl p-5">
          <SectionHeader icon="⚠️" title="Scope Violations" count={violations.length} />
          {violations.length === 0 ? (
            <EmptyState text="No scope violations — all AI agents operating within declared boundaries" />
          ) : (
            <div>
              <div className="grid grid-cols-[120px_1fr_140px_80px_80px] gap-3 text-[10px] uppercase tracking-widest text-gray-600 font-bold mb-1 px-2">
                <span>Agent</span>
                <span>Resource · Type</span>
                <span>App</span>
                <span>Severity</span>
                <span className="text-right">When</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {violations.map((v) => (
                  <ViolationRow key={v.id} v={v} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom row: Live Events + Config */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
          {/* Live Events */}
          <div className="border border-white/10 bg-white/[0.025] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📡</span>
              <h3 className="text-white font-black text-sm uppercase tracking-widest">
                Live Events
              </h3>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-500 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                polling 10s
              </span>
            </div>
            <LiveEventsTerminal events={events} />
          </div>

          {/* Warrior Config */}
          <div className="border border-white/10 bg-white/[0.025] rounded-2xl p-5">
            <SectionHeader icon="⚙️" title="Warrior Config" />
            <div className="space-y-3">
              {[
                { label: 'LLM Model', value: 'claude-sonnet-4-6', color: 'text-violet-400' },
                { label: 'Threat Threshold', value: '55 / 100', color: 'text-yellow-400' },
                { label: 'Auto-Quarantine', value: '≥ 88 / 100', color: 'text-orange-400' },
                { label: 'Correlation Window', value: '5 minutes', color: 'text-cyan-400' },
                { label: 'Honeypot Poll', value: '30 seconds', color: 'text-amber-400' },
                { label: 'Report Interval', value: '24 hours', color: 'text-blue-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{label}</span>
                  <span className={`font-mono font-bold ${color}`}>{value}</span>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="text-[10px] text-gray-600 leading-relaxed">
                  To change thresholds or BYO API key, update env vars and restart the API. Use{' '}
                  <span className="font-mono text-gray-500">WARRIOR_THREAT_THRESHOLD</span>,{' '}
                  <span className="font-mono text-gray-500">WARRIOR_AUTO_QUARANTINE_SCORE</span>,{' '}
                  <span className="font-mono text-gray-500">ANTHROPIC_API_KEY</span>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
