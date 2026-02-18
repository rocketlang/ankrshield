# xShield AI — Project Report

**Date**: 19 February 2026 | **Version**: 0.1.0-alpha | **Stage**: Pre-launch MVP

---

## 1. Executive Summary

xShield AI is an AI-native cybersecurity platform targeting individual defenders, journalists, activists, researchers, and SME teams who face sophisticated threats — nation-state spyware, Linux rootkits, APT intrusions, and zero-day exploits — that traditional antivirus cannot detect.

**Core positioning**: The open-source, self-hosted alternative to $50k/year enterprise EDR. Free tier for individuals, subscriptions for teams and enterprises.

**Live at**: [xshieldai.com](https://xshieldai.com) | Android APK downloadable | Linux server deployable today.

---

## 2. What Is Actually Built and Working

### 2.1 Detection Engine (`packages/spyware-detector`)

The most mature component. **8 parallel detectors**, all real:

| Detector             | What it does                                                                   | Status     |
| -------------------- | ------------------------------------------------------------------------------ | ---------- |
| NetworkIOCDetector   | Pegasus, Candiru, Predator, FinFisher, Hermit C2 domain/IP matching            | ✅ Working |
| AptC2Detector        | 7 APT groups — Lazarus, APT41, Sandworm, Turla, APT28, APT33, Kimsuky          | ✅ Working |
| ProcessDetector      | Spyware process name signatures + /proc enumeration                            | ✅ Working |
| FileArtifactDetector | Spyware + rootkit file path artifacts                                          | ✅ Working |
| LinuxRootkitDetector | LD_PRELOAD, /proc/modules, raw sockets, hidden processes                       | ✅ Working |
| CveDetector          | XZ Utils, DirtyPipe, PwnKit, DirtyCOW — real binary version checks             | ✅ Working |
| YaraDetector         | 11 YARA rules — BPFDoor, Symbiote, OrBit, XorDDoS, Reptile, XZ, Turla, Lazarus | ✅ Working |
| LiveIocDetector      | ThreatFox + Feodo Tracker + URLhaus + OTX — live APIs, 4h cache                | ✅ Working |

**IOC databases** sourced from real public advisories:

- 7 APT groups with domains + IP prefixes (CISA, DOJ, ESET, Mandiant, Microsoft DCU)
- 8 Linux rootkit families with file artifacts, library names, module names
- 1,900+ live botnet C2 IPs from Feodo Tracker (updated every 5 min)
- CISA KEV feed (~1,200 actively exploited CVEs)

### 2.2 AI Warrior Engine (`packages/ai-warrior`)

Claude Sonnet 4.6-powered threat analysis engine. Working features:

- Attack chain correlation (groups related events within a 5-minute window)
- LLM-generated threat narratives per incident
- Auto-policy generation from threat patterns
- Honeypot deployment (17 decoy paths: /.env, /wp-admin, /shell, /cgi-bin, etc.)
- AbuseIPDB auto-reporting of attacker IPs
- iptables auto-blocking on honeypot hit
- Legal evidence report generation (SHA-256 signed, CERT-In template)

### 2.3 API Server (`apps/api`)

Fastify + Mercurius GraphQL server. Working:

- JWT authentication (login, register, refresh)
- AbuseIPDB pre-identification middleware (blocks known bad IPs before they reach app logic)
- REST endpoints: `/warrior/threats/live`, `/warrior/spyware-scan`, `/warrior/android-check`, `/warrior/honeypot-hits`, `/warrior/evidence-report`, `/monitor/stats`
- GraphQL schema with 15+ query fields and 8 mutations
- Prisma ORM connected to PostgreSQL

### 2.4 Web App (`apps/web`)

Landing page live at xshieldai.com. Includes:

- Live threat score ticker (polling `/warrior/threats/live`)
- Linux threat database (16 malware families with CVEs and techniques)
- APT Groups section (9 nation-state actors with tools and targets)
- Platform threat coverage (Linux, Android, Windows, iOS with real stats)
- YARA boast badge
- Download section with QR code → Android APK
- Live threat dashboard link

Pages built: Landing, Dashboard, Devices, LiveThreats, EvidenceReport, Analytics, Policies, Settings, Login, Register.

### 2.5 Android App (`apps/mobile-ios`)

- APK built and downloadable from xshieldai.com/ankrshield.apk
- EAS Build production config complete
- Release signing configured
- Connects to self-hosted xShield server for live threat alerts

### 2.6 Infrastructure

- nginx serving xshieldai.com with Cloudflare SSL (Origin Certificate)
- PM2 managing server processes
- YARA 4.5.0 installed on server
- DNS: Cloudflare proxied (104.21.x.x / 172.67.x.x)
- Embedding providers: Jina (FREE, 1M/month, 88% MTEB) — replaced Voyage ($120/month)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       xshieldai.com                             │
│                    nginx + Cloudflare SSL                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌──────▼──────┐  ┌───▼────┐
    │  Web    │    │  API Server │  │  APK   │
    │  React  │    │  Fastify    │  │Android │
    │  :3000  │    │  :4250      │  │  App   │
    └─────────┘    └──────┬──────┘  └────────┘
                          │
          ┌───────────────┼───────────────────┐
          │               │                   │
   ┌──────▼──────┐ ┌──────▼──────┐  ┌────────▼───────┐
   │  AI Warrior  │ │  Spyware    │  │  PostgreSQL +  │
   │  (Claude)   │ │  Detector   │  │  Redis         │
   │  8 agents   │ │  8 detectors│  │                │
   └─────────────┘ └──────┬──────┘  └────────────────┘
                          │
            ┌─────────────┼──────────────┐
            │             │              │
       ┌────▼───┐  ┌──────▼────┐  ┌─────▼──────┐
       │ThreatFox│  │Feodo Track│  │ CISA KEV   │
       │URLhaus  │  │AbuseIPDB  │  │ AlienVault │
       │  (live) │  │ (report)  │  │ OTX        │
       └─────────┘  └───────────┘  └────────────┘
```

**Monorepo**: pnpm workspaces, 4 apps, 15 packages, TypeScript ESM throughout.

---

## 4. Package Status Matrix

| Package             | Description                | Build Status        | Integration Status |
| ------------------- | -------------------------- | ------------------- | ------------------ |
| `spyware-detector`  | Main detection engine      | ✅ Compiles clean   | ✅ Wired to API    |
| `ai-warrior`        | Claude-powered threat AI   | ✅ Compiles         | ✅ Wired to API    |
| `ai-governance`     | AI tool monitoring         | ✅ Structure exists | ⚠️ Not wired       |
| `dns-resolver`      | DNS-over-HTTPS + blocklist | ✅ Full deps        | ⚠️ Not deployed    |
| `network-monitor`   | Packet capture             | ✅ Structure        | ⚠️ Not deployed    |
| `privacy-engine`    | Tracker classification     | ✅ Structure        | ⚠️ Not wired       |
| `policy-engine`     | Policy evaluation          | ✅ Structure        | ⚠️ Partially wired |
| `tracker-db`        | Tracker database           | ✅ Structure        | ⚠️ Not populated   |
| `android-monitor`   | Android spyware scan       | ✅ Structure        | ⚠️ Partial         |
| `risk-intelligence` | Breach/IP/surface intel    | 🔧 In progress      | ❌ Not started     |
| `core`              | Shared utilities           | ✅ Working          | ✅ Used            |
| `ui`                | Shared React components    | ✅ Structure        | ⚠️ Partial         |
| `crypto`            | Crypto utils               | ✅ Structure        | ⚠️ Minimal use     |
| `config`            | Configuration              | ✅ Working          | ✅ Used            |
| `api-client`        | GraphQL client             | ✅ Structure        | ⚠️ Partial         |

---

## 5. Live Threat Feed Data Sources

| Source                   | Type                     | Auth         | Update Freq  | Integrated  |
| ------------------------ | ------------------------ | ------------ | ------------ | ----------- |
| ThreatFox (abuse.ch)     | APT IOCs (domains + IPs) | None (free)  | Continuous   | ✅          |
| Feodo Tracker (abuse.ch) | Botnet C2 IPs            | None (free)  | Every 5 min  | ✅          |
| URLhaus (abuse.ch)       | Malware URLs             | None (free)  | Continuous   | ✅          |
| CISA KEV                 | Exploited CVEs           | None (free)  | Per advisory | ✅          |
| AlienVault OTX           | Multi-type IOCs          | Free API key | Continuous   | ✅ (opt-in) |
| AbuseIPDB                | IP reputation            | Free API key | Real-time    | ✅          |
| YARA rules               | Binary patterns          | N/A (local)  | Static       | ✅          |

---

## 6. Static IOC Database

All sourced from named public documents:

| APT Group         | Source                          | Domains | IP Prefixes |
| ----------------- | ------------------------------- | ------- | ----------- |
| Lazarus (DPRK)    | CISA AA22-108A, AA21-048A       | 16      | 4           |
| APT41 (China)     | DOJ 2020 indictment US v. Zhang | 10      | 3           |
| Sandworm (Russia) | CISA AA22-110A                  | 4       | 6           |
| Turla (Russia)    | ESET Turla research             | 9       | 3           |
| APT28 (Russia)    | Microsoft DCU court filings     | 12      | 3           |
| APT33 (Iran)      | Mandiant APT33 report 2017      | 8       | 2           |
| Kimsuky (DPRK)    | US-CERT AA20-301A               | 10      | 2           |

---

## 7. Technology Stack

**Languages**: TypeScript (ESM throughout), SQL (PostgreSQL)
**Runtime**: Node.js 20+
**Web framework**: Fastify 4 + Mercurius (GraphQL)
**Database**: PostgreSQL 15 + TimescaleDB + pgvector, Redis
**ORM**: Prisma 5
**Frontend**: React 19, Vite, TailwindCSS, Recharts, Apollo Client
**Mobile**: React Native, Expo, EAS Build
**Desktop**: Electron + Vite
**AI**: Claude Sonnet 4.6 (Anthropic API)
**Security tools**: YARA 4.5.0, AbuseIPDB, iptables
**Infrastructure**: nginx, PM2, Cloudflare

---

## 8. Subscription Model (Designed)

| Tier       | Price       | Key Feature                           |
| ---------- | ----------- | ------------------------------------- |
| FREE       | $0          | Basic spyware scan, 5 honeypots       |
| FREEMIUM   | $4.99/mo    | + AI Warrior, live feeds              |
| PREMIUM    | $9.99/mo    | + YARA, CVE scanner, reports          |
| PRO        | $19.99/mo   | + Risk intelligence, brand protection |
| FAMILY     | $29.99/mo   | Up to 5 devices                       |
| ENTERPRISE | $49/user/mo | + Custom policies, SIEM integration   |
| SUPER      | $99.99/mo   | Full stack, white-label               |

---

## 9. Key Strengths

1. **Real detection, not theatre** — All IOC sources cited to specific government advisories, court documents, or named research papers. YARA rules sourced from published malware analyses.
2. **Free live data** — Core threat feeds (ThreatFox, Feodo, URLhaus, CISA KEV) require zero budget.
3. **Self-hosted** — No telemetry, no cloud dependency. Runs on any Linux VPS.
4. **AI Warrior** — Claude integration gives natural-language threat narration that most EDR tools lack.
5. **Fast iteration** — 17 commits in ~2 weeks, from skeleton to working detection engine.
6. **Open stack** — Everything is TypeScript ESM, well-structured, easy to extend.

---

## 10. Key Gaps (Honest Assessment)

1. **Risk Intelligence package** — Only package.json exists. GreyNoise, Shodan, HIBP, brand protection not built yet.
2. **Dashboard UI** — Pages exist but most are empty shells beyond the landing page.
3. **DNS resolver not deployed** — Package is sophisticated but not serving traffic.
4. **Network monitor not active** — Packet capture not integrated into running server.
5. **AI Governance** — Structure only; no actual ChatGPT/Copilot monitoring working.
6. **No automated tests** — Zero test coverage despite vitest in devDeps.
7. **Payment not wired** — Stripe keys in env but no subscription flow.
8. **Windows/macOS detection** — Everything is Linux-first; no Windows EDR.
9. **Database not seeded** — Tracker DB, blocklist, policies not populated.
10. **No auth flow in prod** — Login/register UI exists but no real user accounts in production yet.

---

## 11. Financials (Target)

- **Seed round**: $3M (seeking)
- **Target ARR by 2028**: $10M+ (100K paid users)
- **Target ARR by 2031**: $500M+ (100M protected devices)
- **Largest cost elimination to date**: Jina embedding replacing Voyage → **$1,440/year saved**

---

_Generated 19 February 2026 | xShield AI / ANKR Labs_
