# AnkrShield — Gaps & Enhancements TODO

**Created:** 2026-03-03
**Based on:** Bird's eye gap analysis vs Bitdefender / Lookout / Norton / Avast
**Overall score:** 8/10 — Strong 1.0 candidate, fix P0s first

---

## P0 — Blocking (fix before wide release)

### P0-1: WhatsApp file verdict engine (stub → real)

**Problem:** WhatsApp file scanning returns fake verdicts — misleads users
**Fix:** Wire to VirusTotal API or build local hash database

- [ ] Create `/root/ankrshield/apps/mobile-ios/android/.../WhatsAppVerdictEngine.java`
  - Hash incoming file (SHA-256)
  - Check against local bundled hash DB (known malware hashes)
  - If not in local DB → POST to `/security/file-scan` on xShield backend
  - Backend proxies to VirusTotal (keeps API key server-side)
  - Cache verdict in MdmStorage (`@ankrshield/file-verdicts`) — 24h TTL
- [ ] Add `/security/file-scan` endpoint to xShield API backend
  - POST `{ sha256: string, filename: string, mimeType: string }`
  - Returns `{ verdict: 'clean'|'suspicious'|'dangerous', engine: string, detectionName?: string }`
- [ ] Update WhatsAppGuardScreen to show real verdict source ("Scanned by VirusTotal")
- [ ] Add progress indicator (scanning... → result) instead of instant mock

### P0-2: NetworkBehaviorScreen — replace mocks with real data

**Problem:** Shows 8 hardcoded fake apps with fake connections
**Fix:** Wire to `network-monitor` package + AppScannerModule

- [ ] `NetworkService.ts` — add `getAppNetworkBehavior(packageName)` method
  - Reads from VPN event ring buffer (vpnService.\_eventHistory)
  - Groups events by app (requires per-app VPN tagging — see P0-2b)
  - Computes: suspiciousDnsCount, doHAvoidance flag, topDomains[]
- [ ] P0-2b: Tag VPN DNS events with source app (requires Android API 26+)
  - `DnsVpnService.java` → use `ConnectivityManager.getConnectionOwnerUid()` → `PackageManager.getPackagesForUid()`
  - Emit events with `packageName` field
  - VpnService.ts → extend `FeedEvent` with optional `packageName?: string`
- [ ] Replace `MOCK_APP_CONNECTIONS` in `NetworkBehaviorScreen.tsx` with real data
- [ ] Keep mock as fallback when API unavailable (clearly labeled "Demo data")

### P0-3: StalkerwareScreen — real detection, not mock apps ✅ DONE 2026-03-03

**Problem:** `MOCK_APPS` list shown — real detection logic in spyware-detector package exists but not wired

- [x] Removed MOCK_APPS entirely
- [x] Calls `AppScanner.getInstalledApps()` native module (Android), runs `detectApp()` on each
- [x] Shows only flagged apps (status !== 'clean')
- [x] "All clear — N apps scanned" when empty
- [x] Progress indicator while scanning
- [x] Auto-scan on mount + Scan again button

### P0-4: DNS VPN — upgrade to DNS-over-HTTPS (DoH)

**Problem:** DNS queries forwarded to Cloudflare over plain UDP — visible to ISPs, snoopable
**Fix:** Use `@ankrshield/dns-resolver` package (already implements DoH) in DnsVpnService

- [ ] `DnsVpnService.java` → replace plain UDP forwarding with HTTPS call to Cloudflare DoH
  - `https://1.1.1.1/dns-query` (RFC 8484 wire format)
  - OR use `https://cloudflare-dns.com/dns-query?name=X&type=A` (JSON format — simpler in Java)
  - Timeout: 5s (same as current)
  - Fallback: Google DoH `https://dns.google/dns-query`
- [ ] Cache DoH responses with TTL from DNS record
- [ ] Show "DNS over HTTPS" badge in Settings when enabled
- [ ] Show "Standard DNS" badge + upgrade prompt when not enabled

---

## P1 — High Impact UX (high value, medium effort)

### P1-1: AppTrustScreen — wire real installed apps ✅ DONE 2026-03-03

- [x] Calls `AppScanner.getInstalledApps()` on Android, filters `isSystemApp=false`
- [x] Falls back to FALLBACK_PACKAGES (10 common apps) when AppScanner unavailable
- [x] Merges real installed + behaviorTracker.getTrackedPackages()
- [x] Screen header: "App Trust" + "{N} apps on your device"
- [x] Sorted by safe zone score (most concerning first)

### P1-2: SettingsScreen — wire Protection Mode toggle ✅ DONE 2026-03-03

- [x] 3-button selector: Smart 🧠 | Strict 🛡 | Monitor 👁
- [x] Persists to MdmStorage `@ankrshield/protection-mode`
- [x] Loads saved mode on screen mount
- [x] Explanatory text per mode + "Recommended" badge on Smart

