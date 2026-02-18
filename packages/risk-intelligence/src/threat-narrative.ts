/**
 * AI Threat Narrative Engine — via ANKR AI Proxy (Frugal)
 *
 * Uses the ANKR AI Proxy (localhost:4444) with strategy="free_first" to
 * auto-select the cheapest available provider (Groq, DeepSeek, etc.)
 * Cost: $0.00 for free-tier providers.
 *
 * Converts raw risk intelligence signals into a plain-English threat briefing —
 * the kind of analysis that normally requires a $5,000/month human CTI analyst.
 *
 * Output:
 *   - Executive summary  (3–4 sentences, board-ready)
 *   - Technical brief    (for the security team)
 *   - Immediate actions  (ordered remediation steps)
 *   - Risk explanation   (why this score was assigned)
 *   - Threat actor profile (when signals point to one)
 *   - Estimated time-to-exploit
 *
 * Requires: ANKR_AI_PROXY_URL env var (defaults to http://localhost:4444)
 * Falls back to ANTHROPIC_API_KEY direct call if proxy unavailable.
 * Returns null silently if neither is configured.
 */

import type { RiskReport } from './types.js';

const TIMEOUT_MS = 30_000;

export interface ThreatNarrative {
  /** 3–4 sentence board-ready summary of the risk posture */
  executiveSummary: string;
  /** Technical analysis of the threat signals for the security team */
  technicalBrief: string;
  /** Ordered list of specific remediation actions to take immediately */
  immediateActions: string[];
  /** Plain-English explanation of why the risk score was assigned */
  riskExplanation: string;
  /** Predicted threat actor profile based on the signals (if applicable) */
  threatActorProfile: string | null;
  /** Estimated time-to-exploit if vulnerabilities are not remediated */
  estimatedTimeToExploit: string | null;
  /** Which AI provider generated this narrative (for transparency) */
  generatedBy?: string;
}

function condensedReport(report: RiskReport): object {
  return {
    domain: report.domain,
    serverIp: report.serverIp,
    riskScore: report.riskScore,
    riskLevel: report.riskLevel,
    topFactors: report.factors
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((f) => ({ category: f.category, score: f.score, summary: f.summary })),
    breachCount: report.breaches.length,
    topBreaches: report.breaches.slice(0, 3).map((b) => ({
      name: b.name,
      date: b.breachDate,
      dataClasses: b.dataClasses.slice(0, 3),
    })),
    phishingDomains: report.domainThreats.length,
    registeredTyposquats: report.registeredTyposquats.length,
    suspiciousCerts: report.suspiciousCerts.length,
    githubLeaks: report.githubLeaks.length,
    phishingFeedHits: report.phishingHits.length,
    asnInfo: report.asnRecord
      ? {
          asn: report.asnRecord.asn,
          org: report.asnRecord.org,
          country: report.asnRecord.country,
          isBulletproof: report.asnRecord.isBulletproof,
          geopoliticalRisk: report.asnRecord.geopoliticalRisk,
        }
      : null,
    dnsSecurityScore: report.dnsSecurityReport?.securityScore ?? null,
    spfPolicy: report.dnsSecurityReport?.spf.policy ?? null,
    dmarcPolicy: report.dnsSecurityReport?.dmarc.policy ?? null,
    exposedPorts: report.exposedServices.map((s) => s.port),
    cves: report.exposedServices.flatMap((s) => s.cves).slice(0, 5),
    otxPulses: report.otx?.pulseCount ?? 0,
    pasteHits: report.pasteHits.length,
  };
}

const SYSTEM_PROMPT = `You are a senior Cyber Threat Intelligence (CTI) analyst at a top-tier cybersecurity firm.
Write threat intelligence briefings for clients. Style rules:
- Executive summary: clear, direct, non-technical, board-ready
- Technical brief: precise, uses industry terminology correctly
- Immediate actions: actionable, prioritized, specific (not generic), start each with a verb
- Risk explanation: connects the dots between individual signals and the overall score
- Threat actor profile: only if there are strong signals; null otherwise
- Time-to-exploit: realistic estimate based on actual signals; null if no exploitable vectors

CRITICAL: Respond with a valid JSON object ONLY. No markdown, no code fences, no preamble. Just JSON.`;

function buildPrompt(report: object): string {
  return `Analyze this digital risk intelligence report and write a comprehensive threat narrative.

RISK REPORT:
${JSON.stringify(report, null, 2)}

Return a JSON object with exactly these keys:
{
  "executiveSummary": "3-4 sentences, board-ready, mentions domain and risk level",
  "technicalBrief": "2-3 paragraphs with specific technical details about each major finding",
  "immediateActions": ["action1", "action2", "..."],
  "riskExplanation": "1-2 paragraphs explaining why this score, connecting the signals",
  "threatActorProfile": "describe likely adversary if signals suggest it, or null",
  "estimatedTimeToExploit": "realistic estimate if vulnerabilities exist, or null"
}`;
}

/**
 * Generate threat narrative via ANKR AI Proxy (free_first strategy — cost $0).
 * Falls back to direct Anthropic API if proxy is unreachable.
 */
export async function generateThreatNarrative(
  report: RiskReport,
  _anthropicApiKey?: string
): Promise<ThreatNarrative | null> {
  const proxyBase = process.env['ANKR_AI_PROXY_URL'] ?? 'http://localhost:4444';
  const condensed = condensedReport(report);
  const prompt = buildPrompt(condensed);

  // Primary: ANKR AI Proxy (free, frugal)
  try {
    const res = await fetch(`${proxyBase}/api/ai/complete`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        strategy: 'free_first',
        maxTokens: 1200,
        temperature: 0.1,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { content?: string; provider?: string; model?: string };
      const text = data.content;
      if (text) {
        const clean = text
          .replace(/^```(?:json)?\n?/i, '')
          .replace(/\n?```$/i, '')
          .trim();
        const parsed = JSON.parse(clean) as ThreatNarrative;
        parsed.generatedBy = data.provider ? `${data.provider}/${data.model}` : 'ankr-proxy';
        return parsed;
      }
    }
  } catch {
    // Proxy unavailable — fall through to Anthropic fallback
  }

  // Fallback: Direct Anthropic API (only if key available)
  const anthropicKey = _anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!anthropicKey) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'xShieldAI/1.0',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === 'text')?.text;
    if (!text) return null;

    const clean = text
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();
    const parsed = JSON.parse(clean) as ThreatNarrative;
    parsed.generatedBy = 'anthropic/claude-haiku-4-5';
    return parsed;
  } catch {
    return null;
  }
}
