# xShield Social Threat Detection — TODO

## Sprint: Social Channel & QR Attack Vectors | v0.7.0

---

## PHASE 1 — Core Detectors (Build Now)

### [x] QR Threat Detector

- [ ] `packages/risk-intelligence/src/detectors/qr-detector.ts`
  - [ ] URL shortener detection (30+ shortener domains)
  - [ ] Suspicious TLD blocklist (.xyz, .top, .tk, .pw, .ru, .cn, .ml, .ga, .cf)
  - [ ] OAuth redirect abuse detection (`redirect_uri`, `next=`, `url=` params to non-whitelisted domain)
  - [ ] Unicode homograph / punycode detection (`xn--`)
  - [ ] Data URI detection (`data:text/html`, `data:application/`)
  - [ ] IP-as-host detection (QR pointing directly to IP address)
  - [ ] Double-encoding detection (`%25`, `%2F` in path)
  - [ ] Login page mimicry patterns (`/signin`, `/login`, `/verify`, `/confirm`)
  - [ ] Very long URL heuristic (> 500 chars = obfuscation)
  - [ ] ThreatFox domain lookup (reuse existing infrastructure)
  - [ ] Domain age check via WHOIS-like API (optional, graceful degradation)
  - [ ] `qrToFactors(result)` → `RiskFactor[]`
  - [ ] Export from `index.ts`

### [x] Discord Webhook Exfil Detector

- [ ] `packages/risk-intelligence/src/detectors/discord-exfil-detector.ts`
  - [ ] Discord webhook pattern: `discord.com/api/webhooks/`
  - [ ] Slack incoming webhook: `hooks.slack.com/services/`
  - [ ] Telegram Bot API: `api.telegram.org/bot`
  - [ ] Teams webhook: `outlook.office.com/webhook/`
  - [ ] Process allowlist: chrome, firefox, safari, msedge, electron, discord, slack, telegram, signal
  - [ ] Score 95 for discord webhook from non-browser/non-discord process
  - [ ] Score 85 for Telegram bot API from non-Telegram process
  - [ ] Score 75 for Slack webhook from non-Slack process
  - [ ] Score 5 for any of the above from allowlisted process
  - [ ] `exfilToFactors(result)` → `RiskFactor[]`
  - [ ] Export from `index.ts`

### [x] Social C2 Detector

- [ ] `packages/risk-intelligence/src/detectors/social-c2-detector.ts`
  - [ ] ThreatFox query for tags: `telegram-bot`, `discord-c2`, `telegram-c2`, `telegram`, `discord`
  - [ ] ThreatFox query for `api.telegram.org` IOC entries (malicious bot tokens)
  - [ ] Known social C2 IP ranges (from threat intel)
  - [ ] Pattern match: `api.telegram.org/bot[0-9]+:[A-Za-z0-9_-]{35}/` — flag unusual bot token patterns
  - [ ] `socialC2ToFactors(result)` → `RiskFactor[]`
  - [ ] Export from `index.ts`

### [x] Social Brand Monitor

- [ ] `packages/risk-intelligence/src/detectors/social-brand-monitor.ts`
  - [ ] Typosquatting generator: leetspeak, char substitution, prefix/suffix patterns
  - [ ] Impersonation pattern list: `official_`, `_support`, `_help`, `_airdrop`, `_bot`, `real_`
  - [ ] Telegram public channel search (via public search API)
  - [ ] Username similarity scorer (Levenshtein distance ≤ 2 = suspicious)
  - [ ] Platform coverage: telegram, discord, twitter, github
  - [ ] `brandToFactors(findings)` → `RiskFactor[]`
  - [ ] Export from `index.ts`

---

## PHASE 2 — Types + Engine Integration

