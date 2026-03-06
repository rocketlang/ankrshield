# AnkrShield — Smart Trust System

**Created:** 2026-03-03
**Goal:** Replace binary block/allow with a contextual discretion model — allow with discretion, block only over-discretion

---

## Philosophy

> Google sending analytics = normal. Random flashlight app sending contacts to China = blocked.
> Browser loading ad trackers = show it quietly. Shady VPN exfilling DNS = CRITICAL.
> User should never have to turn off protection just to browse.

**Safe Zone Model:**

```
[●●●●●●░░░░] SAFE   [●●●░] WATCH   [🚫] BLOCKED
  browser/Google      Instagram      stalkerware
  (show, don't alarm) (amber flag)   (hard block + alert)
```

---

## Phase A — AppTrustEngine (Foundation) ✅ DONE 2026-03-03

- [x] `packages/privacy-engine/src/app-trust-engine.ts`
  - AppTrustTier: SYSTEM | TRUSTED | STANDARD | WATCHLIST | BLOCKED
  - Known app map: Google/Meta/browsers/system → auto-tier
  - `classifyApp(packageName)` → auto-tier heuristic
  - `getUserTier(packageName)` / `setUserTier(packageName, tier)` — user override
  - `getEffectiveTier(packageName)` → user override ?? auto-tier
  - Persist overrides in MdmStorage (`@ankrshield/app-trust-tiers`)

- [x] `packages/privacy-engine/src/app-behavior-tracker.ts`
  - Per-app event ring buffer (7 days, max 500 events/app)
  - `recordEvent(packageName, domain, blocked, category)`
  - `getSafeZoneScore(packageName)` → 0–100 (higher = more concerning)
  - `isFirstParty(domain, packageName)` — google.com for Google apps = first party
  - `getAppStats(packageName)` → { trackersToday, bytesToday, topDomains[], score }
  - Persist to MdmStorage (`@ankrshield/app-behavior`)

- [x] Export both from `packages/privacy-engine/src/index.ts`

---

## Phase B — Smart VPN Rules ✅ DONE 2026-03-03

- [x] `packages/privacy-engine/src/smart-rules.ts`
  - `generatePoliciesForApp(packageName, tier)` → Policy[]
  - SYSTEM → allow all, SILENT log only
  - TRUSTED → block CRITICAL trackers only, notify on HIGH
  - STANDARD → block HIGH+, notify MEDIUM
  - WATCHLIST → block MEDIUM+, notify SUBTLE
  - BLOCKED → block all network (except OS system traffic)
  - First-party exception: never block first-party domains

- [ ] Wire to PolicyEngine in VpnService
  - `loadSmartRules(apps: {packageName: string, tier: AppTrustTier}[])` on VPN start
  - Re-evaluate when user changes a tier

---

## Phase C — Safe Zone UI ✅ DONE 2026-03-03

- [x] `src/components/SafeZoneMeter.tsx`
  - Horizontal bar: safe (green 0–60) → watch (amber 60–80) → blocked (red 80–100)
  - Position dot showing app's current score
  - Compact variant (for lists) + full variant (for detail sheet)

- [ ] `src/screens/AppTrustScreen.tsx`
  - List all installed apps (use InstalledApps native module or static list)
  - Trust tier badge (🟢 TRUSTED / 🟡 STANDARD / 🟠 WATCHLIST / 🔴 BLOCKED)
  - SafeZoneMeter (compact) per app
  - Tap → AppDetailSheet (bottom sheet)
  - Sort by: Safe Zone Score (most concerning first)

- [ ] `src/components/AppDetailSheet.tsx` (bottom sheet)
  - App name + icon placeholder
  - SafeZoneMeter (full)
  - Stats: trackers today, data sent today, top domains
  - First-party vs third-party breakdown
  - Trust tier selector (user can override: TRUSTED / STANDARD / WATCHLIST / BLOCKED)
  - "Why was this flagged?" — plain English explanation

- [ ] Update `HomeScreen.tsx`
  - Remove: "VPN is ON/OFF" binary language
  - Add: "X apps protected • Y being watched • Z blocked"
  - Add: Top 3 apps by safe zone score (compact SafeZoneMeter each)
  - Add: "Manage Apps →" link to AppTrustScreen

- [ ] Update `SettingsScreen.tsx`
  - Protection Mode toggle: Smart (default) | Strict (block all trackers) | Monitor (log only, never block)
  - Remove confusing global VPN on/off

---

## Phase D — Notification Rethink ✅ DONE 2026-03-03

- [x] Update `packages/privacy-engine/src/alert-classifier.ts`
  - Add `appTier` param to `classifyAlert()`
  - SYSTEM tier → all alerts → SILENT
  - TRUSTED tier → MEDIUM alerts → SUBTLE (downgrade)
  - WATCHLIST tier → MEDIUM alerts → HIGH (upgrade)
  - Message copy: "Instagram is sending more than usual" not "THREAT DETECTED"

---

## Done When:

- User can open app, see all their apps with a safe zone score
- Browser + Google apps show green, no alarms
- An over-tracking app shows amber with plain English explanation
- Truly dangerous app (stalkerware, C2) still triggers CRITICAL
- User never has to turn off VPN to browse normally
