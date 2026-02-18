/**
 * @ankrshield/spyware-detector
 *
 * Nation-state spyware detection engine.
 *
 * Detects Pegasus, Candiru, Predator, FinFisher, and Hermit via:
 *   - Network IOC matching (domains + IP prefixes)
 *   - Process name scanning
 *   - File artifact detection
 *   - DNS query analysis
 *
 * Quick start:
 *
 *   import { SpywareScanner } from '@ankrshield/spyware-detector';
 *
 *   const scanner = new SpywareScanner({ enableProcessScan: true });
 *   scanner.on('scan-complete', (result) => console.log(result));
 *
 *   const result = await scanner.scan(['suspicious-domain.com'], ['185.220.1.1']);
 *   console.log(result.isClean, result.severity, result.recommendations);
 */

// ---------------------------------------------------------------------------
// Types — re-exported for consumer convenience
// ---------------------------------------------------------------------------
export type {
  SpywareFamily,
  SpywareIndicatorType,
  SpywareSeverity,
  SpywareIndicator,
  SpywareScanResult,
  ScanOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// IOC databases (read-only; useful for tooling and custom integrations)
// ---------------------------------------------------------------------------
export {
  PEGASUS_DOMAINS,
  PEGASUS_IP_PREFIXES,
  PEGASUS_PROCESS_NAMES,
  PEGASUS_FILE_ARTIFACTS,
} from './iocs/pegasus-iocs.js';

export {
  CANDIRU_DOMAINS,
  CANDIRU_FILE_ARTIFACTS,
  PREDATOR_DOMAINS,
  FINFISHER_PROCESS_NAMES,
  FINFISHER_DOMAINS,
  HERMIT_PACKAGE_NAMES,
} from './iocs/other-spyware-iocs.js';

// ---------------------------------------------------------------------------
// Detectors (lower-level, for use in custom scan pipelines)
// ---------------------------------------------------------------------------
export { NetworkIOCDetector } from './detectors/network-detector.js';
export { ProcessDetector } from './detectors/process-detector.js';
export { FileArtifactDetector } from './detectors/file-detector.js';

// ---------------------------------------------------------------------------
// Main scanner + singleton factory
// ---------------------------------------------------------------------------
export { SpywareScanner, getDefaultScanner } from './scanner.js';
