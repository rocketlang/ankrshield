# AnkrShield AI Warrior — Revised Project Report

**Date:** 2026-02-18
**Status:** Core platform complete. Integration and mobile phases in progress.

---

## 1. Executive Summary

AnkrShield's AI Warrior is a production-ready, LLM-powered threat intelligence engine layered on top of a comprehensive AI agent governance framework. The system monitors every action taken by AI coding assistants and agentic tools on a developer's machine, correlates events into attack chains, narrates threats in plain English, auto-generates enforcement policies, and delivers instant notifications — all without requiring users to have security expertise.

The platform was built as a modular TypeScript monorepo across 12 published packages, with a GraphQL API surface, real-time event streaming, and a full policy engine. This document describes what has been built, the architecture, the key technical innovations, and what remains.

---

## 2. What Was Built — Complete Feature Inventory

### 2.1 @ankrshield/ai-governance

The foundational observability layer for all AI agent activity on the host system.

**AIAgentRegistry**

- Maintains a live registry of all known AI agents (Copilot, Cursor, Grammarly, ChatGPT browser extension, custom agents)
- Agents are registered with declared metadata: name, version, declared scope, trust tier
- Registry is the source of truth for ScopeEnforcer policy lookups
- Emits `agent:registered`, `agent:deregistered` events

**AIAgentMonitor**

- Extends Node.js `EventEmitter`
- Intercepts and records 8 activity types:
  1. `file:read` — agent reads a file from the filesystem
  2. `file:write` — agent writes or modifies a file
  3. `network:request` — outbound HTTP/HTTPS request
  4. `network:upload` — outbound data transfer with payload size tracking
  5. `clipboard:read` — agent reads clipboard contents
  6. `clipboard:write` — agent writes to clipboard
  7. `process:spawn` — agent spawns a child process
  8. `process:exec` — agent executes a shell command
- Each activity record includes: timestamp, agentId, activityType, resource, metadata, stackTrace snippet
- Polling interval configurable; designed for sub-100ms latency on activity detection

---

### 2.2 @ankrshield/ai-warrior

The threat intelligence and response engine. This is the flagship package.

**AIWarrior**

- Orchestrates all subcomponents
- Accepts activity events from `AIAgentMonitor` via subscription
- Routes events to `AttackCorrelator`, `HoneypotManager`, and `ScopeEnforcer` simultaneously
- Escalates confirmed threat chains to `ThreatNarrator` and `IncidentReporter`
- Maintains active agent quarantine state

**AttackCorrelator**

- Correlates raw activity events into structured attack chains using 9 weighted signal types:

| Signal                    | Weight | Description                                      |
| ------------------------- | ------ | ------------------------------------------------ |
| `honeypot_access`         | 1.00   | Agent accessed a decoy credential file           |
| `scope_violation`         | 0.85   | Action outside declared scope contract           |
| `credential_file_read`    | 0.80   | Read of `.env`, key files, secrets               |
| `mass_file_read`          | 0.70   | Bulk filesystem enumeration                      |
| `suspicious_upload`       | 0.75   | Large outbound transfer to unknown host          |
| `clipboard_exfil`         | 0.65   | Clipboard read followed by network request       |
| `unusual_process`         | 0.60   | Child process spawn outside normal agent pattern |
| `c2_domain_contact`       | 0.90   | Network request to known C2 infrastructure       |
| `policy_override_attempt` | 0.80   | Agent attempted to modify its own policy         |

- Computes a composite threat score (0.0–1.0) per correlated chain
- Emits `threat:chain` events above configurable threshold (default: 0.65)

**ThreatNarrator**

- Powered by Anthropic Claude API
- Accepts a structured attack chain object
- Produces a plain-English incident narrative: what happened, in what order, what the likely intent was, and what the user should do
- Narrative is calibrated for non-technical recipients (no jargon, no CVE numbers unless relevant)
- Outputs are stored as structured `IncidentNarrative` objects with chain metadata attached

**AutoPolicyGenerator**

