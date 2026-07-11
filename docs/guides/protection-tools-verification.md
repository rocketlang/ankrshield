# AnkrShield — Protection Tools: what each tile does & how to verify it works

**Audience:** on-device tester (founder P0 pass) · **Screen:** Home → _Protection Tools_ grid
**Principle:** every tile is a **real tool**, not a placeholder. A tile only shows a green **On** badge when its underlying capability is genuinely active on the device (FP-018 — the badge is _computed_ from a live native probe, never asserted).

## The badge (added v1.7.x)

Each tile carries a permission-state badge, computed live every 5 s from the real native modules:

| Badge        | Meaning                                                            | When you see it                                                                                     |
| ------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 🟢 **On**    | The OS dependency is verified **active** right now                 | DNS shield running, accessibility service live, device-admin active, SMS granted, baseline captured |
| 🟠 **Off**   | The tile needs an OS permission/toggle that is **not yet enabled** | Grant the permission (steps below) and the badge flips green                                        |
| 🔵 **Ready** | **No special permission** needed — works the moment you tap it     | Input-based scanners (paste a VPA / SMS / link) and PackageManager reads Android grants at install  |

> "Ready" is honest: it does **not** claim the tool is "running" — it says "tap and it works." Only 🟢 means a background capability is live.

The badge source of truth: `src/services/PermissionState.ts` → `readPermissionState()` probes
`DnsVpn.isRunning`, `WhatsAppGuard.isRunning` (accessibility), `AntiTheft.isDeviceAdminActive`,
`RansomwareWatcher.isRunning`, `OtpGuard.hasPermission` (SMS), `PermissionWatcher.hasSnapshot`.
A probe that throws fails to **Off** — never to a false On.

---

## Per-tile: backing, dependency, and how to verify

Legend for **Backing**: 🔩 native Android module (real OS work) · 🧮 on-device logic/heuristic · 📒 reads the native DNS/scope ledger.

### India-first threats

| Tile                 | Backing                                          | Dep / badge             | How to verify it works                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 💳 **UPI Guard**     | 🔩 `UpiGuardModule`                              | none → 🔵 Ready         | Paste `7506926394@okaxis` → **safe** (known handle). Paste `random@fakebank` → **warned** (unknown PSP). Paste a `upi://pay?pa=…&am=99999` link → parsed + amount flagged. Verifies raw-VPA branch + known-handle set. |
| 💬 **SMS Shield**    | 🧮 fraud-pattern scanner                         | `sms` → 🟢/🟠           | Badge 🟢 only if RECEIVE_SMS granted (auto-scan). **Paste works without it:** paste a lottery/KYC-expiry SMS → flagged with reason. Paste a normal OTP → clean.                                                        |
| 📞 **Call Shield**   | 🧮 India fraud patterns                          | none → 🔵 Ready         | Enter a number / pick a scam type (fake IRS, loan, digital-arrest) → shows the pattern + guidance. Reference patterns render.                                                                                          |
| 💬 **WA Guard**      | 🔩 `WhatsAppGuardModule` + accessibility service | `accessibility` → 🟢/🟠 | Grant **Accessibility → AnkrShield**. Badge flips 🟢. Receive a WhatsApp attachment → it is SHA-256 scanned; check _scan history_ populates (`getScanHistory`).                                                        |
| 🛡️ **Account Guard** | 🔩 WhatsApp + UPI safety                         | `accessibility` → 🟢/🟠 | With accessibility on, run the WhatsApp+UPI safety checklist → each check returns a real pass/warn.                                                                                                                    |
| 📱 **Contact Risk**  | 🧮 heuristic                                     | none → 🔵 Ready         | Enter a number + describe behaviour ("asked for OTP") → risk assessment returned.                                                                                                                                      |

### Web / privacy

