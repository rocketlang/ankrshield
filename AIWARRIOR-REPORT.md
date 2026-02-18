# ANKR Shield — AI Warrior: Project Report

**Date:** 2026-02-18
**Module:** `@ankrshield/ai-warrior`
**Status:** MVP Complete — Integration Ready
**Version:** 0.1.0

---

## 1. Executive Summary

The AI Warrior is ankrshield's autonomous LLM-powered threat intelligence engine. It sits above all other monitoring layers and acts as the "brain" of the platform — correlating raw events into attack narratives, auto-generating block policies, deploying honeypot decoys, quarantining rogue agents, and producing structured incident reports.

Unlike rule-only systems that require manual policy authoring, the AI Warrior uses Claude (`claude-sonnet-4-6`) to understand *intent* — explaining what an attack chain means in plain English and generating targeted policies that address the specific threat pattern observed.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ANKR SHIELD STACK                             │
├─────────────────────────────────────────────────────────────────────┤
│  Event Sources                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ AIAgentMonitor│  │ NetworkMonitor│  │  DNS Logger  │              │
│  │ (ai-governance)│  │(network-monitor)│  │ (dns-resolver)│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                        │
│         └──────────────────┼──────────────────┘                      │
│                            │ ThreatEvent stream                       │
│                            ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    AI WARRIOR                                │    │
│  │                                                              │    │
│  │  warrior.ingest(event) ──→ eventBuffer[10,000]              │    │
│  │                                                              │    │
│  │  ┌────────────────┐   ┌────────────────┐                   │    │
│  │  │  Correlator    │──→│   Narrator     │ (Claude LLM)      │    │
│  │  │  (heuristics)  │   │  (plain Eng.)  │                   │    │
│  │  └────────┬───────┘   └───────┬────────┘                   │    │
│  │           │                   │                              │    │
│  │           └─────── AttackChain ──────────────────────┐      │    │
│  │                                                       │      │    │
│  │  ┌────────────────┐   ┌────────────────┐             │      │    │
│  │  │  PolicyGen     │   │  Quarantine    │◄────────────┘      │    │
│  │  │  (Claude LLM)  │   │  (registry)    │                   │    │
│  │  └───────┬────────┘   └────────────────┘                   │    │
│  │          │                                                   │    │
│  │  ┌───────┴─────────────────────────────────────┐           │    │
│  │  │              Honeypot Manager                │           │    │
│  │  │  Deploys 4 decoy files, polls atime every 30s│           │    │
│  │  └──────────────────────────────────────────────┘           │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────┐           │    │
│  │  │         Incident Reporter (Claude LLM)        │           │    │
│  │  │   Executive Summary + Technical Analysis      │           │    │
│  │  └──────────────────────────────────────────────┘           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                            │                                          │
│          Events: attack-detected, policy-generated,                   │
│                  honeypot-triggered, agent-quarantined,               │
│                  incident-report                                       │
│                            │                                          │
│  ┌─────────────────────────▼───────────────────────┐                │
│  │           GraphQL API + Dashboard               │                │
│  └─────────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Package Structure

```
packages/ai-warrior/
├── package.json                    # @ankrshield/ai-warrior v0.1.0
├── tsconfig.json                   # Extends base, references ai-governance + core
└── src/
    ├── index.ts                    # Barrel exports
    ├── types.ts                    # All domain types (ThreatEvent, AttackChain, etc.)
    ├── warrior.ts                  # AIWarrior orchestrator (main class)
    ├── llm/
    │   ├── client.ts               # WarriorLLMClient (Anthropic SDK wrapper)
    │   └── prompts.ts              # System prompts + user prompt builders
    ├── analysis/
    │   ├── correlator.ts           # AttackCorrelator (heuristic scoring + classification)
    │   ├── narrator.ts             # ThreatNarrator (LLM enrichment)
    │   └── policy-gen.ts          # AutoPolicyGenerator (LLM + heuristic fallback)
    ├── defense/
    │   ├── honeypot.ts             # HoneypotManager (deploy + poll)
    │   └── quarantine.ts          # AgentQuarantine (registry + release)
    └── reporting/
        └── incident.ts            # IncidentReporter (LLM summaries)
```

---

## 4. Core Components

### 4.1 AIWarrior (warrior.ts)
The main orchestrator. Typed EventEmitter that:
- Accepts `ThreatEvent` via `ingest()` from any source
- Runs correlation loop every ~1 min (1/5 of 5-min window)
- Immediately correlates on `critical` severity events
- Emits: `attack-detected`, `policy-generated`, `honeypot-triggered`, `agent-quarantined`, `incident-report`
- Exposes `getStatus()`, `generateReport()`, `releaseAgent()`
- Static adapter: `AIWarrior.fromAIActivity()` converts `AIActivity` → `ThreatEvent`

