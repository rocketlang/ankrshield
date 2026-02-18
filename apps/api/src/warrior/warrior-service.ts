/**
 * AI Warrior Service — API Singleton
 *
 * Single AIWarrior instance for the API process.
 * Wires AIAgentMonitor → Warrior → GraphQL.
 * Pre-registers built-in scope presets for all known AI agents.
 */

import { AIWarrior, type AttackChain, type GeneratedPolicy, type ScopeViolation, type IncidentReport } from '@ankrshield/ai-warrior';
import { AIAgentMonitor } from '@ankrshield/ai-governance';
import { startWirePublisher, stopWirePublisher } from './wire-publisher';

// ─── Singleton State ──────────────────────────────────────────────────────────

let warrior: AIWarrior | null = null;
let monitor: AIAgentMonitor | null = null;

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

  // Wire warrior events → in-memory log (for subscriptions / polling)
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

  // Wire threat events → AnkrWire notification topics (WhatsApp, Telegram, in-app)
  await startWirePublisher(w);
}

export async function stopWarrior(): Promise<void> {
  stopWirePublisher();
  if (warrior) {
    await warrior.stop();
    warrior = null;
  }
  monitor = null;
}
