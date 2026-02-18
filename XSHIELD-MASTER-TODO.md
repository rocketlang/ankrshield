# xShield AI — Master TODO to Surpass All Competitors

**Last updated**: 19 February 2026
**Mission**: Beat Resecurity ($15K–$50K/yr), ZeroFox, Digital Shadows ($95–105K/yr), Recorded Future ($60–100K+), Constella ($315–415K/yr)
**Target**: API-first, AI-native DRP for the $840M unserved SME market
**Current**: v0.4.1 — 13 threat intelligence sources + AI narrative via ANKR proxy (cost $0)

Priority: 🔴 Ship now · 🟠 This week · 🟡 This sprint · 🟢 Next sprint

---

## PHASE 1 — v0.5.0: Real-Time Detection (vs. Competitor's 24–72h SLA)

> **Competitor Kill**: Phishing sites live 4–8 hours. Every DRP vendor SLA: 24–72h.
> We detect in minutes and auto-remediate.

### 🔴 Continuous Domain Watch (Game-Changer #2)

**Package**: `packages/risk-intelligence/src/watchers/domain-watcher.ts`

- [ ] Implement polling scheduler — check each watched domain every 5 minutes via cron
- [ ] Persist watch configs in `domain_watches` table (Prisma schema update needed)
- [ ] Delta detection — compare new report vs previous report, emit only changed fields
- [ ] Alert triggers: new typosquat registered, SPF/DMARC removed, IP on new threat feed, phishing URL found, new breach record
- [ ] Webhook dispatcher — POST to user-configured URL with alert payload on change
- [ ] REST endpoint: `POST /watch/domain` → add domain to watch list
- [ ] REST endpoint: `DELETE /watch/domain/:domain` → remove domain
- [ ] REST endpoint: `GET /watch/domains` → list active watches with last-seen status
- [ ] Dashboard card: "Watched Domains" showing status dots (green/red/yellow)

### 🔴 One-Click Remediation Playbooks (Game-Changer #3)

**Package**: `packages/risk-intelligence/src/playbooks/remediation-engine.ts`

- [ ] DNS fix playbook — for SPF missing: generate exact TXT record to add
- [ ] DNS fix playbook — for DMARC missing: generate `_dmarc` TXT record with recommended policy
- [ ] DNS fix playbook — for CAA missing: generate CAA record to restrict cert issuance
- [ ] Port lockdown playbook — for each Shodan-flagged port: generate exact `ufw` / `iptables` command
- [ ] Phishing takedown template — pre-fill DMCA/abuse report for detected phishing URL
- [ ] Breach response playbook — for each HIBP hit: list affected accounts, password reset steps
- [ ] GitHub secret remediation — for each leaked secret: revoke token + rotate steps
- [ ] CI/CD playbook — generate GitHub Actions YAML to add xShield scan to PR pipeline
- [ ] REST endpoint: `GET /risk/report/:id/playbook` → full remediation playbook for report
- [ ] Landing page: show sample playbook (DNS fix + port lockdown) as "instant remediation" demo

### 🔴 Prisma Schema Updates

- [ ] `DomainWatch` model — userId, domain, webhookUrl, lastCheckedAt, lastRiskScore, isActive
- [ ] `RemediationPlaybook` model — reportId, findings[], actions[], generatedAt
- [ ] `AlertHistory` model — watchId, triggeredAt, alertType, previousValue, newValue, webhookStatus
- [ ] Migration: `npx prisma migrate dev --name add-domain-watch`

---

## PHASE 2 — v0.5.0: Developer-First API + Free Tier (No Competitor Has This)

> **Competitor Kill**: Every DRP vendor says "contact sales". We have self-serve, free tier, and REST API.

### 🔴 API Key Authentication System

