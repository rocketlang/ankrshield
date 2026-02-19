# AnkrShield — Mobile & Conference Demo Todo

**Date:** 19 February 2026
**North Star:** Consumer app = sensor network → aggregate data = enterprise intelligence
**Flywheel:** Conference demo → installs → real tracker data → enterprise product

---

## The Problem in One Line

Everything in the mobile app is mocked (`// TODO: Implement actual API call`).
The `/live` page shows AI warrior data — not tracker data.
The conference demo was designed Jan 22 (`DEMO-MODE-DESIGN.md`) but never built.

---

## Sprint 1 — Conference Demo Web `[BUILDING NOW]`

_Goal: Something to put on a screen at a conference TODAY. No mobile changes needed._

### 1.1 Rebuild `/live` as Tracker Visualization

- [x] Replace current warrior-data `/live` page with conference demo
- [x] **Demo Mode** (client-side simulated data — works with zero API changes):
  - Device grid: 8 devices (iPhone, MacBook, Samsung TV, Xbox, Alexa, Apple Watch, Ring, Robot Vacuum)
  - Animated tracker count badges — pulse red on new event
  - Live activity feed: rolling last-30 events (device → tracker → category → blocked/allowed)
  - Stats bar: Devices · Tracker Attempts · % Blocked · Data Transmitted · Companies · "$X your data"
  - Before/After toggle: without AnkrShield vs with (89% blocked)
  - Scenario selector: Living Room / Gaming Session / Smart Home / Home Office / Hotel Room
  - Playback controls: pause / 1× 2× 5× speed
- [x] **Live Mode toggle** (real API data eventually — shows aggregate stats for now)
- [x] QR code strip at bottom: "Scan to protect your phone"

### 1.2 API: Demo Aggregate Endpoint

- [ ] `GET /demo/stats` — returns real aggregate numbers (devices protected, total tracker blocks) seeded from warrior data until real mobile data flows in

### 1.3 Landing Page Update

- [ ] Add "See it live →" hero CTA linking to `/live`
- [ ] Add conference QR code section to landing page

---

## Sprint 2 — Mobile: Replace All Mocks `[NEXT]`

_Goal: Mobile app reports real numbers. Device appears on the live dashboard when app is installed._

### 2.1 Device Registration & Session System (API)

- [ ] `POST /session/create` — organizer creates a room, returns 6-char code + QR URL
- [ ] `POST /session/:code/join` — device joins room, returns `deviceId` + `sessionId`
- [ ] `GET  /session/:code/stream` — SSE stream of tracker events in this room
- [ ] `POST /session/:code/event` — device reports a tracker event to the room
- [ ] `GET  /session/:code/stats` — aggregate stats for this room (devices, total events, top trackers)
- [ ] In-memory store (Map) for sessions — no DB needed for MVP

### 2.2 Mobile App: PrivacyService → Real API

- [ ] Replace mock `getPrivacyScore()` → `GET /session/me/score`
- [ ] Replace mock `getStats()` → `GET /session/me/stats`
- [ ] Add `registerDevice(sessionCode?)` → `POST /session/:code/join` or `POST /devices/register`
- [ ] Add `reportTrackerEvent(event)` → `POST /session/:code/event`

### 2.3 Mobile App: NetworkService → Real DNS Logs

**MVP approach** (no VPN required): Use AnkrShield as the device's DNS-over-HTTPS server.
When user sets DoH in phone settings → every DNS query hits our server → we log it → match against tracker-db.

- [ ] Add `GET /dns/stats?deviceId=X` endpoint to API — returns recent DNS queries + which were trackers
- [ ] Mobile `NetworkService.getRecentEvents()` → polls `/dns/stats` every 30s
- [ ] Show real DNS-resolved tracker hits in app activity feed

### 2.4 Mobile App: Conference Join Screen

