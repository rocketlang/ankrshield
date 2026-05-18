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

## OSS scope (updated 2026-05-18)

Per the strategic pivot of 2026-05-16, ANKR has moved to an aggressive-OSS
posture: the narrow Enterprise Edition keeps only a small set of items where
operational leverage justifies private licensing. Most of the previously
EE-only capabilities — including the desktop app, the mobile clients, the AI
warrior, the spyware detector, the MDM bridge, the active-defense API, and
the AI governance package — are now part of this open-source repo under
**AGPL-3.0-only**.

The April 2026 OSS-vs-EE capability table is superseded by the current
boundary defined in `STRATEGY.md` + `EXTRACTION-QUEUE.md`. See those docs
for the canonical, current OSS/EE split.

Enterprise Edition contact (for commercial dual-license + SaaS deployment
exceptions): captain@ankr.in

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
