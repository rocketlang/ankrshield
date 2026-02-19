/**
 * Risk Engine — Aggregate all signals → 0–100 risk score → risk level
 *
 * Runs all data-source scanners in parallel and merges their RiskFactor
 * outputs into a single composite risk score using capped weighted
 * accumulation (so multiple weak signals don't inflate beyond one strong one).
 *
 * Sources:
 *   - GreyNoise Community (IP reputation, free/no auth)
 *   - AlienVault OTX     (IP + domain reputation, free API key)
 *   - Shodan             (attack surface, free API key)
 *   - HIBP               (breach monitoring, free/no auth)
 *   - urlscan.io         (phishing detection, free/no auth)
 *   - crt.sh             (certificate transparency, free/no auth)
 *   - DNS validation     (typosquat DNS registration, no API)
 *   - Paste monitor      (data leak detection, free/no auth)
 *   - DNS security audit (SPF/DMARC/DNSSEC/CAA, no API)
 *   - OpenPhish/SURBL    (active phishing feeds, free/no auth)
 *   - ip-api.com         (ASN / geopolitical risk, free/no auth)
 *   - GitHub code search (secret exposure dorks, free token)
 *
 * Score → Level:
 *   0–14   : minimal
 *   15–34  : low
 *   35–54  : medium
 *   55–74  : high
 *   75–100 : critical
 */

import { randomUUID } from 'crypto';
import { promises as dns } from 'dns';

import { lookupAsnReputation, asnToFactors } from './detectors/asn-reputation.js';
import { checkDomainBreaches, breachesToFactors } from './detectors/breach-monitor.js';
import { checkCanaryFiles, canaryToFactors } from './detectors/canary-detector.js';
import { monitorCertTransparency, certRecordsToFactors } from './detectors/cert-transparency.js';
import { auditDnsSecurity, dnsAuditToFactors } from './detectors/dns-security-audit.js';
import { validateTyposquats, typosquatsToFactors } from './detectors/dns-validator.js';
import { scanDomainThreats, domainThreatsToFactors } from './detectors/domain-guard.js';
import { checkDirectoryEntropy, entropyToFactors } from './detectors/entropy-detector.js';
import { scanGithubSecrets, githubLeaksToFactors } from './detectors/github-dork.js';
import { scanIpWithGreyNoise, greyNoiseToFactors } from './detectors/greynoise-scanner.js';
import { scanIpWithOtx, scanDomainWithOtx, otxToFactors } from './detectors/otx-scanner.js';
import { searchPastes, pasteHitsToFactors } from './detectors/paste-monitor.js';
import { checkPhishingFeeds, phishingHitsToFactors } from './detectors/phishing-feeds.js';
import { checkRansomwareFeeds, ransomwareToFactors } from './detectors/ransomware-detector.js';
import { scanIpWithShodan, shodanToFactors } from './detectors/shodan-scanner.js';
import { generateThreatNarrative } from './threat-narrative.js';
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
// Score aggregation (diminishing returns)
// ---------------------------------------------------------------------------

function aggregateScore(factors: RiskFactor[]): number {
  if (factors.length === 0) return 0;
  const sorted = [...factors].sort((a, b) => b.score - a.score);
  let score = sorted[0].score;
  let weight = 0.5;
  for (let i = 1; i < sorted.length; i++) {
    score += sorted[i].score * weight;
    weight *= 0.7;
  }
  return Math.min(Math.round(score), 100);
}

// ---------------------------------------------------------------------------
// IP / DNS helpers
// ---------------------------------------------------------------------------

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

async function resolveIp(domain: string): Promise<string | null> {
  if (IP_RE.test(domain)) return domain;
  try {
    const addresses = await dns.resolve4(domain);
    return addresses[0] ?? null;
  } catch {
    return null;
  }
}

