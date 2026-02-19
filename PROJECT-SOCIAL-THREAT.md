# xShield — Social Channel & QR Code Threat Detection

## Project Report v1.0 | 2026-02-19

---

## Executive Summary

Modern attacks have migrated off email and onto messaging platforms. Telegram, Discord, WhatsApp, Slack, and QR codes are now primary delivery vectors for malware, phishing, credential theft, and data exfiltration — yet most security tools were designed for an email-centric threat model and are blind to these channels.

This report defines xShield's **Social Threat Detection** module: four new detectors that extend the existing 14-detector risk-intelligence engine to cover the full modern attack surface. These are not niche additions — Discord webhook exfiltration is used by over 60 active malware families today. QR phishing bypasses 100% of URL-scanning email security gateways. Telegram C2 is the default for commodity RATs sold on hacking forums.

---

## 1. Threat Landscape

### 1.1 Messaging Platforms as C2 Infrastructure

Command-and-control (C2) infrastructure has shifted from dedicated servers to legitimate cloud services that are impossible to block without disrupting users.

**Telegram Bot API as C2**
The Telegram Bot API (`api.telegram.org/bot<TOKEN>/`) is used as C2 by over 100 active malware families tracked in ThreatFox. The attacker creates a free Telegram bot, hardcodes the token into malware, and uses `getUpdates` / `sendMessage` to issue commands and receive stolen data. The traffic is:

- HTTPS to a legitimate domain (never blocked by firewall)
- Indistinguishable from normal Telegram app traffic at the network level
- Extremely resilient — Telegram doesn't shut bots down quickly
- Free, scalable, and requires no infrastructure

Families using this pattern: **AsyncRAT, LimeRAT, StormKitty, ToxicEye, WarzoneRAT, Purple Fox dropper, and 90+ others.**

**Discord Webhook Exfiltration**
Discord incoming webhooks (`discord.com/api/webhooks/<ID>/<TOKEN>`) are abused for data exfiltration by stealer malware. After harvesting browser passwords, cookies, crypto wallets, and screenshots, the malware POSTs everything directly to an attacker-controlled Discord channel. Detection is near-zero because:

- `discord.com` is on every corporate allowlist
- The webhook URL looks like normal Discord traffic
- No C2 server to take down — Discord moderates slowly
- Webhook IDs cycle rapidly (new one every infection)

Families using this pattern: **Raccoon Stealer, Vidar, RedLine, MetaStealer, WhiteSnake, Umbral Stealer, and 40+ others.**

**WhatsApp / Slack for BEC (Business Email Compromise)**
Business Email Compromise, traditionally conducted via email spoofing, has migrated to messaging platforms:

- CFO impersonation via WhatsApp ("urgent wire transfer needed")
- Slack workspace phishing — fake IT admin messages requesting credentials
- Teams/Slack bots delivering malicious file shares
- No email security gateway to catch these

**Telegram as Dark Web Alternative**
Stolen data dumps (credentials, credit cards, database leaks) increasingly appear on Telegram channels before dark web forums. Monitoring for brand-specific leaks is now a Telegram problem, not just a dark web problem.

---

### 1.2 QR Code Attacks ("Quishing")

QR phishing surged 587% in 2023–2024 as a direct response to improved URL scanning in email gateways. Security tools can't read images — QR codes are invisible to them.

**Attack Taxonomy**

| Attack Type          | Mechanism                                               | Target                             |
| -------------------- | ------------------------------------------------------- | ---------------------------------- |
| Email quishing       | QR in email body or PDF replaces link                   | Credentials, OAuth tokens          |
| Physical replacement | Sticker over legitimate QR (parking, restaurant, event) | Credentials, payments              |
| OAuth hijack         | QR initiates OAuth flow to attacker app                 | Access tokens (no password needed) |
| 2FA bypass           | "Scan to verify" initiates attacker's login session     | Account takeover                   |
| WiFi QR              | Malicious `WIFI:` QR connects to attacker AP            | MitM position                      |
| Package scam         | SMS QR "track your parcel" → phishing page              | Credentials, card data             |
| Conference badge     | QR on printed badge leads to malware download           | Initial access                     |
| Reverse proxy        | QR → legitimate-looking proxy → real site (AiTM)        | Session cookies                    |

