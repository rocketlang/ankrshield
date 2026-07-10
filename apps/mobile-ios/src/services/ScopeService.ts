/**
 * ScopeService — per-app scope verdicts (ASCT-T2.3).
 *
 * Every verdict is COMPUTE (counts from the on-device ledger) plus QUOTE
 * (tracker-db categories/vendors carried on each row) plus NULL said out
 * loud (unattributed events, bypassed apps). Nothing here is inferred:
 * no ML, no heuristics — a domain either matched a tracker-db row or it
 * didn't, and an event either carried a kernel-attributed app or it didn't.
 *
 * Verdict statuses:
 *   TRACKED_BEYOND_SCOPE — app contacted tracker-db-matched endpoints
 *   NO_KNOWN_TRACKERS    — contacts observed, none matched the tracker db
 *                          (NOT a safety claim: "no known tracker", stated as such)
 *   UNWITNESSED          — app is bypassed (banking auto-exclusion or user choice);
 *                          we saw nothing and say so — never counted safe
 *   NO_DATA              — no observed contacts yet
 */

import { vpnService, InstalledApp, ScopeDetailRow } from './VpnService';

export type ScopeStatus = 'TRACKED_BEYOND_SCOPE' | 'NO_KNOWN_TRACKERS' | 'UNWITNESSED' | 'NO_DATA';

export interface AppScopeVerdict {
  packageName: string;
  appName: string;
  status: ScopeStatus;
  /** Contacts to tracker-db-matched endpoints (blocked + allowed attempts). */
  beyondScope: number;
  /** How many of those the shield actually blocked. */
  beyondBlocked: number;
  totalContacts: number;
  vendorCount: number;
  /** 1-4 from tracker-db risk_level; 3+ = stalkerware/APT territory. */
  maxRisk: number;
  critical: boolean;
  autoBypassed: boolean;
  firstTs: number;
  lastTs: number;
}

export interface ScopeReport {
  verdicts: AppScopeVerdict[];
  /** Events the kernel could not attribute to an app (Android <10, system flows). */
  unattributed: { contacts: number; beyondScope: number } | null;
  /** Share of observed contacts that could not be attributed — honesty line. */
  nullShare: number;
  generatedAt: number;
}

/** risk_level threshold where a verdict escalates to CRITICAL (stalkerware=4, apt≥3). */
const CRITICAL_RISK = 3;

export async function buildScopeReport(): Promise<ScopeReport> {
  const [summary, installed] = await Promise.all([
    vpnService.getScopeSummary(),
    vpnService.getInstalledApps(),
  ]);

  const byPkg = new Map<string, InstalledApp>();
  for (const app of installed) {
    byPkg.set(app.packageName, app);
  }

  const verdicts: AppScopeVerdict[] = [];
  let unattributed: ScopeReport['unattributed'] = null;
  let totalContacts = 0;
  let unattributedContacts = 0;

  for (const row of summary) {
    totalContacts += row.contacts;
    if (!row.app) {
      unattributedContacts += row.contacts;
      unattributed = { contacts: row.contacts, beyondScope: row.beyondScope };
      continue;
    }
    // Shared UIDs arrive comma-joined; verdict binds to the honest set
    const firstPkg = row.app.split(',')[0];
    const meta = byPkg.get(firstPkg);
    verdicts.push({
      packageName: row.app,
      appName: meta?.appName ?? row.app,
      status: row.beyondScope > 0 ? 'TRACKED_BEYOND_SCOPE' : 'NO_KNOWN_TRACKERS',
      beyondScope: row.beyondScope,
      beyondBlocked: row.beyondBlocked,
      totalContacts: row.contacts,
      vendorCount: row.vendorCount,
      maxRisk: row.maxRisk,
      critical: row.maxRisk >= CRITICAL_RISK,
      autoBypassed: false,
      firstTs: row.firstTs,
      lastTs: row.lastTs,
    });
  }

  // Bypassed apps: unwitnessed, never safe (ASCT-003)
  const seen = new Set(verdicts.map((v) => v.packageName.split(',')[0]));
  for (const app of installed) {
    if (app.bypassed && !seen.has(app.packageName)) {
      verdicts.push({
        packageName: app.packageName,
        appName: app.appName,
        status: 'UNWITNESSED',
        beyondScope: 0,
        beyondBlocked: 0,
        totalContacts: 0,
        vendorCount: 0,
        maxRisk: 0,
        critical: false,
        autoBypassed: !!app.autoBypassed,
        firstTs: 0,
        lastTs: 0,
      });
    }
  }

  // Worst first: critical, then beyond-scope volume, then unwitnessed last
  verdicts.sort((a, b) => {
    if (a.critical !== b.critical) {
      return a.critical ? -1 : 1;
    }
    if ((a.status === 'UNWITNESSED') !== (b.status === 'UNWITNESSED')) {
      return a.status === 'UNWITNESSED' ? 1 : -1;
    }
    return b.beyondScope - a.beyondScope;
  });

  return {
    verdicts,
    unattributed,
    nullShare: totalContacts > 0 ? unattributedContacts / totalContacts : 0,
    generatedAt: Date.now(),
  };
}

/** Receipts for one app — the cited rows behind its verdict. */
export async function getReceipts(packageName: string): Promise<ScopeDetailRow[]> {
  return vpnService.getScopeDetail(packageName);
}