async function resolveAllIps(domain: string): Promise<string[]> {
  if (IP_RE.test(domain)) return [domain];
  try {
    return await dns.resolve4(domain);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export async function runRiskEngine(options: RiskEngineOptions): Promise<RiskReport> {
  const start = Date.now();
  const { domain } = options;

  const enableGreyNoise = options.enableGreyNoise ?? true;
  const enableShodan = options.enableShodan ?? true;
  const enableHibp = options.enableHibp ?? true;
  const enableUrlscan = options.enableUrlscan ?? true;
  const enableOtx = options.enableOtx ?? true;
  const enableCert = options.enableCertTransparency ?? true;
  const enableDns = options.enableDnsValidation ?? true;
  const enablePaste = options.enablePasteMonitor ?? true;
  const enableDnsSecurity = options.enableDnsSecurity ?? true;
  const enablePhishFeeds = options.enablePhishFeeds ?? true;
  const enableAsnReputation = options.enableAsnReputation ?? true;
  const enableGithubDork = options.enableGithubDork ?? true;
  const enableRansomware = options.enableRansomware ?? true;
  const enableCanary = options.enableCanary ?? false; // opt-in: only on local endpoints
  const enableEntropy = options.enableEntropy ?? false; // opt-in: only on local endpoints

  const enableThreatNarrative = options.enableThreatNarrative ?? true;
  const otxApiKey = options.otxApiKey ?? process.env['OTX_API_KEY'];
  const githubToken = options.githubToken ?? process.env['GITHUB_TOKEN'];
  const anthropicApiKey = options.anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'];

  // Resolve server IP
  const serverIp = options.serverIp ?? (await resolveIp(domain));
  const legitimateIps = IP_RE.test(domain) ? [domain] : await resolveAllIps(domain);

  // Run all checks in parallel
  const [
    greyNoiseResult,
    shodanResult,
    otxIpResult,
    otxDomainResult,
    breaches,
    domainThreats,
    suspiciousCerts,
    registeredTyposquats,
    pasteHits,
    dnsSecurityReport,
    phishingHits,
    asnRecord,
    githubLeaks,
    ransomwareResult,
    canaryResult,
    entropyReports,
  ] = await Promise.all([
    enableGreyNoise && serverIp ? scanIpWithGreyNoise(serverIp) : Promise.resolve(null),
    enableShodan && serverIp
      ? scanIpWithShodan(serverIp, options.shodanApiKey)
      : Promise.resolve(null),
    enableOtx && serverIp ? scanIpWithOtx(serverIp, otxApiKey) : Promise.resolve(null),
    enableOtx && !IP_RE.test(domain) ? scanDomainWithOtx(domain, otxApiKey) : Promise.resolve(null),
    enableHibp && !IP_RE.test(domain) ? checkDomainBreaches(domain) : Promise.resolve([]),
    enableUrlscan && !IP_RE.test(domain) ? scanDomainThreats(domain) : Promise.resolve([]),
    enableCert && !IP_RE.test(domain) ? monitorCertTransparency(domain) : Promise.resolve([]),
    enableDns && !IP_RE.test(domain)
      ? validateTyposquats(domain, legitimateIps)
      : Promise.resolve([]),
    enablePaste && !IP_RE.test(domain) ? searchPastes(domain) : Promise.resolve([]),
    enableDnsSecurity && !IP_RE.test(domain) ? auditDnsSecurity(domain) : Promise.resolve(null),
    enablePhishFeeds && !IP_RE.test(domain) ? checkPhishingFeeds(domain) : Promise.resolve([]),
    enableAsnReputation && serverIp ? lookupAsnReputation(serverIp) : Promise.resolve(null),
    enableGithubDork && !IP_RE.test(domain)
      ? scanGithubSecrets(domain, githubToken)
      : Promise.resolve([]),
    enableRansomware ? checkRansomwareFeeds(serverIp, domain) : Promise.resolve(null),
    enableCanary ? checkCanaryFiles(options.canaryPaths) : Promise.resolve(null),
    enableEntropy ? checkDirectoryEntropy(options.entropyDirectories) : Promise.resolve(null),
  ]);

  // Collect all risk factors
  const factors: RiskFactor[] = [];

  if (greyNoiseResult) factors.push(...greyNoiseToFactors(greyNoiseResult));
  if (shodanResult) factors.push(...shodanToFactors(shodanResult.services, shodanResult.rawPorts));
  if (otxIpResult) factors.push(...otxToFactors(otxIpResult, 'IP'));
  if (otxDomainResult) factors.push(...otxToFactors(otxDomainResult, 'domain'));
  factors.push(...breachesToFactors(breaches, domain));
  factors.push(...domainThreatsToFactors(domainThreats, domain));
  factors.push(...certRecordsToFactors(suspiciousCerts, domain));
  factors.push(...typosquatsToFactors(registeredTyposquats, domain));
  factors.push(...pasteHitsToFactors(pasteHits, domain));
  if (dnsSecurityReport) factors.push(...dnsAuditToFactors(dnsSecurityReport));
  factors.push(...phishingHitsToFactors(phishingHits, domain));
  if (asnRecord) factors.push(...asnToFactors(asnRecord));
  factors.push(...githubLeaksToFactors(githubLeaks, domain));
  if (ransomwareResult) factors.push(...ransomwareToFactors(ransomwareResult));
  if (canaryResult) factors.push(...canaryToFactors(canaryResult));
  if (entropyReports) factors.push(...entropyToFactors(entropyReports));

  const riskScore = aggregateScore(factors);
  const riskLevel = scoreToLevel(riskScore);

  // Build partial report to pass to narrative generator
  const partialReport = {
    id: '',
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
    otx: otxIpResult ?? otxDomainResult,
    suspiciousCerts,
    registeredTyposquats,
    pasteHits,
    dnsSecurityReport,
    phishingHits,
    asnRecord,
    githubLeaks,
    ransomwareResult,
    canaryResult,
    entropyReports,
    threatNarrative: null,
    durationMs: 0,
  };

  // Generate AI narrative (runs after all parallel checks complete)
  const threatNarrative = enableThreatNarrative
    ? await generateThreatNarrative(partialReport, anthropicApiKey)
    : null;

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
    otx: otxIpResult ?? otxDomainResult,
    suspiciousCerts,
    registeredTyposquats,
    pasteHits,
    dnsSecurityReport,
    phishingHits,
    asnRecord,
    githubLeaks,
    ransomwareResult,
    canaryResult,
    entropyReports,
    threatNarrative,
    durationMs: Date.now() - start,
  };
}
