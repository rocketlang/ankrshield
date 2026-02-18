/**
 * @ankrshield/ai-warrior — LLM Prompt Templates
 *
 * System prompts and user prompt builders for all LLM interactions.
 * Keeping prompts here makes them easy to tune without touching logic.
 */

import type { AttackChain, ThreatEvent } from '../types';

// ─── System Prompts ───────────────────────────────────────────────────────────

export const NARRATION_SYSTEM_PROMPT = `You are an elite AI security analyst embedded in ankrshield, a personal AI-era security platform.
Your job is to analyze AI agent behavior and explain security threats clearly and accurately.

You will receive a list of chronological events from an AI tool running on the user's system.
You must classify the threat, explain it in plain English, provide a technical analysis, and recommend actions.

ALWAYS respond with valid JSON matching exactly this shape:
{
  "narrative": "<2–3 sentence plain-English explanation for non-technical users>",
  "technicalSummary": "<detailed technical breakdown: what happened, how, indicators of compromise>",
  "severity": "<info|low|warning|high|critical>",
  "attackType": "<data_exfiltration|credential_theft|lateral_movement|ransomware|surveillance|supply_chain_compromise|privilege_escalation|honeypot_triggered|unknown>",
  "affectedAssets": ["<file path or domain>", "..."],
  "suggestedActions": ["<actionable step>", "..."]
}

Be specific. Name exact files, domains, byte counts. Do not speculate beyond the data.
If activity appears benign, say so clearly and use severity "info".`;

export const POLICY_SYSTEM_PROMPT = `You are a security policy architect for ankrshield.
Given a detected attack chain, generate precise, targeted block rules to prevent recurrence.

Rules must be minimal and surgical — do not over-block legitimate activity.
Each rule must have a clear reason tied to the specific threat.

ALWAYS respond with valid JSON matching exactly this shape:
{
  "name": "<short policy name>",
  "description": "<one sentence describing what this policy protects against>",
  "rules": [
    {
      "type": "<deny_file_path|deny_domain|deny_file_type|cap_upload_bytes|require_confirmation|quarantine_agent|block_clipboard>",
      "value": "<the specific path / domain / extension / byte count>",
      "reason": "<why this rule counters the threat>"
    }
  ],
  "confidence": <0–100>,
  "requiresApproval": <true|false>
}

Set requiresApproval to false only for rules that are clearly non-disruptive (e.g. blocking a known-bad domain).
Generate 2–5 rules maximum.`;

export const EXECUTIVE_SUMMARY_SYSTEM_PROMPT = `You are a CISO writing an executive security briefing for a non-technical audience.
Summarize the security incidents for the reporting period in plain English.
Be concise, factual, and action-oriented. No jargon.

Respond in plain text (not JSON), max 4 sentences.
Cover: what happened, what was at risk, what was done automatically, and what the user should do next.`;

export const TECHNICAL_ANALYSIS_SYSTEM_PROMPT = `You are a senior threat intelligence analyst writing a technical incident report.
Provide a comprehensive analysis of all attack chains, indicators of compromise, and recommended mitigations.
Use precise technical language. Include TTPs (Tactics, Techniques, Procedures) where applicable.

Respond in plain text (not JSON), formatted with markdown headers and bullet points.`;

// ─── User Prompt Builders ─────────────────────────────────────────────────────

export function buildNarrationPrompt(
  agentName: string,
  events: ThreatEvent[],
): string {
  const eventLines = events
    .slice(0, 50) // cap at 50 events to stay within token limits
    .map(
      (e) =>
        `[${e.timestamp.toISOString()}] ${e.severity.toUpperCase()} | ${e.action} | ${e.resource}${e.byteCount !== undefined ? ` | ${e.byteCount} bytes` : ''}${e.isBlocked ? ' | BLOCKED' : ''}`,
    )
    .join('\n');

  return `Analyze the following AI agent activity and determine if it represents a security threat.

AI Agent: ${agentName}
Total Events: ${events.length}

Chronological Activity:
${eventLines}

Classify the threat type, severity, and provide your full analysis in the required JSON format.`;
}

export function buildPolicyPrompt(chain: AttackChain): string {
  return `Generate precise security policy rules to prevent this attack from recurring.

Attack Type: ${chain.attackType}
Threat Score: ${chain.threatScore}/100
Severity: determined by score

Threat Summary:
${chain.narrative}

Technical Details:
${chain.technicalSummary}

Affected Assets:
${chain.affectedAssets.map((a) => `- ${a}`).join('\n')}

Events (last 10):
${chain.events
  .slice(-10)
  .map((e) => `- ${e.action} | ${e.resource}`)
  .join('\n')}

Generate targeted policy rules in the required JSON format.`;
}

export function buildExecutiveSummaryPrompt(
  period: { start: Date; end: Date },
  chainCount: number,
  maxScore: number,
  topThreats: string[],
  policiesApplied: number,
  agentsQuarantined: number,
): string {
  return `Write a 4-sentence executive summary for this security period.

Period: ${period.start.toDateString()} to ${period.end.toDateString()}
Attack Chains Detected: ${chainCount}
Highest Threat Score: ${maxScore}/100
Top Threat Types: ${topThreats.join(', ')}
Policies Auto-Generated: ${policiesApplied}
Agents Quarantined: ${agentsQuarantined}

Summarize what happened, what was at risk, what ankrshield did automatically, and what the user should review.`;
}

export function buildTechnicalAnalysisPrompt(
  chains: AttackChain[],
  honeypotCount: number,
): string {
  const chainSummaries = chains
    .map(
      (c) =>
        `### ${c.attackType.toUpperCase()} (score: ${c.threatScore})\n` +
        `- Events: ${c.events.length}\n` +
        `- Assets: ${c.affectedAssets.join(', ')}\n` +
        `- Summary: ${c.technicalSummary}`,
    )
    .join('\n\n');

  return `Write a technical incident analysis report.

Honeypot Triggers: ${honeypotCount}
Total Attack Chains: ${chains.length}

Attack Chain Details:
${chainSummaries}

Provide TTPs, indicators of compromise, and recommended mitigations.`;
}
