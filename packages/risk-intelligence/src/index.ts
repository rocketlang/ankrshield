/**
 * @ankrshield/risk-intelligence
 *
 * Resecurity-equivalent digital risk intelligence engine:
 *   - IP reputation      — GreyNoise Community (free/no auth) + AlienVault OTX (free key)
 *   - Attack surface     — Shodan Host API (free key)
 *   - Breach monitoring  — HIBP public breach list (free/no auth)
 *   - Phishing detection — urlscan.io (free/no auth)
 *   - Cert transparency  — crt.sh (free/no auth) — finds lookalike SSL certs
 *   - DNS typosquats     — DNS A-record validation (no API)
 *   - Paste monitoring   — psbdmp.ws (free/no auth) — data leak detection
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

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------
export { runRiskEngine } from './risk-engine.js';
