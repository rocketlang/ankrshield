# AnkrShield AI Warrior — Revised TODO

**Date:** 2026-02-18
**Track:** Post-core-platform completion, integration and expansion phase

---

## Completed ✅

### ✅ AI Governance Package (@ankrshield/ai-governance)

- AIAgentRegistry — live registry of all known AI agents with metadata and trust tiers
- AIAgentMonitor — EventEmitter-based monitor covering 8 activity types (file read/write, network request/upload, clipboard read/write, process spawn/exec)
- Full TypeScript types for all activity events
- Unit test coverage

### ✅ AI Warrior Full Implementation (@ankrshield/ai-warrior)

- AIWarrior — orchestration engine wiring all subcomponents
- AttackCorrelator — 9 weighted signal types, composite threat scoring (0.0–1.0), configurable threshold
- ThreatNarrator — Claude-powered plain-English incident narrative generation
- AutoPolicyGenerator — minimum-privilege policy derivation from observed agent behavior
- HoneypotManager — 4 decoy categories (AWS credentials, SSH keys, .env files, API token stores), atime polling detection
- AgentQuarantine — 3 graduated quarantine modes (soft, network-block, full), quarantine persistence
- IncidentReporter — structured incident reports exportable as JSON, Markdown, PDF-ready HTML

### ✅ ScopeEnforcer with 8 Presets

- Presets: coding-assistant, browser-agent, document-editor, email-assistant, data-analyst, terminal-agent, research-agent, unrestricted
- 8 violation types: path-traversal, upload-cap-exceeded, credential-access, clipboard-exfil-pattern, unauthorized-process, domain-violation, file-type-violation, policy-mutation-attempt
- Structured ScopeViolation output with severity and recommended action

### ✅ GraphQL Wiring (8 Queries, 5 Mutations)

- Queries: aiAgents, aiAgentActivity, threatChains, incidentReports, scopeViolations, honeypotStatus, quarantinedAgents, warriorEvents
- Mutations: registerAgent, updateAgentScope, releaseQuarantine, generatePolicy, dismissThreat
- Warrior events polling endpoint with `since` timestamp parameter

### ✅ Spyware Detector Package (@ankrshield/spyware-detector)

- Pegasus (NSO Group) — process artifacts, network destinations, backup anomalies, iMessage exploit indicators
- Candiru (Saito Tech) — DevilsTongue component indicators, Windows artifact patterns
- Predator (Intellexa) — Alien loader indicators, iOS/Android artifact patterns
- FinFisher/FinSpy (Gamma Group) — installer artifacts, C2 communication signatures
- SpywareDetectionReport output with confidence score, matched indicators, affected family, recommended actions

### ✅ Policy Engine Full Implementation

- Domain rules — allow/block/log with wildcard and regex pattern support
- Path rules — filesystem path access control with glob patterns
- File-type rules — extension-based access control (block _.pem, _.key, id_rsa\*, etc.)
- Upload-cap rules — per-request and per-day outbound payload size limits
- Clipboard rules — read/write control with content pattern matching
- Priority-ordered evaluation, default-deny for scoped agents, conflict resolution by specificity

---

## Next — This Week

### Wire Spyware Detector into AIWarrior ThreatEvent Pipeline

- Connect `@ankrshield/spyware-detector` detection output to `AttackCorrelator` as a new signal source
- Map `SpywareDetectionReport.confidence` to `c2_domain_contact` and `unusual_process` signals (weighted appropriately)
- Ensure spyware detections trigger ThreatNarrator with spyware-specific prompt context
- Add `spyware:detected` event type to warrior event stream
- Add GraphQL field: `spywareDetections` query with family filter

### AnkrWire Notifications (WhatsApp Business API + Telegram Bot)

- Implement WhatsApp Business API client in `@ankrshield/ankrwire` package
  - Message template for threat alerts (template approval required by Meta)
  - Fallback: WhatsApp Cloud API with pre-approved template IDs
- Implement Telegram Bot API client
  - `/start` command for user onboarding
  - Inline keyboard for quarantine release confirmation
- Notification routing: severity ≥ HIGH triggers WhatsApp; severity ≥ MEDIUM triggers Telegram
- In-app notification store (last 100 notifications, read/unread state)
- Add to env.example: `ANKRWIRE_WHATSAPP_TOKEN`, `ANKRWIRE_TELEGRAM_BOT_TOKEN`, `ANKRWIRE_TELEGRAM_CHAT_ID`

### iOS React Native App (Dashboard, Alerts, Privacy Score)

- Initialize React Native project in `apps/mobile/`
- Screens:
  - Dashboard: Privacy Score gauge (0–100), trend sparkline, active agent count, recent threat count
  - Alert Feed: paginated list of ThreatEvents with severity badges, tap to expand narrative
  - Agent List: registered agents with scope preset and status indicator
  - Settings: notification preferences, AnkrWire configuration, threshold adjustments
- GraphQL client: Apollo Client with warrior events polling
- Push notifications: Expo Notifications for foreground/background alert delivery
- Design system: match web dashboard color palette

### Prisma Models for Warrior Persistence