**Why QR codes bypass security:**

1. Email scanners parse text/HTML — images (including QR codes) are ignored
2. PDFs with embedded QR images are not scanned for URLs
3. Physical QR codes are completely outside digital security perimeter
4. Mobile devices scanning QR have weaker endpoint security
5. Browser URL bars are hidden/minimal on mobile — users don't see the destination

**QR + OAuth hijack** is particularly dangerous: the QR initiates a legitimate OAuth flow (Microsoft, Google) but the `redirect_uri` points to the attacker. The user sees a real Microsoft login page, completes MFA, and hands the attacker a fully authenticated token. No credential phishing page involved.

---

### 1.3 Social Brand Impersonation

Every company with a public presence faces impersonation on social/messaging platforms:

- Fake Telegram groups ("Official ANKR Support")
- Typosquatted Twitter/X handles (`@ANKRlabs` vs `@ANKRLabs`)
- Fake Discord servers mimicking official community
- WhatsApp numbers claiming to be company support
- YouTube crypto scam streams using stolen brand assets

This is the most common entry point for crypto-related social engineering. Victims join fake support channels, share wallet seeds, click malicious links, or send crypto to "verification addresses."

---

## 2. Architecture

### 2.1 New Detectors (risk-intelligence v0.7.0)

```
packages/risk-intelligence/src/detectors/
  ├── qr-detector.ts           ← QR URL threat scoring
  ├── discord-exfil-detector.ts ← Discord/Slack/Telegram webhook exfil detection
  ├── social-c2-detector.ts    ← Telegram/Discord C2 IOC lookup (ThreatFox)
  └── social-brand-monitor.ts  ← Brand impersonation detection
```

### 2.2 Data Flow

```
Endpoint Agent / Email Scanner / Network Monitor
         │
         ▼
  Input normalisation
  ┌─────────────────────────────────────────────────────┐
  │  QR image → decode → URL                           │
  │  Network conn → domain + process name              │
  │  Brand name → search for impersonators             │
  └─────────────────────────────────────────────────────┘
         │
         ▼
  Risk Intelligence Engine (parallel detectors)
  ┌──────────────────┐  ┌──────────────────┐
  │  qr-detector     │  │  discord-exfil   │
  │  URL heuristics  │  │  process+domain  │
  │  ThreatFox check │  │  webhook pattern │
  └──────────────────┘  └──────────────────┘
  ┌──────────────────┐  ┌──────────────────┐
  │  social-c2       │  │  brand-monitor   │
  │  ThreatFox tags  │  │  name matching   │
  │  platform IOCs   │  │  platform APIs   │
  └──────────────────┘  └──────────────────┘
         │
         ▼
  RiskReport { score, factors, narrative }
```

### 2.3 Integration Points

- **Endpoint Agent (ANKR Warrior)**: observes outbound network connections → passes to `discord-exfil-detector` + `social-c2-detector`
- **Email Scanner**: extracts QR images from email/PDF → decodes → passes URL to `qr-detector`
- **Brand Monitor**: scheduled job (daily) → queries platform APIs → feeds `social-brand-monitor`
- **Existing ThreatFox pipeline**: `social-c2-detector` reuses the same fetch infrastructure as `ransomware-detector`

---

## 3. Detector Specifications

### 3.1 QR Detector (`qr-detector.ts`)

**Input:** Decoded URL from QR code (string)
**Output:** `QrThreatResult` with score 0–100

**Scoring logic:**
| Signal | Score |
|---|---|
| URL shortener (bit.ly, t.co, tinyurl, etc.) | +25 |
| Domain registered < 30 days | +30 |
| Suspicious TLD (.xyz, .top, .tk, .pw, .ru, .cn) | +20 |
| OAuth redirect abuse (`redirect_uri` to non-whitelisted domain) | +45 |
| Unicode homograph (e.g. `xn--` punycode) | +40 |
| Data URI (`data:text/html`) | +60 |
| Known malicious domain (ThreatFox) | +80 |
| IP address as host (not domain) | +30 |
| Very long URL (> 500 chars) | +15 |
| Double encoding (`%25`, `%2F`) | +20 |
| Mimics login page (`/signin`, `/login`, `/verify`) combined with suspicious domain | +25 |

