# xShield AI — Clean TODO

**Last updated**: 19 February 2026

Priority key: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Nice-to-have

---

## TIER 1 — Complete the core product (must-ship)

### 🔴 Risk Intelligence Engine (`packages/risk-intelligence`)

_Resecurity-equivalent capability, building in-house with free APIs_

- [ ] `src/types.ts` — RiskFactor, RiskReport, ExposedService, BreachRecord, DomainThreat types
- [ ] `src/detectors/greynoise-scanner.ts` — GreyNoise Community API (free, no auth) — classify any IP as malicious/benign/noise
- [ ] `src/detectors/shodan-scanner.ts` — Shodan Host API (`SHODAN_API_KEY` env) — enumerate exposed ports/services/CVEs on server's own IP
- [ ] `src/detectors/breach-monitor.ts` — HIBP public breach list (no auth) — check if domain appears in breach records
- [ ] `src/detectors/domain-guard.ts` — urlscan.io (no auth) — detect phishing/typosquatting against your domain
- [ ] `src/risk-engine.ts` — Aggregate all signals → 0–100 risk score → risk level (minimal/low/medium/high/critical)
- [ ] `src/index.ts` — Package exports
- [ ] Wire into `apps/api` — new REST endpoints: `GET /risk/report`, `GET /risk/score`, `GET /risk/ip/:ip`
- [ ] Add to Landing.tsx — "Digital Risk Intelligence" section with risk score visual

### 🔴 Dashboard UI (make it real)

_Currently most pages are empty shells_

- [ ] `Dashboard.tsx` — Wire up real data from GraphQL: threat count, honeypot hits, scan history, risk score
- [ ] `LiveThreats.tsx` — Real-time feed consuming `/warrior/threats/live` with auto-refresh
- [ ] `Analytics.tsx` — Privacy score chart (Recharts), threat breakdown by family, timeline
- [ ] `Devices.tsx` — List connected devices, per-device scan results
- [ ] `EvidenceReport.tsx` — Trigger `/warrior/evidence-report` and render the PDF/HTML output
- [ ] `Policies.tsx` — Show + create policies from GraphQL `generatedPolicies` query

### 🔴 Authentication flow (end-to-end)

- [ ] `Login.tsx` → POST `/auth/login` → store JWT → redirect to Dashboard
- [ ] `Register.tsx` → POST `/auth/register` → auto-login → onboarding
- [ ] Protected route wrapper in router — redirect to login if no JWT
- [ ] Token refresh logic (use refresh token before expiry)
- [ ] Logout clears JWT from storage

### 🔴 Android app — connect to real server

- [ ] Wire APK to user-entered server URL (currently hardcoded?)
- [ ] Receive push alerts from xShield server when threats detected
- [ ] Show scan results in mobile UI
- [ ] Basic spyware scan on device apps from mobile

---

## TIER 2 — Make it better (should ship)

### 🟠 DNS Resolver — deploy it

- [ ] Deploy `@ankrshield/dns-resolver` as a running service on the server (port 5353)
- [ ] Connect web dashboard: show DNS queries blocked in real-time
- [ ] Seed the tracker blocklist from EasyList + EasyPrivacy + Steven Black hosts
- [ ] Expose DNS stats endpoint: queries/hour, top blocked domains, top trackers

### 🟠 Network Monitor — activate it

- [ ] Activate `@ankrshield/network-monitor` packet capture on the server NIC
- [ ] Feed captured events into the Warrior attack chain correlator
- [ ] Show network traffic timeline in Dashboard (`NetworkEvents` GraphQL query)
- [ ] SNI extraction: identify which apps are making which TLS connections

### 🟠 YARA — auto-update rules

- [ ] Script to pull latest Neo23x0/signature-base YARA rules on a schedule
- [ ] Merge with our bundled rules, deduplicate
- [ ] `/yara/status` endpoint showing rules count, last updated, last scan

### 🟠 AI Governance package — wire it up

- [ ] Detect outbound connections to ChatGPT (api.openai.com), Claude (api.anthropic.com), Copilot, Gemini endpoints
- [ ] Log which process is making AI API calls
- [ ] Expose in Dashboard: "AI tools used today" with token/request counts
- [ ] Alert when AI tool makes unexpected file or clipboard access

### 🟠 Privacy Engine — activate it

- [ ] Wire `@ankrshield/privacy-engine` into network monitor pipeline
- [ ] Classify each domain: tracker / CDN / social / analytics / unknown
- [ ] Calculate daily privacy score (0–100) and store in `PrivacyScore` table
- [ ] Show score trend in Dashboard Analytics

### 🟠 Automated tests

- [ ] Unit tests for `spyware-detector` — mock IOC matches, verify indicator output
- [ ] Unit tests for `risk-intelligence` — mock API responses, verify risk scoring
- [ ] Integration test for API `/warrior/spyware-scan` endpoint
- [ ] CI: add GitHub Actions workflow to run tests on PR

---

