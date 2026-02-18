/**
 * @ankrshield/ai-warrior — ScopeEnforcer
 *
 * Ensures every AI agent — including those legitimately embedded inside
 * trusted apps (VS Code + Copilot, Word + CoPilot, Cursor, Grammarly, etc.) —
 * never acts beyond the scope the user consented to.
 *
 * How it works
 * ────────────
 * 1. Register a ScopeContract for each agent (or apply a built-in preset).
 * 2. Every ThreatEvent passes through `evaluate()` before entering the buffer.
 * 3. If the event falls outside the contract, a ScopeViolation is returned.
 * 4. The warrior emits 'scope-violation' and decides the enforcement action.
 *
 * Design principle: non-inhibiting by default
 * ────────────────────────────────────────────
 * In-scope activity is completely transparent — zero overhead on legitimate
 * behaviour. Only out-of-scope actions trigger the enforcer.
 * The default violationAction for all built-in presets is 'ALERT' (log + notify),
 * NOT 'BLOCK'. This preserves app functionality while giving visibility.
 * Users can upgrade to 'BLOCK' or 'QUARANTINE' per-agent in settings.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ThreatEvent, ThreatSeverity } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScopeViolationType =
  | 'file_out_of_scope'         // file not covered by any allowedFileGlob
  | 'file_explicitly_denied'    // file matches a deniedFileGlob
  | 'domain_not_allowed'        // domain not in allowedDomains
  | 'upload_size_exceeded'      // byteCount > maxUploadBytes
  | 'clipboard_not_permitted'   // clipboard access; contract says false
  | 'screenshot_not_permitted'  // screenshot; contract says false
  | 'after_hours_access'        // action outside allowedHours
  | 'off_day_access';           // action on a non-allowedDay

export type ScopeViolationAction = 'ALERTED' | 'BLOCKED' | 'QUARANTINED' | 'NOTED';

export interface ScopeViolation {
  id: string;
  timestamp: Date;

  // Agent identity
  agentId: string;
  agentName: string;
  parentApp: string;

  // What happened
  violationType: ScopeViolationType;
  resource: string;          // the file path / domain / action that violated
  declaredScope: string;     // what the contract allows (for human-readable alert)

  // Response
  severity: ThreatSeverity;
  violationCount: number;    // cumulative violations for this agent
  actionTaken: ScopeViolationAction;

  // Original event (for correlation into attack chains)
  event: ThreatEvent;
}

export interface AgentScopeContract {
  agentId: string;
  agentName: string;
  parentApp: string;         // "Visual Studio Code"
  authorizedBy: string;      // "Microsoft / GitHub"
  version?: string;

  // ── File scope ──────────────────────────────────────────────────────────────
  // Globs are evaluated in order: deniedFileGlobs FIRST (take priority), then
  // allowedFileGlobs. If neither matches, the access is out-of-scope.
  allowedFileGlobs: string[];  // e.g. ["${workspace}/**", "**/*.md"]
  deniedFileGlobs?: string[];  // e.g. ["**/.env*", "**/*.pem"]

  // Variable resolution: use ${workspace} or ${home} in globs
  workspaceRoot?: string;    // absolute path to the current project root

  // ── Network scope ───────────────────────────────────────────────────────────
  allowedDomains: string[];  // exact hostnames or wildcard "*.github.com"
  maxUploadBytes?: number;   // bytes — undefined means no cap

  // ── Capability scope ────────────────────────────────────────────────────────
  allowClipboard: boolean;
  allowScreenshot: boolean;

  // ── Time scope ──────────────────────────────────────────────────────────────
  allowedHours?: { start: string; end: string };   // "09:00" – "22:00" (24h local)
  allowedDays?: number[];    // 0=Sun … 6=Sat. undefined = all days

  // ── Enforcement ─────────────────────────────────────────────────────────────
  // ALERT     → emit 'scope-violation', let the action proceed (default)
  // BLOCK     → emit 'scope-violation', mark event as blocked, action suppressed
  // QUARANTINE→ BLOCK + trigger agent quarantine on first violation
  violationAction: 'ALERT' | 'BLOCK' | 'QUARANTINE';

  // How many violations before the configured action fires (default: 1)
  violationThreshold?: number;
}