- [ ] `POST /auth/api-keys` — generate API key for authenticated user
- [ ] `GET /auth/api-keys` — list API keys with usage stats
- [ ] `DELETE /auth/api-keys/:keyId` — revoke key
- [ ] Middleware: accept `Authorization: Bearer xsh_live_...` or `X-API-Key: xsh_live_...` header
- [ ] API key format: `xsh_live_<32 random chars>` (live) / `xsh_test_<32 random chars>` (sandbox)
- [ ] Store hashed key in DB, never show full key after creation

### 🔴 Rate Limiting by Tier

- [ ] Free tier: 10 risk reports/month, no API key needed (IP-based rate limit)
- [ ] Starter ($99/mo): 500 reports/month, API key required, webhooks enabled
- [ ] Pro ($499/mo): unlimited reports, API key, all integrations, Slack/Jira/PagerDuty
- [ ] Enterprise: custom, white-label, SLA
- [ ] Middleware: check `user.tier` → enforce monthly quota via Redis counter `ratelimit:{userId}:{YYYY-MM}`
- [ ] Rate limit headers in response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] 429 response with `Retry-After` header and upgrade CTA

### 🔴 Public-Facing REST API Docs

- [ ] `GET /api/v1/risk/report?domain=example.com` — run full 13-source risk assessment
- [ ] `GET /api/v1/risk/score?domain=example.com` — just the 0–100 score (fast, lighter)
- [ ] `GET /api/v1/risk/ip/:ip` — IP reputation check (GreyNoise + ASN + OTX)
- [ ] `GET /api/v1/risk/breach?email=...` — credential breach check (HIBP)
- [ ] `GET /api/v1/risk/typosquats?domain=...` — typosquat variants that are live
- [ ] `GET /api/v1/risk/github?org=...` — GitHub secret exposure scan
- [ ] `POST /api/v1/watch` — add domain to continuous monitoring
- [ ] `GET /api/v1/watch` — list watched domains + latest status
- [ ] Versioned under `/api/v1/` — all endpoints

### 🟠 Swagger / OpenAPI Spec

- [ ] Auto-generate `openapi.json` from route definitions (use `fastify-swagger` or `express-openapi-validator`)
- [ ] Serve docs at `/api/docs` — interactive Swagger UI
- [ ] Include auth examples, rate limit info, response schemas
- [ ] Export `openapi.json` — link from landing page "API Documentation"

### 🟠 GitHub Actions Integration (Game-Changer #4)

**File**: `.github/actions/xshield-scan/action.yml`

- [ ] Composite action: runs `curl` against our API, fails CI if risk score > threshold
- [ ] Input params: `domain`, `api-key`, `fail-threshold` (default: 70)
- [ ] Outputs: `risk-score`, `risk-level`, `report-url`
- [ ] Publish to GitHub Marketplace as `ankrlabs/xshield-scan`
- [ ] Sample workflow snippet in docs + landing page

---

## PHASE 3 — v0.6.0: Integrations & Alerts (No Competitor Offers This)

> **Competitor Kill**: No DRP vendor has WhatsApp/Telegram alerts. None has native Slack/Jira.

### 🟠 Slack Integration

- [ ] `POST /integrations/slack` — store Slack webhook URL per user
- [ ] Alert formatter: rich Slack Block Kit message with risk score, top 3 findings, remediation link
- [ ] Test button in Dashboard Settings: "Send test alert"
- [ ] Alert on: new critical finding, domain watch trigger, weekly digest

### 🟠 WhatsApp Business API (Game-Changer #6)

- [ ] `POST /integrations/whatsapp` — store WhatsApp Business number per user
- [ ] Use Twilio WhatsApp API or Meta Cloud API (free tier: 1000 msgs/month)
- [ ] Template message: "🔴 xShield Alert: [DOMAIN] risk score changed to [SCORE]. Top threat: [FINDING]. View: [LINK]"
- [ ] Verify opt-in flow (WhatsApp requires user to message first)

### 🟠 Telegram Bot (Game-Changer #6)

- [ ] Create `@xshield_alert_bot` via BotFather
- [ ] `POST /integrations/telegram` — store chat_id per user
- [ ] Send formatted alert with inline keyboard: [View Report] [Dismiss] [Remediate]
- [ ] Free, no rate limit on Telegram bot API

