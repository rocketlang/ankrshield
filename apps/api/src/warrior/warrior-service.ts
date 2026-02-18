/**
 * AI Warrior Service — API Singleton
 *
 * Single AIWarrior instance for the API process.
 * Wires AIAgentMonitor → Warrior → GraphQL.
 * Pre-registers built-in scope presets for all known AI agents.
 */

/* eslint-disable no-console */

import { AIAgentMonitor } from '@ankrshield/ai-governance';
import type {
  AttackChain,
  GeneratedPolicy,
  IncidentReport,
  ScopeViolation,
} from '@ankrshield/ai-warrior';
import { AIWarrior } from '@ankrshield/ai-warrior';
import { SpywareScanner } from '@ankrshield/spyware-detector';

import { prisma } from '../graphql/builder';

import { startWirePublisher, stopWirePublisher } from './wire-publisher';

// ─── Singleton State ──────────────────────────────────────────────────────────

let warrior: AIWarrior | null = null;
let monitor: AIAgentMonitor | null = null;
let spywareScanTimer: NodeJS.Timeout | null = null;

// In-memory event log for GraphQL subscriptions (ring buffer, last 500)
const recentEvents: Array<{ type: string; payload: unknown; at: Date }> = [];

function pushEvent(type: string, payload: unknown): void {
  recentEvents.push({ type, payload, at: new Date() });
  if (recentEvents.length > 500) recentEvents.shift();
}

// ─── Accessors ────────────────────────────────────────────────────────────────

export function getWarrior(): AIWarrior {
  if (!warrior) {
    warrior = new AIWarrior({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.WARRIOR_MODEL ?? 'claude-sonnet-4-6',
      correlationWindowMs: parseInt(process.env.WARRIOR_CORRELATION_WINDOW_MS ?? '300000'),
      threatScoreThreshold: parseInt(process.env.WARRIOR_THREAT_THRESHOLD ?? '55'),
      autoQuarantineScore: parseInt(process.env.WARRIOR_AUTO_QUARANTINE_SCORE ?? '88'),
      enableHoneypots: process.env.WARRIOR_ENABLE_HONEYPOTS !== 'false',
      reportIntervalMs: parseInt(process.env.WARRIOR_REPORT_INTERVAL_MS ?? '86400000'),
    });
  }
  return warrior;
}

export function getMonitor(): AIAgentMonitor {
  if (!monitor) {
    monitor = new AIAgentMonitor();
  }
  return monitor;
}

export function getRecentEvents(): Array<{ type: string; payload: unknown; at: Date }> {
  return [...recentEvents];
}

// ─── Startup ──────────────────────────────────────────────────────────────────

