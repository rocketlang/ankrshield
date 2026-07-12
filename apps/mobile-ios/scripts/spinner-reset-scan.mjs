#!/usr/bin/env node
/**
 * spinner-reset-scan — the "lesson → guard" for the 2026-07-12 honest-null sweep
 * (feedback_lessons_become_guards_not_memory, FP-018). Six screens shipped a
 * loading/scanning/checking state that never resolved on some path, leaving a
 * spinner that spins forever — a false promise of work-in-progress. The honest
 * state is a null/empty/"not available", never a perpetual spinner.
 *
 * SCOPE — deliberately NARROW and SOUND. A regex cannot prove reachability of a
 * reset across control flow, so this guard only asserts what it can prove with
 * ~zero false positives:
 *
 *   CRITICAL — a spinner-NAMED boolean state is turned ON (useState(true) or
 *              setX(true)) but has NO reset of ANY kind (no setX(false), no dynamic
 *              setX(expr)). It can never turn off → a guaranteed permanent spinner.
 *
 * What it does NOT catch (proven un-catchable by regex here — needs AST/ESLint):
 * an early guard-return that skips a downstream finally (SplitTunnel), an unguarded
 * await before the reset (AppTrust), a reset that lives only in a native-event
 * listener (AvScanner), or a null-as-loading state whose setter is conditional
 * (Settings bwInstalled). Those are caught by review + the memory note; a proper
 * ESLint control-flow rule is the right home if we want them enforced. This guard
 * intentionally does not pretend to — a guard that flags correctly-fixed code
 * trains people to ignore it (the same honesty rule the lesson is about).
 *
 * Run:  node scripts/spinner-reset-scan.mjs        (scans src/screens, exit 1 on CRITICAL)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCREENS = resolve(HERE, '../src/screens');

// A spinner is semantically NAMED. Toggles (notifications, bankAutoStop, shieldOn…)
// default true and are set via variables/functional updaters, not a literal false —
// scoping to these names is what keeps the guard from crying wolf on settings.
// `refreshing`/`submitting` excluded: pull-to-refresh / one-shot submit self-reset.
const SPINNER_NAME = /^(loading|scanning|checking|analy[sz]ing|starting|enabling|busy|watching|locLoading|narrativeLoading)$/i;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function lineOf(text, re) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return 1;
}

const findings = [];
let files = [];
try {
  files = walk(SCREENS);
} catch {
  console.error(`spinner-reset-scan: no screens dir at ${SCREENS}`);
  process.exit(0);
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = file.slice(file.indexOf('src/'));
  const decls = [...text.matchAll(/const\s*\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState(?:<[^>]*>)?\(\s*(true|false)\s*\)/g)];

  for (const [, name, setter, init] of decls) {
    if (!SPINNER_NAME.test(name)) continue; // spinner-named only — never a toggle
    const turnedOn = init === 'true' || new RegExp(`${setter}\\(\\s*true\\s*\\)`).test(text);
    if (!turnedOn) continue;

    // Any reset at all: literal false OR a dynamic setX(<expr>) e.g. setLoading(running).
    const literalReset = new RegExp(`${setter}\\(\\s*false\\s*\\)`).test(text);
    const dynamicReset = new RegExp(`${setter}\\(\\s*(?!true\\s*\\))[^)]+\\)`).test(text);
    if (!literalReset && !dynamicReset) {
      findings.push({
        file: rel,
        line: lineOf(text, new RegExp(`\\[\\s*${name}\\s*,`)),
        msg: `'${name}' is set true but ${setter}(false) appears nowhere — the spinner can never turn off.`,
      });
    }
  }
}

if (!findings.length) {
  console.log('✓ [spinner-reset] no never-resetting spinner states in src/screens.');
  process.exit(0);
}

for (const f of findings) console.error(`⛔ CRITICAL ${f.file}:${f.line}\n     ${f.msg}`);
console.error(
  `\n[spinner-reset] ${findings.length} never-resetting spinner(s). ` +
    `Fix: reset before every early return, or settle in a finally — land on a result or "not available", never a spinner (FP-018).`
);
process.exit(1);
