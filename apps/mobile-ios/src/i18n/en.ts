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

  // Onboarding
  onboarding: {
    title: 'AnkrShield',
    subtitle:
      'Your personal privacy OS — built for India.\nStop trackers, block phishing, detect fraud.',
    getStarted: "Let's get started →",
    trustLine: 'Works entirely offline · No data uploaded · Open source',
    featuresTitle: 'Complete protection',
    featuresSub: 'Six shields working together on your device',
    dnsTitle: 'Enable DNS Shield',
    dnsSubtitle: 'Blocks 100,000+ trackers and phishing domains at the network level.',
    enableDns: 'Enable DNS Shield',
    dnsActive: '✅ DNS Shield Active',
    skip: 'Skip for now',
    permTitle: 'Two quick permissions',
    permSub: 'Optional but recommended for full protection',
    enable: 'Enable',
    privacyNote:
      '🔒 AnkrShield never reads message content, passwords, or personal data. All processing is on-device.',
    doneTitle: "You're protected",
    doneSub: 'AnkrShield is watching your network, files, and apps in the background.',
    startProtecting: 'Start protecting →',
    continue: 'Continue →',
    next: 'Next →',
  },

  // Device Health
  deviceHealth: {
    title: 'Device Health',
    scanning: 'Scanning device security…',
    notAvailable: 'Not available',
    androidOnly: 'Device Health requires Android.',
    couldNotRead: 'Could not read device settings.',
    retry: 'Retry',
    rescan: '↻  Re-scan',
    excellent: 'Excellent',
    good: 'Good',
    needsWork: 'Needs Work',
    atRisk: 'At Risk',
    checksOf: 'of',
    checksPassed: 'checks passed',
    criticalIssue: 'critical issue needs immediate attention',
    criticalIssues: 'critical issues need immediate attention',
    highIssue: 'high severity issue to fix',
    highIssues: 'high severity issues to fix',
    openSettings: 'Open Settings →',
  },

  // UPI Guard
  upiGuard: {
    title: 'UPI Guard',
    subtitle:
      'Paste a UPI payment link or scan result to verify the payee, amount, and handle before sending money.',
    placeholder: 'upi://pay?pa=merchant@oksbi&am=500&pn=Merchant',
    verify: 'Verify',
    knownPsp: '✓ Known PSP',
    payee: 'Payee',
    amount: 'Amount',
    note: 'Note',
    riskSignals: 'Risk signals detected',
    looksLegitimate: '✅ Looks legitimate',
    verifyBefore: '⚠️ Verify before paying',
    doNotPay: 'Do NOT complete this payment.',
    howToUse: 'How to use',
    recentChecks: 'Recent checks',
    safetyTip:
      '💡 Real banks and businesses NEVER send payment requests out of the blue. If you\'re asked to pay to "unfreeze your account" or "claim a refund" — it\'s always fraud.',
    worksWithAll: 'Works with all UPI apps',
  },

  // Link Scanner
  linkScanner: {
    title: 'Link Scanner',
    subtitle: 'Paste any link from WhatsApp, SMS, or email to check it before you open it.',
    placeholder: 'Paste URL or domain here…',
    scan: 'Scan',
    safeToOpen: 'Safe to open',
    openWithCaution: 'Open with caution',
    doNotOpen: 'Do NOT open this link',
    safeDesc:
      'No known threats associated with this domain. Still be cautious about what you submit on the page.',
    cautionDesc:
      'This domain has some suspicious signals. Do not enter credentials or personal information.',
    dangerDesc:
      'High confidence threat detected. Sharing this link with contacts could harm them too.',
    openBrowser: 'Open in browser →',
    howToShare: 'How to share a link from WhatsApp',
    recentScans: 'Recent scans',
    disclaimer:
      "Risk scores are computed by xShield's threat intelligence engine. Scores may not reflect very new domains.",
    lastSeen: 'Last seen in threat intel:',
  },

  // Ransomware Watch
  ransomware: {
    title: 'Ransomware Watch',
    subtitle: 'Monitors your storage for encrypted files and ransom notes in real time.',
    start: 'Start Watcher',
    stop: 'Stop Watcher',
    active: '🛡 Watcher Active',
    inactive: 'Watcher Stopped',
    recentAlerts: 'Recent alerts',
    noAlerts: 'No ransomware activity detected',
    androidOnly: 'Ransomware Watch requires Android.',
  },

  // Call Protection
  callProtection: {
    title: 'Call Protection',
    subtitle: 'Identifies TRAI-flagged fraud call patterns before you answer.',
    androidOnly: 'Call Protection is available on Android.',
  },

  // Safe Browsing
  safeBrowsing: {
    title: 'Safe Browsing',
    subtitle: 'Catches fake bank and UPI sites using real-time URL analysis.',
    active: 'Active',
    inactive: 'Inactive',
    androidOnly: 'Safe Browsing requires Android and Accessibility permission.',
  },

  // AV Scanner
  avScanner: {
    title: 'AV Scanner',
    subtitle: 'Checks installed apps against malware databases',
    scanBtn: '▶ Scan Installed Apps',
    rescanBtn: '↺ Re-scan Apps',
    cancelBtn: '✕ Cancel Scan',
    vtKeyLabel: '+ Add VirusTotal API key (optional)',
    vtKeySet: '🔑 VirusTotal key set',
    vtKeyHint: 'Free key: virustotal.com → Sign up → API key (4 lookups/min)',
    vtKeyPlaceholder: 'Paste your free VT API key here',
    maliciousLabel: 'malicious',
    suspiciousLabel: 'suspicious',
    cleanLabel: 'clean',
    totalLabel: 'total',
    androidOnly: 'AV Scanner is available on Android only.',
    emptyTitle: 'Ready to scan',
    emptyBody:
      'Checks every installed app against known malware hashes.\nAdd a free VirusTotal key for cloud-backed detection.',
    threatBanner: '☠️ {n} malicious app found — uninstall immediately',
    threatBannerPlural: '☠️ {n} malicious apps found — uninstall immediately',
    warnBanner: '⚠️ {n} suspicious app — review carefully',
    warnBannerPlural: '⚠️ {n} suspicious apps — review carefully',
    cleanBanner: '✅ All {n} apps are clean',
  },

  // Blocklist Sync
  blocklistSync: {
    syncing: '⟳ Syncing blocklist...',
    domains: '{n} domains',
    updatedAgo: 'updated {t}',
    neverSynced: 'not yet synced',
    justNow: 'just now',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    daysAgo: '{n}d ago',
  },
} as const;

export type Strings = typeof en;
