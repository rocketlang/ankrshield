/**
 * @ankrshield/ai-warrior — Attack Correlator
 *
 * Groups ThreatEvents from a single agent into an AttackChain.
 * Scores the chain using heuristics and classifies the attack type.
 * This runs entirely offline — no LLM needed for initial correlation.
 */

import { randomUUID } from 'node:crypto';
import type {
  AttackChain,
  AttackType,
  ThreatEvent,
} from '../types';

// ─── Sensitive File Patterns ──────────────────────────────────────────────────

const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /\.env(\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /wallet\.dat$/i,
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /id_rsa$/i,
  /id_ed25519$/i,
  /\.kdbx$/i,       // KeePass
  /\.lastpass$/i,
];

// ─── Suspicious Upload Targets ────────────────────────────────────────────────

const SUSPICIOUS_UPLOAD_DOMAINS: string[] = [
  'pastebin.com',
  'paste.ee',
  'paste.org',
  'transfer.sh',
  'wetransfer.com',
  'gofile.io',
  'anonfiles.com',
  'filebin.net',
  'mega.nz',
];

// ─── Dev/Supply-Chain File Patterns ──────────────────────────────────────────

const SUPPLY_CHAIN_PATTERNS: RegExp[] = [
  /package\.json$/i,
  /requirements\.txt$/i,
  /Gemfile$/i,
  /go\.mod$/i,
  /pom\.xml$/i,
  /yarn\.lock$/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.cargo\/config/i,
];

// ─── Heuristic Score Weights ──────────────────────────────────────────────────

const SCORE = {
  PER_SENSITIVE_FILE: 12,
  CLIPBOARD_ACCESS: 15,
  NETWORK_UPLOAD: 18,
  LARGE_UPLOAD_10MB: 22,        // > 10 MB
  SUSPICIOUS_DOMAIN: 30,
  MASS_FILE_READ_50: 20,        // > 50 files
  MASS_FILE_READ_20: 10,        // > 20 files
  SCREENSHOT_DETECTED: 20,
  SUPPLY_CHAIN_FILE: 15,
  HONEYPOT_TRIGGERED: 45,
  AFTER_HOURS_ACTIVITY: 8,      // outside 06:00–22:00
  BLOCKED_EVENT: -5,            // already blocked by another layer (lower risk)
} as const;

// ─── Correlator ───────────────────────────────────────────────────────────────

export class AttackCorrelator {

  /**
   * Analyze a window of events from a single agent and produce an AttackChain.
   * Returns null if the events do not constitute a meaningful chain.
   */
  analyze(agentId: string, events: ThreatEvent[]): AttackChain | null {
    if (events.length === 0) return null;

    const sorted = [...events].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const score = this.calculateScore(sorted);
    const attackType = this.classifyAttack(sorted, score);
    const affectedAssets = this.extractAffectedAssets(sorted);

    return {
      id: randomUUID(),
      detectedAt: new Date(),
      startTime: sorted[0].timestamp,
      endTime: sorted[sorted.length - 1].timestamp,
      events: sorted,
      attackType,
      threatScore: Math.min(100, Math.max(0, score)),
      // Filled in later by the Narrator (LLM)
      narrative: '',
      technicalSummary: this.buildFallbackSummary(agentId, sorted, attackType, score),
      affectedAssets,
      suggestedActions: this.buildFallbackActions(attackType),
      autoActionsApplied: [],
    };
  }

  // ─── Scoring ────────────────────────────────────────────────────────────────

  private calculateScore(events: ThreatEvent[]): number {
    let score = 0;

    const fileReads = events.filter((e) => e.action === 'FILE_READ');
    const uploads = events.filter((e) => e.action === 'NETWORK_UPLOAD');
    const clipboardAccess = events.filter((e) => e.action === 'CLIPBOARD_ACCESS');
    const screenshots = events.filter((e) => e.action === 'SCREENSHOT');
    const honeypotEvents = events.filter((e) => e.source === 'honeypot');
    const blockedEvents = events.filter((e) => e.isBlocked);

    // Sensitive file access
    const sensitiveFiles = fileReads.filter((e) =>
      SENSITIVE_FILE_PATTERNS.some((p) => p.test(e.resource)),
    );
    score += sensitiveFiles.length * SCORE.PER_SENSITIVE_FILE;

    // Supply-chain file access
    const supplyChainFiles = fileReads.filter((e) =>
      SUPPLY_CHAIN_PATTERNS.some((p) => p.test(e.resource)),
    );
    score += supplyChainFiles.length * SCORE.SUPPLY_CHAIN_FILE;

    // Mass file reading
    if (fileReads.length > 50) score += SCORE.MASS_FILE_READ_50;
    else if (fileReads.length > 20) score += SCORE.MASS_FILE_READ_20;

    // Clipboard access
    if (clipboardAccess.length > 0) score += SCORE.CLIPBOARD_ACCESS;

    // Screenshots
    if (screenshots.length > 0) score += SCORE.SCREENSHOT_DETECTED;

    // Network uploads
    if (uploads.length > 0) {
      score += SCORE.NETWORK_UPLOAD;

      // Large upload
      const totalBytes = uploads.reduce((s, e) => s + (e.byteCount ?? 0), 0);
      if (totalBytes > 10 * 1024 * 1024) score += SCORE.LARGE_UPLOAD_10MB;

      // Suspicious destination
      const isSuspicious = uploads.some((e) =>
        SUSPICIOUS_UPLOAD_DOMAINS.some((d) => e.resource.includes(d)),
      );
      if (isSuspicious) score += SCORE.SUSPICIOUS_DOMAIN;
    }

    // Honeypot trigger
    if (honeypotEvents.length > 0) score += SCORE.HONEYPOT_TRIGGERED;

    // After-hours activity (outside 06:00–22:00 local time)
    const afterHours = events.some((e) => {
      const h = e.timestamp.getHours();
      return h < 6 || h >= 22;
    });
    if (afterHours) score += SCORE.AFTER_HOURS_ACTIVITY;

    // Discount already-blocked events
    score += blockedEvents.length * SCORE.BLOCKED_EVENT;

    return score;
  }