## TIER 3 — Grow the platform (high value)

### 🟡 Payment integration

- [ ] Wire Stripe checkout into Register flow — select tier at signup
- [ ] Webhook handler for `customer.subscription.updated` / `deleted`
- [ ] Update `User.tier` in database on subscription events
- [ ] Feature gates: check user tier before enabling premium scan features
- [ ] Pricing page on xshieldai.com

### 🟡 AlienVault OTX — full integration

- [ ] Get free OTX API key (otx.alienvault.com) and set `OTX_API_KEY` on server
- [ ] Verify OTX feed is pulling correctly (check `LiveIocDetector.getCacheStats()`)
- [ ] Add OTX cache stats to `/warrior/threats/live` response

### 🟡 Shodan — expose your own server

- [ ] Get Shodan API key (free account at shodan.io), set `SHODAN_API_KEY`
- [ ] Run initial scan against server IP → see what ports/services Shodan sees
- [ ] Add findings to risk report: "Your server exposes these services to the internet"
- [ ] Schedule weekly re-scan

### 🟡 Windows + macOS detection

- [ ] Add Windows-specific IOC paths to `FileArtifactDetector` (APPDATA, TEMP paths)
- [ ] Add macOS-specific checks (LaunchAgents, kernel extensions for spyware)
- [ ] Platform-aware `ProcessDetector` — Windows uses `tasklist`, macOS uses `ps`
- [ ] Separate YARA rules for Windows malware (Emotet, TrickBot, LockBit artifacts)

### 🟡 Breach monitoring — domain watch

- [ ] Add domain monitoring: check every 24h if new breaches appear for configured domain
- [ ] Email alert when new breach is detected
- [ ] Dashboard card: "X accounts from yourdomain.com in breach databases"

### 🟡 Brand protection — typosquat detection

- [ ] `domain-guard.ts` in risk-intelligence: generate typosquat variants of your domain
- [ ] Check each variant via urlscan.io / DNS resolution — flag registered look-alikes
- [ ] Dashboard alert: "3 domains similar to yours were registered this week"

---

## TIER 4 — Polish and scale

### 🟢 Tracker database seeding

- [ ] Import EasyList into `tracker-db` package
- [ ] Import Steven Black hosts list (~100K entries)
- [ ] Import DuckDuckGo Tracker Radar data
- [ ] Expose tracker count in dashboard stats

### 🟢 iOS app

- [ ] Port Android app screens to React Native iOS-compatible components
- [ ] TestFlight build via EAS
- [ ] App Store submission (requires Apple developer account $99/year)

### 🟢 Evidence report improvements

- [ ] PDF generation (use puppeteer or pdf-lib) instead of raw HTML
- [ ] Add YARA match evidence to report
- [ ] Add risk intelligence findings to report
- [ ] Watermark + timestamp each page

### 🟢 Desktop app

- [ ] Get Electron app launching with the web dashboard embedded
- [ ] System tray icon with threat count badge
- [ ] Native OS notifications on critical alerts
- [ ] Auto-launch on boot (auto-launch.ts already exists)

### 🟢 API rate limiting per tier

- [ ] Free tier: 10 scans/day, 100 API calls/hour
- [ ] Premium: unlimited scans, 1000 API calls/hour
- [ ] Enforce via Redis rate limiter keyed on userId + tier

### 🟢 Onboarding flow

- [ ] After register: 3-step wizard (connect server → install app → run first scan)
- [ ] First scan auto-triggered on new account
- [ ] "You're protected" confirmation screen

### 🟢 Documentation site

- [ ] Self-hosted docs at docs.xshieldai.com
- [ ] Getting started guide (Linux server + Android app)
- [ ] API reference (auto-generated from GraphQL schema)
- [ ] YARA rule authoring guide

---

## IMMEDIATE NEXT ACTIONS (next 48 hours)

1. **Build `packages/risk-intelligence`** — GreyNoise + Shodan + HIBP + urlscan.io
2. **Wire risk engine into API** — `/risk/report` endpoint
3. **Add risk section to Landing.tsx** — show off the capability
4. **Dashboard.tsx** — make it show real data (wire GraphQL queries)
5. **Set `OTX_API_KEY`** on server — free OTX account takes 2 minutes
6. **Deploy DNS resolver** as sidecar service

---

## Environment Variables Still Needed

```bash
SHODAN_API_KEY=          # Free at shodan.io — attack surface scanning
OTX_API_KEY=             # Free at otx.alienvault.com — 19M+ IOC feed
ANTHROPIC_API_KEY=       # Already set — AI Warrior
ABUSEIPDB_API_KEY=       # Already set — IP reporting
JINA_API_KEY=            # Already set — embeddings
STRIPE_SECRET_KEY=       # Needed for payment tier
STRIPE_PUBLISHABLE_KEY=  # Needed for payment tier
JWT_SECRET=              # Should be set in prod
```

---

_xShield AI / ANKR Labs — 19 February 2026_
