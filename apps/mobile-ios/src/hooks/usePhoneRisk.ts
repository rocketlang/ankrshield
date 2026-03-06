/**
 * usePhoneRisk — hook to check & report phone numbers against XS-SATOI API.
 */

import { useCallback, useState } from 'react';

const API_BASE = 'https://xshieldai.com/api';
const CACHE = new Map<string, { result: PhoneRiskResult; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

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
      const res = await fetch(`${API_BASE}/risk/phone?number=${encodeURIComponent(key)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: PhoneRiskResult = await res.json();
      CACHE.set(key, { result, ts: Date.now() });
      return result;
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
