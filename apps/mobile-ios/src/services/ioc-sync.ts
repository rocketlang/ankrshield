/**
 * IOC Blocklist Sync Service
 *
 * Pulls the latest IOC feed from xShield every 6 hours.
 * Stores locally using MdmStorage (offline-first, backed by Android SharedPreferences).
 * The DNS resolver checks this list before allowing connections.
 */

import { API_BASE } from '../config';
import { MdmStorage } from '../mdm/storage';

const BLOCKLIST_KEY = '@ankrshield/ioc_blocklist';
const LAST_SYNC_KEY = '@ankrshield/ioc_last_sync';
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FEED_URL = `${API_BASE}/ioc/feed?format=domains&limit=2000`;
const DELTA_FEED_URL = `${API_BASE}/ioc/feed/delta`;

export interface BlocklistState {
  domains: Set<string>;
  lastSyncAt: Date | null;
  count: number;
  syncInProgress: boolean;
}

const state: BlocklistState = {
  domains: new Set(),
  lastSyncAt: null,
  count: 0,
  syncInProgress: false,
};

/**
 * Load blocklist from local storage into memory.
 * Called at app startup.
 */
export async function loadBlocklist(): Promise<void> {
  try {
    const [raw, lastSync] = await Promise.all([
      MdmStorage.getItem(BLOCKLIST_KEY),
      MdmStorage.getItem(LAST_SYNC_KEY),
    ]);
    if (raw) {
      const domains = JSON.parse(raw) as string[];
      state.domains = new Set(domains);
      state.count = domains.length;
    }
    if (lastSync) {
      state.lastSyncAt = new Date(lastSync);
    }
  } catch {
    // corrupt storage — will re-sync
  }
}

/**
 * Fetch IOC list from xShield API. Uses delta sync when a prior sync timestamp
 * exists — only downloads domains added since last sync (≪ full list size).
 * Falls back to full sync if delta fails.
 */
export async function syncBlocklist(): Promise<{
  synced: boolean;
  count: number;
  added?: number;
  removed?: number;
  error?: string;
}> {
  if (state.syncInProgress) return { synced: false, count: state.count };
  state.syncInProgress = true;
  try {
    if (state.lastSyncAt) {
      return await _deltaSync();
    }
    return await _fullSync();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { synced: false, count: state.count, error: msg };
  } finally {
    state.syncInProgress = false;
  }
}

async function _fullSync(): Promise<{ synced: boolean; count: number }> {
  const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const domains = text
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  state.domains = new Set(domains);
  state.count = domains.length;
  state.lastSyncAt = new Date();

  await Promise.all([
    MdmStorage.setItem(BLOCKLIST_KEY, JSON.stringify(domains)),
    MdmStorage.setItem(LAST_SYNC_KEY, state.lastSyncAt.toISOString()),
  ]);

  return { synced: true, count: domains.length };
}

async function _deltaSync(): Promise<{
  synced: boolean;
  count: number;
  added: number;
  removed: number;
}> {
  const since = state.lastSyncAt!.toISOString();
  const url = `${DELTA_FEED_URL}?since=${encodeURIComponent(since)}&minScore=60`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Delta HTTP ${res.status}`);

  const json = (await res.json()) as {
    add: string[];
    remove: string[];
    timestamp: string;
    total: number;
  };
  const add: string[] = (json.add ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean);
  const remove: string[] = (json.remove ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean);

  for (const d of add) state.domains.add(d);
  for (const d of remove) state.domains.delete(d);
  state.count = state.domains.size;
  state.lastSyncAt = json.timestamp ? new Date(json.timestamp) : new Date();

  await Promise.all([
    MdmStorage.setItem(BLOCKLIST_KEY, JSON.stringify([...state.domains])),
    MdmStorage.setItem(LAST_SYNC_KEY, state.lastSyncAt.toISOString()),
  ]);

  return { synced: true, count: state.count, added: add.length, removed: remove.length };
}

/**
 * Check if a domain is in the blocklist.
 * Checks exact match + parent domain (e.g., sub.malware.ru → malware.ru).
 */
export function isDomainBlocked(domain: string): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  if (state.domains.has(d)) return true;
  const parts = d.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (state.domains.has(parent)) return true;
  }
  return false;
}

/**
 * Start background sync — syncs immediately if stale, then every 6h.
 * Returns a cleanup function.
 */
export function startBlocklistSync(): () => void {
  const checkAndSync = async () => {
    const stale = !state.lastSyncAt || Date.now() - state.lastSyncAt.getTime() > SYNC_INTERVAL_MS;
    if (stale) {
      await syncBlocklist();
    }
  };

  // Load from storage first, then check if sync needed
  loadBlocklist()
    .then(checkAndSync)
    .catch(() => {});

  const interval = setInterval(checkAndSync, SYNC_INTERVAL_MS);
  return () => clearInterval(interval);
}

export function getBlocklistStats() {
  return {
    count: state.count,
    lastSyncAt: state.lastSyncAt,
    syncInProgress: state.syncInProgress,
  };
}