- [ ] `packages/risk-intelligence/src/types.ts`
  - [ ] Add categories: `qr_threat`, `discord_exfil`, `social_c2`, `brand_impersonation`
  - [ ] Add sources: `threatfox_social`, `qr_heuristic`, `process_monitor`, `brand_scan`
  - [ ] Add to `RiskReport`: `qrResult?`, `exfilResult?`, `socialC2Result?`, `brandFindings?`
  - [ ] Add to `RiskEngineOptions`: `enableQr?`, `qrUrl?`, `enableExfilDetection?`, `networkConnections?`, `enableBrandMonitor?`, `brandTerms?`

- [ ] `packages/risk-intelligence/src/risk-engine.ts`
  - [ ] Import all 4 new detectors
  - [ ] Add to Promise.all() block
  - [ ] Collect factors from each detector
  - [ ] Attach results to RiskReport

- [ ] `packages/risk-intelligence/src/index.ts`
  - [ ] Export all new detectors + types

---

## PHASE 3 — Package + Publish

- [ ] `packages/risk-intelligence/package.json` → bump to `v0.7.0`
- [ ] Publish to Verdaccio: `npm publish --registry http://localhost:4873`
- [ ] Git commit + push

---

## PHASE 4 — xShield Web Integration (Next Sprint)

- [ ] Add QR scanner UI component to xShield web dashboard
  - [ ] File upload + drag-drop for QR images
  - [ ] Paste URL field for pre-decoded QR URLs
  - [ ] Real-time threat score display
  - [ ] "Is this QR safe?" widget embeddable on any page

- [ ] Add Social Threats panel to threat dashboard
  - [ ] Show active Discord exfil alerts from connected endpoints
  - [ ] Telegram C2 connection alerts
  - [ ] Brand impersonation findings table

- [ ] Add brand terms config to Settings page
  - [ ] User inputs their brand terms
  - [ ] Triggers daily brand monitor scan

---

## PHASE 5 — ANKR Warrior Integration (Future)

- [ ] Endpoint agent: hook outbound network connections → feed to discord-exfil-detector in real-time
- [ ] Browser extension: scan QR codes on visited pages + images in emails (Gmail, Outlook web)
- [ ] Slack/Teams bot: employees can submit suspicious QR images for instant threat scoring
- [ ] Telegram channel watcher: monitor specific channels for data leaks containing company keywords
- [ ] Webhook: POST alerts to Slack/Teams/Discord when high-severity social threats detected

---

## PHASE 6 — Commercial Features

- [ ] Brand monitoring dashboard (white-label per customer)
- [ ] Daily brand impersonation report (email digest)
- [ ] Takedown request workflow (integration with platform abuse reporting APIs)
- [ ] QR code threat intelligence feed (aggregated, anonymized)
- [ ] API endpoint: `POST /api/qr/check` — public API for third-party integration
- [ ] Telegram leak monitoring: scan public Telegram channels for customer's domain/email patterns

---

## Priorities

| Item                       | Impact   | Effort | Build order |
| -------------------------- | -------- | ------ | ----------- |
| QR detector                | High     | Low    | 1           |
| Discord exfil detector     | Critical | Low    | 2           |
| Social C2 detector         | High     | Low    | 3           |
| Brand monitor (heuristic)  | Medium   | Medium | 4           |
| QR scanner UI              | High     | Medium | 5           |
| Endpoint agent integration | Critical | High   | 6           |
| Brand monitor (API)        | Medium   | High   | 7           |

---

## Notes

- Discord exfil detection is the **highest signal-to-noise** of all four detectors. Zero false positives in real environments — no legitimate software (except Discord itself) sends POSTs to discord.com/api/webhooks.
- QR detector should be accessible as a standalone API (`POST /api/v1/qr/check`) for integration with email gateways and browser extensions.
- Brand monitor Phase 1 (heuristic typosquatting) requires no API keys. Phase 2 (live platform search) needs Telegram API access.
- All detectors follow the existing pattern: graceful degradation if external API unavailable, fire-and-forget scoring, never block the main flow.