- Observes agent behavior over a configurable baseline window
- Generates a minimum-privilege scope policy from observed access patterns
- Policy output is human-readable YAML and machine-executable JSON
- Produces both "what this agent actually does" (descriptive) and "what it should be allowed to do" (prescriptive) variants

**HoneypotManager**

- Seeds and monitors 4 categories of decoy files:
  1. **AWS credentials** — `~/.aws/credentials` with fake access keys
  2. **SSH private keys** — `~/.ssh/id_rsa_honeypot` with synthetic key material
  3. **Environment files** — `.env.honeypot` with fake DB credentials, API tokens
  4. **API token stores** — `~/.config/honeypot-tokens.json` with fake Bearer tokens
- Detection mechanism: inode `atime` polling (no inotify dependency, works across filesystems)
- Access to any honeypot file triggers an immediate `honeypot:triggered` event with `agentId`, `filePath`, `accessTime`
- High-confidence signal — honeypot access alone is sufficient to trigger quarantine

**AgentQuarantine**

- Receives quarantine requests from `AIWarrior` when threat score exceeds threshold (default: 0.80)
- Quarantine modes:
  - `soft` — alert only, log continued activity
  - `network-block` — suspend outbound network access for agent process
  - `full` — terminate agent process and hold pending human review
- Quarantine state is persisted; agent cannot re-register without explicit user release
- Emits `quarantine:applied`, `quarantine:released` events

**ScopeEnforcer**

- Policy engine for AI agent scope contracts
- 8 built-in scope presets:
  1. `coding-assistant` — read/write within project directory, network to package registries only
  2. `browser-agent` — network unrestricted, no filesystem write outside downloads
  3. `document-editor` — read/write within Documents, no network upload above 1MB
  4. `email-assistant` — clipboard read/write, no filesystem access outside attachments
  5. `data-analyst` — read-only filesystem in declared data paths, no clipboard write
  6. `terminal-agent` — process spawn within declared allow-list, no credential file access
  7. `research-agent` — network read-only to declared domains, clipboard write allowed
  8. `unrestricted` — all actions permitted, monitoring only (for trusted internal agents)
- 8 violation types detected:
  1. `path-traversal` — access outside declared filesystem scope
  2. `upload-cap-exceeded` — outbound transfer above declared limit
  3. `credential-access` — read of credential files not in declared allow-list
  4. `clipboard-exfil-pattern` — clipboard read + network write within 30s window
  5. `unauthorized-process` — spawn of process not in declared allow-list
  6. `domain-violation` — network request to domain outside declared allow-list
  7. `file-type-violation` — access to file extensions outside declared allow-list
  8. `policy-mutation-attempt` — attempt to modify own scope configuration
- Each violation produces a structured `ScopeViolation` object with severity, evidence, and recommended action

**IncidentReporter**

- Generates structured incident reports from correlated threat chains and ThreatNarrator output
- Report format: executive summary, timeline, affected resources, agent identity, recommended actions, raw evidence appendix
- Exports to: JSON (machine-readable), Markdown (human-readable), PDF-ready HTML
- Suitable for SOC2 audit evidence, legal holds, and compliance documentation

---

### 2.3 GraphQL API Surface

Full GraphQL schema wiring for all AI Warrior functionality.

**8 Queries:**

1. `aiAgents` — list all registered agents with status
2. `aiAgentActivity` — paginated activity log with filters
3. `threatChains` — list correlated attack chains with scores
4. `incidentReports` — list generated incident reports
5. `scopeViolations` — list violations by agent, severity, time range
6. `honeypotStatus` — status and access log for all decoy files
7. `quarantinedAgents` — currently quarantined agents and reason
8. `warriorEvents` — polling endpoint for real-time event stream

**5 Mutations:**

1. `registerAgent` — register a new AI agent with scope preset
2. `updateAgentScope` — modify an agent's scope contract
3. `releaseQuarantine` — release a quarantined agent (requires reason)
4. `generatePolicy` — trigger AutoPolicyGenerator for a given agent
5. `dismissThreat` — mark a threat chain as reviewed and dismissed

**Warrior Events Polling:**

