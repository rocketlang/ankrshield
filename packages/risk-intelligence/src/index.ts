/**
 * @ankrshield/risk-intelligence
 *
 * Digital risk intelligence engine providing:
 *   - IP reputation via GreyNoise Community API (free, no auth)
 *   - Attack surface enumeration via Shodan Host API (free API key)
 *   - Breach monitoring via HIBP public breach list (free, no auth)
 *   - Phishing / typosquat detection via urlscan.io (free, no auth)
 *
 * Usage:
 *   import { runRiskEngine } from '@ankrshield/risk-intelligence';
 *   const report = await runRiskEngine({ domain: 'example.com' });
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

// ---------------------------------------------------------------------------
// Individual detectors (usable independently)
// ---------------------------------------------------------------------------
export { scanIpWithGreyNoise, greyNoiseToFactors } from './detectors/greynoise-scanner.js';
export { scanIpWithShodan, shodanToFactors } from './detectors/shodan-scanner.js';
export { checkDomainBreaches, breachesToFactors } from './detectors/breach-monitor.js';
export { scanDomainThreats, domainThreatsToFactors } from './detectors/domain-guard.js';

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------
export { runRiskEngine } from './risk-engine.js';
