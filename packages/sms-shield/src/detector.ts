/**
 * SMS Fraud Detection Engine
 * Detects India-specific SMS fraud patterns including UPI fraud,
 * bank phishing, OTP harvesting, KYC scams, and more.
 */

import type { SmsAnalysisResult, SmsThreateType } from './types';

// ─── URL extraction ────────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s]+/gi;

export function extractUrls(content: string): string[] {
  const matches = content.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    const m = url.match(/^https?:\/\/([^/?#]+)/i);
    return m ? m[1].toLowerCase() : null;
  }
}

// ─── Sender ID validation ──────────────────────────────────────────────────────

/**
 * Valid Indian SMS sender IDs follow the DLT format:
 *   - Transactional:  VM-XXXXXX  (e.g. VM-SBIBNK)
 *   - Promotional:    AM-XXXXXX  (e.g. AM-OFFERS)
 *   Generally: 2 uppercase letters, hyphen, up to 6-11 uppercase alphanumeric chars
 */
const VALID_SENDER_REGEX = /^[A-Z]{2}-[A-Z0-9]{3,11}$/;

const BANK_KEYWORDS = [
  'sbi',
  'hdfc',
  'icici',
  'axis',
  'pnb',
  'bob',
  'kotak',
  'yes',
  'union',
  'canara',
  'indus',
  'citi',
  'rbl',
  'iob',
  'central',
  'federal',
  'idbi',
  'bank',
  'bnk',
  'bk',
];

export function isSuspiciousSenderId(senderId: string): boolean {
  if (!senderId) return false;
  if (VALID_SENDER_REGEX.test(senderId)) return false;
  // Phone numbers as sender IDs are always suspicious for transactional SMS
  if (/^[+]?[0-9]{7,15}$/.test(senderId)) return true;
  // Lowercase or mixed-case sender IDs are suspicious (DLT IDs are uppercase)
  if (senderId !== senderId.toUpperCase()) return true;
  // Sender IDs that look like bank names but are not in valid DLT format
  const lower = senderId.toLowerCase();
  const looksLikeBank = BANK_KEYWORDS.some((k) => lower.includes(k));
  if (looksLikeBank && !VALID_SENDER_REGEX.test(senderId)) return true;
  return false;
}

// ─── Threat pattern definitions ────────────────────────────────────────────────

interface ThreatPattern {
  type: SmsThreateType;
  keywords: RegExp[];
  weight: number;
}

const THREAT_PATTERNS: ThreatPattern[] = [
  {
    type: 'upi_fraud',
    keywords: [
      /upi/i,
      /bhim/i,
      /phonepe/i,
      /google.?pay/i,
      /gpay/i,
      /paytm/i,
      /net.?banking/i,
      /update.{0,20}kyc/i,
      /link.{0,20}aadhar/i,
      /link.{0,20}aadhaar/i,
      /transaction.{0,30}failed/i,
      /payment.{0,30}failed/i,
    ],
    weight: 15,
  },
  {
    type: 'bank_phishing',
    keywords: [
      /dear.{0,15}customer.{0,50}(sbi|hdfc|icici|axis|pnb|bob|kotak|yes bank|union bank)/i,
      /(sbi|hdfc|icici|axis|pnb|bob).{0,50}account.{0,50}(block|suspend|deactivat)/i,
      /your.{0,20}(bank|account).{0,30}(block|suspend|deactivat|expir)/i,
      /net.?banking.{0,30}(block|suspend|deactivat|expir)/i,
      /atm.{0,30}(block|suspend|deactivat)/i,
      /debit.{0,20}card.{0,30}(block|suspend|expir)/i,
    ],
    weight: 20,
  },
  {
    type: 'kyc_scam',
    keywords: [
      /kyc.{0,30}update/i,
      /kyc.{0,30}verif/i,
      /complete.{0,20}kyc/i,
      /account.{0,30}suspend/i,
      /account.{0,30}block/i,
      /click.{0,30}link.{0,30}verif/i,
      /verify.{0,30}account/i,
      /re-?verif/i,
    ],
    weight: 18,
  },
  {
    type: 'otp_harvesting',
    keywords: [
      /share.{0,20}otp/i,
      /forward.{0,20}otp/i,
      /send.{0,20}otp/i,
      /tell.{0,30}otp/i,
      /give.{0,20}otp/i,
      /otp.{0,30}share/i,
      /otp.{0,20}forward/i,
    ],
    weight: 25,
  },
  {
    type: 'lottery_scam',
    keywords: [
      /you.{0,20}won/i,
      /you.{0,20}win/i,
      /congratulation/i,
      /prize.{0,30}money/i,
      /prize.{0,30}worth/i,
      /lottery/i,
      /claim.{0,20}reward/i,
      /claim.{0,20}prize/i,
      /lucky.{0,30}winner/i,
      /rs\.?\s*[0-9,]+.{0,20}(won|win|prize|reward)/i,
    ],
    weight: 20,
  },
  {
    type: 'job_scam',
    keywords: [
      /work.{0,20}from.{0,20}home/i,
      /part.?time.{0,30}(job|earn|income)/i,
      /earn.{0,20}daily/i,
      /earn.{0,20}rs\.?\s*[0-9]/i,
      /data.{0,20}entry.{0,20}job/i,
      /online.{0,20}job.{0,30}apply/i,
      /urgent.{0,30}hiring/i,
    ],
    weight: 15,
  },
  {
    type: 'loan_scam',
    keywords: [
      /instant.{0,30}loan/i,
      /personal.{0,20}loan.{0,30}(approv|apply|offer)/i,
      /pre.?approv.{0,20}loan/i,
      /loan.{0,20}without.{0,30}(document|cibil|credit)/i,
      /low.{0,20}interest.{0,20}loan/i,
      /5.?minute.{0,20}loan/i,
    ],
    weight: 15,
  },
  {
    type: 'parcel_scam',
    keywords: [
      /delivery.{0,30}failed/i,
      /parcel.{0,30}hold/i,
      /customs.{0,30}fee/i,
      /your.{0,30}package.{0,30}(hold|failed|deliver)/i,
      /fedex.{0,30}(failed|hold|fee)/i,
      /dtdc.{0,30}(failed|hold|fee)/i,
      /dhl.{0,30}(failed|hold|fee)/i,
      /india.?post.{0,30}(failed|hold|fee)/i,
    ],
    weight: 18,
  },
  {
    type: 'govt_impersonation',
    keywords: [
      /uidai/i,
      /income.?tax.{0,30}(notice|refund|action|demand)/i,
      /income.?tax.?department/i,
      /cbdt/i,
      /cyber.?crime.{0,30}police/i,
      /i.?t.?department/i,
      /govt.?of.?india.{0,40}(notice|action|summon)/i,
      /aadhaar.{0,30}(suspend|block|link|update)/i,
    ],
    weight: 22,
  },
];

// ─── Generic suspicion signals ─────────────────────────────────────────────────

const GENERIC_SUSPICIOUS_PATTERNS: RegExp[] = [
  /click.{0,20}(here|link|now|below)/i,
  /tap.{0,20}(here|link|now|below)/i,
  /bit\.ly|tinyurl\.com|t\.co|goo\.gl|short\.ly/i,
  /http:\/\//i, // HTTP (not HTTPS) link in financial SMS
  /expir.{0,20}(today|soon|24|48|hour)/i,
  /urgent/i,
  /immediately/i,
  /call.{0,20}(now|immediately|urgent)/i,
  /download.{0,30}app/i,
];

// ─── Main analysis function ────────────────────────────────────────────────────

export function analyzeSms(content: string, senderId?: string): SmsAnalysisResult {
  const matchedPatterns: string[] = [];
  const detectedTypes: Map<SmsThreateType, number> = new Map();

  // Check all threat patterns
  for (const pattern of THREAT_PATTERNS) {
    for (const regex of pattern.keywords) {
      if (regex.test(content)) {
        const patternLabel = '[' + pattern.type + '] ' + regex.source;
        if (!matchedPatterns.includes(patternLabel)) {
          matchedPatterns.push(patternLabel);
        }
        const existing = detectedTypes.get(pattern.type) ?? 0;
        detectedTypes.set(pattern.type, existing + pattern.weight);
      }
    }
  }

  // Check generic suspicious patterns
  let genericScore = 0;
  for (const regex of GENERIC_SUSPICIOUS_PATTERNS) {
    if (regex.test(content)) {
      const patternLabel = '[generic] ' + regex.source;
      if (!matchedPatterns.includes(patternLabel)) {
        matchedPatterns.push(patternLabel);
      }
      genericScore += 5;
    }
  }

  // Extract URLs
  const extractedUrls = extractUrls(content);

  // Extract domain from first URL
  let domain: string | null = null;
  if (extractedUrls.length > 0) {
    domain = extractDomain(extractedUrls[0]);
  }

  // Check URL suspicion signals
  if (extractedUrls.length > 0) {
    for (const url of extractedUrls) {
      if (url.startsWith('http://')) {
        genericScore += 10;
        matchedPatterns.push('[generic] HTTP (non-HTTPS) URL');
      }
      if (/bit\.ly|tinyurl\.com|t\.co|goo\.gl|short\.gy|rb\.gy|is\.gd/i.test(url)) {
        genericScore += 15;
        matchedPatterns.push('[generic] URL shortener detected');
      }
    }
  }

  // Sender ID check
  const suspiciousSenderId = senderId ? isSuspiciousSenderId(senderId) : false;
  if (suspiciousSenderId) {
    genericScore += 20;
    matchedPatterns.push('[generic] Suspicious sender ID format');
  }

  // Determine primary threat type (highest score)
  let threatType: SmsThreateType | null = null;
  let maxScore = 0;
  for (const [type, score] of detectedTypes) {
    if (score > maxScore) {
      maxScore = score;
      threatType = type;
    }
  }

  // Calculate confidence (0-100)
  const rawScore = maxScore + genericScore;
  const confidence = Math.min(100, Math.round(rawScore));

  const isSuspicious = confidence >= 30 || matchedPatterns.length >= 2;

  return {
    isSuspicious,
    confidence,
    threatType,
    matchedPatterns,
    extractedUrls,
    suspiciousSenderId,
    domain,
  };
}