### 🟠 Jira Integration

- [ ] `POST /integrations/jira` — store Jira URL + API token + project key
- [ ] On new critical finding: auto-create Jira ticket with title, description, remediation steps, priority mapping
- [ ] Link Jira ticket ID to finding in xShield report

### 🟠 PagerDuty Integration

- [ ] `POST /integrations/pagerduty` — store PagerDuty routing key
- [ ] On critical/high finding: trigger PagerDuty incident via Events API v2
- [ ] Auto-resolve incident when risk score drops below threshold

---

## PHASE 4 — v0.6.0: Supply Chain (Biggest 2025–2026 Attack Vector)

> **Competitor Kill**: No vendor offers supply chain attack surface modeling.

### 🟡 Supply Chain Risk Monitor (Game-Changer #5)

**Package**: `packages/risk-intelligence/src/detectors/supply-chain-scanner.ts`

- [ ] `checkNpmPackage(name)` — query npm registry, check for:
  - Known malicious packages (Snyk OSS DB, sonatype OSS Index)
  - Typosquat names (Levenshtein distance ≤ 2 from popular packages)
  - Packages with recently removed maintainers
  - Packages with sudden ownership transfer
  - Last publish date > 2 years (abandoned = risk)
- [ ] `checkPypiPackage(name)` — same checks via PyPI JSON API
- [ ] `checkDockerImage(name)` — query Docker Hub API for known-vulnerable base images
- [ ] Integrate into risk engine: new detector runs when `enableSupplyChain: true`
- [ ] REST endpoint: `POST /risk/supply-chain` → body: `{packages: [{ecosystem: "npm", name: "lodash"}]}`
- [ ] REST endpoint: `GET /risk/supply-chain/scan?manifest=package.json` → parse lockfile + check all deps

### 🟡 Supply Chain Blast-Radius Modeling (Game-Changer #10)

- [ ] Map vendor ecosystem: given a target org, enumerate their known SaaS vendors (from DNS + cert data)
- [ ] For each vendor: check if they appear in breach databases, dark web paste monitors
- [ ] Model blast radius: "If [VENDOR] is compromised, here is your exposed data path"
- [ ] REST endpoint: `GET /risk/blast-radius?domain=target.com`
- [ ] Dashboard: vendor dependency graph with risk heat-map

---

## PHASE 5 — v0.7.0: MSSP + Takedowns (Revenue Multipliers)

> **Competitor Kill**: Recorded Future charges $200K per 500 takedowns. We include it.

### 🟡 Automated Takedown Orchestration (Game-Changer #8)

- [ ] Takedown workflow engine: given a phishing URL, simultaneously:
  - POST abuse report to registrar (RDAP lookup → find registrar abuse email)
  - POST to hosting provider abuse contact (reverse IP → hosting lookup)
  - Submit to Google Safe Browsing via `safebrowsing.google.com/safebrowsing/report_phish/`
  - Submit to Microsoft SmartScreen via `microsoft.com/en-us/wdsi/support/report-unsafe-site`
  - Submit to ICANN complaint form
  - Submit to PhishTank API (free, instant propagation to Firefox/Chrome)
  - Submit to OpenPhish
- [ ] Track takedown status: `pending → submitted → confirmed_down`
- [ ] REST endpoint: `POST /takedown/request` → body: `{url: "https://phishing.com/login"}`
- [ ] REST endpoint: `GET /takedown/:id/status` → check takedown progress
- [ ] Dashboard: Takedown tracker with timeline and status per channel
- [ ] Contractual SLA: sub-2-hour median (enabled by parallelizing all channels simultaneously)

### 🟡 MSSP White-Label API (Game-Changer #7)

