/**
 * India Threat Intelligence Detector (X10)
 *
 * India-specific threat patterns:
 * 1. UPI/payment fraud: domains mimicking NPCI, UPI, BHIM, PhonePe, GPay, Paytm, SBI, HDFC, ICICI
 * 2. Indian government impersonation: aadhaar, digilocker, india.gov.in, mygov, cowin
 * 3. CERT-In advisories: fetch latest from cert-in.org.in and match domain patterns
 * 4. Indian telecom fraud patterns: fake DLT sender IDs (VM-SBIINB, AM-HDFCBK etc.)
 * 5. India-targeted ransomware: LockBit India targets, REvil India operations
 */

import type { RiskFactor } from '../types.js';

const TIMEOUT_MS = 5_000;
const CERT_IN_URL = 'https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES01';

// ---------------------------------------------------------------------------
// UPI / Payment brand keywords
// ---------------------------------------------------------------------------

const UPI_KEYWORDS = [
  'npci',
  'upi',
  'bhim',
  'phonepe',
  'gpay',
  'paytm',
  'googlepay',
  'amazonpay',
  'mobikwik',
] as const;

// ---------------------------------------------------------------------------
// Indian government impersonation keywords
// ---------------------------------------------------------------------------

const GOVT_KEYWORDS = [
  'aadhaar',
  'aadhar',
  'digilocker',
  'mygov',
  'cowin',
  'india-gov',
  'indiagov',
  'nsdl',
  'epfo',
  'irctc-india',
] as const;

// ---------------------------------------------------------------------------
// Telecom DLT sender ID fraud patterns
// ---------------------------------------------------------------------------

const TELECOM_FRAUD_KEYWORDS = [
  'vm-sbi',
  'am-hdfc',
  'vm-axis',
  'am-icici',
  'jio-alert',
  'airtel-alert',
  'bsnl-alert',
] as const;

// ---------------------------------------------------------------------------
// India-targeted ransomware families
// ---------------------------------------------------------------------------

const INDIA_RANSOMWARE_FAMILIES = ['lockbit', 'revil', 'darkside', 'conti', 'maze'] as const;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface IndiaThreatResult {
  /** True if the domain exhibits India-specific threat patterns */
  isIndiaTarget: boolean;
  /** Which pattern keywords/indicators matched */
  matchedPatterns: string[];
  /** True if domain matched against CERT-In advisory text */
  certInAdvisoryMatch: boolean;
  /** True if domain mimics UPI / payment brands */
  upiFraudIndicator: boolean;
  /** True if domain impersonates Indian government services */
  govtImpersonation: boolean;
  /** Composite risk score 0–100 */
  riskScore: number;
}

// ---------------------------------------------------------------------------
// CERT-In advisory fetch (graceful fallback)
// ---------------------------------------------------------------------------

