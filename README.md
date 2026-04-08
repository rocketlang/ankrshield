# xShieldAI

**Open-source domain threat intelligence & breach monitoring**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-green.svg)]()

Passive scan engine for domain impersonation detection, email authentication gaps, and open threat intelligence enrichment. Built for security teams that need to act on findings, not just collect them.

---

## What it does

- Detects lookalike / typosquat domains registered against your brand
- Checks email authentication posture (SPF, DMARC) across all domains
- Enriches impostor domains against OTX AlienVault, Shodan, and certificate transparency logs
- Identifies when lookalike domains resolve to known malware C2 infrastructure
- Outputs STIX 2.1 bundles with MITRE ATT&CK mappings — ingestible by any SIEM

```bash
# Scan a domain
npx ankrshield-cli scan --domain yourdomain.com

# Full brand scan (SPF + DMARC + typosquats + OTX enrichment)
npx ankrshield-cli scan --domain yourdomain.com --full --stix
```

---

## OSS vs Enterprise Edition

This repo contains the **open-source core**. The Enterprise Edition (`ankrshield-ee`, private) contains the AI and active response layer.

| Capability                                        | OSS (this repo) | Enterprise Edition |
| ------------------------------------------------- | --------------- | ------------------ |
| Domain scan engine                                | ✅              | ✅                 |
| SPF / DMARC audit                                 | ✅              | ✅                 |
| Typosquat detection                               | ✅              | ✅                 |
| OTX AlienVault enrichment                         | ✅              | ✅                 |
| Shodan host intelligence                          | ✅              | ✅                 |
| STIX 2.1 export                                   | ✅              | ✅                 |
| CLI (`ankrshield-cli`)                            | ✅              | ✅                 |
| DPDP Act 2023 compliance mapping                  | ✅              | ✅                 |
| AI threat narration & attack correlation          | ❌              | ✅                 |
| Automated DMCA / abuse reporting                  | ❌              | ✅                 |
| SIEM push (Splunk, Sentinel, Chronicle)           | ❌              | ✅                 |
| Executive notification workflows                  | ❌              | ✅                 |
| MDM integration (Intune, Workspace ONE)           | ❌              | ✅                 |
| Nation-state spyware detection (Pegasus, Candiru) | ❌              | ✅                 |
| Multi-tenant SaaS dashboard                       | ❌              | ✅                 |

Enterprise Edition: captain@ankr.in

---

## Packages (OSS)

| Package                      | Description                                                           |
| ---------------------------- | --------------------------------------------------------------------- |
| `packages/risk-intelligence` | Core scan engine — breach monitoring, IP reputation, brand protection |
| `packages/dns-resolver`      | DNS-over-HTTPS resolver with blocklist support                        |
| `packages/ankrshield-cli`    | CLI — scan domains, audit email auth, export STIX                     |
| `packages/core`              | Shared types and utilities                                            |
| `packages/policy-engine`     | Policy evaluation and enforcement                                     |
| `packages/tracker-db`        | Tracker classification database                                       |
| `apps/xshield-api`           | REST + GraphQL API                                                    |
| `apps/web`                   | Web dashboard (self-hostable)                                         |

---

## Self-hosting

```bash
git clone https://github.com/rocketlang/ankrshield
cd ankrshield
cp .env.example .env   # add your OTX + Shodan API keys
pnpm install
pnpm dev
```

API keys required (all have free tiers):

- OTX AlienVault: otx.alienvault.com
- Shodan: shodan.io
- HIBP: haveibeenpwned.com/API/Key

---

## Built by

ANKR Labs — Port VTS, ship management OS, eBL infrastructure, freight exchanges, trade compliance, agentic AI.
captain@ankr.in · ankr.in · xshieldai.com

Apache 2.0