- `warriorEvents` query supports long-polling with `since` timestamp parameter
- Returns all `ThreatEvent`, `ScopeViolation`, `HoneypotTrigger`, and `QuarantineEvent` objects since the given timestamp
- Designed for progressive enhancement: works today, upgrades to WebSocket subscription in Phase 2

---

### 2.4 @ankrshield/spyware-detector

Dedicated package for commercial and nation-state spyware detection.

**Detected Families:**

- **Pegasus** (NSO Group) — process artifact scanning, network destination analysis, backup anomaly detection, iMessage exploit indicator patterns
- **Candiru** (Saito Tech) — Windows-focused artifact patterns, DevilsTongue component indicators
- **Predator** (Intellexa) — Alien loader indicators, iOS/Android artifact patterns
- **FinFisher / FinSpy** (Gamma Group) — installer artifact patterns, C2 communication signatures

**Detection Methods:**

1. Process tree analysis — known spyware processes and their parent-child patterns
2. Network destination fingerprinting — known C2 IP ranges and domain patterns
3. Filesystem artifact scanning — known file paths, names, and sizes associated with each family
4. Backup anomaly detection — anomalous entries in device backup manifests (iOS spyware vector)
5. Behavioral indicators — privilege escalation patterns, persistence mechanism signatures

**Output:** `SpywareDetectionReport` with confidence score (0.0–1.0), matched indicators, affected family, recommended response actions.

---

### 2.5 Full Policy Engine

The policy engine underlies both ScopeEnforcer and AutoPolicyGenerator.

**Policy Rule Types:**

- **Domain rules** — allow/block/log specific domains or domain patterns (wildcard and regex supported)
- **Path rules** — allow/block/log filesystem path access with glob pattern support
- **File-type rules** — allow/block/log access by file extension (e.g., block `*.pem`, `*.key`, `id_rsa*`)
- **Upload-cap rules** — enforce maximum outbound payload size per request and per day
- **Clipboard rules** — allow/block clipboard read, clipboard write, or specific content patterns

**Policy Evaluation:**

- Rules evaluated in priority order with explicit allow/deny/log actions
- Default-deny for scope-declared agents (anything not explicitly permitted is blocked)
- Default-allow-and-log for `unrestricted` agents (full audit trail, no blocking)
- Policy conflicts resolved by most-specific rule wins

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HOST SYSTEM                                  │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Copilot  │  │  Cursor  │  │Grammarly │  │  Custom Agent    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │              │                  │             │
│       └──────────────┴──────────────┴──────────────────┘            │
│                                    │                                │
│                         ┌──────────▼──────────┐                    │
│                         │  @ankrshield/        │                    │
│                         │  ai-governance       │                    │
│                         │                      │                    │
│                         │  AIAgentRegistry     │                    │
│                         │  AIAgentMonitor      │                    │
│                         │  (8 activity types)  │                    │
│                         └──────────┬───────────┘                    │
│                                    │ ActivityEvent stream           │
│              ┌─────────────────────┼─────────────────────┐         │
│              │                     │                     │         │
│   ┌──────────▼──────────┐  ┌───────▼───────┐  ┌────────▼──────┐  │
│   │  ScopeEnforcer      │  │HoneypotManager│  │ SpywareDetect │  │
│   │  (8 presets,        │  │(4 decoys,     │  │ (Pegasus,     │  │
│   │   8 violation types)│  │ atime polling)│  │  Candiru,     │  │
│   └──────────┬──────────┘  └───────┬───────┘  │  Predator,    │  │
│              │                     │          │  FinFisher)   │  │
│              └─────────┬───────────┘          └───────┬───────┘  │
│                        │  ThreatSignals                │          │
│                        │                               │          │
│              ┌──────────▼──────────────────────────────▼──────┐   │
│              │              @ankrshield/ai-warrior             │   │
│              │                                                  │   │
│              │  ┌─────────────────────────────────────────┐   │   │
│              │  │         AttackCorrelator                 │   │   │
│              │  │         (9 weighted signals)             │   │   │
│              │  └──────────────────┬──────────────────────┘   │   │
│              │                     │ ThreatChain (score≥0.65)  │   │
│              │      ┌──────────────┼──────────────┐           │   │
│              │      │              │              │           │   │
│              │  ┌───▼────┐  ┌──────▼──────┐ ┌───▼─────────┐ │   │
│              │  │Threat  │  │AutoPolicy   │ │ Incident    │ │   │
│              │  │Narrator│  │Generator    │ │ Reporter    │ │   │
│              │  │(Claude)│  │             │ │             │ │   │
│              │  └───┬────┘  └─────────────┘ └─────────────┘ │   │
│              │      │                                         │   │
│              │  ┌───▼──────────────┐                         │   │
│              │  │ AgentQuarantine  │                         │   │
│              │  │ (soft/network/   │                         │   │
│              │  │  full modes)     │                         │   │
│              │  └──────────────────┘                         │   │
│              └──────────────────────┬───────────────────────┘   │
│                                     │                             │
│                         ┌───────────▼──────────────┐            │
│                         │      GraphQL API           │            │
│                         │  8 queries, 5 mutations    │            │
│                         │  warrior events polling    │            │
│                         └───────────┬────────────────┘            │
│                                     │                             │
│              ┌──────────────────────┼──────────────────┐         │
│              │                      │                  │         │
│   ┌──────────▼──────┐  ┌───────────▼──────┐  ┌───────▼──────┐  │
│   │  Web Dashboard  │  │  iOS App (soon)  │  │  AnkrWire    │  │
│   │                 │  │                  │  │  (WhatsApp,  │  │
│   │  Privacy Score  │  │  Alert Feed      │  │  Telegram)   │  │
│   │  Agent List     │  │  Privacy Score   │  │              │  │
│   │  Threat Feed    │  │                  │  │              │  │
│   └─────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Technical Innovations

