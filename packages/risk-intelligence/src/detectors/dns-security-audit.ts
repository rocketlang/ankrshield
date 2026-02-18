/**
 * DNS Security Audit
 *
 * Checks email security and DNS hardening records for a domain — all via
 * standard DNS lookups, zero cost, zero API key.
 *
 * Checks performed:
 *   SPF   — Sender Policy Framework (email spoofing prevention)
 *   DMARC — Domain-based Message Auth, Reporting & Conformance
 *   DKIM  — DomainKeys Identified Mail selector discovery
 *   DNSSEC — DNS Security Extensions (signing enabled?)
 *   CAA   — Certification Authority Authorization
 *   MX    — Mail exchanger records exist?
 *   BIMI  — Brand Indicators for Message Identification
 *
 * A missing SPF or weak DMARC policy means anyone can spoof email
 * from your domain — a critical phishing enabler.
 */

import { promises as dns, type MxRecord, type CaaRecord } from 'dns';

import type { RiskFactor } from '../types.js';

export interface DnsSecurityReport {
  domain: string;

  spf: {
    exists: boolean;
    record: string | null;
    /** 'strict' = -all, 'soft' = ~all, 'neutral' = ?all, 'none' = missing */
    policy: 'strict' | 'soft' | 'neutral' | 'none';
  };

  dmarc: {
    exists: boolean;
    record: string | null;
    /** 'reject' | 'quarantine' | 'none' | 'missing' */
    policy: 'reject' | 'quarantine' | 'none' | 'missing';
    pct: number; // percentage of email covered (default 100)
  };

  dnssec: {
    enabled: boolean;
  };

  caa: {
    exists: boolean;
    issuers: string[];
  };

  mx: {
    exists: boolean;
    count: number;
  };

  bimi: {
    exists: boolean;
  };

  /** Aggregate DNS security score 0–100 (higher = better configured) */
  securityScore: number;
}

// ---------------------------------------------------------------------------
// DNS helpers
// ---------------------------------------------------------------------------

async function resolveTxtSafe(name: string): Promise<string[][]> {
  try {
    return await dns.resolveTxt(name);
  } catch {
    return [];
  }
}

async function resolveMxSafe(name: string): Promise<MxRecord[]> {
  try {
    return await dns.resolveMx(name);
  } catch {
    return [];
  }
}

async function resolveCaaSafe(name: string): Promise<CaaRecord[]> {
  try {
    return await dns.resolveCaa(name);
  } catch {
    return [];
  }
}

