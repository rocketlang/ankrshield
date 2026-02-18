# ANKR Shield — AI Warrior: Enhancement TODO

**Module:** `@ankrshield/ai-warrior`
**Updated:** 2026-02-18
**Current Version:** 0.1.0 (MVP)

---

## Priority Legend
- 🔴 **P0** — Critical / blocks production
- 🟠 **P1** — High / do within 1–2 weeks
- 🟡 **P2** — Medium / do within 1–2 months
- 🟢 **P3** — Nice-to-have / backlog

---

## PHASE 1 — Stabilize & Ship (P0 + P1)

### Testing
- [ ] 🔴 Write unit tests for `AttackCorrelator` — verify score weights and attack type classification
- [ ] 🔴 Write unit tests for `HoneypotManager` — mock `fs` calls, verify trigger detection
- [ ] 🔴 Write unit tests for `AutoPolicyGenerator` — test heuristic fallback with mock LLM
- [ ] 🔴 Write unit tests for `AgentQuarantine` — quarantine/release lifecycle
- [ ] 🔴 Write integration test for `AIWarrior` — full event → chain → policy → quarantine flow
- [ ] 🟠 Write unit tests for `IncidentReporter` — risk score calculation, timeline building
- [ ] 🟠 Add `vitest` coverage reporting to CI

### Bug Fixes & Hardening
- [ ] 🔴 Add `ANTHROPIC_API_KEY` to `.env.example` and ecosystem config
- [ ] 🔴 Add `@ankrshield/ai-warrior` to `pnpm-workspace.yaml` (already in `packages/*` glob but verify)
- [ ] 🔴 Run `pnpm install` to install `@anthropic-ai/sdk` dependency
- [ ] 🟠 Add ReDoS protection in `AIAgentRegistry.findByProcess()` — validate regex before compiling
- [ ] 🟠 Fix `AIAgentRegistry.findAll()` — currently returns mutable reference; should return `[...this.agents]`
- [ ] 🟠 Add correlation dedup window tuning — current 10-min window may miss slow attacks
- [ ] 🟠 Validate `WarriorConfig` with Zod schema before starting

### API Integration
- [ ] 🔴 Wire `AIWarrior` into `apps/api/src/main.ts` — instantiate on startup, wire to `AIAgentMonitor`
- [ ] 🔴 Add GraphQL types for `AttackChain`, `GeneratedPolicy`, `IncidentReport` in `apps/api/src/graphql/types/`
- [ ] 🔴 Add GraphQL queries: `attackChains`, `incidentReport`, `warriorStatus`
- [ ] 🔴 Add GraphQL mutations: `releaseAgent`, `applyPolicy`, `generateReport`
- [ ] 🟠 Add WebSocket subscription for real-time warrior events: `onAttackDetected`, `onAgentQuarantined`

### Persistence
- [ ] 🔴 Add Prisma models for `AttackChain`, `GeneratedPolicy`, `WarriorEvent` to `prisma/schema.prisma`
- [ ] 🔴 Persist attack chains to DB on detection (TimescaleDB hypertable for time-series queries)
- [ ] 🔴 Persist generated policies to DB with `requiresApproval` workflow
- [ ] 🔴 Persist incident reports to DB with PDF export option
- [ ] 🟠 Restore warrior state from DB on restart (attack chains, quarantine list)

---

## PHASE 2 — Endpoint Sniffing & Phishing Defense (P1)

### Phishing Interceptor (`packages/phishing-shield/`)
- [ ] 🟠 Create `@ankrshield/phishing-shield` package
- [ ] 🟠 Implement lookalike domain detection — Levenshtein distance ≤ 2 from Alexa Top 1M
- [ ] 🟠 Implement homoglyph/IDN detection — Cyrillic `а` vs Latin `a` etc.
- [ ] 🟠 Implement new domain age check — flag domains registered < 30 days (WHOIS API)
- [ ] 🟠 Integrate Google Safe Browsing API for URL reputation
- [ ] 🟠 Integrate VirusTotal URL scan API
- [ ] 🟠 Detect fake login forms in page HTML — regex match for `<input type=password>` on non-HTTPS or unknown domains
- [ ] 🟠 Emit `ThreatEvent` to AIWarrior when phishing detected
- [ ] 🟠 Wire into DNS resolver blocklist

### Endpoint Sniffing Defense (`packages/network-monitor/src/sniff-detector.ts`)
- [ ] 🟠 Detect NIC in promiscuous mode — `ip link show | grep PROMISC` (Linux) / `ifconfig` (macOS)
- [ ] 🟠 Detect ARP poisoning — monitor ARP table for duplicate gateway MAC
- [ ] 🟠 Detect DNS response mismatch — compare local DNS vs DoH baseline
- [ ] 🟠 Detect SSL stripping — HTTPS → HTTP downgrade on known-HTTPS domains
- [ ] 🟠 Detect port scan — > 20 unique ports from same source in 10s
- [ ] 🟠 Emit `ThreatEvent` to AIWarrior when sniffing indicators detected
- [ ] 🟠 Add sniff events to `EventType` enum in Prisma schema

