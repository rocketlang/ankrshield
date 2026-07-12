#!/usr/bin/env node
/**
 * version-lockstep-guard — the "lesson → guard" for the 2026-07-12 version-drift bug
 * (feedback_lessons_become_guards_not_memory). A v1.9.0 APK shipped showing "1.8.7" in
 * Settings because `appVersion.ts` (the UI string) was never bumped in lockstep with
 * `build.gradle` versionName (the OS version). Instead of REMEMBERING "bump all three",
 * the substrate CHECKS that the three in-repo mobile version surfaces agree.
 *
 *   1. src/appVersion.ts          APP_VERSION      → every Settings/Help/About screen text
 *   2. android/app/build.gradle   versionName      → the OS-level app version
 *   3. package.json               version          → the npm/workspace version
 *
 * These drift independently and silently. `build.gradle` drives the update; `appVersion.ts`
 * is baked into the JS bundle at build time — so a mismatch ships a lying Settings screen.
 *
 * Exit 0 = all three agree (prints nothing on the happy path unless -v).
 * Exit 1 = mismatch (or a surface that couldn't be parsed) → BLOCK the commit/build.
 *
 * The three web download surfaces (SPA AnkrShieldLanding.tsx, the static
 * /var/www/xshield/ankrshield-download.html + ankrshield-version.json) live OUTSIDE this
 * repo / are deploy artifacts, so they are reported as WARNINGS only, never a hard fail.
 *
 * Run:  node scripts/version-lockstep-guard.mjs        (from apps/mobile-ios)
 *       node scripts/version-lockstep-guard.mjs -v     (also print on success)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..'); // apps/mobile-ios
const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Extract the first capture group, or null (with the reason recorded). */
function extract(label, path, re) {
  const txt = read(path);
  if (txt == null) return { label, path, version: null, err: 'file not found' };
  const m = txt.match(re);
  if (!m) return { label, path, version: null, err: 're did not match' };
  return { label, path, version: m[1] };
}

// ── The three authoritative in-repo mobile surfaces ──────────────────────────
const surfaces = [
  extract('appVersion.ts (APP_VERSION)', resolve(APP, 'src/appVersion.ts'), /APP_VERSION\s*=\s*['"]([^'"]+)['"]/),
  extract('build.gradle (versionName)', resolve(APP, 'android/app/build.gradle'), /versionName\s+["']([^"']+)["']/),
  extract('package.json (version)', resolve(APP, 'package.json'), /"version"\s*:\s*"([^"]+)"/),
];

const parseFails = surfaces.filter((s) => s.version == null);
const versions = [...new Set(surfaces.filter((s) => s.version).map((s) => s.version))];
const agree = parseFails.length === 0 && versions.length === 1;

if (!agree) {
  console.error('⛔ [version-lockstep] mobile version surfaces DISAGREE — the Settings screen will lie:');
  for (const s of surfaces) {
    const shown = s.version ?? `<unparsed: ${s.err}>`;
    console.error(`     ${s.version === (versions.length === 1 ? versions[0] : null) ? '  ' : '≠ '}${shown}  ·  ${s.label}`);
  }
  console.error('   Bump ALL THREE to the same value, then rebuild (appVersion.ts is baked into the JS bundle at build time).');
  console.error('   Reminder — a release also updates the web surfaces (not checked here, they are deploy artifacts):');
  console.error('     · apps/web/src/pages/AnkrShieldLanding.tsx  (SPA, route /personal) + rebuild dist');
  console.error('     · /var/www/xshield/ankrshield-download.html + ankrshield-version.json + a versioned APK + its nginx alias block');
  process.exit(1);
}

// ── Advisory: peek at the web surfaces if reachable, warn (never fail) on drift ──
const V = versions[0];
const webWarnings = [];
const spa = read(resolve(APP, '../web/src/pages/AnkrShieldLanding.tsx'));
if (spa && !spa.includes(`v${V}`)) {
  webWarnings.push(`apps/web/src/pages/AnkrShieldLanding.tsx has no "v${V}" — SPA download page may be stale (rebuild dist after fixing).`);
}
const verJson = read('/var/www/xshield/ankrshield-version.json');
if (verJson) {
  const m = verJson.match(/"version"\s*:\s*"([^"]+)"/);
  if (m && m[1] !== V) webWarnings.push(`/var/www/xshield/ankrshield-version.json = ${m[1]} (update feed lags app ${V}).`);
}

if (webWarnings.length) {
  console.error(`⚠️  [version-lockstep] mobile is ${V}, but a web surface looks stale:`);
  for (const w of webWarnings) console.error(`     · ${w}`);
  console.error('   (advisory only — not blocking; these are deploy artifacts outside the app build.)');
}

if (verbose) console.log(`✓ [version-lockstep] all three mobile version surfaces agree: ${V}`);
process.exit(0);
