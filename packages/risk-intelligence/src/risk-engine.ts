/**
 * Risk Engine — Aggregate all signals → 0–100 risk score → risk level
 *
 * Runs all four data-source scanners in parallel, merges their RiskFactor
 * outputs, and computes a single composite risk score using a capped weighted
 * accumulation (not a plain average, to ensure multiple weak signals don't
 * inflate the score beyond a single strong one).
 *
 * Score → Level mapping:
 *   0–14   : minimal
 *   15–34  : low
 *   35–54  : medium
 *   55–74  : high
 *   75–100 : critical
 */

import { randomUUID } from 'crypto';
import { promises as dns } from 'dns';

import { checkDomainBreaches, breachesToFactors } from './detectors/breach-monitor.js';
import { scanDomainThreats, domainThreatsToFactors } from './detectors/domain-guard.js';
import { scanIpWithGreyNoise, greyNoiseToFactors } from './detectors/greynoise-scanner.js';
import { scanIpWithShodan, shodanToFactors } from './detectors/shodan-scanner.js';
import type { RiskEngineOptions, RiskFactor, RiskLevel, RiskReport } from './types.js';

// ---------------------------------------------------------------------------
// Score → Level
// ---------------------------------------------------------------------------

function scoreToLevel(score: number): RiskLevel {
  if (score < 15) return 'minimal';
  if (score < 35) return 'low';
  if (score < 55) return 'medium';
  if (score < 75) return 'high';
  return 'critical';
}

// ---------------------------------------------------------------------------
// Score aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate multiple risk factors into a single 0–100 score.
 *
 * Approach: sort factors descending by score, take the highest as a base,
 * then add 50% of each subsequent factor — so duplicate signals don't linearly
 * inflate the score.
 */
function aggregateScore(factors: RiskFactor[]): number {
  if (factors.length === 0) return 0;

  const sorted = [...factors].sort((a, b) => b.score - a.score);
  let score = sorted[0].score; // highest signal as base

  let weight = 0.5;
  for (let i = 1; i < sorted.length; i++) {
    score += sorted[i].score * weight;
    weight *= 0.7; // diminishing returns
  }

  return Math.min(Math.round(score), 100);
}

// ---------------------------------------------------------------------------
// IP resolution
// ---------------------------------------------------------------------------

async function resolveIp(domain: string): Promise<string | null> {
  try {
    const addresses = await dns.resolve4(domain);
    return addresses[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

/**
 * Run a full risk intelligence assessment for the given domain and (optionally)
 * its server IP. Returns a complete RiskReport.
 */
export async function runRiskEngine(options: RiskEngineOptions): Promise<RiskReport> {
  const start = Date.now();
  const { domain } = options;

  const enableGreyNoise = options.enableGreyNoise ?? true;
  const enableShodan = options.enableShodan ?? true;
  const enableHibp = options.enableHibp ?? true;
  const enableUrlscan = options.enableUrlscan ?? true;

  // Resolve server IP if not provided
  const serverIp = options.serverIp ?? (await resolveIp(domain));

  // Run all checks in parallel
  const [greyNoiseResult, shodanResult, breaches, domainThreats] = await Promise.all([
    enableGreyNoise && serverIp ? scanIpWithGreyNoise(serverIp) : Promise.resolve(null),
    enableShodan && serverIp
      ? scanIpWithShodan(serverIp, options.shodanApiKey)
      : Promise.resolve(null),
    enableHibp ? checkDomainBreaches(domain) : Promise.resolve([]),
    enableUrlscan ? scanDomainThreats(domain) : Promise.resolve([]),
  ]);

  // Collect all risk factors
  const factors: RiskFactor[] = [];

  if (greyNoiseResult) {
    factors.push(...greyNoiseToFactors(greyNoiseResult));
  }

  if (shodanResult) {
    factors.push(...shodanToFactors(shodanResult.services, shodanResult.rawPorts));
  }

  factors.push(...breachesToFactors(breaches, domain));
  factors.push(...domainThreatsToFactors(domainThreats, domain));

  // Compute score
  const riskScore = aggregateScore(factors);
  const riskLevel = scoreToLevel(riskScore);

  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    domain,
    serverIp,
    riskScore,
    riskLevel,
    factors,
    greynoise: greyNoiseResult,
    exposedServices: shodanResult?.services ?? [],
    breaches,
    domainThreats,
    durationMs: Date.now() - start,
  };
}