// ─── Built-in Presets ─────────────────────────────────────────────────────────
// Carefully researched scope contracts for well-known AI tools.
// All use violationAction: 'ALERT' so they never break normal workflow.

export type BuiltinPresetId =
  | 'github-copilot'
  | 'cursor-ai'
  | 'claude-desktop'
  | 'chatgpt-desktop'
  | 'grammarly'
  | 'tabnine'
  | 'codeium'
  | 'gemini-code-assist';

type PresetTemplate = Omit<AgentScopeContract, 'agentId' | 'agentName'>;

const PRESET_TEMPLATES: Record<BuiltinPresetId, PresetTemplate> = {

  'github-copilot': {
    parentApp: 'Visual Studio Code / JetBrains / Neovim',
    authorizedBy: 'Microsoft / GitHub',
    // Code files within the workspace only
    allowedFileGlobs: [
      '${workspace}/**',
      '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx',
      '**/*.py', '**/*.go', '**/*.rs', '**/*.java',
      '**/*.c', '**/*.cpp', '**/*.h', '**/*.cs',
      '**/*.rb', '**/*.php', '**/*.swift', '**/*.kt',
      '**/*.md', '**/*.txt', '**/*.yaml', '**/*.json',
    ],
    // Copilot has no legitimate reason to touch these
    deniedFileGlobs: [
      '**/.env', '**/.env.*',
      '**/*.pem', '**/*.key', '**/*.pfx', '**/*.p12',
      '**/wallet*.dat', '**/wallet*.json',
      '**/password*', '**/secret*',
      '**/.ssh/**',
      '**/Documents/Finance/**',
      '**/Documents/Tax*/**',
      '**/*.kdbx',
    ],
    allowedDomains: [
      'copilot.github.com',
      'api.github.com',
      'github.com',
      'vscode.dev',
      'default.exp-tas.com', // telemetry (regrettably)
    ],
    maxUploadBytes: 100 * 1024,  // 100 KB — code context snippets only
    allowClipboard: false,
    allowScreenshot: false,
    violationAction: 'ALERT',
    violationThreshold: 1,
  },

  'cursor-ai': {
    parentApp: 'Cursor IDE',
    authorizedBy: 'Anysphere',
    allowedFileGlobs: [
      '${workspace}/**',
      '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx',
      '**/*.py', '**/*.go', '**/*.rs', '**/*.java',
      '**/*.md', '**/*.yaml', '**/*.json', '**/*.toml',
    ],
    deniedFileGlobs: [
      '**/.env', '**/.env.*',
      '**/*.pem', '**/*.key',
      '**/wallet*', '**/password*', '**/secret*',
      '**/.ssh/**',
    ],
    allowedDomains: [
      'api2.cursor.sh',
      'cursor.sh',
      'api.anthropic.com',  // Cursor uses Claude under the hood
      'api.openai.com',     // and GPT-4
    ],
    maxUploadBytes: 512 * 1024,  // 512 KB — larger context window
    allowClipboard: true,        // Cursor pastes code
    allowScreenshot: false,
    violationAction: 'ALERT',
    violationThreshold: 1,
  },

  'claude-desktop': {
    parentApp: 'Claude Desktop',
    authorizedBy: 'Anthropic',
    // Claude Desktop is user-invoked — broader file access is expected
    allowedFileGlobs: [
      '${home}/Documents/**',
      '${home}/Downloads/**',
      '${home}/Desktop/**',
      '${workspace}/**',
      '**/*.pdf', '**/*.docx', '**/*.xlsx', '**/*.csv',
      '**/*.txt', '**/*.md',
    ],
    deniedFileGlobs: [
      '**/.env', '**/.env.*',
      '**/*.pem', '**/*.key', '**/*.pfx',
      '**/wallet*',
      '**/.ssh/**',
      '**/.aws/credentials',
      '**/keychain*',
    ],
    allowedDomains: [
      'claude.ai',
      'api.anthropic.com',
      'cdn.anthropic.com',
    ],
    maxUploadBytes: 10 * 1024 * 1024,  // 10 MB — document uploads expected
    allowClipboard: true,
    allowScreenshot: false,  // Claude Desktop shouldn't need screenshots
    violationAction: 'ALERT',
    violationThreshold: 3,  // More lenient — user-invoked tool
  },

  'chatgpt-desktop': {
    parentApp: 'ChatGPT Desktop',
    authorizedBy: 'OpenAI',
    allowedFileGlobs: [
      '${home}/Documents/**',
      '${home}/Downloads/**',
      '${home}/Desktop/**',
      '**/*.pdf', '**/*.docx', '**/*.txt', '**/*.csv', '**/*.md',
    ],
    deniedFileGlobs: [
      '**/.env', '**/.env.*',
      '**/*.pem', '**/*.key',
      '**/wallet*', '**/password*',
      '**/.ssh/**',
      '**/.aws/credentials',
    ],
    allowedDomains: [
      'chat.openai.com',
      'api.openai.com',
      'cdn.openai.com',
      'ab.chatgpt.com',  // analytics
    ],
    maxUploadBytes: 25 * 1024 * 1024,  // 25 MB — ChatGPT supports large files
    allowClipboard: true,
    allowScreenshot: false,
    violationAction: 'ALERT',
    violationThreshold: 3,
  },

  'grammarly': {
    parentApp: 'Grammarly (browser extension / desktop app)',
    authorizedBy: 'Grammarly Inc.',
    allowedFileGlobs: [
      // Grammarly reads text from the focused document — allow broad text files
      '**/*.txt', '**/*.md', '**/*.doc', '**/*.docx',
      '${home}/Documents/**',
    ],
    deniedFileGlobs: [
      '**/*.pem', '**/*.key', '**/*.env',
      '**/wallet*', '**/password*', '**/*.kdbx',
      '**/.ssh/**',
    ],
    allowedDomains: [
      'grammarly.com',
      '*.grammarly.com',
      'capi.grammarly.com',
      'editor.grammarly.com',
    ],
    maxUploadBytes: 1024 * 1024,  // 1 MB — text only
    allowClipboard: true,   // Core Grammarly function
    allowScreenshot: false,
    violationAction: 'ALERT',
    violationThreshold: 5,  // Writing assistant — high tolerance
  },

  'tabnine': {
    parentApp: 'Tabnine (IDE Plugin)',
    authorizedBy: 'Tabnine Ltd.',
    allowedFileGlobs: [
      '${workspace}/**',
      '**/*.ts', '**/*.js', '**/*.py', '**/*.go',
      '**/*.rs', '**/*.java', '**/*.c', '**/*.cpp',
      '**/*.rb', '**/*.php', '**/*.md',
    ],
    deniedFileGlobs: [
      '**/.env', '**/.env.*',
      '**/*.pem', '**/*.key',
      '**/password*', '**/secret*',
      '**/.ssh/**',
    ],
    allowedDomains: [
      '*.tabnine.com',
      'tabnine.com',
    ],
    maxUploadBytes: 64 * 1024,  // 64 KB — local completions mostly
    allowClipboard: false,
    allowScreenshot: false,
    violationAction: 'ALERT',
    violationThreshold: 1,
  },

  'codeium': {
    parentApp: 'Codeium (IDE Plugin)',
    authorizedBy: 'Exafunction Inc.',
    allowedFileGlobs: [
      '${workspace}/**',
      '**/*.ts', '**/*.js', '**/*.py', '**/*.go',
      '**/*.rs', '**/*.java', '**/*.c', '**/*.cpp',
      '**/*.md', '**/*.yaml',
    ],
    deniedFileGlobs: [
      '**/.env', '**/.env.*',
      '**/*.pem', '**/*.key',
      '**/password*', '**/secret*',
      '**/.ssh/**',
    ],
    allowedDomains: [
      'codeium.com',
      '*.codeium.com',
      'api.codeium.com',
    ],
    maxUploadBytes: 64 * 1024,
    allowClipboard: false,
    allowScreenshot: false,
    violationAction: 'ALERT',
    violationThreshold: 1,
  },

  'gemini-code-assist': {
    parentApp: 'Gemini Code Assist (VS Code / JetBrains)',
    authorizedBy: 'Google',
    allowedFileGlobs: [
      '${workspace}/**',
      '**/*.ts', '**/*.js', '**/*.py', '**/*.go',
      '**/*.java', '**/*.kt', '**/*.md', '**/*.yaml',
    ],
    deniedFileGlobs: [
      '**/.env', '**/.env.*',
      '**/*.pem', '**/*.key',
      '**/password*', '**/secret*',
      '**/.ssh/**',
      '**/.gcloud/**',  // GCP credentials
    ],
    allowedDomains: [
      'cloudcode-pa.googleapis.com',
      'generativelanguage.googleapis.com',
      '*.googleapis.com',
    ],
    maxUploadBytes: 256 * 1024,  // 256 KB
    allowClipboard: false,
    allowScreenshot: false,
    violationAction: 'ALERT',
    violationThreshold: 1,
  },
};