async function fetchCertInAdvisoryText(): Promise<string> {
  try {
    const res = await fetch(CERT_IN_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

/**
 * Check a domain against India-specific threat intelligence patterns.
 */
export async function checkIndiaThreatIntel(
  domain: string,
  ip?: string
): Promise<IndiaThreatResult> {
  const domainLower = domain.toLowerCase();
  const matchedPatterns: string[] = [];
  let upiFraudIndicator = false;
  let govtImpersonation = false;
  let certInAdvisoryMatch = false;

  // 1. UPI / payment fraud check
  for (const kw of UPI_KEYWORDS) {
    if (domainLower.includes(kw)) {
      // Only flag as fraud if it's NOT one of the legitimate brand domains
      const legitimateDomains = [
        'phonepe.com',
        'paytm.com',
        'npci.org.in',
        'bhimupi.org.in',
        'googlepay.com',
        'pay.google.com',
        'amazon.in',
        'mobikwik.com',
      ];
      const isLegit = legitimateDomains.some(
        (ld) => domainLower === ld || domainLower.endsWith(`.${ld}`)
      );
      if (!isLegit) {
        upiFraudIndicator = true;
        matchedPatterns.push(`upi-fraud:${kw}`);
      }
    }
  }

  // 2. Government impersonation check
  for (const kw of GOVT_KEYWORDS) {
    if (domainLower.includes(kw)) {
      const legitimateDomains = [
        'uidai.gov.in',
        'digilocker.gov.in',
        'mygov.in',
        'cowin.gov.in',
        'nsdl.co.in',
        'epfindia.gov.in',
        'irctc.co.in',
        'india.gov.in',
      ];
      const isLegit = legitimateDomains.some(
        (ld) => domainLower === ld || domainLower.endsWith(`.${ld}`)
      );
      if (!isLegit) {
        govtImpersonation = true;
        matchedPatterns.push(`govt-impersonation:${kw}`);
      }
    }
  }

  // 3. Telecom DLT sender ID fraud patterns
  for (const kw of TELECOM_FRAUD_KEYWORDS) {
    if (domainLower.includes(kw)) {
      matchedPatterns.push(`telecom-fraud:${kw}`);
    }
  }

  // 4. India-targeted ransomware domain patterns
  for (const family of INDIA_RANSOMWARE_FAMILIES) {
    if (domainLower.includes(`${family}-india`) || domainLower.includes(`india-${family}`)) {
      matchedPatterns.push(`ransomware-india:${family}`);
    }
  }

  // 5. CERT-In advisory match (async fetch)
  const advisoryText = await fetchCertInAdvisoryText();
  if (advisoryText.length > 0) {
    // Look for the domain's base name in the advisory text
    const baseName = domainLower.replace(/^www\./, '').split('.')[0];
    if (baseName && baseName.length > 3 && advisoryText.toLowerCase().includes(baseName)) {
      certInAdvisoryMatch = true;
      matchedPatterns.push(`cert-in-advisory:${baseName}`);
    }
  }

  // Also check if IP belongs to India-targeted ransomware campaigns
  if (ip) {
    // Known India-targeted ransomware C2 IP ranges (illustrative CIDR blocks)
    // In production these would be refreshed from a live feed
    const indiaTargetedRanges = ['45.227.', '185.220.', '194.165.'];
    for (const range of indiaTargetedRanges) {
      if (ip.startsWith(range)) {
        matchedPatterns.push(`ransomware-c2-ip:${range}*`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Score computation
  // ---------------------------------------------------------------------------
  let riskScore = 0;
  if (upiFraudIndicator) riskScore += 40;
  if (govtImpersonation) riskScore += 35;
  if (certInAdvisoryMatch) riskScore += 30;
  // Telecom fraud
  const telecomMatches = matchedPatterns.filter((p) => p.startsWith('telecom-fraud:')).length;
  riskScore += telecomMatches * 25;
  // Ransomware
  const ransomwareMatches = matchedPatterns.filter((p) => p.startsWith('ransomware')).length;
  riskScore += ransomwareMatches * 20;

  riskScore = Math.min(riskScore, 100);

  const isIndiaTarget = matchedPatterns.length > 0;

  return {
    isIndiaTarget,
    matchedPatterns,
    certInAdvisoryMatch,
    upiFraudIndicator,
    govtImpersonation,
    riskScore,
  };
}

// ---------------------------------------------------------------------------
// RiskFactor conversion
// ---------------------------------------------------------------------------

/**
 * Convert an IndiaThreatResult into RiskFactor entries for the risk engine.
 */
export function indiaThreatToFactors(result: IndiaThreatResult): RiskFactor[] {
  if (!result.isIndiaTarget || result.riskScore === 0) return [];

  const factors: RiskFactor[] = [];

  if (result.upiFraudIndicator) {
    factors.push({
      category: 'phishing_domain',
      summary: `Domain mimics Indian UPI/payment brands (${result.matchedPatterns
        .filter((p) => p.startsWith('upi-fraud:'))
        .map((p) => p.replace('upi-fraud:', ''))
        .join(', ')})`,
      score: 40,
      source: 'internal',
      detail: `UPI brand impersonation detected: ${result.matchedPatterns.filter((p) => p.startsWith('upi-fraud:')).join(', ')}`,
    });
  }

  if (result.govtImpersonation) {
    factors.push({
      category: 'phishing_domain',
      summary: `Domain impersonates Indian government services (${result.matchedPatterns
        .filter((p) => p.startsWith('govt-impersonation:'))
        .map((p) => p.replace('govt-impersonation:', ''))
        .join(', ')})`,
      score: 35,
      source: 'internal',
      detail: `Government impersonation indicators: ${result.matchedPatterns.filter((p) => p.startsWith('govt-impersonation:')).join(', ')}`,
    });
  }

  if (result.certInAdvisoryMatch) {
    factors.push({
      category: 'active_phishing_campaign',
      summary: 'Domain referenced in CERT-In (India CERT) advisory',
      score: 30,
      source: 'internal',
      detail: `CERT-In advisory match: ${result.matchedPatterns.filter((p) => p.startsWith('cert-in-advisory:')).join(', ')}`,
    });
  }

  const telecomMatches = result.matchedPatterns.filter((p) => p.startsWith('telecom-fraud:'));
  if (telecomMatches.length > 0) {
    factors.push({
      category: 'phishing_domain',
      summary: `Indian telecom DLT sender ID fraud patterns detected (${telecomMatches.map((p) => p.replace('telecom-fraud:', '')).join(', ')})`,
      score: Math.min(telecomMatches.length * 25, 50),
      source: 'internal',
      detail: telecomMatches.join(', '),
    });
  }

  const ransomwareMatches = result.matchedPatterns.filter((p) => p.startsWith('ransomware'));
  if (ransomwareMatches.length > 0) {
    factors.push({
      category: 'ransomware_c2',
      summary: `India-targeted ransomware indicators (${ransomwareMatches.map((p) => p.split(':')[1]).join(', ')})`,
      score: Math.min(ransomwareMatches.length * 20, 60),
      source: 'internal',
      detail: ransomwareMatches.join(', '),
    });
  }

  return factors;
}