- [ ] New screen `ConferenceScreen.tsx` — QR scanner + manual 6-char code entry
- [ ] On join: device registers → sends simulated tracker events every 5s → appears on `/live` screen
- [ ] Privacy notice: "Your device appears as Device-XXXX. No personal data is shared."
- [ ] Add "Join Conference" button to HomeScreen

### 2.5 `/live` Real Data Mode

- [ ] When session code in URL (`/live?room=CONF24`), switch to real SSE stream
- [ ] Device tiles appear in grid as phones join
- [ ] Aggregate stats update in real time
- [ ] Devices show as anonymized (Device-A4B2, etc.)

---

## Sprint 3 — Real DNS Interception on Android `[MEDIUM TERM]`

_Goal: App actually intercepts DNS queries on device without root. This is the real sensor._

### 3.1 Android VpnService Implementation

The only way to intercept all DNS on Android without root is `VpnService` (local loopback VPN).
React Native requires a native module for this.

- [ ] Create `android/app/src/main/java/com/ankrshield/DnsVpnService.java`
  - Extends `VpnService`
  - Creates local TUN interface
  - Intercepts all UDP port 53 traffic
  - Resolves via DoH (https://dns.xshieldai.com/dns-query)
  - Logs each query: domain, resolved IP, timestamp
  - Matches against tracker-db (bundled as SQLite)
- [ ] Create `android/app/src/main/java/com/ankrshield/DnsVpnModule.java` — React Native bridge
- [ ] Register in `AndroidManifest.xml`:
  ```xml
  <service android:name=".DnsVpnService" android:permission="android.permission.BIND_VPN_SERVICE">
    <intent-filter><action android:name="android.net.VpnService"/></intent-filter>
  </service>
  ```
- [ ] React Native module: `NativeModules.DnsVpn.start()` / `.stop()` / `.getStats()`

### 3.2 Tracker Database on Device

- [ ] Bundle compressed tracker-db (SQLite, ~2MB) in app assets
  - Top 100K trackers from `packages/tracker-db`
  - Include category (advertising, analytics, social, fingerprinting, etc.)
  - Include risk level (low/medium/high/critical)
- [ ] On DNS intercept: SQLite lookup (< 1ms) → mark as tracker or clean
- [ ] Report tracker hits to API every 30s (batch)

### 3.3 App Permission Flow

- [ ] Request VPN permission on first launch (Android system dialog)
- [ ] Explain why: "AnkrShield uses a local VPN to see which apps are tracking you. No data leaves your device without your permission."
- [ ] Show estimated battery impact (< 1% — local only, no data routing)

---

## Sprint 4 — iOS Support `[LATER]`

- [ ] iOS: Use `NEDNSProxyProvider` (Network Extension) instead of VpnService
- [ ] Requires Apple Developer account + Network Extension entitlement
- [ ] Same React Native bridge pattern as Android

---

## Sprint 5 — Enterprise Intelligence Layer `[Q2 2026]`

_This is what monetizes. Once you have real aggregate data from thousands of users._

### 5.1 Aggregate Threat Intelligence API

- [ ] `GET /api/threat-feed` — trending tracker domains in last 24h (authenticated, paid tier)
- [ ] `GET /api/tracker-spike` — domains with unusual activity spike (> 3σ from baseline)
- [ ] `GET /api/industry-benchmark` — "your domain vs industry average tracker count"
- [ ] `GET /api/new-trackers` — newly observed tracker domains (not in public lists yet)

### 5.2 Dashboard for Enterprise Customers

- [ ] Aggregate view: tracker trends over time
- [ ] Top offending apps (across all AnkrShield users — anonymized)
- [ ] New tracker alerts ("Facebook just started using a new fingerprinting domain")
- [ ] Exportable threat reports (PDF, JSON)

### 5.3 Threat Feed Webhook

- [ ] `POST /integrations/threat-feed/webhook` — push new threats to customer SIEM
- [ ] Formats: STIX 2.1, OpenIOC, plain JSON

---

## Mobile App: Screen Inventory & Status

| Screen              | File                       | Status        | What it needs    |
| ------------------- | -------------------------- | ------------- | ---------------- |
| Home                | `HomeScreen.tsx`           | Mock data     | Wire to real API |
| Dashboard           | `DashboardScreen.tsx`      | Unknown       | Audit            |
| Activity            | `ActivityScreen.tsx`       | Mock data     | Real DNS events  |
| Settings            | `SettingsScreen.tsx`       | Unknown       | VPN toggle       |
| Live Threats        | `LiveThreatsScreen.tsx`    | Unknown       | Session join     |
| AI Warrior          | `WarriorScreen.tsx`        | Unknown       | Wire to API      |
| Android Monitor     | `AndroidMonitorScreen.tsx` | Unknown       | Wire to API      |
| Spyware Scan        | `SpywareScanScreen.tsx`    | Unknown       | Wire to API      |
| Threat Alerts       | `ThreatAlertsScreen.tsx`   | Unknown       | Wire to API      |
| Agent Manager       | `AgentManagerScreen.tsx`   | Unknown       | Wire to API      |
| **Conference Join** | `ConferenceScreen.tsx`     | **NOT BUILT** | **BUILD THIS**   |

---

## API Endpoints Needed (New)

```
# Session / Room System
POST   /session/create              → { code, qrUrl, expiresAt }
POST   /session/:code/join          → { deviceId, sessionId }
POST   /session/:code/event         → report a tracker event
GET    /session/:code/stream        → SSE: real-time events
GET    /session/:code/stats         → aggregate stats

# DNS Stats (for mobile polling)
GET    /dns/stats?deviceId=X        → recent DNS queries + tracker hits

# Demo (simulated, for conference screen without real devices)
GET    /demo/stats                  → seeded aggregate numbers

# Threat Feed (enterprise, authenticated)
GET    /api/threat-feed             → trending trackers
GET    /api/tracker-spike           → anomaly detection
```

---

## Key Packages: Already Built, Not Wired

| Package                     | Purpose                          | Used by                 |
| --------------------------- | -------------------------------- | ----------------------- |
| `packages/tracker-db`       | 1M+ tracker domains              | DNS server — NOT mobile |
| `packages/dns-resolver`     | DoH resolver + tracker matching  | API only — NOT mobile   |
| `packages/android-monitor`  | Stalkerware/permission detection | NOT wired to API        |
| `packages/privacy-engine`   | Privacy score 0-100              | NOT wired to mobile     |
| `packages/network-monitor`  | Traffic analysis                 | NOT wired to mobile     |
| `packages/spyware-detector` | Pegasus/APT detection            | NOT wired to API        |

---

## The Conference Demo Script (Target UX)

```
Organizer opens /live on big screen
  → Selects "Conference Mode" → creates room CONF24
  → QR code appears on screen

Attendee scans QR
  → App installs (or opens if already installed)
  → Prompt: "Join room CONF24?"
  → One tap → device appears on big screen as "Device-A4B2"
  → App starts reporting tracker events

Big screen shows:
  → 47 phones connected
  → 89,000 tracking attempts in last 5 minutes
  → Top tracker: google-analytics.com (12,400 hits)
  → 78% blocked by AnkrShield
  → Live feed scrolling with events from real phones in the room

Audience reaction: 😱
```

---

## Build Order (Immediate)

1. **[NOW]** Rebuild `/live` as conference demo with demo mode (Sprint 1.1)
2. **[TODAY]** API: session create/join/stream endpoints (Sprint 2.1)
3. **[TODAY]** Mobile: ConferenceScreen.tsx + device registration (Sprint 2.4)
4. **[THIS WEEK]** Mobile: Replace mocks with real API calls (Sprint 2.2)
5. **[NEXT WEEK]** Android VpnService native module (Sprint 3.1)
6. **[NEXT WEEK]** Bundle tracker-db as SQLite on device (Sprint 3.2)
7. **[LATER]** Enterprise intelligence layer (Sprint 5)