export async function startWarrior(): Promise<void> {
  const w = getWarrior();
  const m = getMonitor();

  // Wire monitor → warrior
  m.on('activity', (activity) => {
    w.ingestAIActivity(activity, 'Unknown AI Agent');
  });

  // Wire warrior events → in-memory ring buffer (for polling / future subscriptions)
  w.on('attack-detected', (chain: AttackChain) => {
    pushEvent('attack-detected', chain);
  });
  w.on('policy-generated', (policy: GeneratedPolicy) => {
    pushEvent('policy-generated', policy);
  });
  w.on('scope-violation', (violation: ScopeViolation) => {
    pushEvent('scope-violation', violation);
  });
  w.on('agent-quarantined', (agent) => {
    pushEvent('agent-quarantined', agent);
  });
  w.on('honeypot-triggered', (asset) => {
    pushEvent('honeypot-triggered', asset);
  });
  w.on('incident-report', (report: IncidentReport) => {
    pushEvent('incident-report', report);
  });
  w.on('error', (err: Error) => {
    console.error('[AI Warrior] Error:', err.message);
  });

  // ── Persist attack chains to DB ──────────────────────────────────────────
  w.on('attack-detected', (chain: AttackChain) => {
    void (async () => {
      try {
        await prisma.warriorAttackChain.create({
          data: {
            id: chain.id,
            detectedAt: chain.detectedAt,
            startTime: chain.startTime,
            endTime: chain.endTime,
            attackType: chain.attackType as Parameters<
              typeof prisma.warriorAttackChain.create
            >[0]['data']['attackType'],
            threatScore: chain.threatScore,
            eventCount: chain.events.length,
            narrative: chain.narrative,
            technicalSummary: chain.technicalSummary,
            affectedAssets: chain.affectedAssets,
            suggestedActions: chain.suggestedActions,
            autoActionsApplied: chain.autoActionsApplied,
          },
        });
        await prisma.warriorEvent.create({
          data: {
            eventType: 'attack_detected',
            chainId: chain.id,
            agentId: chain.events[0]?.agentId,
            agentName: chain.events[0]?.agentName,
            payload: chain as Record<string, unknown>,
          },
        });
      } catch (_e) {
        /* DB may not be migrated yet — safe to skip */
      }
    })();
  });

  // ── Persist generated policies to DB ──────────────────────────────────────
  w.on('policy-generated', (policy: GeneratedPolicy) => {
    void (async () => {
      try {
        await prisma.warriorPolicy.create({
          data: {
            id: policy.id,
            name: policy.name,
            description: policy.description,
            triggeredBy: policy.triggeredBy,
            confidence: policy.confidence,
            autoApplied: policy.autoApplied,
            requiresApproval: policy.requiresApproval,
            rules: policy.rules as Parameters<
              typeof prisma.warriorPolicy.create
            >[0]['data']['rules'],
          },
        });
      } catch (_e) {
        /* DB may not be migrated yet — safe to skip */
      }
    })();
  });

  // ── Persist quarantine to DB ─────────────────────────────────────────────
  w.on('agent-quarantined', (agent) => {
    void (async () => {
      try {
        await prisma.warriorQuarantine.upsert({
          where: { agentId: agent.agentId },
          update: {
            quarantinedAt: agent.quarantinedAt,
            reason: agent.reason,
            isActive: true,
            releasedAt: null,
          },
          create: {
            agentId: agent.agentId,
            agentName: agent.agentName,
            quarantinedAt: agent.quarantinedAt,
            reason: agent.reason,
            attackChainId: agent.attackChainId,
            isActive: true,
          },
        });
      } catch (_e) {
        /* DB may not be migrated yet — safe to skip */
      }
    })();
  });

  // ── Persist incident reports ─────────────────────────────────────────────
  w.on('incident-report', (report: IncidentReport) => {
    void (async () => {
      try {
        await prisma.warriorIncidentReport.create({
          data: {
            id: report.id,
            generatedAt: report.generatedAt,
            periodStart: report.period.start,
            periodEnd: report.period.end,
            riskScore: report.riskScore,
            executiveSummary: report.executiveSummary,
            technicalAnalysis: report.technicalAnalysis,
            totalEventsAnalyzed: report.totalEventsAnalyzed,
            totalAlertsGenerated: report.totalAlertsGenerated,
            topThreats: report.topThreats,
            recommendations: report.recommendations,
            rawReport: report as Record<string, unknown>,
          },
        });
      } catch (_e) {
        /* DB may not be migrated yet — safe to skip */
      }
    })();
  });

  // ── Restore quarantine from DB on startup ─────────────────────────────────
  try {
    const activeQuarantines = await prisma.warriorQuarantine.findMany({
      where: { isActive: true },
    });
    for (const q of activeQuarantines) {
      const syntheticChain: AttackChain = {
        id: q.attackChainId,
        detectedAt: q.quarantinedAt,
        startTime: q.quarantinedAt,
        endTime: q.quarantinedAt,
        events: [],
        attackType: 'unknown',
        threatScore: 90,
        narrative: q.reason,
        technicalSummary: q.reason,
        affectedAssets: [],
        suggestedActions: [],
        autoActionsApplied: [`Restored from DB — quarantined at ${q.quarantinedAt.toISOString()}`],
      };
      w.restoreQuarantine(q.agentId, syntheticChain);
    }
    if (activeQuarantines.length > 0) {
      console.warn(
        `[AI Warrior] Restored ${activeQuarantines.length} quarantined agent(s) from DB`
      );
    }
  } catch (_e) {
    /* DB may not be migrated yet — quarantine starts empty */
  }

  // Register built-in scope presets for known AI agents
  w.registerPreset('chatgpt-desktop', 'ChatGPT Desktop', 'chatgpt-desktop');
  w.registerPreset('claude-desktop', 'Claude Desktop', 'claude-desktop');
  w.registerPreset('github-copilot', 'GitHub Copilot', 'github-copilot', {
    workspaceRoot: process.env.DEFAULT_WORKSPACE_ROOT,
  });
  w.registerPreset('cursor-ai', 'Cursor AI', 'cursor-ai', {
    workspaceRoot: process.env.DEFAULT_WORKSPACE_ROOT,
  });
  w.registerPreset('grammarly', 'Grammarly', 'grammarly');
  w.registerPreset('tabnine', 'Tabnine', 'tabnine');
  w.registerPreset('codeium', 'Codeium', 'codeium');
  w.registerPreset('gemini-code-assist', 'Gemini Code Assist', 'gemini-code-assist');

  await w.start();

  // ── Periodic spyware scanning ─────────────────────────────────────────────
  const spywareScanIntervalMs = parseInt(
    process.env.WARRIOR_SPYWARE_SCAN_INTERVAL_MS ?? '21600000' // 6 hours
  );

  const runSpywareScan = async (): Promise<void> => {
    try {
      const scanner = new SpywareScanner({
        enableNetworkScan: true,
        enableProcessScan: true,
        enableFileScan: true,
      });
      const result = await scanner.scan();

      if (!result.isClean && result.indicatorsFound.length > 0) {
        for (const indicator of result.indicatorsFound) {
          w.ingest({
            id: `spyware-${indicator.family}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date(),
            source:
              indicator.type === 'network_ioc'
                ? 'network'
                : indicator.type === 'process_name'
                  ? 'process'
                  : 'file-system',
            severity:
              result.severity === 'confirmed'
                ? 'critical'
                : result.severity === 'probable'
                  ? 'high'
                  : 'warning',
            action: 'SPYWARE_IOC_DETECTED',
            resource: indicator.value,
            agentId: `spyware-${indicator.family}`,
            agentName: `${indicator.family.toUpperCase()} Spyware`,
            metadata: {
              family: indicator.family,
              indicatorType: indicator.type,
              description: indicator.description,
              confidence: indicator.confidence,
              overallConfidence: result.overallConfidence,
              scanId: result.id,
            },
            isBlocked: false,
          });
        }
        console.warn(
          `[AI Warrior] Spyware scan: ${result.indicatorsFound.length} indicator(s) — families: ${result.families.join(', ')}`
        );
      } else {
        console.warn(`[AI Warrior] Spyware scan: clean (${result.scanDurationMs}ms)`);
      }
    } catch (err) {
      console.error('[AI Warrior] Spyware scan failed:', err instanceof Error ? err.message : err);
    }
  };

  // Run immediately on startup, then on interval
  void runSpywareScan();
  spywareScanTimer = setInterval(runSpywareScan, spywareScanIntervalMs);
  if (spywareScanTimer.unref) spywareScanTimer.unref();

  // Wire threat events → AnkrWire notification topics (WhatsApp, Telegram, in-app)
  await startWirePublisher(w);
}

export async function stopWarrior(): Promise<void> {
  stopWirePublisher();
  if (spywareScanTimer) {
    clearInterval(spywareScanTimer);
    spywareScanTimer = null;
  }
  if (warrior) {
    await warrior.stop();
    warrior = null;
  }
  monitor = null;
}
