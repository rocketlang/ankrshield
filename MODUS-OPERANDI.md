# AnkrShield — Modus Operandi

**The product that protects you from surveillance cannot itself surveil you.**

---

## Core Principle

Every security app that "phones home" creates the same trust paradox it claims to solve.
Pegasus itself arrives disguised as a system update. Stalkerware disguises as a battery
optimiser. The attack vector is **unverifiable code or data from a remote server**.

AnkrShield resolves this architecturally, not with a privacy policy.

---

## The Two-Tier Model

### Free — Pure Discovery (zero network, zero trust required)

The free tier never makes a network connection. Ever.

```
Phone
  └─ VpnService (local loopback — DNS only)
       ├─ Intercepts all DNS queries via TUN interface
       ├─ Checks against tracker-db.sqlite (bundled in APK, ~2MB)
       ├─ NXDOMAIN for known trackers (blocked locally)
       └─ Forwards clean queries to upstream DoH

tracker-db.sqlite:
  - 100K+ tracker domains (advertising, analytics, fingerprinting, stalkerware C2)
  - Sourced from DisconnectMe, EasyPrivacy, OISD, AnkrShield IOC research
  - Columns: domain, category, vendor, risk_level, added_date
  - Compiled at build time, shipped inside the APK
  - No runtime downloads. No update calls. Static.
```

**What users see:**

- Real-time DNS interception counter ("4,832 trackers blocked today")
- Which apps generated the most tracking attempts
- Privacy score: 0–100 derived from tracker density
- Pegasus/APT indicator scan (fully on-device)

**What we see:** Nothing. We have no server-side visibility into free-tier users.

---

### Paid — Mitigations ($X/month)

The paid tier adds a server connection. The user consciously opts in knowing exactly
what is transmitted. Nothing is hidden.

#### What the app sends to xshieldai.com

| Data                    | Example                                                        | Purpose                                |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------- |
| Tracker domain names    | `pixel.facebook.com`                                           | Feed the threat intelligence engine    |
| Anonymised device hash  | `sha256(hardware_serial)`                                      | Rate limiting, dedup — non-reversible  |
| Scan result summary     | `{ clean: true }` or `{ family: "Pegasus", confidence: 0.87 }` | Community protection                   |
| App category (optional) | `"social_media"`                                               | Correlate tracker usage with app types |

**What we never send:**

- URLs, paths, query parameters
- Device identity (IMEI, phone number, email)
- Location
- Content of any network traffic
- Contacts, messages, media

#### What the server sends back (always signed)

Every response from `xshieldai.com` is signed with our Ed25519 private key.
The app's public key is **baked into the APK at compile time** — it cannot be
replaced by a server. If the signature is invalid, the response is **rejected and
the user is alerted**.

| Response type       | Format                                   | What it does                                           |
| ------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Tracker-db diff     | Signed JSON list of domains              | Added to local SQLite — **data only, never code**      |
| Mitigation playbook | Signed Markdown text                     | Rendered as human-readable steps — **never executed**  |
| IOC update          | Signed list of IPs, domains, cert hashes | Added to local block list                              |
| Disconnect guide    | Signed Markdown                          | Step-by-step instructions to remove a specific tracker |

**The server cannot push executable code.** The update format is data-only.
The app renders it; the app never eval()s it.

#### Transparent outbound log

Every byte the app sends to the server is logged in the **Network Activity** screen.
Users can see the exact JSON payloads, timestamps, and server responses.
Nothing is sent silently in the background.

---

## Trust Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AnkrShield APK                          │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │  Free layer          │  │  Paid layer               │    │
│  │  (zero network)      │  │  (verified channel)       │    │
│  │                      │  │                           │    │
│  │  tracker-db.sqlite   │  │  Ed25519 verifier         │    │
│  │  DnsVpnService       │  │  Signed bundle receiver   │    │
│  │  AndroidMonitor      │  │  Outbound activity log    │    │
│  │  SpywareDetector     │  │  User consent gates       │    │
│  └──────────────────────┘  └──────────┬──────────────┘    │
│                                        │                    │
│              ┌─────────────────────────┘                   │
│              │  Only with explicit user consent             │
│              │  Only signed responses accepted              │
│              │  Only data pushed, never code                │
└──────────────┼─────────────────────────────────────────────┘
               │
               ▼
        xshieldai.com API
        (enterprise intelligence layer)
```

### The Ed25519 verification flow

```
Server                          App
  │                              │
  │  SignedBundle {              │
  │    payload: { domains[] },   │
  │    sig: Ed25519(payload,     │
  │           PRIVATE_KEY)       │
  │  }                           │
  │ ───────────────────────────► │
  │                              │  Ed25519.verify(payload, sig, BAKED_IN_PUBLIC_KEY)
  │                              │  ✓ Valid → apply diff to SQLite
  │                              │  ✗ Invalid → reject + alert user
```

---

## Competitive Moat

|                         | AnkrShield Free | Competitors | AnkrShield Paid       |
| ----------------------- | --------------- | ----------- | --------------------- |
| Works offline           | ✓               | Sometimes   | ✓                     |
| Open-source core        | ✓ (planned)     | Rarely      | ✓                     |
| Shows what it sends     | N/A             | Never       | ✓                     |
| Signed updates only     | N/A             | Never       | ✓                     |
| Real Pegasus detection  | ✓               | No          | ✓ + community signals |
| Enterprise threat feed  | ✗               | No          | ✓                     |
| No tracking of trackers | ✓               | No          | Opt-in only           |

---

## Enterprise Value (B2B Layer)

The aggregate of anonymised tracker observations across consenting paid users
is a **unique threat intelligence signal** no other vendor has at this level of
device proximity.

```
Enterprise API (authenticated, paid tier):
  GET /api/threat-feed        — trending tracker domains (last 24h)
  GET /api/tracker-spike      — domains with unusual activity (>3σ from baseline)
  GET /api/new-trackers       — domains seen in the wild before any public list
  GET /api/industry-benchmark — "your domain vs industry average tracker count"
```

Revenue model:

- Consumer free → builds the sensor network
- Consumer paid ($4.99/mo) → direct revenue + feeds intelligence
- Enterprise API ($500–$5000/mo) → the real margin

---

## Sprint Roadmap

| Sprint | Deliverable                           | Status         |
| ------ | ------------------------------------- | -------------- |
| 1      | Conference demo web page (`/live`)    | ✅ Done        |
| 2      | Session/room system (API + mobile)    | ✅ Done        |
| 2.5    | Wire real API endpoints to mobile     | ✅ Done        |
| 3      | Android VpnService (DNS interception) | 🔨 In Progress |
| 3.1    | Bundle tracker-db as SQLite           | 🔨 In Progress |
| 3.2    | Signed update bundle verifier         | Next           |
| 3.3    | Transparent outbound log screen       | Next           |
| 4      | iOS NEDNSProxyProvider                | Q2 2026        |
| 5      | Enterprise intelligence API           | Q2 2026        |
| 6      | Open-source the free layer            | Q3 2026        |