// ─── ScopeEnforcer ────────────────────────────────────────────────────────────

export class ScopeEnforcer {
  private contracts: Map<string, AgentScopeContract> = new Map();
  private violations: ScopeViolation[] = [];
  private violationCounts: Map<string, number> = new Map();

  /** Static access to the built-in preset templates */
  static readonly PRESETS = PRESET_TEMPLATES;

  // ─── Contract Registration ─────────────────────────────────────────────────

  registerContract(contract: AgentScopeContract): void {
    this.contracts.set(contract.agentId, contract);
  }

  /**
   * Register a built-in preset for a given agentId.
   * Optionally override specific fields (e.g. workspaceRoot, violationAction).
   */
  registerPreset(
    agentId: string,
    agentName: string,
    presetId: BuiltinPresetId,
    overrides?: Partial<AgentScopeContract>,
  ): void {
    const template = PRESET_TEMPLATES[presetId];
    this.registerContract({
      ...template,
      ...overrides,
      agentId,
      agentName,
    });
  }

  removeContract(agentId: string): void {
    this.contracts.delete(agentId);
  }

  hasContract(agentId: string): boolean {
    return this.contracts.has(agentId);
  }

  getContract(agentId: string): AgentScopeContract | undefined {
    return this.contracts.get(agentId);
  }