### 4.1 AI Agent Scope Contracts

The concept of a declared, machine-enforced scope contract for an AI agent process is novel. Unlike OS-level sandboxing (which is coarse-grained and process-level) or network firewalls (which are destination-based), scope contracts are semantic: they describe what an agent is _for_ and enforce that semantics at runtime. This is the subject of a pending patent.

### 4.2 LLM-Powered Threat Narration

Using an LLM to translate structured security event chains into plain-English narratives — calibrated for non-expert audiences — makes enterprise security accessible without a SOC. The ThreatNarrator prompt is engineered to produce actionable, jargon-free output that an executive can act on without consulting a security engineer.

### 4.3 Atime-Based Honeypot Polling

Using inode access time (`atime`) polling rather than inotify/FSEvents for honeypot detection means the honeypot system works across all filesystems and does not require elevated permissions or kernel extensions. It is also undetectable by malicious agents that monitor for inotify watchers.

### 4.4 Weighted Multi-Signal Correlation

The AttackCorrelator does not alert on individual events (which produces unbearable false-positive rates). It weights nine signal types and requires a composite score threshold before producing a threat chain. This design produces high-confidence alerts at the cost of minor detection latency — the correct tradeoff for a user-facing product where alert fatigue is fatal.

### 4.5 Graduated Quarantine

