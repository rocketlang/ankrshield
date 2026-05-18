# Installer Configuration Status

**Last updated:** 2026-05-18 (electron-builder migration)
**Status:** Migration committed; needs `pnpm install` + first build to verify

---

## Current Toolchain

| Stage                  | Tool                        | Config                        |
| ---------------------- | --------------------------- | ----------------------------- |
| Dev / `pnpm dev`       | electron-forge (start only) | `forge.config.js` (no makers) |
| Renderer build         | Vite 5                      | `vite.config.ts`              |
| Main build             | tsc                         | `tsconfig.json`               |
| Packaging + installers | **electron-builder 25**     | `electron-builder.yml`        |

History: prior versions used electron-forge for both dev _and_ packaging.
That pipeline broke on pnpm workspaces because forge's flora-colossus
walker couldn't traverse the symlinked nested `node_modules`
(`Failed to locate module "@ioredis/commands"` from
`@ankrshield/dns-resolver`). Migrated to electron-builder 2026-05-18
because electron-builder follows pnpm symlinks correctly.

---

## Build Targets

| Platform | Target                                                       | Output                                                                                  |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Windows  | **NSIS** (one installer .exe, per-user or per-machine) + ZIP | `out/make/ankrshield Setup ${version}.exe`, `out/make/ankrshield-${version}-win.zip`    |
| macOS    | DMG (x64 + arm64) + ZIP                                      | `out/make/ankrshield-${version}.dmg`, `out/make/ankrshield-${version}-mac.zip`          |
| Linux    | DEB + RPM + ZIP                                              | `out/make/ankrshield_${version}_amd64.deb`, `out/make/ankrshield-${version}.x86_64.rpm` |

NSIS replaces the prior Squirrel installer. NSIS produces a single
double-clickable Setup.exe with directory choice, desktop shortcut,
and a proper uninstaller — better UX for a paid privacy product than
Squirrel's auto-install. Auto-update can still use electron-updater
(NSIS supports it).

---

## Commands

```bash
cd /root/ankrshield/apps/desktop

# Dev (live reload)
pnpm dev

# Verify build pipeline
pnpm build
pnpm package           # produces unpacked app dir under out/

# Installers (build for current platform)
pnpm make

# Cross-platform builds (require Wine for win on linux/mac)
pnpm make:win
pnpm make:mac
pnpm make:linux
pnpm make:all          # all three (-mwl)
```

---

## Assets Required

These must exist under `apps/desktop/assets/` before `make` succeeds:

- [ ] `assets/icon.icns` — macOS app icon (512x512)
- [ ] `assets/icon.ico` — Windows installer + app icon (256x256)
- [ ] `assets/icon.png` — Linux app icon (512x512)
- [ ] `assets/dmg-background.png` — DMG window background (540x380)

`assets/install.gif` (Squirrel loader) is no longer needed — NSIS uses
the installerIcon instead.

---

## Code Signing (Production)

| Platform | When required                                    | Cost / setup                                                                                                  |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Windows  | Public distribution (avoid SmartScreen warnings) | $200–$400/yr cert. Set `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` env vars before `make:win`.                    |
| macOS    | Wide distribution + notarization                 | $99/yr Apple Developer. Set `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID` + `CSC_LINK`/`CSC_KEY_PASSWORD`. |
| Linux    | Never required                                   | —                                                                                                             |

For investor demos: signing is **not** required. Unsigned NSIS installer
shows a SmartScreen warning that users can bypass with "More info → Run anyway".

---

## Verification checklist (next session)

1. `cd /root/ankrshield/apps/desktop && pnpm install` — pulls electron-builder, drops 5 forge makers
2. `pnpm typecheck` — should pass (no code changes)
3. `pnpm build` — main + renderer to `dist/`
4. `pnpm package` — sanity check, produces `out/<platform>-<arch>/` unpacked app dir
5. `pnpm make:linux` — fastest cross-platform smoke test on this VM (DEB + RPM + ZIP)
6. If linux make succeeds → run `pnpm make:win` (Wine must be present) for the .exe
7. Update `/root/ankrshield/codex.json` `ankrshield_consumer.what_exists.desktop_app` field to reflect verified installer

If `make:linux` fails: most likely missing asset (icon.png/icon.ico). Create the assets first, retry.
If still failing: electron-builder logs go to stderr — capture them, the error is usually explicit about which dep can't be packed.

---

## Why electron-builder, not electron-forge

| Concern                      | electron-forge                 | electron-builder            |
| ---------------------------- | ------------------------------ | --------------------------- |
| pnpm workspace symlinks      | broken (flora-colossus)        | works                       |
| Native module rebuild        | external tool                  | built-in                    |
| Auto-update                  | needs separate Squirrel server | electron-updater integrated |
| NSIS support                 | via maker plugin               | first-class                 |
| Cross-platform from one host | partial                        | full (with Wine for win)    |
| Code signing                 | manual                         | env-var driven              |
| Active development           | slowing                        | active                      |