| Tile                  | Backing                                 | Dep / badge     | How to verify it works                                                                                                                                                                             |
| --------------------- | --------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🌐 **Safe Browse**    | 📒 DNS shield                           | `vpn` → 🟢/🟠   | Turn on the DNS shield (Settings). Badge 🟢. Visit a known-bad host → blocked; the _how it works_ copy names the mechanism (DNS-layer).                                                            |
| 📋 **DPDP Scan**      | 🧮 compliance check over installed apps | none → 🔵 Ready | Tap → scans installed apps for DPDP-relevant excess data collection → cited report.                                                                                                                |
| 🔗 **Link Scan**      | 🧮 phishing URL heuristics              | none → 🔵 Ready | Paste `http://hdfcbank-login.com` → flagged (look-alike). Paste `https://hdfcbank.com` → clean.                                                                                                    |
| 📊 **Privacy Report** | 📒 scope ledger                         | `vpn` → 🟢/🟠   | With shield on and some traffic, open → per-app "who tracked you", cited against the 207k tracker DB; amber "aggressive" vs red "stalkerware" tiers; **Tame** + **Evidence Pack** buttons present. |
| 🌙 **Caught in Act**  | 📒 scope ledger (screen-off)            | `vpn` → 🟢/🟠   | Shield on; lock the phone for a while; reopen → apps that phoned trackers **while the screen was off** are listed with receipts.                                                                   |
| 🔗 **Network**        | 📒 DNS feed                             | `vpn` → 🟢/🟠   | Shield on → live DNS tracker feed streams entries.                                                                                                                                                 |

### Malware / device security

| Tile               | Backing                                | Dep / badge          | How to verify it works                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔬 **AV Scan**     | 🔩 `AvScannerModule`                   | none → 🔵 Ready      | Tap **Scan**. It enumerates installed apps (`PackageManager`), computes a **real SHA-256** of each APK, checks a malware-hash seed list. Optional: paste a free VirusTotal key → cross-checks online. Verify a per-app result list with hashes appears. |
| 🔒 **Anti-Theft**  | 🔩 `AntiTheftModule` (device admin)    | `admin` → 🟢/🟠      | Enable **Device admin → AnkrShield**. Badge 🟢. Test remote-lock trigger; confirm `isDeviceAdminActive` = true.                                                                                                                                         |
| 🦠 **Ransomware**  | 🔩 `RansomwareWatcherModule` + service | `ransomware` → 🟢/🟠 | Start the watcher. Badge 🟢 (`isRunning`). Mass-rename/encrypt a batch of test files in a watched dir → alert fires.                                                                                                                                    |
| 🕵️ **Stalkerware** | 🔩 installed-app inspection            | none → 🔵 Ready      | Tap → scans installed apps for hidden-spy signatures (no launcher icon, spy permissions) → flagged list or "clean".                                                                                                                                     |

### App & permission auditing

| Tile              | Backing                      | Dep / badge        | How to verify it works                                                                                                                                   |
| ----------------- | ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **App Scope**  | 🔩 `AppScannerModule`        | none → 🔵 Ready    | Tap → lists apps requesting **excess permissions** vs their function, via `getInstalledApps`.                                                            |
| 🔔 **Perm Watch** | 🔩 `PermissionWatcherModule` | `snapshot` → 🟢/🟠 | First run: tap **Take baseline** → badge flips 🟢 (`hasSnapshot`). Later, after an app update gains a permission → the diff shows "gained since update". |
| 🏥 **Dev Health** | 🔩 `DeviceHealthModule`      | none → 🔵 Ready    | Tap → read-only device hygiene checks (screen lock, unknown sources, OS patch age) → scored report.                                                      |

### Watch / corporate

| Tile                  | Backing           | Dep / badge     | How to verify it works                                                       |
| --------------------- | ----------------- | --------------- | ---------------------------------------------------------------------------- |
| ⌚ **Health Privacy** | 🧮 witness        | none → 🔵 Ready | Open → checks whether a paired watch/health app is leaking → witness result. |
| 🏢 **Corporate**      | 🧮 MDM enrollment | none → 🔵 Ready | Open → MDM enrollment flow renders (enterprise).                             |

---

## Fast verification checklist (on device)

1. **Fresh install, nothing granted** → most permission tiles show 🟠 **Off**, input tiles show 🔵 **Ready**. (Nothing should be falsely 🟢.)
2. **Turn on DNS shield** → Safe Browse, Privacy Report, Caught in Act, Network flip 🟢 within ~5 s.
3. **Grant Accessibility** → WA Guard + Account Guard flip 🟢.
4. **Enable Device admin** → Anti-Theft flips 🟢.
5. **Start Ransomware watcher** → Ransomware flips 🟢.
6. **Grant SMS** → SMS Shield flips 🟢. **Take Perm Watch baseline** → Perm Watch flips 🟢.
7. **Tap any 🔵 Ready tile** (UPI/SMS-paste/Link/AV) → it produces a real result with no permission.

If any tile shows 🟢 when its dependency is **off**, that is a bug (report it) — the badge must never over-claim.

---

*Generated from verified source: `apps/mobile-ios/src/screens/HomeScreen.tsx`, `src/services/PermissionState.ts`, and the `android/app/src/main/java/com/ankr/shield/*Module.java` native bridges.\*
