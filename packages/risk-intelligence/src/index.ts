/**
 * @ankrshield/risk-intelligence
 *
 * Enterprise digital risk intelligence engine — surpassing Resecurity ($50K/year):
 *   - IP reputation      — GreyNoise Community (free/no auth) + AlienVault OTX (free key)
 *   - Attack surface     — Shodan Host API (free key)
 *   - Breach monitoring  — HIBP public breach list (free/no auth)
 *   - Phishing detection — urlscan.io (free/no auth)
 *   - Cert transparency  — crt.sh (free/no auth) — finds lookalike SSL certs
 *   - DNS typosquats     — DNS A-record validation (no API)
 *   - Paste monitoring   — psbdmp.ws (free/no auth) — data leak detection
 *   - DNS security audit — SPF/DMARC/DNSSEC/CAA (no API)
 *   - Active phishing    — OpenPhish + SURBL + PhishStats (free/no auth)
 *   - ASN reputation     — ip-api.com + bulletproof ASN + geopolitical risk (free)
 *   - Secret exposure    — GitHub code dorks for .env / credentials (free token)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  RiskLevel,
  RiskFactor,
  GreyNoiseResult,
  ExposedService,
  BreachRecord,
  DomainThreat,
  RiskReport,
  RiskEngineOptions,
} from './types.js';

export type { OtxResult } from './detectors/otx-scanner.js';
export type { CertRecord } from './detectors/cert-transparency.js';
export type { RegisteredTyposquat } from './detectors/dns-validator.js';
export type { PasteHit } from './detectors/paste-monitor.js';
export type { DnsSecurityReport } from './detectors/dns-security-audit.js';
export type { PhishingHit } from './detectors/phishing-feeds.js';
export type { AsnRecord } from './detectors/asn-reputation.js';
export type { GithubLeakHit } from './detectors/github-dork.js';
export type { ThreatNarrative } from './threat-narrative.js';

// ---------------------------------------------------------------------------
// Individual detectors (usable independently)
// ---------------------------------------------------------------------------
export { scanIpWithGreyNoise, greyNoiseToFactors } from './detectors/greynoise-scanner.js';
export { scanIpWithShodan, shodanToFactors } from './detectors/shodan-scanner.js';
export { scanIpWithOtx, scanDomainWithOtx, otxToFactors } from './detectors/otx-scanner.js';
export { checkDomainBreaches, breachesToFactors } from './detectors/breach-monitor.js';
export { scanDomainThreats, domainThreatsToFactors } from './detectors/domain-guard.js';
export { monitorCertTransparency, certRecordsToFactors } from './detectors/cert-transparency.js';
export { validateTyposquats, typosquatsToFactors } from './detectors/dns-validator.js';
export { searchPastes, pasteHitsToFactors } from './detectors/paste-monitor.js';
export { auditDnsSecurity, dnsAuditToFactors } from './detectors/dns-security-audit.js';
export { checkPhishingFeeds, phishingHitsToFactors } from './detectors/phishing-feeds.js';
export { lookupAsnReputation, asnToFactors } from './detectors/asn-reputation.js';
export { scanGithubSecrets, githubLeaksToFactors } from './detectors/github-dork.js';
export { checkRansomwareFeeds, ransomwareToFactors } from './detectors/ransomware-detector.js';
export type {
  RansomwareResult,
  FeodoEntry,
  ThreatFoxIoc,
} from './detectors/ransomware-detector.js';
export {
  checkCanaryFiles,
  canaryToFactors,
  CanaryManager,
  DEFAULT_CANARY_PATHS,
} from './detectors/canary-detector.js';
export type { CanaryFile, CanaryEvent, CanaryResult } from './detectors/canary-detector.js';
export {
  checkDirectoryEntropy,
  analyzeDirectoryEntropy,
  analyzeFileEntropy,
  calculateEntropy,
  entropyToFactors,
} from './detectors/entropy-detector.js';
export type { FileEntropyResult, EntropyReport } from './detectors/entropy-detector.js';
export { generateThreatNarrative } from './threat-narrative.js';

// ---------------------------------------------------------------------------
// Social / Messaging / QR threat detectors (v0.7.0)
// ---------------------------------------------------------------------------
export { checkQrThreat, qrToFactors } from './detectors/qr-detector.js';
export type { QrThreatResult, QrSignal } from './detectors/qr-detector.js';

export {
  checkExfilConnection,
  checkExfilConnections,
  exfilToFactors,
} from './detectors/discord-exfil-detector.js';
export type { ExfilConnection, ExfilResult } from './detectors/discord-exfil-detector.js';

export { checkSocialC2, socialC2ToFactors } from './detectors/social-c2-detector.js';
export type { SocialC2Result } from './detectors/social-c2-detector.js';

export {
  checkBrandImpersonation,
  analyseCandidateForBrand,
  brandToFactors,
  compareVisualSimilarity,
} from './detectors/social-brand-monitor.js';
export type { BrandFinding, BrandMonitorResult } from './detectors/social-brand-monitor.js';

// ---------------------------------------------------------------------------
// Supply Chain Scanner (v0.8.0)
// ---------------------------------------------------------------------------
export { scanSupplyChain, parseManifest } from './detectors/supply-chain-scanner.js';
export type {
  SupplyChainEcosystem,
  PackageCheck,
  SupplyChainFinding,
  PackageRisk,
  SupplyChainReport,
} from './detectors/supply-chain-scanner.js';

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------
export { runRiskEngine } from './risk-engine.js';

// ---------------------------------------------------------------------------
// Social Threat → AI Warrior bridge
// ---------------------------------------------------------------------------
export { socialThreatsToWarriorEvents } from './social-warrior-bridge.js';
export type { SocialThreatEvent } from './social-warrior-bridge.js';

// ---------------------------------------------------------------------------
// Remediation Playbook Engine
// ---------------------------------------------------------------------------
export { buildRemediationPlaybook } from './playbooks/remediation-engine.js';
export type {
  RemediationPlaybook,
  RemediationAction,
  RemediationStep,
  DNSRecord,
} from './playbooks/remediation-engine.js';
