/**
 * useBlocklist — On-device threat blocklist (EF-2)
 *
 * Downloads the weekly threat blocklist from GitHub CDN (not ANKR server).
 * Parses into a sorted Uint32Array for O(log n) binary search — ~17 comparisons for 1M entries.
 *
 * Usage:
 *   const { checkPhone, checkDomain, ready } = useBlocklist();
 *   const hit = await checkPhone('+919876543210');  // true = known-compromised
 *
 * Privacy: raw number is never transmitted. SHA-256 hashed locally, lookup is local.
 * Offline: cached in module memory per app session. Re-fetches next session if stale.
 *
 * Format: big-endian sorted Uint32Array (4 bytes per entry, no header).
 * Generator: scripts/generate-blocklists.mjs
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Config ──────────────────────────────────────────────────────────────────

const MANIFEST_URL =
  'https://raw.githubusercontent.com/rocketlang/ankrshield/main/blocklist-manifest.json';

const FETCH_TIMEOUT_MS = 15_000;

// ─── Module-level singletons (survive re-renders, reset on cold start) ───────

let phoneList: Uint32Array | null = null;
let domainList: Uint32Array | null = null;
let loadPromise: Promise<void> | null = null;
let loadedVersion = '';

interface Manifest {
  phoneVersion: string;
  phoneUrl: string;
  domainVersion: string;
  domainUrl: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * SHA-256 using the Web Crypto API (available in React Native 0.71+ with Hermes).
 * Returns hex string.
 */
async function sha256hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a sha256 hex string → uint32 (first 8 hex chars = 4 bytes, big-endian).
 * Matches the server-side generator: parseInt(hexStr.slice(0, 8), 16) >>> 0
 */
async function hashToUint32(input: string): Promise<number> {
  const hex = await sha256hex(input);
  return (parseInt(hex.slice(0, 8), 16) >>> 0) as number;
}

/**
 * Normalise a phone number to E.164 format.
 * Handles Indian 10-digit numbers automatically.
 */
function toE164(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`;
  if (cleaned.startsWith('+')) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  return cleaned;
}

/**
 * Binary search on a sorted Uint32Array (big-endian binary from generator).
 * Returns true if target is found.
 */
function binarySearch(arr: Uint32Array, target: number): boolean {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const val = arr[mid];
    if (val === target) return true;
    if (val < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/**
 * Parse a binary blob (big-endian uint32 array) into a Uint32Array.
 */
function parseBinary(buffer: ArrayBuffer): Uint32Array {
  const view = new DataView(buffer);
  const count = Math.floor(buffer.byteLength / 4);
  const arr = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = view.getUint32(i * 4, false); // false = big-endian
  }
  return arr;
}

/**
 * Fetch a binary file and decompress (the gzip decompression is handled by fetch's
 * Accept-Encoding negotiation on most RN versions; if not, the raw bytes are still valid
 * since GitHub serves pre-compressed with Content-Encoding: gzip which fetch auto-decodes).
 */
async function fetchBinary(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: { Accept: 'application/octet-stream' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.arrayBuffer();
}

// ─── Loader ──────────────────────────────────────────────────────────────────

async function loadBlocklists(): Promise<void> {
  try {
    // 1. Fetch manifest (tiny JSON, ~500 bytes)
    const manifestRes = await fetch(MANIFEST_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!manifestRes.ok) throw new Error(`Manifest fetch failed: ${manifestRes.status}`);
    const manifest: Manifest = await manifestRes.json();

    // 2. Skip if already loaded at this version
    if (loadedVersion === manifest.phoneVersion && phoneList && domainList) return;

    // 3. Download + parse phone blocklist
    const phoneBuf = await fetchBinary(manifest.phoneUrl);
    phoneList = parseBinary(phoneBuf);

    // 4. Download + parse domain blocklist
    const domainBuf = await fetchBinary(manifest.domainUrl);
    domainList = parseBinary(domainBuf);

    loadedVersion = manifest.phoneVersion;
    console.log(
      `[blocklist] Loaded v${loadedVersion}: ${phoneList.length} phone + ${domainList.length} domain entries`
    );
  } catch (e) {
    // Non-fatal: app still works, phone/domain checks degrade gracefully
    console.warn('[blocklist] Load failed (offline or network error):', (e as Error).message);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlocklist() {
  const [ready, setReady] = useState(phoneList !== null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!loadPromise) {
      loadPromise = loadBlocklists().then(() => {
        if (mounted.current) setReady(true);
      });
    } else {
      loadPromise.then(() => {
        if (mounted.current) setReady(true);
      });
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Check if a phone number appears in the on-device threat blocklist.
   * Returns false (safe) if blocklist is not yet loaded.
   */
  const checkPhone = useCallback(async (rawNumber: string): Promise<boolean> => {
    if (!phoneList) return false; // not loaded yet — fail open (don't block)
    try {
      const e164 = toE164(rawNumber);
      const target = await hashToUint32(e164);
      return binarySearch(phoneList, target);
    } catch {
      return false;
    }
  }, []);

  /**
   * Check if a domain appears in the on-device threat blocklist.
   * Also checks the parent domain (e.g. "ads.tracker.com" → checks "tracker.com" too).
   * Returns false if blocklist not loaded.
   */
  const checkDomain = useCallback(async (domain: string): Promise<boolean> => {
    if (!domainList) return false;
    try {
      const d = domain.toLowerCase().trim();
      const target = await hashToUint32(d);
      if (binarySearch(domainList, target)) return true;

      // Check parent domain
      const dot = d.indexOf('.');
      if (dot > 0 && dot < d.length - 1) {
        const parent = d.slice(dot + 1);
        if (parent.includes('.')) {
          const parentTarget = await hashToUint32(parent);
          if (binarySearch(domainList, parentTarget)) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return { checkPhone, checkDomain, ready, loadedVersion };
}

/**
 * Standalone utility — use outside of React components.
 * Triggers blocklist load once and resolves when ready.
 */
export async function getBlocklistChecker() {
  if (!loadPromise) {
    loadPromise = loadBlocklists();
  }
  await loadPromise;
  return {
    checkPhone: async (rawNumber: string) => {
      if (!phoneList) return false;
      const e164 = toE164(rawNumber);
      const target = await hashToUint32(e164);
      return binarySearch(phoneList, target);
    },
    checkDomain: async (domain: string) => {
      if (!domainList) return false;
      const target = await hashToUint32(domain.toLowerCase());
      return binarySearch(domainList, target);
    },
    ready: phoneList !== null,
  };
}