### 4.2 AttackCorrelator (analysis/correlator.ts)
**Fully offline — no LLM required.** Groups events from a single agent within the correlation window and produces a scored `AttackChain`.

**Score Weights:**

| Signal | Score |
|---|---|
| Sensitive file accessed (`.env`, `.pem`, `wallet.dat`, ...) | +12 per file |
| Clipboard access | +15 |
| Network upload | +18 |
| Upload > 10 MB | +22 |
| Upload to pastebin / transfer.sh etc. | +30 |
| > 50 files read | +20 |
| > 20 files read | +10 |
| Screenshot detected | +20 |
| Supply-chain file (`package.json`, `requirements.txt`, ...) | +15 |
| Honeypot triggered | +45 |
| After-hours activity (outside 06:00–22:00) | +8 |
| Already-blocked event (another layer caught it) | −5 |

**Attack Type Classification (priority order):**
1. `honeypot_triggered` — any honeypot event
2. `credential_theft` — credential files + clipboard/upload
3. `data_exfiltration` — mass files + upload + score ≥ 50
4. `surveillance` — screenshot + mass files
5. `ransomware` — file writes + mass files
6. `supply_chain_compromise` — build config + upload
7. `unknown` — default

### 4.3 ThreatNarrator (analysis/narrator.ts)
Sends the attack chain to Claude with a structured prompt. Returns:
- `narrative` — 2–3 sentence plain English (for non-technical users)
- `technicalSummary` — full technical analysis
- Refined `attackType`, `affectedAssets`, `suggestedActions`

Falls back gracefully if LLM is unavailable.

### 4.4 AutoPolicyGenerator (analysis/policy-gen.ts)
Generates targeted `GeneratedPolicyRule[]` via Claude based on the attack chain. Rule types:
- `deny_file_path` — block specific file path
- `deny_domain` — block network domain
- `deny_file_type` — block by extension
- `cap_upload_bytes` — maximum upload size
- `require_confirmation` — prompt user before action
- `quarantine_agent` — quarantine agent immediately
- `block_clipboard` — disable clipboard access

Falls back to heuristic rules (block upload domains, flag sensitive files) if LLM unavailable.

### 4.5 HoneypotManager (defense/honeypot.ts)
Deploys 4 decoy files at startup:

| File | Type | Contains |
|---|---|---|
| `.env.backup` | file | Fake API keys: OpenAI, Anthropic, Stripe, AWS, JWT |
| `api_keys.txt` | api-key | Fake tokens: GitHub, Slack, Twilio |
| `wallet_backup.dat` | wallet | Fake BTC/ETH addresses + mnemonic |
| `passwords_backup.txt` | credential | Fake passwords for email, bank, SSH, VPN |

**Detection:** polls `fs.stat().atimeMs` every 30 seconds. If atime changes → file was read → `triggered` event emitted. Supports `registerTrigger()` for platform-specific hooks (inotify, ESF).

**Automatic Response:** any honeypot trigger → immediate `AttackChain` with score 96 + agent quarantined.

### 4.6 AgentQuarantine (defense/quarantine.ts)
Registry of quarantined agents. Idempotent — re-quarantining updates the reason. Supports `release(agentId)` for manual clearance.

### 4.7 IncidentReporter (reporting/incident.ts)
Generates `IncidentReport` with:
- **Risk score** — weighted: 70% max chain score + 30% frequency penalty
- **Executive summary** — Claude generates 4-sentence plain English
- **Technical analysis** — Claude generates full markdown analysis with TTPs
- **Timeline** — all attack events, honeypot triggers, quarantine events sorted chronologically
- **Recommendations** — heuristic-based action items (rotate keys, audit agents, apply policies)

---

## 5. LLM Integration

### Provider
- **Primary:** Anthropic Claude (`claude-sonnet-4-6`)
- **SDK:** `@anthropic-ai/sdk ^0.36.3`
- **Auth:** `ANTHROPIC_API_KEY` environment variable

### LLM Calls Per Event Cycle

| Call | When | Tokens (est.) |
|---|---|---|
| Threat narration | Per attack chain | ~800 in / ~400 out |
| Policy generation | Per attack chain | ~600 in / ~300 out |
| Executive summary | Per report | ~400 in / ~200 out |
| Technical analysis | Per report | ~1000 in / ~800 out |

### Resilience
- All LLM calls wrapped in `completeJSON()` with typed fallbacks
- If Claude is unavailable → heuristic fallbacks activate
- `maxRetries: 2` in Anthropic SDK client
- Narration and policy generation fail gracefully — chain is still emitted

---

## 6. Integration with ai-governance

`packages/ai-governance/src/monitor.ts` was updated:

**Before (original):**
```typescript
export class AIAgentMonitor {
  private activities: AIActivity[] = [];  // unbounded
  logActivity(activity: AIActivity): void {
    this.activities.push(activity);  // silent, no events
  }
}
```

**After (updated):**
```typescript
export class AIAgentMonitor extends EventEmitter {
  // Emits 'activity' event on every logActivity()
  // Buffer capped at 10,000 entries
  // Returns copies to prevent mutation
}
```

**Wiring the warrior to the monitor:**
```typescript
import { AIAgentMonitor } from '@ankrshield/ai-governance';
import { AIWarrior } from '@ankrshield/ai-warrior';

const monitor = new AIAgentMonitor();
const warrior = new AIWarrior({ anthropicApiKey: process.env.ANTHROPIC_API_KEY! });

await warrior.start();

// Wire events from monitor into warrior
monitor.on('activity', (activity) => {
  warrior.ingestAIActivity(activity, 'ChatGPT Desktop');
});

// Listen for warrior decisions
warrior.on('attack-detected', (chain) => {
  console.log('ATTACK:', chain.narrative);
  console.log('Score:', chain.threatScore);
});

warrior.on('policy-generated', (policy) => {
  console.log('NEW POLICY:', policy.name);
  console.log('Rules:', policy.rules);
});

warrior.on('agent-quarantined', (agent) => {
  console.log('QUARANTINED:', agent.agentName, '-', agent.reason);
});
```

---

## 7. Environment Variables

Add to `.env`:
```env
# AI Warrior (required)
ANTHROPIC_API_KEY=sk-ant-...

# Optional tuning
WARRIOR_MODEL=claude-sonnet-4-6
WARRIOR_CORRELATION_WINDOW_MS=300000
WARRIOR_THREAT_THRESHOLD=55
WARRIOR_AUTO_QUARANTINE_SCORE=88
WARRIOR_ENABLE_HONEYPOTS=true
WARRIOR_REPORT_INTERVAL_MS=86400000
```

---

## 8. Files Modified / Created

| File | Action | Notes |
|---|---|---|
| `packages/ai-warrior/package.json` | Created | New package |
| `packages/ai-warrior/tsconfig.json` | Created | Extends base, refs ai-governance + core |
| `packages/ai-warrior/src/types.ts` | Created | All domain types |
| `packages/ai-warrior/src/llm/client.ts` | Created | Anthropic SDK wrapper with JSON parsing |
| `packages/ai-warrior/src/llm/prompts.ts` | Created | 4 system prompts + 4 user prompt builders |
| `packages/ai-warrior/src/analysis/correlator.ts` | Created | Heuristic scoring + 9 signal weights |
| `packages/ai-warrior/src/analysis/narrator.ts` | Created | LLM threat narration |
| `packages/ai-warrior/src/analysis/policy-gen.ts` | Created | LLM + heuristic policy generation |
| `packages/ai-warrior/src/defense/honeypot.ts` | Created | 4 decoy files, atime polling |
| `packages/ai-warrior/src/defense/quarantine.ts` | Created | Agent quarantine registry |
| `packages/ai-warrior/src/reporting/incident.ts` | Created | LLM incident report generation |
| `packages/ai-warrior/src/warrior.ts` | Created | Main AIWarrior orchestrator |
| `packages/ai-warrior/src/index.ts` | Created | Barrel exports |
| `packages/ai-governance/src/monitor.ts` | Updated | EventEmitter, buffer cap, return copies |

---

## 9. Known Limitations (MVP)

| Limitation | Impact | Resolution |
|---|---|---|
| Honeypot atime detection unreliable with `noatime` mounts | False negatives on some Linux setups | Use inotify `IN_ACCESS` (Linux) or ESF (macOS) in production |
| No PID attribution on honeypot access via atime polling | Can't name which agent triggered | Requires platform hooks |
| Event buffer is in-memory only | Events lost on restart | Persist to TimescaleDB |
| Correlator groups only by `agentId` | Cross-agent attacks not linked | Add cross-agent correlation in v0.2 |
| LLM calls are sequential per chain | Slower with many concurrent chains | Parallelize with Promise.all |
| No tests yet | Regressions possible | See AIWARRIOR-TODO.md |

---

## 10. Quality & Safety

- **TypeScript strict mode** — all types explicit, no `any`
- **Buffer bounded** — eventBuffer capped at 10,000; honeypot assets have no unbounded growth
- **Graceful degradation** — every LLM call has a typed fallback
- **No destructive actions** — warrior emits events and records quarantine; actual enforcement is delegated to policy engine
- **No secret logging** — honeypot content is fake; real credentials never passed to LLM

---

*Generated by Claude Sonnet 4.6 | ankrshield AI Warrior MVP | 2026-02-18*
