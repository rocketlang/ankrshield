/**
 * NDJSON blocklist loader — the data floor (WS1-T1).
 *
 * Loads parsed tracker domains straight from .cache/blocklists/parsed-domains.ndjson
 * into a DomainLookup, with NO Postgres round-trip. A 230k-entry public blocklist is
 * derived cache data, not user data — it has no business in the primary app DB (and
 * mixing it there would put a freely-rebuildable list next to data we must never drop).
 * The DB-backed path (BlocklistManager.loadFromDatabase) remains for the categorised
 * dashboard queries (WS1-T3); this path is what makes isBlocked() meaningful today.
 *
 * Refresh: re-run scripts/download-blocklists.ts then scripts/parse-blocklists (or the
 * importer) to regenerate parsed-domains.ndjson — same cron pattern as refresh-opensanctions.
 */

import { createReadStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import type { DomainLookup } from './lookup.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_NDJSON = join(
  HERE,
  '..',
  '..',
  '.cache',
  'blocklists',
  'parsed-domains.ndjson'
);

/**
 * Hosts/AdGuard/EasyList parsing leaves junk in the stream (bare IPs, "local",
 * "0.0.0.0", comment fragments). A blocklist that sinkholes "0.0.0.0" or "local"
 * would break normal resolution — so the floor MUST reject non-domains.
 */
export function isValidTrackerDomain(raw: string): boolean {
  const d = raw.toLowerCase().trim();
  if (d.length < 4 || d.length > 253) return false;
  if (!d.includes('.')) return false; // needs a TLD
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return false; // bare IPv4
  if (/[^a-z0-9.-]/.test(d)) return false; // spaces / wildcards / junk
  if (d.startsWith('.') || d.endsWith('.') || d.startsWith('-')) return false;
  if (d.includes('..')) return false;
  const tld = d.slice(d.lastIndexOf('.') + 1);
  if (tld.length < 2 || /^\d+$/.test(tld)) return false; // no numeric TLD
  return true;
}

export interface NdjsonLoadResult {
  file: string;
  read: number;
  loaded: number;
  skipped: number;
  bySource: Record<string, number>;
}

/**
 * Only hosts/adguard entries are safe for DNS-level blocking. EasyList/EasyPrivacy are
 * BROWSER adblock rules — network filters with `$third-party` context and element-hiding —
 * so reducing them to apex domains and sinkholing those at DNS level is wrong: it blocks
 * legitimate sites (github.com, wikipedia.org appear in EasyPrivacy as *rule subjects*, not
 * "block this whole domain"). A DNS floor must use DNS-level sources. Honouring adblock rules
 * properly needs an in-browser engine (a later, separate surface), not the resolver.
 */
const DNS_RELIABLE_FORMATS = new Set(['hosts', 'adguard']);

/**
 * Stream the NDJSON into a DomainLookup. Batched so we don't hold the whole file
 * as objects in memory. Returns counts so the caller can prove the floor.
 */
export async function loadNdjsonIntoLookup(
  lookup: DomainLookup,
  filePath: string = DEFAULT_NDJSON,
  batchSize = 10000,
  dnsReliableOnly = true
): Promise<NdjsonLoadResult> {
  if (!existsSync(filePath)) {
    throw new Error(
      `blocklist NDJSON not found: ${filePath} — run scripts/download-blocklists.ts first`
    );
  }
  const res: NdjsonLoadResult = { file: filePath, read: 0, loaded: 0, skipped: 0, bySource: {} };
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let batch: Array<{ domain: string; category?: string; threatLevel?: string }> = [];

  const flush = async () => {
    if (batch.length) {
      await lookup.addDomains(batch);
      res.loaded += batch.length;
      batch = [];
    }
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    res.read++;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      res.skipped++;
      continue;
    }
    if (!entry?.domain || !isValidTrackerDomain(entry.domain)) {
      res.skipped++;
      continue;
    }
    if (dnsReliableOnly && !DNS_RELIABLE_FORMATS.has(entry.format)) {
      res.skipped++;
      continue;
    }
    res.bySource[entry.source ?? 'unknown'] = (res.bySource[entry.source ?? 'unknown'] ?? 0) + 1;
    batch.push({ domain: entry.domain.toLowerCase().trim(), category: entry.category });
    if (batch.length >= batchSize) await flush();
  }
  await flush();
  return res;
}