- [ ] `POST /mssp/orgs` — create sub-organization under MSSP account
- [ ] `GET /mssp/orgs` — list all client orgs
- [ ] White-label config: custom logo URL, custom domain for reports, custom report footer
- [ ] Usage billing aggregation: MSSP account sees total API calls across all sub-orgs
- [ ] Wholesale pricing: $0.05/report for MSSP tier (mark up 10–20x to clients = $0.50–$1.00/report)
- [ ] REST endpoint: `GET /mssp/usage` → per-org monthly usage breakdown
- [ ] Dashboard: MSSP admin view showing all client orgs + their risk status

---

## PHASE 6 — v0.8.0: AI Intelligence (Full Moat)

> **Competitor Kill**: No vendor does Attack Story reconstruction or LLM-native threat briefings.

### 🟡 Attack Story Engine (Game-Changer #9)

**File**: `packages/risk-intelligence/src/narrative/attack-story.ts`

- [ ] Timeline correlation: for a domain, collect timestamped events across all 13 sources
  - Domain registration date (RDAP)
  - Certificate issuance dates (crt.sh)
  - First phishing kit detection (phishing feeds)
  - First paste site appearance (paste monitor)
  - GreyNoise first-seen date for associated IPs
- [ ] Pass timeline to AI proxy: "reconstruct the attack narrative from these events"
- [ ] Output: "This campaign began 47 days ago when threat actor registered [TYPOSQUAT]..."
- [ ] PDF generation: `puppeteer` → board-ready PDF with logo, timeline visual, findings
- [ ] REST endpoint: `GET /risk/attack-story?domain=example.com` → full narrative PDF
- [ ] Route through ANKR AI proxy with `strategy: "free_first"` (cost $0)

### 🟡 Enhanced AI Threat Narrative (Upgrade v0.4.1)

- [ ] Add threat actor profiling: cross-reference ASN/IP with known APT groups
- [ ] Add MITRE ATT&CK mapping: map each finding to ATT&CK technique ID (T1566 = phishing, etc.)
- [ ] Add time-to-exploit estimate with confidence interval
- [ ] Add peer benchmark: "Your risk score is higher than 73% of companies in your industry"
- [ ] Cache narratives for 1 hour per domain (avoid re-generating for same report)

### 🟡 Outcome-Based Pricing / ROI Dashboard (Game-Changer #11)

- [ ] Track per-user metrics: threats detected before impact, takedowns completed, credentials remediated
- [ ] Calculate dollar-value savings using FBI/Verizon DBIR breach cost models ($4.45M avg breach 2023)
- [ ] Dashboard widget: "xShield saved you an estimated $X,XXX this month"
- [ ] Peer benchmarking: anonymized comparison vs similar company size/industry
- [ ] Monthly PDF "Security Outcomes Report" auto-emailed to user
- [ ] Security outcomes contract: if < X threats detected/quarter → partial refund (differentiator)

---

## PHASE 7 — v0.5.0: Landing Page & Pricing (Convert Traffic)

> Current landing has risk demo. Missing: pricing page, developer API section, free-tier CTA.

### 🔴 Pricing Page (`apps/web/src/pages/Pricing.tsx`)

- [ ] Create `/pricing` route with 4 tiers:
  - **Free**: 10 reports/month, no credit card, no API key, basic risk score
  - **Starter** ($99/mo): 500 reports, API key, webhooks, email alerts
  - **Pro** ($499/mo): unlimited, all integrations, Slack/Jira/PagerDuty/WhatsApp, continuous watch, supply chain scan, attack story
  - **Enterprise** (custom): white-label, MSSP, contractual takedown SLA, custom integrations
- [ ] Comparison table: xShield vs Recorded Future vs ZeroFox vs Resecurity
- [ ] "vs competitors" section: "Constella charges $315K–$415K/year. We charge $99/month."
- [ ] "Get started free" CTA → Register page (no credit card required)

### 🔴 Landing Page Updates (`apps/web/src/pages/Landing.tsx`)