- Add models to `prisma/schema.prisma`:
  - `AgentActivity` — persisted AIAgentMonitor events (agentId, activityType, resource, metadata, timestamp)
  - `ThreatChain` — correlated attack chains (score, signals, status, createdAt, resolvedAt)
  - `ScopeViolation` — violation records (agentId, violationType, severity, evidence, timestamp)
  - `HoneypotAccess` — honeypot trigger log (filePath, agentId, accessTime, chainId)
  - `IncidentReport` — generated reports (chainId, narrative, rawJson, createdAt)
  - `QuarantineEvent` — quarantine start/end records (agentId, mode, reason, duration)
- Run `prisma migrate dev --name warrior-persistence`
- Replace in-memory stores in AIWarrior with Prisma client calls
- Add 30-day retention policy migration

### Add ANTHROPIC_API_KEY to env.example

- Add `ANTHROPIC_API_KEY=sk-ant-...` to `env.example` with comment: `# Required for ThreatNarrator (AI Warrior)`
- Add validation in AIWarrior constructor: throw descriptive error if key is missing at startup
- Document in README quick-start section

---

## Phase 2 — 1 Month

### Phishing Interceptor

- Lookalike domain detection using Levenshtein distance and homoglyph substitution against a brand list (top 500 brands + user-defined domains)
- Google Safe Browsing API v4 integration for known phishing URL checking
- Real-time DNS query interception hook: check every resolved domain before allowing connection
- Alert types: `lookalike:detected`, `safebrowsing:hit`, `homoglyph:detected`
- UI: phishing alert card in dashboard with domain comparison visualization

### Endpoint Attack Detection

- ARP poisoning detection: monitor local ARP table for MAC address conflicts and gateway MAC changes
- DNS mismatch analysis: compare resolved IPs against known-good baselines; flag unexpected changes
- SSL stripping detection: detect HTTP connections to hosts that previously served HTTPS
- Network-level integration with DNS Shield for coordinated detection
- Alert: `arp:poisoning`, `dns:mismatch`, `ssl:stripping`

### Behavioral Baselining (30-Day Per-Agent Baseline)

- For each registered agent, maintain a rolling 30-day baseline of normal activity:
  - Typical file paths accessed (histogram)
  - Typical network destinations (frequency map)
  - Typical upload volumes (mean + 3σ bounds)
  - Typical process spawn patterns
- Flag deviations as `behavioral:anomaly` signals with z-score severity
- Feed anomaly signals into AttackCorrelator with moderate weight (0.45)
- UI: per-agent behavioral profile page with baseline vs. current activity comparison

### WebSocket Subscriptions for Real-Time UI

- Replace warrior events polling with GraphQL subscription: `subscription { warriorEvents { type severity timestamp narrative } }`
- Implement WebSocket server using `graphql-ws`
- Update web dashboard to use subscription client
- Update iOS app to use subscription client (Apollo Subscription)
- Maintain polling endpoint as fallback for environments that block WebSockets

---

## Phase 3 — 3 Months

### Cross-Agent Correlation

- Detect coordinated attacks across multiple AI agents (e.g., Copilot reads a credential file, then Grammarly uploads clipboard content containing that credential)
- Cross-agent correlation window: 5-minute sliding window
- New AttackCorrelator signal: `cross_agent_coordination` (weight: 0.95)
- Alert: `coordination:detected` with participating agent list and shared evidence

### Electron Desktop Tray Application

- Always-on system tray agent for macOS and Windows
- Native OS notifications for threats (NSUserNotification on macOS, Windows Toast on Windows)
- Tray menu: Privacy Score badge, quick-access to quarantine release, agent list
- Embedded mini-dashboard in tray popover
- Auto-start on login, minimal resource footprint

### MITRE ATT&CK for LLM Agents Mapping

- Map detected attack chains to the emerging MITRE ATT&CK for LLM Agents framework
- TTPs: Prompt Injection (T-LLM-001), Data Exfiltration via Agent (T-LLM-002), Scope Escape (T-LLM-003), Policy Manipulation (T-LLM-004)
- IncidentReporter: include ATT&CK technique IDs in generated reports
- UI: MITRE ATT&CK navigator heat map showing frequency of observed techniques

### Enterprise Multi-Device Sync

- Centralized policy management: define scope presets at the organization level, push to all enrolled devices
- Multi-device dashboard: unified view of all enrolled devices, agents, and threat events
- Role-based access control: Admin, Security Analyst, Read-Only Viewer
- Compliance exports: SOC2 Type II evidence package, ISO 27001 audit logs
- Threat intel feed integration: pull from commercial threat intel providers (VirusTotal, AlienVault OTX)
- SSO integration: SAML 2.0, OIDC for enterprise identity providers

---

## Backlog (Unscheduled)

- Browser extension: in-browser AI agent monitoring for web-based AI tools (ChatGPT, Claude.ai, Gemini)
- Android app: mirror iOS app feature set
- Ansible/Terraform provisioning: deploy AnkrShield agent to fleet via IaC
- SIEM integration: forward threat events to Splunk, Elastic SIEM, Microsoft Sentinel via CEF/LEEF
- Public threat intelligence sharing: opt-in aggregated threat data sharing with AnkrShield community feed
- Custom honeypot templates: user-defined decoy file types beyond the 4 built-in categories

---

_AnkrShield AI Warrior — Revised TODO — 2026-02-18_
