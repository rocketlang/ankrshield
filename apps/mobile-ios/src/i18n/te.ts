/**
 * Telugu translations — xShield i18n (A8)
 * Key strings: risk levels, home screen, SMS shield, monitor.
 */
import type { Strings } from './en';

export const te: Strings = {
  loading: 'లోడ్ అవుతోంది...',
  error: 'లోపం',
  retry: 'మళ్ళీ ప్రయత్నించు',
  cancel: 'రద్దు చేయి',
  confirm: 'నిర్ధారించు',
  save: 'సేవ్ చేయి',
  done: 'పూర్తయింది',

  home: {
    title: 'xShield',
    subtitle: 'పరికర రక్షణ క్రియాశీలంగా ఉంది',
    privacyScore: 'గోప్యత స్కోర్',
    threatsBlocked: 'నేడు నిరోధించిన బెదిరింపులు',
    lastScan: 'చివరి స్కాన్',
    scanNow: 'ఇప్పుడు స్కాన్ చేయి',
    allClear: 'అన్నీ సురక్షితం',
    threatsFound: 'బెదిరింపులు కనుగొనబడ్డాయి',
  },

  risk: {
    critical: 'తీవ్రమైన ప్రమాదం',
    high: 'అధిక ప్రమాదం',
    medium: 'మధ్యస్థ ప్రమాదం',
    low: 'తక్కువ ప్రమాదం',
    minimal: 'కనీస ప్రమాదం',
    safe: 'సురక్షితం',
  },

  monitor: {
    title: 'యాప్ సేఫ్టీ స్కానర్',
    subtitle: 'ఇన్‌స్టాల్ చేసిన యాప్‌లలో బెదిరింపులను స్కాన్ చేస్తోంది',
    scanning: 'యాప్‌లను స్కాన్ చేస్తోంది...',
    scanComplete: 'స్కాన్ పూర్తయింది',
    appsScanned: 'యాప్‌లు స్కాన్ చేయబడ్డాయి',
    threatsFound: 'బెదిరింపులు కనుగొనబడ్డాయి',
    noThreats: 'ఏ బెదిరింపూ కనుగొనబడలేదు',
    stalkerwareFound: 'నిఘా యాప్ కనుగొనబడింది!',
    uninstall: 'అన్‌ఇన్‌స్టాల్ చేయి',
    ignore: 'విస్మరించు',
  },

  sms: {
    title: 'SMS భద్రత',
    subtitle: 'SMS మోసం నుండి రక్షణ',
    safe: 'ఈ సందేశం సురక్షితంగా కనిపిస్తోంది',
    suspicious: 'అనుమానాస్పద సందేశం కనుగొనబడింది!',
    fraud_upi: 'UPI మోసం హెచ్చరిక',
    fraud_bank: 'బ్యాంక్ ఫిషింగ్ హెచ్చరిక',
    fraud_kyc: 'KYC స్కామ్ హెచ్చరిక',
    fraud_lottery: 'లాటరీ స్కామ్ హెచ్చరిక',
    fraud_otp: 'OTP దొంగతనం హెచ్చరిక',
    doNotShare: 'OTP ని ఎవరితోనూ పంచుకోకండి',
    reportScam: 'స్కామ్ నివేదించు (సంచార్ సాథి)',
  },

  dpdp: {
    title: 'గోప్యత సమ్మతి',
    subtitle: 'DPDP చట్టం 2023 సమ్మతి స్కానర్',
    compliant: 'DPDP సమ్మతంగా ఉంది',
    partial: 'పాక్షికంగా సమ్మతంగా ఉంది',
    nonCompliant: 'సమ్మతంగా లేదు',
    checkingApps: 'యాప్ సమ్మతిని తనిఖీ చేస్తోంది...',
    violations: 'ఉల్లంఘనలు కనుగొనబడ్డాయి',
    noViolations: 'ఉల్లంఘనలు లేవు',
    learnMore: 'DPDP చట్టం 2023 గురించి తెలుసుకోండి',
  },

  settings: {
    title: 'సెట్టింగ్‌లు',
    language: 'భాష',
    notifications: 'నోటిఫికేషన్లు',
    vpnAlwaysOn: 'ఎల్లప్పుడూ ఆన్ VPN',
    blockMalware: 'మాల్వేర్ డొమైన్లను నిరోధించు',
    blockTrackers: 'ట్రాకర్లను నిరోధించు',
    reportAnonymous: 'అనామక బెదిరింపు నివేదించడం',
    version: 'వెర్షన్',
    privacy: 'గోప్యత విధానం',
    terms: 'సేవా నిబంధనలు',
  },

  mdm: {
    title: 'కార్పొరేట్ షీల్డ్',
    subtitle: 'పరికర నిర్వహణ',
    notEnrolled: 'ఏ సంస్థలోనూ నమోదు చేయబడలేదు',
    scanQr: 'నమోదు QR కోడ్ స్కాన్ చేయి',
    enrolled: 'నమోదు చేయబడింది',
    org: 'సంస్థ',
    policy: 'విధానం',
    compliance: 'సమ్మతి స్థితి',
    syncBlocklist: 'భద్రతా విధానం సింక్ చేయి',
    unenroll: 'పరికర నమోదు రద్దు చేయి',
    unenrollConfirm: 'ఇది అన్ని కార్పొరేట్ భద్రతా విధానాలను తొలగిస్తుంది. కొనసాగించాలా?',
  },

  alerts: {
    title: 'బెదిరింపు హెచ్చరికలు',
    noAlerts: 'హెచ్చరికలు లేవు — మీరు రక్షించబడ్డారు',
    critical: 'తీవ్రమైన బెదిరింపు',
    watchAlert: 'డొమైన్ ప్రమాద హెచ్చరిక',
    smsAlert: 'SMS మోసం హెచ్చరిక',
  },
};