### P1-3: Error Boundaries — prevent white screen crashes ✅ DONE 2026-03-03

- [x] Created `src/components/ErrorBoundary.tsx` (React class, getDerivedStateFromError + componentDidCatch)
- [x] Shows "Something went wrong — tap to retry" with screen name
- [x] `eb()` HOC in App.tsx wraps all 19 Stack.Screen routes
- [x] Added 5 new routes: AppTrust, Stalkerware, SmsShield, DpdpScan, NetworkBehavior

### P1-4: Spyware scan — honest "unavailable" state ✅ DONE 2026-03-03

- [x] Removed mock fallback from catch block
- [x] `offline` state: shows 🔌 "Scan Unavailable" card with retry button
- [x] Three distinct states: scanning spinner | result (clean or indicators) | offline unavailable
- [x] Hero icon changes: 🔬 idle → ⚠️ threats found → 🔌 offline

### P1-5: AppConsentScreen — deprecate or connect to AppTrustScreen

**Problem:** AppConsentScreen shows mock data — AppTrustScreen already replaces it properly

- [ ] Option A: Remove AppConsentScreen from navigation (simplify)
- [ ] Option B: Redirect AppConsentScreen → AppTrustScreen (backward compat for any deeplinks)
- [ ] Remove from bottom tab / main navigation

---

## P2 — Competitive Gaps (medium effort, high differentiation value)

### P2-1: Ransomware detector (file system monitor)

**What:** Watch Downloads/WhatsApp/DCIM for mass file extension changes (signs of ransomware)

- [ ] `RansomwareWatcherService.java` — FileObserver on key directories
  - Trigger if >10 files renamed/modified with new extension in <30s
  - Known ransomware extensions: `.locked`, `.encrypted`, `.WNCRY`, `.zepto`, `.cerber`
- [ ] On trigger → CRITICAL alert → pause DNS VPN + alert user
- [ ] `RansomwareScreen.tsx` — status + history of flagged events
- [ ] Add to HomeScreen quick actions

### P2-2: Call protection — spam/fraud caller ID (India)

**What:** Warn user when incoming call matches known fraud numbers / patterns

- [ ] `CallMonitorService.java` — `PhoneStateListener` + `TelecomManager`
  - On CALL_STATE_RINGING → extract number → check:
    1. Local blocklist (bundled CSV of known fraud numbers — TRAI database)
    2. Prefix check (known IVR fraud prefixes: +91-141, +91-160 etc.)
    3. International call pretending to be local (country code mismatch)
  - Overlay warning if match: "⚠️ Possible fraud call — TRAI-flagged number"
- [ ] Permission needed: `READ_PHONE_STATE` + `SYSTEM_ALERT_WINDOW` (overlay)
- [ ] `CallProtectionScreen.tsx` — toggle + recent blocked calls log
- [ ] Update blocker list: weekly sync from `/security/fraud-numbers` API

### P2-3: Safe browsing overlay (in-browser phishing detection)

**What:** When user visits a phishing URL in any browser, show warning overlay
**Note:** DNS layer already blocks known phishing domains — this adds a UI layer for near-misses

- [ ] `AnkrShieldAccessibilityService.java` — already exists, extend it:
  - Watch `TYPE_WINDOW_STATE_CHANGED` events for browser package names
  - Extract URL from Chrome/Firefox address bar via accessibility tree
  - Check URL against IOC blocklist (already synced locally)
  - If match → show overlay warning (SYSTEM_ALERT_WINDOW)
- [ ] Overlay: red banner "⚠️ AnkrShield blocked this site — known phishing"
  - "Go back" (primary) + "I understand the risk" (secondary)
- [ ] Supported browsers: Chrome, Firefox, Samsung Internet, DuckDuckGo, Brave

### P2-4: Dark + Light theme toggle

- [ ] `useThemeStore.ts` — same pattern as XLearnAI
  - Themes: `dark` (current) | `light` | `auto` (system)
- [ ] Update all StyleSheet colors to use theme tokens
- [ ] Persist in MdmStorage `@ankrshield/theme`
- [ ] Add to SettingsScreen

### P2-5: Offline mode — cached scores

**What:** App works without internet — shows last-known score with staleness indicator

- [ ] `PrivacyService.ts` → cache last successful response in MdmStorage `@ankrshield/last-score`
- [ ] On fetch failure, return cached data + set `isStale: true`
- [ ] UI: show "Last updated 3h ago" when stale — not an error
- [ ] All screens: fallback to cached data, never blank

---

## P3 — Enhancements (nice to have, future roadmap)

### P3-1: Network map visualization