- [ ] Add "Developer API" section — show 4-line `curl` example to get risk report
- [ ] Add "Continuous Monitoring" section — show webhook payload example
- [ ] Add "Integrations" logos: Slack, GitHub, Jira, WhatsApp, Telegram, PagerDuty
- [ ] Add pricing tier preview section with "Start for free" CTA
- [ ] Add social proof: "13 intelligence sources, 30-second reports, $0 to start"
- [ ] Add competitor comparison mini-table inline: "vs $50K/year alternatives"

### 🟠 Developer Portal (`apps/web/src/pages/Developers.tsx`)

- [ ] `/developers` route — API quickstart guide
- [ ] Interactive API explorer (call live API from browser, see JSON response)
- [ ] Code examples: curl, Python, Node.js, Go
- [ ] Webhook setup guide with example payload
- [ ] GitHub Actions integration walkthrough
- [ ] API key generation directly from this page

---

## PHASE 8 — v0.5.0: Dashboard (Make It Real)

> Dashboard is currently empty shells. Fill it with live data.

### 🔴 Dashboard.tsx — Wire Real Data

- [ ] Risk score widget — call `GET /risk/score` for user's registered domain
- [ ] Threat count widget — query DB for threats last 24h/7d/30d
- [ ] Domain watch status — list watched domains with last-checked timestamps + alert count
- [ ] Recent alerts feed — last 10 alerts with type, severity, timestamp
- [ ] Intelligence sources status — show which of 13 sources are live vs degraded
- [ ] Takedown queue — pending/in-progress/completed takedowns with SLA countdown

### 🔴 Authentication Flow (End-to-End)

- [ ] `Login.tsx` → `POST /auth/login` → store JWT + refresh token in httpOnly cookie
- [ ] `Register.tsx` → `POST /auth/register` → auto-login → onboarding wizard (3 steps)
- [ ] Protected route guard — redirect to `/login` if no valid JWT
- [ ] Auto-refresh token before expiry (silent refresh via `/auth/refresh`)
- [ ] Logout clears cookies + invalidates refresh token in DB

### 🟠 Onboarding Wizard (`apps/web/src/pages/Onboarding.tsx`)

- [ ] Step 1: Enter your domain → immediate free risk scan → show score
- [ ] Step 2: Configure alerts (email required, Slack/WhatsApp optional)
- [ ] Step 3: Add to continuous monitoring → confirm webhook or use our dashboard
- [ ] "You're protected" confirmation with first report link

---

## PHASE 9 — v0.5.0: Payment & Revenue

### 🟠 Stripe Integration

- [ ] `POST /billing/checkout` → create Stripe Checkout session for selected tier
- [ ] `GET /billing/portal` → Stripe Customer Portal (manage subscription)
- [ ] Webhook handler `POST /billing/webhook`: handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Update `User.tier` in DB on subscription events
- [ ] Feature gates: check `req.user.tier` before allowing premium API calls

---

## PHASE 10 — v1.0.0: Mobile & Desktop (Complete Platform)

### 🟢 Android App Improvements

- [ ] Wire APK to user-entered server URL (remove hardcoded endpoint)
- [ ] Real-time push alerts when domain watch triggers
- [ ] Show last risk score + top finding on home screen
- [ ] One-tap "Run Scan" button → calls API → shows report

### 🟢 Desktop App (Electron)

- [ ] System tray icon with threat count badge
- [ ] Native OS notification on critical alerts
- [ ] Embedded web dashboard (localhost:5270 in Electron webview)
- [ ] Auto-launch on boot

---

## COMPETITIVE SCORE TRACKER

Track our progress against each competitor:

| Feature                         | Resecurity | ZeroFox | Rec. Future | xShield Now | xShield v1.0 |
| ------------------------------- | ---------- | ------- | ----------- | ----------- | ------------ |
| Risk score (0–100)              | ✅         | ✅      | ✅          | ✅ v0.4.1   | ✅           |
| AI threat narrative             | ❌         | ❌      | ❌          | ✅ v0.4.1   | ✅           |
| 13+ intelligence sources        | ❌ (8–10)  | ❌      | ❌          | ✅ v0.4.1   | ✅           |
| Free tier (no credit card)      | ❌         | ❌      | ❌          | 🔨 v0.5.0   | ✅           |
| Developer REST API              | ❌         | ❌      | ❌          | 🔨 v0.5.0   | ✅           |
| Transparent public pricing      | ❌         | ❌      | ❌          | 🔨 v0.5.0   | ✅           |
| Self-serve instant access       | ❌         | ❌      | ❌          | 🔨 v0.5.0   | ✅           |
| Continuous domain watch         | ✅         | ✅      | ✅          | 🔨 v0.5.0   | ✅           |
| One-click remediation playbooks | ❌         | ❌      | ❌          | 🔨 v0.5.0   | ✅           |
| GitHub Actions integration      | ❌         | ❌      | ❌          | 🔨 v0.5.0   | ✅           |
| Slack / Jira / PagerDuty        | ✅         | ✅      | ✅          | 🔨 v0.6.0   | ✅           |
| WhatsApp / Telegram alerts      | ❌         | ❌      | ❌          | 🔨 v0.6.0   | ✅           |
| Supply chain monitor            | ❌         | ❌      | limited     | 🔨 v0.6.0   | ✅           |
| Automated phishing takedowns    | limited    | ✅      | ✅($200K)   | 🔨 v0.7.0   | ✅ included  |
| MSSP white-label API            | ❌         | limited | ❌          | 🔨 v0.7.0   | ✅           |
| Attack story engine             | ❌         | ❌      | ❌          | 🔨 v0.8.0   | ✅           |
| Supply chain blast-radius       | ❌         | ❌      | ❌          | 🔨 v0.8.0   | ✅           |
| ROI dashboard + outcome SLA     | ❌         | ❌      | ❌          | 🔨 v1.0.0   | ✅           |
| Contractual takedown SLA        | ❌         | ❌      | ❌          | 🔨 v1.0.0   | ✅           |
| MITRE ATT&CK mapping            | ✅         | limited | ✅          | 🔨 v0.8.0   | ✅           |
| Price/year                      | $15–50K    | custom  | $60–100K+   | **$99/mo**  | **$99/mo**   |

---

## RELEASE PLAN

| Version | Target    | Key Deliverables                                                       |
| ------- | --------- | ---------------------------------------------------------------------- |
| v0.5.0  | Week 1–2  | Domain watch, remediation playbooks, API keys, free tier, pricing page |
| v0.6.0  | Week 3–4  | Slack/Jira/WA/Telegram, supply chain scanner, GitHub Actions           |
| v0.7.0  | Week 5–6  | Automated takedowns, MSSP white-label, enhanced AI narrative           |
| v0.8.0  | Week 7–8  | Attack story engine, blast-radius, MITRE ATT&CK, ROI dashboard         |
| v1.0.0  | Week 9–10 | Outcome-based SLA, mobile alerts, desktop app, Stripe billing          |

---

## IMMEDIATE NEXT 48 HOURS (v0.5.0 Start)

1. **Prisma schema** — add `DomainWatch`, `AlertHistory`, `ApiKey`, `RemediationPlaybook` models → migrate
2. **API key middleware** — `xsh_live_` prefix, hash + store, middleware to parse
3. **Rate limiting** — Redis counter per userId per month, enforce tier limits
4. **Remediation engine** — `remediation-engine.ts` — generate DNS fix playbooks from `DnsSecurityReport`
5. **Domain watcher** — `domain-watcher.ts` — 5-minute polling loop with webhook dispatch
6. **Pricing page** — `Pricing.tsx` — 4 tiers, competitor comparison table, "Start Free" CTA
7. **Update Landing** — add developer API section, curl example, integration logos

---

_xShield AI / ANKR Labs — 19 February 2026_
_Objective: Surpass Resecurity, ZeroFox, Digital Shadows, Recorded Future, Constella Intel_