---

## PHASE 3 — AI Warrior Intelligence Upgrades (P2)

### Cross-Agent Correlation
- [ ] 🟡 Detect attacks spanning multiple agents — link `data_exfiltration` from ChatGPT + clipboard from Grammarly
- [ ] 🟡 Build attack graph — directed graph of events → assets → destinations
- [ ] 🟡 Implement MITRE ATT&CK for LLM Agents mapping to warrior attack types

### Behavioral Baselining
- [ ] 🟡 Implement 30-day baseline builder in `AttackCorrelator`
- [ ] 🟡 Store baselines per-agent in DB (avg files/hour, common domains, active hours)
- [ ] 🟡 Use deviation from baseline in threat score (+score if 3× baseline file access)
- [ ] 🟡 Auto-tune thresholds based on user's normal AI usage patterns

### Adaptive LLM Prompting
- [ ] 🟡 Add few-shot examples to narration prompt — include 3 real attack narratives
- [ ] 🟡 Chain-of-thought prompting for complex attack classification
- [ ] 🟡 Let user correct warrior analysis → feed corrections back as prompt context
- [ ] 🟡 Implement RAG over past attack chains for better policy generation

### Real-Time Agent Feedback
- [ ] 🟡 Add `PROMPT_USER` flow — warrior asks user to approve borderline actions in real-time
- [ ] 🟡 Add electron notification for immediate alerts (tray badge + native alert)
- [ ] 🟡 Add mobile push notification for critical alerts via iOS app

---

## PHASE 4 — Advanced Defense Capabilities (P2–P3)

### Enhanced Honeypots
- [ ] 🟡 Add SSH key honeypot (`~/.ssh/id_rsa_backup`)
- [ ] 🟡 Add browser cookie jar honeypot (`cookies_export.json`)
- [ ] 🟡 Add crypto seed phrase honeypot (`seed_phrase.txt`)
- [ ] 🟡 PID attribution on honeypot access using inotify (Linux) / FSEvents (macOS)
- [ ] 🟡 Configurable honeypot directories via `.env`
- [ ] 🟢 Dynamic honeypot generation — warrior creates context-aware decoys based on files it sees the agent access
- [ ] 🟢 Network honeypots — fake API endpoint that logs who calls it

### Deception Layer
- [ ] 🟢 Honey credentials — inject fake credentials into clipboard on agent clipboard read
- [ ] 🟢 Canary tokens — embed unique URLs in decoy files; trigger when URL is fetched
- [ ] 🟢 Fake directory with hundreds of decoy files — detect mass enumeration

### Spyware Detection Integration
- [ ] 🟡 Wire Pegasus/spyware detection results into warrior as `ThreatEvent`
- [ ] 🟡 Correlate spyware indicators with AI agent activity (both active at same time → critical)
- [ ] 🟡 Add `surveillance` attack type with richer indicators

### Threat Intelligence Feeds
- [ ] 🟢 Integrate AbuseIPDB for IP reputation in network events
- [ ] 🟢 Integrate Shodan for exposed asset detection
- [ ] 🟢 Integrate CISA KEV (Known Exploited Vulnerabilities) feed
- [ ] 🟢 Anonymized cross-user threat sharing — report novel attack patterns to ankrshield cloud (opt-in)

---

## PHASE 5 — Enterprise & Compliance (P3)

### Multi-Device Coordination
- [ ] 🟢 Warrior instances across devices sync attack chains via ankrshield cloud
- [ ] 🟢 Family/Enterprise: parent warrior aggregates child device events

### Compliance Reporting
- [ ] 🟢 SOC 2 Type II evidence export from incident reports
- [ ] 🟢 GDPR data flow mapping — AI agent data processing audit
- [ ] 🟢 Generate compliance summary per quarter

### Audit Immutability
- [ ] 🟢 Hash and sign incident reports (SHA-256 + user's GPG key)
- [ ] 🟢 Append-only audit log for warrior decisions (cannot be tampered with)

---

## IMMEDIATE NEXT STEPS (This Week)

In order:

1. **`pnpm install`** — install `@anthropic-ai/sdk`
2. **Add `ANTHROPIC_API_KEY`** to `.env.example` and `ecosystem.ankrshield.config.js`
3. **Add Prisma models** for `AttackChain`, `GeneratedPolicy` in `prisma/schema.prisma`
4. **Wire warrior into API** `apps/api/src/main.ts`
5. **Add GraphQL types + queries** for warrior data
6. **Write correlator unit tests** — highest risk component
7. **Verify honeypot detection** on local machine — manually touch a decoy file, confirm event fires
8. **Add phishing interceptor** — highest user-facing value after warrior

---

*ANKR Shield AI Warrior | Enhancement Roadmap | 2026-02-18*