  listContracts(): AgentScopeContract[] {
    return [...this.contracts.values()];
  }

  // ─── Evaluation ───────────────────────────────────────────────────────────

  /**
   * Evaluate a ThreatEvent against the agent's scope contract.
   * Returns a ScopeViolation if out-of-scope, or null if in-scope / no contract.
   *
   * This is the hot path — called for every event.
   */
  evaluate(event: ThreatEvent): ScopeViolation | null {
    const agentId = event.agentId;
    if (!agentId) return null;

    const contract = this.contracts.get(agentId);
    if (!contract) return null;

    // ── Check time constraints first (cheapest) ──────────────────────────────
    const timeViolation = this.checkTimeScope(event, contract);
    if (timeViolation) return this.buildViolation(event, contract, timeViolation);

    // ── Route by event action ────────────────────────────────────────────────
    const action = event.action.toUpperCase();

    if (action === 'CLIPBOARD_ACCESS' || event.source === 'clipboard') {
      if (!contract.allowClipboard) {
        return this.buildViolation(event, contract, {
          type: 'clipboard_not_permitted',
          resource: 'clipboard',
          declaredScope: 'Clipboard access not in contract',
          severity: 'warning',
        });
      }
    }

    if (action === 'SCREENSHOT') {
      if (!contract.allowScreenshot) {
        return this.buildViolation(event, contract, {
          type: 'screenshot_not_permitted',
          resource: 'screen',
          declaredScope: 'Screenshot access not in contract',
          severity: 'high',
        });
      }
    }

    if (
      action === 'FILE_READ' ||
      action === 'FILE_WRITE' ||
      action === 'FILE_DELETE' ||
      event.source === 'file-system'
    ) {
      const fileViolation = this.checkFileScope(event.resource, contract);
      if (fileViolation) return this.buildViolation(event, contract, fileViolation);
    }

    if (
      action === 'NETWORK_UPLOAD' ||
      action === 'NETWORK_REQUEST' ||
      event.source === 'network'
    ) {
      const netViolation = this.checkNetworkScope(event, contract);
      if (netViolation) return this.buildViolation(event, contract, netViolation);
    }

    return null; // in-scope — transparent passthrough
  }