**Cap:** 100

### 3.2 Discord Webhook Exfil Detector (`discord-exfil-detector.ts`)

**Input:** `{ domain: string, url?: string, processName: string, processPath?: string }`
**Output:** `ExfilResult` with score 0–100

**Logic:**

- `discord.com/api/webhooks/*` from non-browser process → score 95 (critical)
- `hooks.slack.com/*` from non-expected process → score 75
- `api.telegram.org/bot*` from non-Telegram process → score 85
- `discord.com/api/webhooks/*` from browser → score 5 (normal)
- Process name allowlist: `chrome`, `firefox`, `safari`, `msedge`, `electron`, `discord`, `slack`, `telegram`

**Key insight:** A legitimate app (Chrome, Discord client) making these calls is normal. Any other process — `svchost.exe`, `explorer.exe`, `python.exe`, `powershell.exe`, `cmd.exe`, random PE — is almost certainly malware.

### 3.3 Social C2 Detector (`social-c2-detector.ts`)

**Input:** Domain or IP being connected to
**Output:** `SocialC2Result` with score 0–100

**Checks:**

1. ThreatFox query with tags: `telegram-bot`, `discord-c2`, `telegram-c2`
2. Known Telegram Bot API patterns: `api.telegram.org` (legitimate) vs known malicious bot tokens in ThreatFox
3. Known Discord C2 server IDs from threat intelligence feeds
4. Abuse.ch any new C2 tags related to social platform abuse

**Differentiator from ransomware-detector:** Ransomware detector focuses on C2 for ransomware operators. Social C2 detector focuses on C2 using social platforms as the transport layer.

### 3.4 Social Brand Monitor (`social-brand-monitor.ts`)

**Input:** Brand terms array (e.g. `['ankr', 'ankrshield', 'xshield']`)
**Output:** `BrandMonitorResult[]` — list of impersonation findings

**Checks:**

- Telegram: search via MTProto or public search APIs for channels/groups matching brand terms
- Username typosquatting patterns: leetspeak, added chars, hyphenation
- Common impersonation patterns: `official_*`, `*_support`, `*_help`, `*_airdrop`
- Risk scoring per finding based on follower count, activity, and content

---

## 4. Risk Scoring Integration

New `RiskFactor` categories added to types:

- `qr_threat` — QR code URL threat
- `discord_exfil` — Discord/webhook data exfiltration
- `social_c2` — C2 over social messaging platforms
- `brand_impersonation` — fake account/channel impersonating brand

New sources:

- `threatfox_social` — ThreatFox social platform IOCs
- `qr_heuristic` — QR URL heuristic analysis

---

## 5. Commercial Positioning

| Feature                 | Competitors                               | xShield            |
| ----------------------- | ----------------------------------------- | ------------------ |
| QR threat scoring       | Enterprise email gateways only ($50k+/yr) | Included in base   |
| Discord exfil detection | CrowdStrike/SentinelOne EDR only          | Lightweight, open  |
| Telegram C2             | Threat intel platforms ($5k+/mo)          | Free via ThreatFox |
| Brand impersonation     | DRP vendors (ZeroFOX, $3k+/mo)            | Included           |

**Target customers who immediately benefit:**

- Crypto projects (high Telegram impersonation risk)
- Fintech startups (Slack/WhatsApp BEC risk)
- Remote-first companies (Discord-heavy teams, exfil risk)
- Any company that uses QR codes in marketing materials

---

## 6. Privacy Considerations

- QR detector: only the extracted URL is processed, never the image itself after decoding
- Brand monitor: only searches public channels/profiles, no private data accessed
- Discord exfil: only domain + process name observed, no payload inspection
- All lookups are point-in-time, no persistent tracking of users

---

## 7. References

- CISA Alert: QR Code Phishing (2024)
- ThreatFox Telegram C2 Tracker: `threatfox.abuse.ch`
- Recorded Future: Discord as Malware Infrastructure (2023)
- ENISA Threat Landscape: Social Engineering via Messaging Platforms (2025)
- Any.run: Discord webhook stealer analysis corpus

---

_Report generated by ANKR xShield team | Classification: Internal | Version 1.0_
