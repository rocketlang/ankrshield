/**
 * @ankrshield/spyware-detector
 *
 * Threat detection engine covering:
 *   - Nation-state spyware (Pegasus, Candiru, Predator, FinFisher, Hermit)
 *   - APT group C2 infrastructure (Lazarus, APT41, Sandworm, Turla, APT28, APT33, Kimsuky)
 *   - Linux rootkits (BPFDoor, Symbiote, Reptile, Diamorphine, OrBit, HiddenWasp, XorDDoS)
 *   - CVE vulnerability detection (XZ Utils, DirtyPipe, PwnKit, DirtyCOW)
 *   - Live threat feeds (ThreatFox, Feodo Tracker — real-time APT IOCs)
 */

// ---------------------------------------------------------------------------
// Types
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
// IOC databases
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

export {
  LAZARUS_DOMAINS,
  LAZARUS_IP_PREFIXES,
  APT41_DOMAINS,
  APT41_IP_PREFIXES,
  SANDWORM_DOMAINS,
  SANDWORM_IP_PREFIXES,
  TURLA_DOMAINS,
  TURLA_IP_PREFIXES,
  APT28_DOMAINS,
  APT28_IP_PREFIXES,
  APT33_DOMAINS,
  APT33_IP_PREFIXES,
  KIMSUKY_DOMAINS,
  KIMSUKY_IP_PREFIXES,
} from './iocs/apt-iocs.js';

export {
  BPFDOOR_FILE_ARTIFACTS,
  BPFDOOR_MASQUERADE_NAMES,
  SYMBIOTE_LIBRARY_NAMES,
  REPTILE_FILE_ARTIFACTS,
  REPTILE_MODULE_NAMES,
  DIAMORPHINE_MODULE_NAMES,
  DIAMORPHINE_FILE_ARTIFACTS,
  ORBIT_FILE_ARTIFACTS,
  HIDDENWASP_FILE_ARTIFACTS,
  LIGHTNING_FRAMEWORK_FILE_ARTIFACTS,
  XORDDOS_FILE_ARTIFACTS,
  XORDDOS_PROCESS_NAMES,
  SUSPICIOUS_PRELOAD_BASENAMES,
  KNOWN_ROOTKIT_MODULES,
} from './iocs/linux-rootkit-iocs.js';

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------
export { NetworkIOCDetector } from './detectors/network-detector.js';
export { AptC2Detector } from './detectors/apt-detector.js';
export { ProcessDetector } from './detectors/process-detector.js';
export { FileArtifactDetector } from './detectors/file-detector.js';
export { LinuxRootkitDetector } from './detectors/linux-rootkit-detector.js';
export { CveDetector } from './detectors/cve-detector.js';
export { LiveIocDetector, getActivelyExploitedCves } from './live-ioc-feed.js';

// ---------------------------------------------------------------------------
// Main scanner + singleton factory
// ---------------------------------------------------------------------------
export { SpywareScanner, getDefaultScanner } from './scanner.js';
