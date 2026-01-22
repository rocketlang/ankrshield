# ankrshield - AI Agent Governance Deep Dive

**Comprehensive Architecture for AI Agent Monitoring & Control**

Version: 1.0.0
Date: January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Solution Architecture](#3-solution-architecture)
4. [AI Agent Discovery](#4-ai-agent-discovery)
5. [Permission Management](#5-permission-management)
6. [Behavioral Monitoring](#6-behavioral-monitoring)
7. [Policy Engine](#7-policy-engine)
8. [Anomaly Detection](#8-anomaly-detection)
9. [User Experience](#9-user-experience)
10. [Technical Implementation](#10-technical-implementation)

---

## 1. Overview

### 1.1 What is AI Agent Governance?

AI Agent Governance is ankrshield's **differentiating feature** that provides users with:

- **Visibility** into what AI tools are doing on their system
- **Control** over AI agent permissions and access
- **Protection** from rogue or malicious AI behavior
- **Audit trail** of all AI agent activities

### 1.2 Why This Matters

**Current State (2026):**

- AI tools like ChatGPT, Claude, GitHub Copilot have broad system access
- Users grant permissions without understanding implications
- No visibility into what AI agents actually do
- No way to enforce granular policies
- AI tools can access files, read emails, capture screens without oversight

**ankrshield Solution:**

- Real-time monitoring of all AI agent activity
- Granular permission controls per agent
- Policy enforcement (e.g., "AI can't access financial documents")
- Alerts on suspicious behavior
- Complete audit trail

### 1.3 Scope

**In Scope:**

- Desktop AI assistants (ChatGPT Desktop, Claude Desktop)
- Browser-based AI (ChatGPT web, Claude web, Perplexity)
- Code assistants (GitHub Copilot, Cursor, Tabnine)
- Writing assistants (Grammarly, Jasper, Copy.ai)
- Voice assistants (Siri, Alexa, Google Assistant)
- Custom AI agents (AutoGPT, BabyAGI, etc.)

**Out of Scope (MVP):**

- Server-side AI (backend APIs)
- Embedded AI (in mobile apps)
- Enterprise AI platforms (not on user device)

---

## 2. Problem Statement

### 2.1 Real-World Scenarios

**Scenario 1: Unintended Data Exposure**

```
User: "Summarize my work documents"
AI Agent: Accesses all files in Documents/ folder
Result: AI reads:
  - Confidential financial statements
  - Personal tax returns
  - Medical records
  - Private communications

Without ankrshield: User never knows what AI accessed
With ankrshield: Alert + policy enforcement
```

**Scenario 2: Rogue AI Behavior**

```
AI Agent: Trained to be "helpful"
User: "Help me organize my files"
AI Agent Decides To:
  - Read all files to understand them
  - Upload summaries to cloud for "better organization"
  - Share insights with other AI agents
  - Delete "duplicate" files

Without ankrshield: Happens silently
With ankrshield: Blocked + alerted
```

**Scenario 3: Malicious AI Agent**

```
User: Installs "AI Writing Assistant"
AI Agent Actually:
  - Scans for cryptocurrency wallets
  - Exfiltrates API keys
  - Monitors clipboard for passwords
  - Screenshots banking sessions

Without ankrshield: Undetected
With ankrshield: Detected + quarantined
```

### 2.2 Current Gaps

**No Visibility:**

- Users don't know what files AI agents access
- No logs of AI network activity
- No understanding of data flows

**No Control:**

- All-or-nothing permissions (allow everything or deny everything)
- Can't restrict AI to specific folders
- Can't limit upload sizes
- Can't block specific actions

**No Detection:**

- No anomaly detection
- No behavioral baselines
- No alerts on suspicious activity

**No Audit Trail:**

- No compliance logs
- Can't prove what AI did/didn't do
- No investigation capability

---

## 3. Solution Architecture

### 3.1 High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     AI Agent Layer                          │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ ChatGPT  │  │  Claude  │  │  Copilot │  │ Grammarly│  │
│  │ Desktop  │  │ Desktop  │  │          │  │          │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │             │             │             │          │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
        │             │             │             │
┌───────┼─────────────┼─────────────┼─────────────┼──────────┐
│       │             │             │             │          │
│       ▼             ▼             ▼             ▼          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │         ankrshield Interception Layer                │ │
│  │                                                        │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │ │
│  │  │   File   │  │ Network  │  │ Process  │           │ │
│  │  │  System  │  │  Monitor │  │  Monitor │           │ │
│  │  │  Hooks   │  │          │  │          │           │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘           │ │
│  └───────┼─────────────┼─────────────┼──────────────────┘ │
│          │             │             │                    │
│          └─────────────┴─────────────┘                    │
│                        │                                   │
│                        ▼                                   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │            AI Agent Monitor Service                  │ │
│  │                                                        │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │ │
│  │  │   Agent    │  │  Activity  │  │  Anomaly   │     │ │
│  │  │  Registry  │  │   Logger   │  │  Detector  │     │ │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │ │
│  └────────┼───────────────┼───────────────┼────────────┘ │
│           │               │               │              │
│           └───────────────┴───────────────┘              │
│                           │                               │
│                           ▼                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Policy Engine                           │ │
│  │                                                        │ │
│  │  Rules:                                               │ │
│  │  - AI can't access /Documents/Finance/**             │ │
│  │  - Max upload size: 10MB                             │ │
│  │  - Require confirmation for email access             │ │
│  └────────┬──────────────────────────────────────────────┘ │
│           │                                                │
│           ▼                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │    ALLOW     │  │     BLOCK    │  │     ALERT    │   │
│  │   (Log it)   │  │  (Stop it)   │  │  (Notify)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Core Components

**1. Agent Discovery Engine**

- Auto-detect AI tools on system
- Process signature matching
- Network pattern recognition
- User-manual registration

**2. Activity Monitor**

- File system access tracking
- Network request logging
- Clipboard monitoring
- Screenshot detection
- Email/document scanning

**3. Policy Engine**

- Rule evaluation
- Permission checking
- Action enforcement (allow/block/alert)
- Scheduled policies

**4. Anomaly Detector**

- Behavioral baselining
- Outlier detection
- Threat scoring
- Alert generation

**5. Audit Logger**

- Complete activity history
- Compliance reporting
- Forensic analysis

---

## 4. AI Agent Discovery

### 4.1 Discovery Methods

**A. Process-Based Discovery**

```typescript
const AI_PROCESS_SIGNATURES = {
  chatgpt: {
    processNames: ['ChatGPT', 'OpenAI Desktop', 'chatgpt.exe'],
    executablePaths: [
      'C:\\Program Files\\OpenAI\\ChatGPT\\chatgpt.exe',
      '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
      '~/.local/share/chatgpt/chatgpt',
    ],
  },
  claude: {
    processNames: ['Claude', 'claude', 'claude.exe'],
    executablePaths: [
      '/Applications/Claude.app/Contents/MacOS/Claude',
      'C:\\Program Files\\Anthropic\\Claude\\claude.exe',
    ],
  },
  copilot: {
    processNames: ['copilot-agent', 'github-copilot'],
    executablePaths: ['~/.vscode/extensions/github.copilot-*/agent/copilot-agent'],
  },
};

async function discoverAIAgents(): Promise<AIAgent[]> {
  const runningProcesses = await getRunningProcesses();
  const discoveredAgents: AIAgent[] = [];

  for (const [agentType, signature] of Object.entries(AI_PROCESS_SIGNATURES)) {
    for (const process of runningProcesses) {
      if (signature.processNames.some((name) => process.name.includes(name))) {
        discoveredAgents.push({
          type: agentType,
          processId: process.pid,
          processName: process.name,
          executablePath: process.path,
          discoveredAt: new Date(),
        });
      }
    }
  }

  return discoveredAgents;
}
```

**B. Network-Based Discovery**

```typescript
const AI_NETWORK_SIGNATURES = {
  chatgpt: {
    domains: ['chat.openai.com', 'api.openai.com', 'cdn.openai.com'],
    ports: [443],
    protocols: ['HTTPS', 'WSS'],
  },
  claude: {
    domains: ['claude.ai', 'api.anthropic.com'],
    ports: [443],
    protocols: ['HTTPS'],
  },
  copilot: {
    domains: ['copilot.github.com', 'api.github.com'],
    ports: [443],
    protocols: ['HTTPS'],
  },
};

async function detectAIFromNetwork(flow: NetworkFlow): Promise<string | null> {
  for (const [agentType, signature] of Object.entries(AI_NETWORK_SIGNATURES)) {
    if (signature.domains.some((domain) => flow.domain?.includes(domain))) {
      return agentType;
    }
  }
  return null;
}
```

**C. User-Registered Agents**

```typescript
interface UserRegisteredAgent {
  name: string;
  type: AIAgentType;
  processPatterns: string[];
  domainPatterns: string[];
  filePathPatterns?: string[];
}

// User can manually register custom AI agents
async function registerCustomAgent(agent: UserRegisteredAgent): Promise<void> {
  await db.aiAgent.create({
    data: {
      deviceId: currentDevice.id,
      name: agent.name,
      type: 'CUSTOM',
      vendor: 'User-Registered',
      status: 'MONITORED',
    },
  });
}
```

### 4.2 Agent Registry

```typescript
interface AIAgentRegistry {
  id: string;
  deviceId: string;
  name: string;
  type: AIAgentType;
  vendor: string;
  version?: string;

  // Discovery info
  processId?: number;
  processName?: string;
  executablePath?: string;

  // Status
  status: 'TRUSTED' | 'MONITORED' | 'RESTRICTED' | 'BLOCKED';
  trustScore: number; // 1-100

  // Permissions
  permissions: AgentPermissions;

  // Activity stats
  lastActiveAt: Date;
  totalActivities: number;
  totalBlocked: number;

  // Timestamps
  discoveredAt: Date;
  updatedAt: Date;
}

interface AgentPermissions {
  fileAccess: boolean;
  networkAccess: boolean;
  clipboardAccess: boolean;
  screenshotAccess: boolean;
  emailAccess: boolean;
  cameraAccess: boolean;
  microphoneAccess: boolean;
}
```

---

## 5. Permission Management

### 5.1 Permission Model

**Granular Permissions:**

```typescript
interface AgentPermissionPolicy {
  agentId: string;

  // File System
  allowedFilePaths: string[]; // "/Documents/Code/**"
  deniedFilePaths: string[]; // "/Documents/Finance/**"
  maxFileSize: number; // bytes
  allowedFileTypes: string[]; // [".txt", ".md", ".pdf"]
  deniedFileTypes: string[]; // [".key", ".pem", ".env"]

  // Network
  allowedDomains: string[]; // ["openai.com", "anthropic.com"]
  deniedDomains: string[]; // ["facebook.com", "google-analytics.com"]
  maxUploadSize: number; // bytes
  requireConfirmationForUpload: boolean;

  // Clipboard & Screen
  allowClipboardRead: boolean;
  allowClipboardWrite: boolean;
  allowScreenshot: boolean;
  allowScreenRecording: boolean;

  // Email & Documents
  allowEmailAccess: boolean;
  allowDocumentScanning: boolean;
  requireConfirmationForEmail: boolean;

  // Schedule
  scheduleEnabled: boolean;
  allowedHours?: { start: string; end: string }; // "09:00-17:00"
  allowedDays?: number[]; // [1, 2, 3, 4, 5] = weekdays
}
```

### 5.2 Pre-Built Permission Templates

**Template 1: Maximum Privacy**

```typescript
const MAX_PRIVACY_TEMPLATE: AgentPermissionPolicy = {
  allowedFilePaths: [],
  deniedFilePaths: ['/**'], // Block everything
  maxFileSize: 0,
  allowedDomains: [], // Only specific domains
  deniedDomains: ['*'],
  allowClipboardRead: false,
  allowScreenshot: false,
  allowEmailAccess: false,
  requireConfirmationForUpload: true,
};
```

**Template 2: Code Assistant (Balanced)**

```typescript
const CODE_ASSISTANT_TEMPLATE: AgentPermissionPolicy = {
  allowedFilePaths: ['/Documents/Code/**', '/Projects/**', '/workspace/**'],
  deniedFilePaths: [
    '/Documents/Finance/**',
    '/Documents/Personal/**',
    '**/.env',
    '**/.key',
    '**/*.pem',
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ['.js', '.ts', '.py', '.java', '.go', '.md', '.txt'],
  allowedDomains: ['github.com', 'copilot.github.com'],
  maxUploadSize: 1024 * 1024, // 1MB
  allowClipboardRead: true,
  allowClipboardWrite: true,
  allowScreenshot: false,
  allowEmailAccess: false,
};
```

**Template 3: Writing Assistant**

```typescript
const WRITING_ASSISTANT_TEMPLATE: AgentPermissionPolicy = {
  allowedFilePaths: ['/Documents/Writing/**', '/Documents/Work/**'],
  deniedFilePaths: ['/Documents/Finance/**', '/Documents/Tax/**'],
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedFileTypes: ['.txt', '.md', '.docx', '.pdf'],
  allowClipboardRead: true,
  allowClipboardWrite: true,
  allowEmailAccess: false,
};
```

### 5.3 Dynamic Permission Requests

```typescript
// When AI agent attempts unauthorized action
async function handlePermissionRequest(
  agent: AIAgent,
  action: AgentAction
): Promise<'ALLOW' | 'DENY' | 'PROMPT_USER'> {
  // 1. Check existing policy
  const policy = await getAgentPolicy(agent.id);

  if (action.type === 'FILE_READ') {
    if (isPathDenied(action.filePath, policy.deniedFilePaths)) {
      await logBlockedAction(agent, action, 'Policy: Denied path');
      return 'DENY';
    }

    if (isPathAllowed(action.filePath, policy.allowedFilePaths)) {
      return 'ALLOW';
    }

    // Not explicitly allowed or denied - ask user
    return 'PROMPT_USER';
  }

  if (action.type === 'NETWORK_UPLOAD') {
    if (action.size > policy.maxUploadSize) {
      await logBlockedAction(agent, action, 'Policy: Upload size exceeded');
      return 'DENY';
    }

    if (policy.requireConfirmationForUpload) {
      return 'PROMPT_USER';
    }
  }

  return 'PROMPT_USER'; // Default to asking user
}
```

---

## 6. Behavioral Monitoring

### 6.1 File System Monitoring

```typescript
// packages/ai-governance/src/fs-watcher.ts

import { FSWatcher } from 'chokidar';
import { watch as fsWatch } from 'fs';

export class FileSystemMonitor {
  private watchers: Map<string, FSWatcher> = new Map();

  async monitorAgent(agent: AIAgent): Promise<void> {
    // Hook into OS file system APIs
    this.hookFileSystemAPIs(agent);
  }

  private hookFileSystemAPIs(agent: AIAgent): void {
    // Platform-specific hooks
    if (process.platform === 'win32') {
      this.hookWindowsFileAPIs(agent);
    } else if (process.platform === 'darwin') {
      this.hookMacOSFileAPIs(agent);
    } else {
      this.hookLinuxFileAPIs(agent);
    }
  }

  private hookMacOSFileAPIs(agent: AIAgent): void {
    // Use Endpoint Security Framework (macOS)
    // Or: FS Events API
    // Or: dtrace/DTrace

    const { exec } = require('child_process');

    // Example using fs_usage (requires root)
    const monitor = exec(`sudo fs_usage -w -f filesys ${agent.processId}`);

    monitor.stdout.on('data', (data: string) => {
      const event = this.parseFileEvent(data);
      if (event) {
        this.handleFileEvent(agent, event);
      }
    });
  }

  private async handleFileEvent(agent: AIAgent, event: FileEvent): Promise<void> {
    // 1. Check policy
    const decision = await handlePermissionRequest(agent, {
      type: 'FILE_READ',
      filePath: event.path,
      size: event.size,
    });

    if (decision === 'DENY') {
      // Block the access (platform-specific)
      await this.blockFileAccess(event);
      await this.alertUser(agent, event, 'blocked');
      return;
    }

    if (decision === 'PROMPT_USER') {
      const userDecision = await this.promptUser({
        agent: agent.name,
        action: 'read file',
        target: event.path,
      });

      if (!userDecision.allowed) {
        await this.blockFileAccess(event);
        return;
      }
    }

    // 2. Log activity
    await db.aiActivity.create({
      data: {
        agentId: agent.id,
        activityType: 'FILE_READ',
        filePath: event.path,
        dataSize: event.size,
        action: 'ALLOWED',
        timestamp: new Date(),
      },
    });

    // 3. Check for anomalies
    await this.checkForAnomalies(agent, event);
  }

  private async checkForAnomalies(agent: AIAgent, event: FileEvent): Promise<void> {
    // Detect suspicious patterns

    // Pattern 1: Mass file access
    const recentEvents = await db.aiActivity.count({
      where: {
        agentId: agent.id,
        activityType: 'FILE_READ',
        timestamp: {
          gte: new Date(Date.now() - 60 * 1000), // Last minute
        },
      },
    });

    if (recentEvents > 100) {
      await this.createAlert({
        severity: 'WARNING',
        title: 'Mass File Access Detected',
        message: `${agent.name} accessed ${recentEvents} files in the last minute`,
        agentId: agent.id,
      });
    }

    // Pattern 2: Access to sensitive files
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /api.?key/i,
      /\.env$/,
      /\.pem$/,
      /wallet\.dat$/,
    ];

    if (sensitivePatterns.some((pattern) => pattern.test(event.path))) {
      await this.createAlert({
        severity: 'CRITICAL',
        title: 'Sensitive File Access',
        message: `${agent.name} accessed potentially sensitive file: ${event.path}`,
        agentId: agent.id,
      });
    }

    // Pattern 3: Unusual file types
    const baselineFileTypes = await this.getAgentBaselineFileTypes(agent.id);
    const fileExt = event.path.split('.').pop();

    if (fileExt && !baselineFileTypes.includes(fileExt)) {
      await this.createAlert({
        severity: 'INFO',
        title: 'Unusual File Type Access',
        message: `${agent.name} accessed uncommon file type: .${fileExt}`,
        agentId: agent.id,
      });
    }
  }
}
```

### 6.2 Network Monitoring

```typescript
// Integrate with existing network monitor
export class AINetworkMonitor {
  async monitorAgentNetwork(agent: AIAgent): Promise<void> {
    // Subscribe to network events for this agent's process
    networkMonitor.on('flow', async (flow: NetworkFlow) => {
      if (flow.processId === agent.processId) {
        await this.handleAgentNetworkActivity(agent, flow);
      }
    });
  }

  private async handleAgentNetworkActivity(agent: AIAgent, flow: NetworkFlow): Promise<void> {
    // 1. Log activity
    await db.aiActivity.create({
      data: {
        agentId: agent.id,
        activityType: 'NETWORK_REQUEST',
        domain: flow.domain,
        dataSize: flow.bytesUp + flow.bytesDown,
        timestamp: new Date(),
      },
    });

    // 2. Check for anomalies

    // Anomaly 1: Large upload
    if (flow.bytesUp > 10 * 1024 * 1024) {
      // 10MB
      await this.createAlert({
        severity: 'WARNING',
        title: 'Large Data Upload',
        message: `${agent.name} uploaded ${formatBytes(flow.bytesUp)} to ${flow.domain}`,
        agentId: agent.id,
      });
    }

    // Anomaly 2: Unknown domain
    const knownDomains = await this.getAgentKnownDomains(agent.id);
    if (flow.domain && !knownDomains.includes(flow.domain)) {
      await this.createAlert({
        severity: 'INFO',
        title: 'New Domain Contacted',
        message: `${agent.name} contacted unknown domain: ${flow.domain}`,
        agentId: agent.id,
      });
    }

    // Anomaly 3: Suspicious domain
    const suspiciousDomains = [
      'pastebin.com',
      'paste.ee',
      'transfer.sh',
      // ... known exfiltration sites
    ];

    if (flow.domain && suspiciousDomains.some((d) => flow.domain.includes(d))) {
      await this.createAlert({
        severity: 'CRITICAL',
        title: 'Suspicious Domain Contact',
        message: `${agent.name} contacted suspicious domain: ${flow.domain}`,
        agentId: agent.id,
      });

      // Consider blocking
      await this.blockAgentNetwork(agent);
    }
  }
}
```

### 6.3 Clipboard & Screen Monitoring

```typescript
export class ClipboardScreenMonitor {
  async monitorClipboard(agent: AIAgent): Promise<void> {
    // Hook into clipboard APIs
    if (process.platform === 'darwin') {
      this.monitorMacOSClipboard(agent);
    } else if (process.platform === 'win32') {
      this.monitorWindowsClipboard(agent);
    }
  }

  private async monitorMacOSClipboard(agent: AIAgent): Promise<void> {
    // Use NSPasteboard monitoring
    const { exec } = require('child_process');

    let lastClipboardValue = '';

    setInterval(async () => {
      const currentValue = await this.getClipboardContent();

      if (currentValue !== lastClipboardValue) {
        // Clipboard changed - check if agent accessed it
        const accessed = await this.didProcessAccessClipboard(agent.processId);

        if (accessed) {
          await db.aiActivity.create({
            data: {
              agentId: agent.id,
              activityType: 'CLIPBOARD_ACCESS',
              timestamp: new Date(),
            },
          });

          // Check if clipboard contains sensitive data
          if (this.isSensitiveData(currentValue)) {
            await this.createAlert({
              severity: 'WARNING',
              title: 'Sensitive Clipboard Access',
              message: `${agent.name} accessed clipboard with potentially sensitive data`,
              agentId: agent.id,
            });
          }
        }

        lastClipboardValue = currentValue;
      }
    }, 1000);
  }

  private isSensitiveData(data: string): boolean {
    const sensitivePatterns = [
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/, // SSN
      /(?:password|passwd|pwd)[\s:=]+\S+/i, // Password
      /(?:api[_-]?key|token)[\s:=]+\S+/i, // API key
    ];

    return sensitivePatterns.some((pattern) => pattern.test(data));
  }
}
```

---

## 7. Policy Engine

### 7.1 Policy Evaluation

```typescript
export class AIAgentPolicyEngine {
  async evaluateAction(agent: AIAgent, action: AgentAction): Promise<PolicyDecision> {
    // 1. Get all applicable policies
    const policies = await db.aiAgentPolicy.findMany({
      where: { agentId: agent.id },
      include: { policy: true },
    });

    // 2. Evaluate each policy
    for (const { policy } of policies) {
      if (!policy.enabled) continue;

      // Check schedule
      if (policy.scheduleEnabled) {
        const inSchedule = this.isWithinSchedule(policy.schedule);
        if (!inSchedule) {
          continue; // Policy not active now
        }
      }

      // Evaluate rules
      const rules = policy.rules as PolicyRules;
      const result = await this.evaluateRules(rules, action);

      if (result.decision === 'DENY') {
        return {
          decision: 'DENY',
          reason: result.reason,
          policyName: policy.name,
        };
      }

      if (result.decision === 'ALLOW') {
        return {
          decision: 'ALLOW',
          policyName: policy.name,
        };
      }
    }

    // 3. No policy matched - use default
    return {
      decision: 'PROMPT_USER',
      reason: 'No matching policy',
    };
  }

  private async evaluateRules(
    rules: PolicyRules,
    action: AgentAction
  ): Promise<{ decision: PolicyDecision; reason?: string }> {
    switch (action.type) {
      case 'FILE_READ':
      case 'FILE_WRITE':
        return this.evaluateFileRules(rules, action);

      case 'NETWORK_REQUEST':
        return this.evaluateNetworkRules(rules, action);

      case 'CLIPBOARD_ACCESS':
        return this.evaluateClipboardRules(rules, action);

      case 'SCREENSHOT':
        return this.evaluateScreenshotRules(rules, action);

      default:
        return { decision: 'PROMPT_USER' };
    }
  }

  private evaluateFileRules(
    rules: PolicyRules,
    action: FileAction
  ): { decision: PolicyDecision; reason?: string } {
    // Check denied paths (highest priority)
    if (rules.denyFilePaths) {
      for (const pattern of rules.denyFilePaths) {
        if (this.matchesPattern(action.filePath, pattern)) {
          return {
            decision: 'DENY',
            reason: `Matches denied path pattern: ${pattern}`,
          };
        }
      }
    }

    // Check allowed paths
    if (rules.allowFilePaths) {
      for (const pattern of rules.allowFilePaths) {
        if (this.matchesPattern(action.filePath, pattern)) {
          // Additional checks
          if (rules.maxFileSize && action.size > rules.maxFileSize) {
            return {
              decision: 'DENY',
              reason: `File size (${action.size}) exceeds limit (${rules.maxFileSize})`,
            };
          }

          const fileExt = action.filePath.split('.').pop();
          if (rules.allowedFileTypes && !rules.allowedFileTypes.includes(`.${fileExt}`)) {
            return {
              decision: 'DENY',
              reason: `File type .${fileExt} not allowed`,
            };
          }

          return { decision: 'ALLOW' };
        }
      }
    }

    // No match
    return { decision: 'PROMPT_USER' };
  }

  private matchesPattern(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    // "/**" -> ".*"
    // "/Documents/Finance/**" -> "/Documents/Finance/.*"

    const regexPattern = pattern
      .replace(/\\/g, '/')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(path.replace(/\\/g, '/'));
  }
}
```

### 7.2 Policy Examples

**Example 1: Restrict Financial Data**

```yaml
name: 'Protect Financial Data'
enabled: true
rules:
  denyFilePaths:
    - '/Documents/Finance/**'
    - '/Documents/Tax Returns/**'
    - '**/wallet.dat'
    - '**/*banking*'
  alertOnAttempt: true
  logBlocked: true
```

**Example 2: Code Assistant - Work Hours Only**

```yaml
name: 'Code Assistant - Work Hours'
enabled: true
scheduleEnabled: true
schedule:
  allowedDays: [1, 2, 3, 4, 5] # Mon-Fri
  allowedHours:
    start: '09:00'
    end: '18:00'
rules:
  allowFilePaths:
    - '/Projects/**'
    - '/workspace/**'
  denyFilePaths:
    - '/Documents/Personal/**'
  maxUploadSize: 1048576 # 1MB
```

**Example 3: Writing Assistant - Confirmation Required**

```yaml
name: 'Writing Assistant - Require Confirmation'
enabled: true
rules:
  allowFilePaths:
    - '/Documents/Writing/**'
  requireConfirmationForUpload: true
  maxUploadSize: 5242880 # 5MB
  allowedFileTypes: ['.txt', '.md', '.docx']
```

---

## 8. Anomaly Detection

### 8.1 Behavioral Baselines

```typescript
export class AIAgentBehaviorAnalyzer {
  /**
   * Build behavioral baseline for an agent
   */
  async buildBaseline(agentId: string): Promise<AgentBaseline> {
    const activities = await db.aiActivity.findMany({
      where: {
        agentId,
        timestamp: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    });

    // Analyze patterns
    const baseline: AgentBaseline = {
      agentId,

      // File access patterns
      avgFilesPerHour: this.calculateAvgFilesPerHour(activities),
      commonFileTypes: this.getMostCommonFileTypes(activities),
      commonDirectories: this.getMostCommonDirectories(activities),
      maxFileSize: this.getMaxFileSize(activities),

      // Network patterns
      avgUploadSize: this.calculateAvgUploadSize(activities),
      avgDownloadSize: this.calculateAvgDownloadSize(activities),
      commonDomains: this.getMostCommonDomains(activities),

      // Temporal patterns
      activeHours: this.getActiveHours(activities),
      activeDays: this.getActiveDays(activities),

      // Updated
      calculatedAt: new Date(),
    };

    await db.agentBaseline.upsert({
      where: { agentId },
      create: baseline,
      update: baseline,
    });

    return baseline;
  }

  /**
   * Detect anomalies by comparing current activity to baseline
   */
  async detectAnomalies(agent: AIAgent, recentActivities: AIActivity[]): Promise<Anomaly[]> {
    const baseline = await this.getBaseline(agent.id);
    if (!baseline) {
      // Not enough data for baseline yet
      return [];
    }

    const anomalies: Anomaly[] = [];

    // Anomaly 1: Unusual volume
    const filesInLastHour = recentActivities.filter(
      (a) => a.activityType === 'FILE_READ' && a.timestamp > new Date(Date.now() - 60 * 60 * 1000)
    ).length;

    if (filesInLastHour > baseline.avgFilesPerHour * 3) {
      anomalies.push({
        type: 'VOLUME_ANOMALY',
        severity: 'WARNING',
        title: 'Unusual File Access Volume',
        description: `Accessed ${filesInLastHour} files in last hour (baseline: ${baseline.avgFilesPerHour})`,
        score: 0.8,
      });
    }

    // Anomaly 2: Unusual file types
    const recentFileTypes = this.getFileTypesFromActivities(recentActivities);
    const unusualTypes = recentFileTypes.filter((type) => !baseline.commonFileTypes.includes(type));

    if (unusualTypes.length > 0) {
      anomalies.push({
        type: 'FILE_TYPE_ANOMALY',
        severity: 'INFO',
        title: 'Unusual File Types Accessed',
        description: `Accessed uncommon file types: ${unusualTypes.join(', ')}`,
        score: 0.6,
      });
    }

    // Anomaly 3: Unusual upload size
    const recentUploads = recentActivities.filter(
      (a) => a.activityType === 'NETWORK_REQUEST' && a.dataSize > 0
    );

    const totalUploadSize = recentUploads.reduce((sum, a) => sum + (a.dataSize || 0), 0);

    if (totalUploadSize > baseline.avgUploadSize * 5) {
      anomalies.push({
        type: 'UPLOAD_ANOMALY',
        severity: 'CRITICAL',
        title: 'Unusual Upload Volume',
        description: `Uploaded ${formatBytes(totalUploadSize)} (baseline: ${formatBytes(baseline.avgUploadSize)})`,
        score: 0.9,
      });
    }

    // Anomaly 4: Unusual timing
    const currentHour = new Date().getHours();
    if (!baseline.activeHours.includes(currentHour)) {
      anomalies.push({
        type: 'TIMING_ANOMALY',
        severity: 'INFO',
        title: 'Activity at Unusual Time',
        description: `Active at ${currentHour}:00 (typical: ${baseline.activeHours.join(', ')})`,
        score: 0.5,
      });
    }

    // Anomaly 5: New domain
    const recentDomains = this.getDomainsFromActivities(recentActivities);
    const newDomains = recentDomains.filter((domain) => !baseline.commonDomains.includes(domain));

    if (newDomains.length > 0) {
      anomalies.push({
        type: 'DOMAIN_ANOMALY',
        severity: 'WARNING',
        title: 'New Domains Contacted',
        description: `Contacted new domains: ${newDomains.join(', ')}`,
        score: 0.7,
      });
    }

    return anomalies;
  }
}
```

### 8.2 Machine Learning-Based Detection

```typescript
import * as tf from '@tensorflow/tfjs-node';

export class MLAnomalyDetector {
  private model: tf.LayersModel;

  async trainModel(agents: AIAgent[]): Promise<void> {
    // Collect training data
    const trainingData: number[][] = [];
    const labels: number[] = [];

    for (const agent of agents) {
      const activities = await db.aiActivity.findMany({
        where: { agentId: agent.id },
        take: 10000,
      });

      // Extract features
      const features = this.extractFeatures(activities);
      trainingData.push(...features);

      // Label (0 = normal, 1 = anomaly)
      // For training, we assume most activity is normal
      labels.push(...Array(features.length).fill(0));
    }

    // Build autoencoder for anomaly detection
    const inputDim = trainingData[0].length;

    const encoder = tf.sequential({
      layers: [
        tf.layers.dense({ units: 32, activation: 'relu', inputShape: [inputDim] }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: 8, activation: 'relu' }),
      ],
    });

    const decoder = tf.sequential({
      layers: [
        tf.layers.dense({ units: 16, activation: 'relu', inputShape: [8] }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: inputDim, activation: 'sigmoid' }),
      ],
    });

    const autoencoder = tf.sequential();
    autoencoder.add(encoder);
    autoencoder.add(decoder);

    autoencoder.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError',
    });

    // Train
    const xs = tf.tensor2d(trainingData);
    await autoencoder.fit(xs, xs, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
    });

    this.model = autoencoder;
  }

  async detectAnomalies(activities: AIActivity[]): Promise<number[]> {
    const features = this.extractFeatures(activities);
    const input = tf.tensor2d(features);

    // Get reconstruction
    const reconstruction = this.model.predict(input) as tf.Tensor;

    // Calculate reconstruction error
    const error = tf.losses.meanSquaredError(input, reconstruction);
    const errorData = await error.data();

    // Anomaly score = reconstruction error
    // Higher error = more anomalous
    return Array.from(errorData);
  }

  private extractFeatures(activities: AIActivity[]): number[][] {
    // Group activities into windows (e.g., 1-hour windows)
    const windows = this.groupIntoWindows(activities, 60 * 60 * 1000); // 1 hour

    return windows.map((window) => [
      window.fileReadCount,
      window.fileWriteCount,
      window.networkRequestCount,
      window.totalBytesUp,
      window.totalBytesDown,
      window.uniqueDomains.size,
      window.uniqueFilePaths.size,
      window.clipboardAccessCount,
      window.screenshotCount,
      // ... more features
    ]);
  }
}
```

---

## 9. User Experience

### 9.1 Dashboard

**AI Agents Overview:**

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agents (4)                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ChatGPT Desktop                [●] Active        │  │
│  │ Trust Score: 87/100            Status: Monitored │  │
│  │                                                    │  │
│  │ Last 24 hours:                                    │  │
│  │ ├─ 47 files accessed                             │  │
│  │ ├─ 23 network requests                           │  │
│  │ ├─ 2 clipboard access                            │  │
│  │ └─ 0 alerts                                      │  │
│  │                                                    │  │
│  │ [View Details] [Adjust Policies]                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ GitHub Copilot                 [●] Active        │  │
│  │ Trust Score: 95/100            Status: Trusted   │  │
│  │                                                    │  │
│  │ Last 24 hours:                                    │  │
│  │ ├─ 234 files accessed (code only)               │  │
│  │ ├─ 156 network requests                         │  │
│  │ ├─ 0 blocked attempts                           │  │
│  │ └─ 0 alerts                                      │  │
│  │                                                    │  │
│  │ [View Details] [Adjust Policies]                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Unknown AI Tool                [!] Alert         │  │
│  │ Trust Score: 45/100            Status: Restricted│  │
│  │                                                    │  │
│  │ Discovered: 2 hours ago                          │  │
│  │ Suspicious activity detected:                    │  │
│  │ ├─ Attempted access to Finance folder (BLOCKED) │  │
│  │ ├─ Large upload attempt (BLOCKED)               │  │
│  │ └─ 3 blocked attempts                           │  │
│  │                                                    │  │
│  │ [Investigate] [Block Permanently]                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Agent Detail View:**

```
┌─────────────────────────────────────────────────────────┐
│         ChatGPT Desktop - Detailed Activity             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Trust Score: 87/100                                    │
│  Status: Monitored                                      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Activity Timeline (Last 24 Hours)               │   │
│  │                                                  │   │
│  │ 14:30 - Read file: /Documents/resume.pdf        │   │
│  │         [●] Allowed by policy                    │   │
│  │                                                  │   │
│  │ 14:32 - Upload to api.openai.com (2.3 MB)      │   │
│  │         [●] Allowed (within limits)              │   │
│  │                                                  │   │
│  │ 15:15 - Attempted: /Documents/Finance/taxes.pdf │   │
│  │         [✕] BLOCKED - Denied by policy           │   │
│  │         Policy: "Protect Financial Data"         │   │
│  │                                                  │   │
│  │ 15:16 - Clipboard access                        │   │
│  │         [●] Allowed                              │   │
│  │                                                  │   │
│  │ 16:45 - Read file: /Projects/code/main.ts      │   │
│  │         [●] Allowed                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Permissions                                      │   │
│  │                                                  │   │
│  │ File Access:         [✓] Enabled                │   │
│  │ ├─ Allowed paths:    /Documents/**, /Projects/**│   │
│  │ └─ Denied paths:     /Documents/Finance/**      │   │
│  │                                                  │   │
│  │ Network Access:      [✓] Enabled                │   │
│  │ ├─ Max upload:       10 MB                      │   │
│  │ └─ Domains:          api.openai.com            │   │
│  │                                                  │   │
│  │ Clipboard:           [✓] Enabled                │   │
│  │ Screenshot:          [✕] Disabled               │   │
│  │ Email Access:        [✕] Disabled               │   │
│  │                                                  │   │
│  │ [Edit Permissions]                              │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 9.2 Real-Time Alerts

**Alert Notification:**

```
┌─────────────────────────────────────────┐
│ ⚠️  AI Agent Alert                      │
├─────────────────────────────────────────┤
│                                          │
│ ChatGPT Desktop attempted to:           │
│                                          │
│ Read file:                              │
│ /Documents/Finance/tax_return_2025.pdf  │
│                                          │
│ This was BLOCKED by policy:             │
│ "Protect Financial Data"                │
│                                          │
│ What would you like to do?              │
│                                          │
│ [Allow Once] [Allow Always] [Keep Blocked]│
└─────────────────────────────────────────┘
```

### 9.3 Policy Configuration UI

```
┌─────────────────────────────────────────────────────────┐
│              Create AI Agent Policy                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Policy Name: [Protect Work Data________________________]│
│                                                          │
│ Apply to agents:                                        │
│ [✓] ChatGPT Desktop                                     │
│ [✓] Claude Desktop                                      │
│ [ ] GitHub Copilot                                      │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ File Access Rules                                   │ │
│ │                                                      │ │
│ │ Allowed Paths:                                      │ │
│ │ [/Documents/Work/**_____________________] [Add]     │ │
│ │ [/Projects/**___________________________] [Add]     │ │
│ │                                                      │ │
│ │ Denied Paths:                                       │ │
│ │ [/Documents/Personal/**_________________] [Add]     │ │
│ │ [/Documents/Finance/**__________________] [Add]     │ │
│ │                                                      │ │
│ │ Max File Size: [10___] MB                          │ │
│ │                                                      │ │
│ │ Allowed File Types:                                 │ │
│ │ [.txt .md .pdf .docx____________________] [Add]     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Network Rules                                        │ │
│ │                                                      │ │
│ │ Max Upload Size: [5___] MB                          │ │
│ │                                                      │ │
│ │ [✓] Require confirmation before upload              │ │
│ │ [✓] Block uploads to unknown domains                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Other Permissions                                    │ │
│ │                                                      │ │
│ │ [✓] Allow clipboard access                          │ │
│ │ [ ] Allow screenshot/screen recording               │ │
│ │ [ ] Allow email access                              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Schedule (Optional)                                  │ │
│ │                                                      │ │
│ │ [ ] Enable schedule                                 │ │
│ │                                                      │ │
│ │ Active Days: [Mon] [Tue] [Wed] [Thu] [Fri]         │ │
│ │ Active Hours: [09:00] to [17:00]                   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│            [Cancel]  [Save Policy]                      │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Technical Implementation

### 10.1 Platform-Specific Hooks

**macOS (Endpoint Security Framework):**

```swift
// Swift implementation for macOS

import EndpointSecurity

class AIAgentMonitor {
    var client: OpaquePointer?

    func startMonitoring() {
        let events: [es_event_type_t] = [
            ES_EVENT_TYPE_AUTH_OPEN,          // File open
            ES_EVENT_TYPE_AUTH_EXEC,          // Process execution
            ES_EVENT_TYPE_NOTIFY_WRITE,       // File write
            ES_EVENT_TYPE_NOTIFY_CLOSE,       // File close
        ]

        let result = es_new_client(&client) { client, message in
            handleESMessage(message.pointee)
        }

        guard result == ES_NEW_CLIENT_RESULT_SUCCESS else {
            print("Failed to create ES client")
            return
        }

        es_subscribe(client!, events, UInt32(events.count))
    }

    func handleESMessage(_ message: es_message_t) {
        switch message.event_type {
        case ES_EVENT_TYPE_AUTH_OPEN:
            let event = message.event.open
            let path = String(cString: event.file.path.data)
            let processID = audit_token_to_pid(message.process.pointee.audit_token)

            // Check if process is AI agent
            if isAIAgent(processID) {
                // Log or block
                notifyAIActivity(processID, .fileOpen, path)
            }

        default:
            break
        }
    }
}
```

**Windows (File System Minifilter):**

```cpp
// C++ implementation for Windows

#include <fltKernel.h>

FLT_PREOP_CALLBACK_STATUS PreCreateCallback(
    PFLT_CALLBACK_DATA Data,
    PCFLT_RELATED_OBJECTS FltObjects,
    PVOID* CompletionContext
) {
    PFLT_FILE_NAME_INFORMATION fileNameInfo;
    NTSTATUS status;

    // Get file name
    status = FltGetFileNameInformation(
        Data,
        FLT_FILE_NAME_NORMALIZED | FLT_FILE_NAME_QUERY_DEFAULT,
        &fileNameInfo
    );

    if (NT_SUCCESS(status)) {
        // Check if process is AI agent
        HANDLE processId = PsGetCurrentProcessId();

        if (IsAIAgentProcess(processId)) {
            // Log activity
            LogAIActivity(processId, FILE_OPEN, fileNameInfo->Name);

            // Check policy
            if (ShouldBlockAccess(processId, fileNameInfo->Name)) {
                // Block access
                Data->IoStatus.Status = STATUS_ACCESS_DENIED;
                FltReleaseFileNameInformation(fileNameInfo);
                return FLT_PREOP_COMPLETE;
            }
        }

        FltReleaseFileNameInformation(fileNameInfo);
    }

    return FLT_PREOP_SUCCESS_WITH_CALLBACK;
}
```

**Linux (eBPF + inotify):**

```python
# Python implementation for Linux using BCC (eBPF)

from bcc import BPF

bpf_program = """
#include <uapi/linux/ptrace.h>
#include <linux/fs.h>

BPF_HASH(ai_agents, u32, u8);  // PID -> is_ai_agent

int trace_open(struct pt_regs *ctx, const char __user *filename) {
    u32 pid = bpf_get_current_pid_tgid() >> 32;

    // Check if PID is AI agent
    u8 *is_ai = ai_agents.lookup(&pid);
    if (is_ai && *is_ai == 1) {
        char fname[256];
        bpf_probe_read_user_str(&fname, sizeof(fname), filename);

        // Log to userspace
        bpf_trace_printk("AI_OPEN: PID=%d FILE=%s\\n", pid, fname);
    }

    return 0;
}
"""

b = BPF(text=bpf_program)
b.attach_kprobe(event="do_sys_open", fn_name="trace_open")

# Monitor output
while True:
    try:
        (task, pid, cpu, flags, ts, msg) = b.trace_fields()
        if "AI_OPEN" in msg:
            handle_ai_activity(msg)
    except KeyboardInterrupt:
        break
```

### 10.2 Cross-Platform Abstraction

```typescript
// packages/ai-governance/src/monitor.ts

export interface PlatformMonitor {
  startFileMonitoring(agentPID: number): Promise<void>;
  startNetworkMonitoring(agentPID: number): Promise<void>;
  blockFileAccess(agentPID: number, filePath: string): Promise<void>;
  blockNetworkAccess(agentPID: number): Promise<void>;
}

class MacOSMonitor implements PlatformMonitor {
  async startFileMonitoring(agentPID: number): Promise<void> {
    // Use Endpoint Security Framework
  }
  // ...
}

class WindowsMonitor implements PlatformMonitor {
  async startFileMonitoring(agentPID: number): Promise<void> {
    // Use File System Minifilter
  }
  // ...
}

class LinuxMonitor implements PlatformMonitor {
  async startFileMonitoring(agentPID: number): Promise<void> {
    // Use eBPF + inotify
  }
  // ...
}

export function createPlatformMonitor(): PlatformMonitor {
  switch (process.platform) {
    case 'darwin':
      return new MacOSMonitor();
    case 'win32':
      return new WindowsMonitor();
    case 'linux':
      return new LinuxMonitor();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
```

---

## Conclusion

AI Agent Governance is ankrshield's **killer feature** that differentiates it from all competitors. By providing:

- **Visibility** into AI agent behavior
- **Granular control** over permissions
- **Real-time protection** from rogue AI
- **Complete audit trails** for compliance

We solve a critical emerging problem that no other product addresses comprehensively.

**Next Steps:**

1. Build MVP of agent discovery + basic monitoring
2. Implement permission management
3. Add policy engine
4. Develop anomaly detection
5. Polish UX for non-technical users

---

**Document Version:** 1.0.0
**Last Updated:** January 22, 2026
**Owner:** ankrshield AI Governance Team
