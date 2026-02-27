export interface SmsAnalysisResult {
  isSuspicious: boolean;
  confidence: number; // 0-100
  threatType: SmsThreateType | null;
  matchedPatterns: string[];
  extractedUrls: string[];
  suspiciousSenderId: boolean;
  domain: string | null; // extracted domain from URL in SMS
}

export type SmsThreateType =
  | 'upi_fraud' // fake UPI/payment SMS
  | 'bank_phishing' // fake bank alert
  | 'kyc_scam' // "KYC update required"
  | 'lottery_scam' // "You won" scams
  | 'job_scam' // work from home job scams
  | 'loan_scam' // instant loan / personal loan fraud
  | 'otp_harvesting' // OTP forwarding request
  | 'parcel_scam' // FedEx/DTDC parcel SMS scams
  | 'govt_impersonation'; // fake UIDAI/income tax/police SMS