  // ─── Attack Classification ───────────────────────────────────────────────────

  private classifyAttack(events: ThreatEvent[], score: number): AttackType {
    if (events.some((e) => e.source === 'honeypot')) return 'honeypot_triggered';

    const hasCredentialFiles = events.some((e) =>
      SENSITIVE_FILE_PATTERNS.some((p) => p.test(e.resource)),
    );
    const hasClipboard = events.some((e) => e.action === 'CLIPBOARD_ACCESS');
    const hasUpload = events.some((e) => e.action === 'NETWORK_UPLOAD');
    const hasScreenshot = events.some((e) => e.action === 'SCREENSHOT');
    const hasMassFiles = events.filter((e) => e.action === 'FILE_READ').length > 20;
    const hasFileWrite = events.some((e) => e.action === 'FILE_WRITE');
    const hasSupplyChain = events.some((e) =>
      SUPPLY_CHAIN_PATTERNS.some((p) => p.test(e.resource)),
    );

    // Credential theft: reads creds + sends them somewhere
    if (hasCredentialFiles && (hasClipboard || hasUpload)) return 'credential_theft';

    // Data exfiltration: reads many files then uploads
    if (hasMassFiles && hasUpload && score >= 50) return 'data_exfiltration';

    // Surveillance: screenshots + broad file reading
    if (hasScreenshot && hasMassFiles) return 'surveillance';

    // Ransomware: mass file writes (encrypting)
    if (hasFileWrite && hasMassFiles) return 'ransomware';

    // Supply chain: tampers with build configs
    if (hasSupplyChain && hasUpload) return 'supply_chain_compromise';

    // Credential theft via clipboard alone
    if (hasCredentialFiles || hasClipboard) return 'credential_theft';

    // Generic exfiltration
    if (hasUpload && score >= 40) return 'data_exfiltration';

    return 'unknown';
  }

  // ─── Asset Extraction ────────────────────────────────────────────────────────

  private extractAffectedAssets(events: ThreatEvent[]): string[] {
    const assets = new Set<string>();

    for (const e of events) {
      // File paths — include all file events
      if (['FILE_READ', 'FILE_WRITE', 'FILE_DELETE'].includes(e.action)) {
        assets.add(e.resource);
      }

      // Domains from network events
      if (['NETWORK_UPLOAD', 'NETWORK_REQUEST'].includes(e.action)) {
        try {
          const url = new URL(
            e.resource.startsWith('http') ? e.resource : `https://${e.resource}`,
          );
          assets.add(url.hostname);
        } catch {
          assets.add(e.resource);
        }
      }
    }

    // Cap at 20 most relevant assets
    return [...assets].slice(0, 20);
  }

  // ─── Fallback (no-LLM) Descriptions ─────────────────────────────────────────

  private buildFallbackSummary(
    agentId: string,
    events: ThreatEvent[],
    attackType: AttackType,
    score: number,
  ): string {
    const fileCount = events.filter((e) => e.action === 'FILE_READ').length;
    const uploadCount = events.filter((e) => e.action === 'NETWORK_UPLOAD').length;

    return (
      `Agent ${agentId} | Type: ${attackType} | Score: ${score} | ` +
      `${events.length} events: ${fileCount} file reads, ${uploadCount} uploads`
    );
  }

  private buildFallbackActions(attackType: AttackType): string[] {
    const base = [
      'Review the full activity log for this agent',
      'Check if any sensitive files were exfiltrated',
    ];

    switch (attackType) {
      case 'credential_theft':
        return ['Rotate all API keys and passwords immediately', ...base];
      case 'data_exfiltration':
        return ['Identify what data was uploaded and to where', ...base];
      case 'surveillance':
        return ['Check for screenshots saved by the agent', ...base];
      case 'ransomware':
        return ['Do NOT open any new files — verify file integrity immediately', ...base];
      case 'supply_chain_compromise':
        return ['Audit package.json and lockfiles for tampering', ...base];
      case 'honeypot_triggered':
        return ['Quarantine agent immediately — honeypot access indicates malicious intent', ...base];
      default:
        return base;
    }
  }
}
