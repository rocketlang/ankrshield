/**
 * Re-export bridge for India threat intel and phishing kit detectors.
 * Used internally within the API app while the main package index.ts
 * is updated to include these new exports.
 */
export {
  checkIndiaThreatIntel,
  indiaThreatToFactors,
} from '../../../../packages/risk-intelligence/src/detectors/india-threat-intel.js';
export type { IndiaThreatResult } from '../../../../packages/risk-intelligence/src/detectors/india-threat-intel.js';

export {
  fingerprintPhishingKit,
  phishingKitToFactors,
} from '../../../../packages/risk-intelligence/src/detectors/phishing-kit.js';
export type { PhishingKitResult } from '../../../../packages/risk-intelligence/src/detectors/phishing-kit.js';