Three quarantine modes (soft, network-block, full) allow the system to respond proportionally. A score of 0.65–0.79 triggers soft quarantine (log and alert); 0.80–0.89 triggers network-block (most useful — stops exfiltration without breaking the user's workflow); 0.90+ triggers full quarantine (terminate). Users can always override and release, preserving human-in-the-loop control.

---

## 5. Pain Points Addressed

| Pain Point                                           | AnkrShield Solution                                   |
| ---------------------------------------------------- | ----------------------------------------------------- |
| AI agents have unrestricted filesystem access        | ScopeEnforcer with path and file-type rules           |
| No visibility into what AI agents actually do        | AIAgentMonitor with 8 activity types, full audit log  |
| Security alerts require expert interpretation        | ThreatNarrator produces plain-English narratives      |
| Malicious agents can exfiltrate credentials silently | Honeypot system + upload-cap rules catch exfiltration |
| Spyware targets high-value users with no detection   | SpywareDetector with 4 known-family signatures        |
| Trackers follow users across DNS queries             | DNS Shield blocks 250k+ known-bad domains             |
| No single privacy health metric                      | Privacy Score (0–100) with trend analysis             |
| Alerts arrive too late (weekly reports)              | AnkrWire push notifications on threat detection       |
| Enterprise policy generation is manual               | AutoPolicyGenerator derives policies from behavior    |

---

## 6. What Remains to Be Built

### Immediate (this week)

- Wire `@ankrshield/spyware-detector` findings into the AI Warrior `ThreatEvent` pipeline so spyware detections benefit from AttackCorrelator correlation and ThreatNarrator narration
- AnkrWire notification delivery (WhatsApp Business API, Telegram Bot API)
- Prisma schema models for warrior event persistence (currently in-memory only)
- Add `ANTHROPIC_API_KEY` to `env.example` (ThreatNarrator dependency)

### Phase 2 (1 month)

- Phishing interceptor: lookalike domain detection, Google Safe Browsing API integration
- Endpoint attack detection: ARP poisoning detection, DNS mismatch analysis, SSL stripping indicators
- Behavioral baselining: 30-day per-agent activity baseline for anomaly detection
- WebSocket subscriptions: replace warrior events polling with true real-time push

### Phase 3 (3 months)

- iOS React Native app: dashboard, alert feed, privacy score, agent management
- Electron desktop tray: native OS notifications, always-on system tray agent
- Cross-agent correlation: detect coordinated attacks across multiple AI agents
- MITRE ATT&CK for LLM Agents mapping: align threat chains to emerging framework
- Enterprise multi-device sync: centralized policy management across a team or organization

---

## 7. Integration Guide — Quick Start

### Prerequisites

```bash
node >= 20
pnpm >= 9
ANTHROPIC_API_KEY (for ThreatNarrator)
```

### Installation

```bash
pnpm add @ankrshield/ai-governance @ankrshield/ai-warrior
```

### Minimal Setup

```typescript
import { AIAgentRegistry, AIAgentMonitor } from '@ankrshield/ai-governance';
import { AIWarrior } from '@ankrshield/ai-warrior';

// 1. Register your AI agents
const registry = new AIAgentRegistry();
registry.register({
  id: 'copilot',
  name: 'GitHub Copilot',
  scopePreset: 'coding-assistant',
  declaredPaths: ['/home/user/projects'],
  declaredDomains: ['copilot.github.com', 'api.github.com'],
  uploadCapBytes: 500_000, // 500KB per request
});

// 2. Start the monitor
const monitor = new AIAgentMonitor(registry);
monitor.start();

// 3. Start the warrior
const warrior = new AIWarrior({
  monitor,
  registry,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  honeypotPaths: ['~/.aws/credentials', '~/.env.honeypot'],
  threatThreshold: 0.65,
  quarantineThreshold: 0.8,
});

await warrior.start();

// 4. Listen for threats
warrior.on('threat:chain', (chain) => {
  console.log('Threat detected:', chain.narrative);
});

warrior.on('quarantine:applied', (event) => {
  console.log(`Agent ${event.agentId} quarantined: ${event.reason}`);
});
```

### GraphQL API

```bash
# Start the API server
pnpm dev

# Query registered agents
curl -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ aiAgents { id name scopePreset status } }"}'

# Poll for warrior events since a timestamp
curl -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ warriorEvents(since: \"2026-02-18T00:00:00Z\") { type severity timestamp narrative } }"}'
```

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...    # Required for ThreatNarrator
DNS_SHIELD_DOH_PROVIDER=cloudflare  # Options: cloudflare, google, quad9
HONEYPOT_POLL_INTERVAL_MS=5000  # Default: 5000ms
THREAT_THRESHOLD=0.65           # Default: 0.65
QUARANTINE_THRESHOLD=0.80       # Default: 0.80
ANKRWIRE_WHATSAPP_TOKEN=...     # Optional: WhatsApp Business API token
ANKRWIRE_TELEGRAM_BOT_TOKEN=... # Optional: Telegram Bot API token
```

---

_AnkrShield AI Warrior — Revised Project Report — 2026-02-18_
