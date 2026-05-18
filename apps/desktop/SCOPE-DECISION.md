# npm Scope Decision — @ankrshield vs @xshieldai

**Decided:** 2026-05-18
**Decider:** Founder (capt.anil.sharma@powerpbox.org)
**Context:** Founder clarified that **ankrshield.com is not held** —
only **xshieldai.com** is the live, registered, public domain.

---

## The split

| Layer                                                                     | Scope                         | Why                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internal workspace packages** (pnpm `workspace:*` deps)                 | `@ankrshield/*`               | Legacy. Lots of cross-refs across `apps/desktop`, `apps/api`, internal libs (`dns-resolver`, `network-monitor`, `privacy-engine`). Renaming would be a high-blast-radius rewrite for zero external benefit — these are never published to the public registry. |
| **Public-facing npm packages** (anything `pnpm publish`-ed to npmjs.org)  | `@xshieldai/*`                | Matches the live domain. Org is already claimed under the `rocketlang` npm user — see `MEMORY.md` → `reference_npm_orgs_2026_05_17.md`. Public users find packages by domain, not by internal codename.                                                        |
| **Private registry mirror** (verdaccio)                                   | `@ankrshield/*`               | Mirrors the workspace. Verdaccio is internal — `@ankrshield` is correct there.                                                                                                                                                                                 |
| **User-facing app branding** (installer name, homepage, email, icon URLs) | `xShieldAI` / `xshieldai.com` | The public face. Matches the held domain.                                                                                                                                                                                                                      |

---

## Concretely: what's `@ankrshield/*` vs `@xshieldai/*`

`@ankrshield/*` (workspace, internal — keep as-is):

- `@ankrshield/desktop` — this app
- `@ankrshield/dns-resolver` — workspace dep
- `@ankrshield/network-monitor` — workspace dep
- `@ankrshield/privacy-engine` — workspace dep
- 7 `@ankrshield/desktop-{App,index,preload,window,tray,updater,notifications}` micro-packages in verdaccio backup

`@xshieldai/*` (public scope, claimed but mostly empty — use for new public publishes):

- (slot reserved — no packages published yet)
- Future candidates: SDK (`@xshieldai/sdk`), GitHub Action (`@xshieldai/scan-action`), public CLI

---

## Rules going forward

1. **Never rename existing `@ankrshield/*` packages.** Too many import sites.
2. **Never publish `@ankrshield/*` to npmjs.org.** Public registry. The brand isn't live.
3. **Any net-new public package goes to `@xshieldai/*`.** Use the existing org claim.
4. **User-visible strings in `@ankrshield/*` packages** (homepage, author, descriptions, icon URLs) **must use xshieldai.com**. Internal package name can stay `@ankrshield/foo`; the public surface inside it must reference the held domain.
5. If a future product split occurs (e.g. genuine consumer AnkrShield re-launch on a held `ankrshield.in` / `ankrshield.app` / similar), revisit this doc.

---

## Audit results (2026-05-18)

After scope sweep + domain sweep:

```
grep -rln "ankrshield\.com" apps/desktop/ --excl node_modules
→ 0 hits (cleaned 2026-05-18)
```

The `@ankrshield/*` package name is retained intentionally; only the
domain references were corrected.

---

## License

AGPL-3.0-only. Founder set 2026-05-18 as a project-wide rule: every
ANKR OSS / open-core / free app uses AGPL-3.0 (not MIT, not Apache,
not plain GPL, not "TBD"). The license closes the SaaS loophole —
a competitor running a modified ankrshield desktop as a network
service has to release their modifications under the same terms.

Top-level LICENSE: `/root/ankrshield/LICENSE` (AGPL-3.0 short notice,
copy of the `/root/aegis/LICENSE` template).

`package.json` declares `"license": "AGPL-3.0-only"` (SPDX).

Same applied to:

- `/root/ankrshield/package.json` (was "TBD")
- `/root/ankrshield/apps/desktop/package.json` (was "GPL-3.0")
- `/root/ankrshield/apps/warrior-cli/package.json` (was "Apache-2.0")

## See also

- `MEMORY.md` → `reference_npm_orgs_2026_05_17.md` (npm orgs claimed)
- `MEMORY.md` → `project_ankr_platform_vertical_architecture.md` (platform vs domain split)
- `MEMORY.md` → `feedback_agpl3_default_for_free_oss.md` (AGPL-3.0 default rule)
- `/root/ankrshield/codex.json` `ankrshield_consumer.what_is_not_built` (records "ankrshield.com domain not live")
- `/root/aegis/LICENSE` (AGPL-3.0 short-notice template)
