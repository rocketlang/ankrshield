/**
 * @ankrshield/risk-intelligence — Type definitions
 *
 * Digital risk intelligence: breach monitoring, IP reputation,
 * attack surface enumeration, and brand / domain protection.
 */

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

/** Overall risk level derived from 0–100 score. */
export type RiskLevel = 'minimal' | 'low' | 'medium' | 'high' | 'critical';

/**
 * A single contributing risk signal.
 * score: 0–100, how severely this factor increases overall risk.
 */
export interface RiskFactor {
  /** Short machine-readable category */
  category:
    | 'malicious_ip'
    | 'exposed_service'
    | 'known_breach'
    | 'phishing_domain'
    | 'typosquat'
    | 'open_port'
    | 'outdated_software'
    | 'shodan_indexed'
    | 'scanner_activity';
  /** Human-readable summary of the finding */
  summary: string;
  /** Severity contribution 0–100 */
  score: number;
  /** Source that produced this finding */
  source: 'greynoise' | 'shodan' | 'hibp' | 'urlscan' | 'internal';
  /** Optional raw detail (URL, IP, port, domain, etc.) */
  detail?: string;
}

// ---------------------------------------------------------------------------
// Sub-reports from each data source
// ---------------------------------------------------------------------------

/** Classification of an IP from GreyNoise Community API. */
export interface GreyNoiseResult {
  ip: string;
  /** 'malicious' | 'benign' | 'unknown' — GreyNoise terminology */
  classification: 'malicious' | 'benign' | 'unknown';
  /** True when GreyNoise has seen recent scanning activity from this IP */
  noise: boolean;
  /** True when the IP is a known security researcher scanner */
  riot: boolean;
  /** Human-readable name of the organisation (if known) */
  name: string;
  /** When GreyNoise last saw activity from this IP */
  lastSeen: string | null;
}

/** An internet-exposed service discovered via Shodan. */
export interface ExposedService {
  port: number;
  protocol: 'tcp' | 'udp';
  /** Service banner / product name if identified */
  product: string;
  /** Software version if identified */
  version: string;
  /** Associated CVEs for this service, if any */
  cves: string[];
}

/** A public breach record where the target domain appeared (HIBP). */
export interface BreachRecord {
  /** Breach name as used by HIBP */
  name: string;
  /** ISO-8601 date of the breach */
  breachDate: string;
  /** Number of accounts compromised */
  pwnCount: number;
  /** Data classes exposed (e.g. 'Email addresses', 'Passwords') */
  dataClasses: string[];
}

/** A potentially phishing or typosquatting domain found via urlscan.io. */
export interface DomainThreat {
  /** The suspicious domain name */
  domain: string;
  /** URL that was scanned */
  url: string;
  /** urlscan verdict: 'malicious' | 'suspicious' | 'safe' | 'unrated' */
  verdict: 'malicious' | 'suspicious' | 'safe' | 'unrated';
  /** Screenshot URL from urlscan.io (if available) */
  screenshotUrl: string | null;
  /** ISO-8601 scan timestamp */
  scannedAt: string;
}

// ---------------------------------------------------------------------------
// Aggregate risk report
// ---------------------------------------------------------------------------

/**
 * Full risk intelligence report for a given domain / IP pair.
 */
export interface RiskReport {
  /** Unique report identifier (UUID v4) */
  id: string;
  /** ISO-8601 timestamp when the report was generated */
  generatedAt: string;
  /** Domain that was assessed */
  domain: string;
  /** Server IP that was assessed (may be null if lookup failed) */
  serverIp: string | null;

  /** Aggregate 0–100 risk score (higher = worse) */
  riskScore: number;
  /** Human-readable risk level */
  riskLevel: RiskLevel;

  /** Individual risk signals that contributed to the score */
  factors: RiskFactor[];

  /** GreyNoise classification of the server IP */
  greynoise: GreyNoiseResult | null;

  /** Internet-exposed services on the server IP (from Shodan) */
  exposedServices: ExposedService[];

  /** Public data breaches that include the assessed domain */
  breaches: BreachRecord[];

  /** Phishing / typosquat domains found that target this domain */
  domainThreats: DomainThreat[];

  /** OTX threat intelligence result for the server IP */
  otx: import('./detectors/otx-scanner.js').OtxResult | null;

  /** SSL certs issued for lookalike domains (cert transparency) */
  suspiciousCerts: import('./detectors/cert-transparency.js').CertRecord[];

  /** Typosquat domains that are actually registered (DNS-verified) */
  registeredTyposquats: import('./detectors/dns-validator.js').RegisteredTyposquat[];

  /** Paste site hits mentioning this domain */
  pasteHits: import('./detectors/paste-monitor.js').PasteHit[];

  /** Time taken to assemble the report, in milliseconds */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Engine options
// ---------------------------------------------------------------------------

export interface RiskEngineOptions {
  /** Domain to assess (e.g. 'example.com') */
  domain: string;
  /**
   * Server IP to assess. If omitted the engine will attempt a DNS A-record
   * lookup of the domain to find the server IP automatically.
   */
  serverIp?: string;
  /** Shodan API key (free account at shodan.io). Required for Shodan checks. */
  shodanApiKey?: string;
  /** AlienVault OTX API key (free at otx.alienvault.com). */
  otxApiKey?: string;
  /** Disable individual sub-checks */
  enableGreyNoise?: boolean;
  enableShodan?: boolean;
  enableHibp?: boolean;
  enableUrlscan?: boolean;
  enableOtx?: boolean;
  enableCertTransparency?: boolean;
  enableDnsValidation?: boolean;
  enablePasteMonitor?: boolean;
}
