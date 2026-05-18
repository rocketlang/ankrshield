/**
 * usePhoneRisk — on-device phone risk check with server fallback (EF-2).
 *
 * FREE tier (default, no API key):
 *   Uses on-device blocklist via useBlocklist — zero ANKR server contact.
 *   Returns a synthetic PhoneRiskResult from the local binary lookup.
 *
 * PAID tier (API key set):
 *   Calls xshieldai.com for crowd-sourced confidence, verified flag, advisories.
 *   Falls back to on-device check if server is unreachable.
 */

import { useCallback, useState } from 'react';

import { getBlocklistChecker } from './useBlocklist';

const API_BASE = 'https://xshieldai.com/api';
const CACHE = new Map<string, { result: PhoneRiskResult; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

// Stored API key — null means free tier. Replace with AsyncStorage read when key mgmt is added.
async function getStoredApiKey(): Promise<string | null> {
  return null; // TODO: AsyncStorage.getItem('xshield_api_key')
}

function syntheticResult(rawNumber: string, hijacked: boolean): PhoneRiskResult {
  const masked =
    rawNumber.length > 6
      ? rawNumber.slice(0, 3) + '*'.repeat(rawNumber.length - 6) + rawNumber.slice(-3)
      : '***';
  return {
    number: rawNumber,
    numberDisplay: masked,
    hijacked,
    platforms: [],
    reportCount: 0,
    confidence: hijacked ? 55 : 0,
    sources: ['on_device_blocklist'],
    firstReportedAt: null,
    lastReportedAt: null,
    advisories: hijacked
      ? [
          'This number appears in our threat blocklist. Verify via a different channel before responding.',
        ]
      : [],
    riskScore: hijacked ? 55 : 0,
  };
}

export interface PhoneRiskResult {
  number: string;
  numberDisplay: string;
  hijacked: boolean;
  platforms: string[];
  reportCount: number;
  confidence: number;
  sources: string[];
  firstReportedAt: string | null;
  lastReportedAt: string | null;
  advisories: string[];
  riskScore: number;
}

export interface ReportPayload {
  number: string;
  platform: 'whatsapp' | 'telegram' | 'instagram' | 'facebook' | 'gmail' | 'other';
  notes?: string;
}

export function usePhoneRisk() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkNumber = useCallback(async (rawNumber: string): Promise<PhoneRiskResult | null> => {
    const key = rawNumber.replace(/\s/g, '');
    const cached = CACHE.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

    setLoading(true);
    setError(null);
    try {
      const apiKey = await getStoredApiKey();

      // Free tier: on-device blocklist lookup — zero server contact
      if (!apiKey) {
        const checker = await getBlocklistChecker();
        const hit = await checker.checkPhone(key);
        const result = syntheticResult(key, hit);
        CACHE.set(key, { result, ts: Date.now() });
        return result;
      }

      // Paid tier: server lookup with on-device fallback
      try {
        const res = await fetch(`${API_BASE}/risk/phone?number=${encodeURIComponent(key)}`, {
          headers: { Accept: 'application/json', 'X-API-Key': apiKey },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result: PhoneRiskResult = await res.json();
        CACHE.set(key, { result, ts: Date.now() });
        return result;
      } catch {
        // Server unreachable — fall back to on-device for paid users too
        const checker = await getBlocklistChecker();
        const hit = await checker.checkPhone(key);
        return syntheticResult(key, hit);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reportNumber = useCallback(async (payload: ReportPayload): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/risk/phone/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { checkNumber, reportNumber, loading, error };
}
