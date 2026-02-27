/**
 * English strings — source of truth for xShield i18n (A8)
 */
export const en = {
  // Common
  loading: 'Loading...',
  error: 'Error',
  retry: 'Retry',
  cancel: 'Cancel',
  confirm: 'Confirm',
  save: 'Save',
  done: 'Done',

  // Home screen
  home: {
    title: 'xShield',
    subtitle: 'Device Protection Active',
    privacyScore: 'Privacy Score',
    threatsBlocked: 'Threats Blocked Today',
    lastScan: 'Last Scan',
    scanNow: 'Scan Now',
    allClear: 'All Clear',
    threatsFound: 'Threats Found',
  },

  // Risk levels
  risk: {
    critical: 'Critical Risk',
    high: 'High Risk',
    medium: 'Medium Risk',
    low: 'Low Risk',
    minimal: 'Minimal Risk',
    safe: 'Safe',
  },

  // Android Monitor
  monitor: {
    title: 'App Safety Scanner',
    subtitle: 'Scanning installed apps for threats',
    scanning: 'Scanning apps...',
    scanComplete: 'Scan Complete',
    appsScanned: 'apps scanned',
    threatsFound: 'threats found',
    noThreats: 'No threats detected',
    stalkerwareFound: 'Surveillance app detected!',
    uninstall: 'Uninstall',
    ignore: 'Ignore',
  },

  // SMS Shield
  sms: {
    title: 'SMS Safety',
    subtitle: 'Protecting against SMS fraud',
    safe: 'This message appears safe',
    suspicious: 'Suspicious message detected!',
    fraud_upi: 'UPI Fraud Alert',
    fraud_bank: 'Bank Phishing Alert',
    fraud_kyc: 'KYC Scam Alert',
    fraud_lottery: 'Lottery Scam Alert',
    fraud_otp: 'OTP Harvesting Alert',
    doNotShare: 'Never share OTP with anyone',
    reportScam: 'Report Scam (Sanchar Saathi)',
  },

  // DPDP Scanner
  dpdp: {
    title: 'Privacy Compliance',
    subtitle: 'DPDP Act 2023 Compliance Scanner',
    compliant: 'DPDP Compliant',
    partial: 'Partially Compliant',
    nonCompliant: 'Not Compliant',
    checkingApps: 'Checking app compliance...',
    violations: 'Violations Found',
    noViolations: 'No violations',
    learnMore: 'Learn about DPDP Act 2023',
  },

  // Settings
  settings: {
    title: 'Settings',
    language: 'Language',
    notifications: 'Notifications',
    vpnAlwaysOn: 'Always-on VPN',
    blockMalware: 'Block Malware Domains',
    blockTrackers: 'Block Trackers',
    reportAnonymous: 'Anonymous Threat Reporting',
    version: 'Version',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
  },

  // MDM
  mdm: {
    title: 'Corporate Shield',
    subtitle: 'Device Management',
    notEnrolled: 'Not enrolled in any organization',
    scanQr: 'Scan Enrollment QR Code',
    enrolled: 'Enrolled',
    org: 'Organization',
    policy: 'Policy',
    compliance: 'Compliance Status',
    syncBlocklist: 'Sync Security Policy',
    unenroll: 'Unenroll Device',
    unenrollConfirm: 'This will remove all corporate security policies. Continue?',
  },

  // Alerts
  alerts: {
    title: 'Threat Alerts',
    noAlerts: "No alerts \u2014 you're protected",
    critical: 'Critical Threat',
    watchAlert: 'Domain Risk Alert',
    smsAlert: 'SMS Fraud Alert',
  },
} as const;

export type Strings = typeof en;