- [ ] World map showing tracker domains by country
- [ ] Dot markers sized by request count
- [ ] India-focused: highlight India-owned vs foreign trackers
- [ ] Tap marker → show which apps are sending data there
- [ ] Libraries: `react-native-maps` or SVG-based world map

### P3-2: Weekly digest notification

- [ ] Every Sunday 10:00 IST → push notification
  - "Your privacy score this week: 87 (+3 from last week)"
  - "Top tracker blocked: doubleclick.net (142 attempts)"
  - "Clean streak: 7 days 🎉"
- [ ] `WeeklyDigestService.ts` — reads VPN ring buffer, computes week summary
- [ ] Schedule via WorkManager (Android) or BGAppRefreshTask (iOS)

### P3-3: UPI fraud call detection (India-specific)

- [ ] Extend CallMonitorService with IVR pattern detection
  - "Press 1 to unblock your bank account" → fraud
  - "Your KYC is pending" → fraud
  - Audio analysis via `SpeechRecognizer` API (on-device)
- [ ] Real-time transcription → SMS Shield analyzer → ALERT

### P3-4: Trusted Wi-Fi zones

- [ ] User can mark current network as "trusted home network"
  - Trusted: relax DNS rules (STANDARD behaviour for all apps)
  - Untrusted/public: strict rules (WATCHLIST behaviour for all apps)
- [ ] `WifiMonitorService.java` — `ConnectivityManager.NetworkCallback`
- [ ] Toggle in SettingsScreen

### P3-5: App behaviour comparison

- [ ] "Instagram uses 3× more trackers than Snapchat"
- [ ] Category benchmarks: "Social Media apps average 14 trackers/day — Instagram has 31"
- [ ] On `AppDetailSheet.tsx` — "vs category average" indicator on SafeZoneMeter

### P3-6: DPDP compliance report PDF export

- [ ] Scan result → generate PDF report
- [ ] Format: App name, scanned date, violations list, DPDP sections violated, recommendations
- [ ] Use existing `@ankr/test-reporter` `htmlToPdf()` function (already built)
- [ ] Share via Android Share Intent

### P3-7: Family protection (multi-device)

- [ ] Parent dashboard: monitor child's phone remotely
- [ ] Child mode: restrict to TRUSTED tier only, all STANDARD → WATCHLIST
- [ ] Uses xShield API — family plan (linked API keys)

### P3-8: Impersonation detection — ML similarity

- [ ] Replace basic string matching with proper string distance (Levenshtein + phonetic)
  - "Rahull Sharma" vs "Rahul Sharma" → 95% similar → flag
  - "Mummy" vs "Mum_my" → flag
- [ ] Integrate with contacts database (already have `READ_CONTACTS` permission)

### P3-9: VirusTotal hash DB bundled in APK

- [ ] Bundle top-10K known malware hashes in APK (compressed, ~500KB)
- [ ] Check file hash locally before hitting backend
- [ ] Reduces latency from ~1s → ~10ms for common malware
- [ ] Update hash DB via IOC sync (already running every 6h)

---

## Done (from Smart Trust sprint 2026-03-03)

- [x] AppTrustEngine — 5 tiers, known app map (50+ apps), user overrides
- [x] AppBehaviorTracker — per-app ring buffer, safe zone score 0–100
- [x] SmartRules — tier-aware VPN policy generation (SYSTEM/TRUSTED/STANDARD/WATCHLIST/BLOCKED)
- [x] SafeZoneMeter component — compact + full variants
- [x] AppTrustScreen — app list ranked by concern score (real installed apps via AppScanner)
- [x] AppDetailSheet — bottom sheet with stats + tier override
- [x] HomeScreen — Smart Trust card replacing fear-based banner
- [x] Alert classifier — tier-aware downgrade/upgrade + contextual copy

## Done (P1 sprint 2026-03-03)

- [x] P0-3: StalkerwareScreen — wired to real AppScanner.getInstalledApps()
- [x] P1-1: AppTrustScreen — real installed apps, no hardcoded seed list
- [x] P1-2: SettingsScreen — Protection Mode toggle (Smart/Strict/Monitor) with MdmStorage
- [x] P1-3: ErrorBoundary component + all 19 screens wrapped in App.tsx + 5 new routes registered
- [x] P1-4: SpywareScanScreen — honest offline state (no silent mock clean result)

---

## Key Metrics to Track Post-Launch

| Metric                             | Target        | Notes                            |
| ---------------------------------- | ------------- | -------------------------------- |
| Crash rate                         | < 0.1%        | Need error boundaries (P1-3)     |
| Backend unavailability UX          | 100% graceful | Need offline mode (P2-5)         |
| Mock screens visible to users      | 0             | P0-2, P0-3 remaining             |
| DNS filtering real threats blocked | Measure       | DoH upgrade changes numbers      |
| User tier overrides per session    | Track         | Indicates app trust system usage |