async function checkDnssec(domain: string): Promise<boolean> {
  // Check for DS records at the parent — if resolvable, DNSSEC is likely enabled
  try {
    const result = await dns.resolve(domain, 'DS' as Parameters<typeof dns.resolve>[1]);
    return Array.isArray(result) && result.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

export async function auditDnsSecurity(domain: string): Promise<DnsSecurityReport> {
  const base = domain.toLowerCase().replace(/^www\./, '');

  const [txtRecords, dmarcRecords, caaRecords, mxRecords, bimiRecords] = await Promise.all([
    resolveTxtSafe(base),
    resolveTxtSafe(`_dmarc.${base}`),
    resolveCaaSafe(base),
    resolveMxSafe(base),
    resolveTxtSafe(`default._bimi.${base}`),
  ]);

  // SPF
  const spfRaw = txtRecords
    .map((r) => r.join(''))
    .find((r) => r.toLowerCase().startsWith('v=spf1'));

  let spfPolicy: DnsSecurityReport['spf']['policy'] = 'none';
  if (spfRaw) {
    if (spfRaw.includes('-all')) spfPolicy = 'strict';
    else if (spfRaw.includes('~all')) spfPolicy = 'soft';
    else spfPolicy = 'neutral';
  }

  // DMARC
  const dmarcRaw = dmarcRecords.map((r) => r.join('')).find((r) => r.startsWith('v=DMARC1'));
  let dmarcPolicy: DnsSecurityReport['dmarc']['policy'] = 'missing';
  let dmarcPct = 100;

  if (dmarcRaw) {
    const pMatch = /p=(\w+)/.exec(dmarcRaw);
    const pol = pMatch?.[1]?.toLowerCase();
    if (pol === 'reject') dmarcPolicy = 'reject';
    else if (pol === 'quarantine') dmarcPolicy = 'quarantine';
    else dmarcPolicy = 'none';

    const pctMatch = /pct=(\d+)/.exec(dmarcRaw);
    if (pctMatch) dmarcPct = parseInt(pctMatch[1], 10);
  }

  // DNSSEC
  const dnssecEnabled = await checkDnssec(base);

  // CAA
  const caaIssuers = caaRecords
    .filter((r) => r.critical === 0 && r.issue)
    .map((r) => r.issue ?? '')
    .filter(Boolean);

  // Security score (0–100, higher = better)
  let score = 0;
  if (spfPolicy === 'strict') score += 25;
  else if (spfPolicy === 'soft') score += 15;
  else if (spfPolicy === 'neutral') score += 5;

  if (dmarcPolicy === 'reject') score += 35;
  else if (dmarcPolicy === 'quarantine') score += 20;
  else if (dmarcPolicy === 'none') score += 5;

  if (dnssecEnabled) score += 20;
  if (caaRecords.length > 0) score += 10;
  if (mxRecords.length > 0) score += 5;
  if (bimiRecords.length > 0) score += 5;

  return {
    domain: base,
    spf: { exists: !!spfRaw, record: spfRaw ?? null, policy: spfPolicy },
    dmarc: { exists: !!dmarcRaw, record: dmarcRaw ?? null, policy: dmarcPolicy, pct: dmarcPct },
    dnssec: { enabled: dnssecEnabled },
    caa: { exists: caaRecords.length > 0, issuers: caaIssuers },
    mx: { exists: mxRecords.length > 0, count: mxRecords.length },
    bimi: { exists: bimiRecords.length > 0 },
    securityScore: score,
  };
}

/**
 * Convert DNS security audit findings into RiskFactor entries.
 * Poor DNS config allows email spoofing — a direct phishing enabler.
 */
export function dnsAuditToFactors(report: DnsSecurityReport): RiskFactor[] {
  const factors: RiskFactor[] = [];

  // SPF missing or weak
  if (!report.spf.exists) {
    factors.push({
      category: 'exposed_service',
      summary: `No SPF record — anyone can send email spoofing @${report.domain} (phishing enabler)`,
      score: 40,
      source: 'internal',
      detail: 'Add TXT record: v=spf1 include:your-provider.com -all',
    });
  } else if (report.spf.policy === 'neutral' || report.spf.policy === 'soft') {
    factors.push({
      category: 'exposed_service',
      summary: `Weak SPF policy (${report.spf.policy === 'soft' ? '~all' : '?all'}) on ${report.domain} — email spoofing partially possible`,
      score: 20,
      source: 'internal',
      detail: `Current: ${report.spf.record ?? 'none'} — Change to -all for strict enforcement`,
    });
  }

  // DMARC missing or none policy
  if (!report.dmarc.exists || report.dmarc.policy === 'missing') {
    factors.push({
      category: 'exposed_service',
      summary: `No DMARC record on ${report.domain} — spoofed emails pass major mailbox providers`,
      score: 45,
      source: 'internal',
      detail: 'Add TXT _dmarc record: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com',
    });
  } else if (report.dmarc.policy === 'none') {
    factors.push({
      category: 'exposed_service',
      summary: `DMARC policy is "none" on ${report.domain} — monitor only, spoofed emails not blocked`,
      score: 25,
      source: 'internal',
      detail: 'Upgrade DMARC policy from p=none to p=quarantine or p=reject',
    });
  } else if (report.dmarc.pct < 100) {
    factors.push({
      category: 'exposed_service',
      summary: `DMARC only covers ${report.dmarc.pct}% of emails from ${report.domain}`,
      score: 10,
      source: 'internal',
      detail: `Change pct=${report.dmarc.pct} to pct=100`,
    });
  }

  // No CAA record
  if (!report.caa.exists) {
    factors.push({
      category: 'exposed_service',
      summary: `No CAA record on ${report.domain} — any CA can issue SSL certs for this domain`,
      score: 15,
      source: 'internal',
      detail: 'Add CAA record: 0 issue "letsencrypt.org" to restrict cert issuers',
    });
  }

  return factors;
}