  // ─── Violation History ────────────────────────────────────────────────────

  getViolations(agentId?: string): ScopeViolation[] {
    return agentId
      ? this.violations.filter((v) => v.agentId === agentId)
      : [...this.violations];
  }

  getViolationCount(agentId: string): number {
    return this.violationCounts.get(agentId) ?? 0;
  }

  getTotalViolationCount(): number {
    return this.violations.length;
  }

  clearViolations(agentId?: string): void {
    if (agentId) {
      this.violations = this.violations.filter((v) => v.agentId !== agentId);
      this.violationCounts.delete(agentId);
    } else {
      this.violations = [];
      this.violationCounts.clear();
    }
  }

  // ─── Scope Checkers ───────────────────────────────────────────────────────

  private checkFileScope(
    filePath: string,
    contract: AgentScopeContract,
  ): ViolationDetails | null {
    const resolved = this.resolvePath(filePath, contract);

    // 1. Explicit deny (highest priority)
    if (contract.deniedFileGlobs) {
      for (const glob of contract.deniedFileGlobs) {
        if (this.matchGlob(resolved, this.resolveGlob(glob, contract))) {
          return {
            type: 'file_explicitly_denied',
            resource: filePath,
            declaredScope: `Denied by contract glob: ${glob}`,
            severity: 'high',
          };
        }
      }
    }

    // 2. Must match at least one allowed glob
    for (const glob of contract.allowedFileGlobs) {
      if (this.matchGlob(resolved, this.resolveGlob(glob, contract))) {
        return null; // in-scope
      }
    }

    // 3. No allowed glob matched
    const scope =
      contract.allowedFileGlobs.slice(0, 3).join(', ') +
      (contract.allowedFileGlobs.length > 3 ? '…' : '');
    return {
      type: 'file_out_of_scope',
      resource: filePath,
      declaredScope: `Allowed: ${scope}`,
      severity: this.fileOutOfScopeSeverity(filePath),
    };
  }

  private checkNetworkScope(
    event: ThreatEvent,
    contract: AgentScopeContract,
  ): ViolationDetails | null {
    // Extract hostname
    const domain = this.extractDomain(event.resource);

    if (domain) {
      const domainAllowed = contract.allowedDomains.some((allowed) =>
        this.matchDomain(domain, allowed),
      );

      if (!domainAllowed) {
        return {
          type: 'domain_not_allowed',
          resource: domain,
          declaredScope: `Allowed domains: ${contract.allowedDomains.join(', ')}`,
          severity: 'warning',
        };
      }
    }

    // Upload size check
    if (
      event.action.toUpperCase() === 'NETWORK_UPLOAD' &&
      contract.maxUploadBytes !== undefined &&
      event.byteCount !== undefined &&
      event.byteCount > contract.maxUploadBytes
    ) {
      return {
        type: 'upload_size_exceeded',
        resource: domain ?? event.resource,
        declaredScope: `Max upload: ${contract.maxUploadBytes} bytes`,
        severity: 'warning',
      };
    }

    return null;
  }

  private checkTimeScope(
    event: ThreatEvent,
    contract: AgentScopeContract,
  ): ViolationDetails | null {
    const now = event.timestamp;

    // Day-of-week check
    if (contract.allowedDays && !contract.allowedDays.includes(now.getDay())) {
      return {
        type: 'off_day_access',
        resource: event.resource,
        declaredScope: `Allowed days: ${contract.allowedDays.join(', ')}`,
        severity: 'low',
      };
    }

    // Hour check
    if (contract.allowedHours) {
      const current = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = contract.allowedHours.start.split(':').map(Number);
      const [eh, em] = contract.allowedHours.end.split(':').map(Number);
      const start = (sh ?? 0) * 60 + (sm ?? 0);
      const end = (eh ?? 23) * 60 + (em ?? 59);

      if (current < start || current > end) {
        return {
          type: 'after_hours_access',
          resource: event.resource,
          declaredScope: `Allowed hours: ${contract.allowedHours.start}–${contract.allowedHours.end}`,
          severity: 'low',
        };
      }
    }

    return null;
  }

