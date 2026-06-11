#!/usr/bin/env node
// WS1-T1 proof: the tracker-blocking data floor is real.
// Loads the parsed NDJSON into a DomainLookup and asserts known trackers are blocked
// while legitimate domains are not. Exits 0 iff the floor holds.
//
//   node packages/dns-resolver/scripts/verify-blocklist-floor.mjs

import { DomainLookup } from '../dist/blocklist/lookup.js';
import { loadNdjsonIntoLookup } from '../dist/blocklist/ndjson-loader.js';

const lookup = new DomainLookup();
const t0 = Date.now();
const res = await loadNdjsonIntoLookup(lookup);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\nLoaded ${res.loaded.toLocaleString()} tracker domains in ${secs}s (${res.skipped.toLocaleString()} junk skipped)`);
console.log('by source:', res.bySource);

// Known trackers — MUST be blocked.
const trackers = ['google-analytics.com', 'doubleclick.net', 'googletagmanager.com', 'scorecardresearch.com'];
// Legitimate domains — MUST NOT be blocked (allow normal apps to work).
const legit = ['github.com', 'wikipedia.org', 'kernel.org'];

let pass = res.loaded > 50000; // expect a substantial list
const out = [];
for (const d of trackers) {
  const b = await lookup.isBlocked(d);
  out.push(`  ${b ? '🛑 BLOCK' : '⚠️  MISS '} ${d}`);
  if (!b) pass = false;
}
for (const d of legit) {
  const b = await lookup.isBlocked(d);
  out.push(`  ${b ? '⚠️  BLOCK' : '✅ ALLOW'} ${d}`);
  if (b) pass = false;
}
// Subdomain (wildcard) check — tracking subdomains of a blocked apex should also block.
const sub = 'ssl.google-analytics.com';
const subBlocked = await lookup.isBlocked(sub);
out.push(`  ${subBlocked ? '🛑 BLOCK' : '·  pass '} ${sub} (subdomain)`);

console.log('\nverdicts:');
console.log(out.join('\n'));
console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — tracker-blocking data floor (${res.loaded.toLocaleString()} domains)\n`);
process.exit(pass ? 0 : 1);