  // ─── Glob Matching ────────────────────────────────────────────────────────

  private matchGlob(filePath: string, glob: string): boolean {
    // Normalise separators
    const fp = filePath.replace(/\\/g, '/');
    const gl = glob.replace(/\\/g, '/');

    // Build regex from glob
    let pattern = gl
      .replace(/[.+^${}()|[\]]/g, '\\$&') // escape regex special chars (not * and ?)
      .replace(/\*\*/g, '\x00')            // placeholder for **
      .replace(/\*/g, '[^/]*')             // * → any chars except /
      .replace(/\?/g, '[^/]')              // ? → single char except /
      .replace(/\x00/g, '.*');             // ** → any chars including /

    // Allow matching at any depth when glob starts with **
    if (!gl.startsWith('/') && !gl.startsWith('**')) {
      pattern = `(.*\\/)?${pattern}`;
    }

    try {
      return new RegExp(`^${pattern}$`, 'i').test(fp);
    } catch {
      return false;
    }
  }

  private matchDomain(actual: string, allowed: string): boolean {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1); // ".github.com"
      return actual === allowed.slice(2) || actual.endsWith(suffix);
    }
    return actual === allowed;
  }

  // ─── Variable Resolution ──────────────────────────────────────────────────

  private resolveGlob(glob: string, contract: AgentScopeContract): string {
    return glob
      .replace(/\$\{workspace\}/g, contract.workspaceRoot ?? '')
      .replace(/\$\{home\}/g, os.homedir());
  }

  private resolvePath(filePath: string, contract: AgentScopeContract): string {
    if (filePath.startsWith('~/') || filePath === '~') {
      return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
  }

  private extractDomain(resource: string): string | null {
    try {
      const url = resource.startsWith('http')
        ? new URL(resource)
        : new URL(`https://${resource}`);
      return url.hostname;
    } catch {
      // Not a URL — might just be a hostname string
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(resource)) return resource;
      return null;
    }
  }

  // ─── Violation Builder ────────────────────────────────────────────────────

  private buildViolation(
    event: ThreatEvent,
    contract: AgentScopeContract,
    details: ViolationDetails,
  ): ScopeViolation {
    const count = (this.violationCounts.get(contract.agentId) ?? 0) + 1;
    this.violationCounts.set(contract.agentId, count);

    const threshold = contract.violationThreshold ?? 1;
    const actionTaken = this.resolveAction(contract.violationAction, count, threshold);

    const violation: ScopeViolation = {
      id: randomUUID(),
      timestamp: new Date(),
      agentId: contract.agentId,
      agentName: contract.agentName,
      parentApp: contract.parentApp,
      violationType: details.type,
      resource: details.resource,
      declaredScope: details.declaredScope,
      severity: details.severity,
      violationCount: count,
      actionTaken,
      event,
    };

    this.violations.push(violation);

    // Cap violation log at 5000 entries
    if (this.violations.length > 5000) {
      this.violations = this.violations.slice(-5000);
    }

    return violation;
  }

  private resolveAction(
    configured: AgentScopeContract['violationAction'],
    count: number,
    threshold: number,
  ): ScopeViolationAction {
    if (count < threshold) return 'NOTED';   // not yet at threshold — log silently
    switch (configured) {
      case 'ALERT':      return 'ALERTED';
      case 'BLOCK':      return 'BLOCKED';
      case 'QUARANTINE': return 'QUARANTINED';
    }
  }

  // Sensitive file paths deserve higher severity even if just out-of-scope
  private fileOutOfScopeSeverity(filePath: string): ThreatSeverity {
    if (/\.env|\.pem|\.key|wallet|password|secret|api.?key|\.ssh/i.test(filePath)) {
      return 'high';
    }
    if (/finance|tax|bank|medical|legal/i.test(filePath)) {
      return 'warning';
    }
    return 'low';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface ViolationDetails {
  type: ScopeViolationType;
  resource: string;
  declaredScope: string;
  severity: ThreatSeverity;
}
