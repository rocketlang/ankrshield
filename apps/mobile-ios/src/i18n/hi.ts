/**
 * Hindi translations — xShield i18n (A8)
 */
import type { Strings } from './en';

export const hi: Strings = {
  loading: 'लोड हो रहा है...',
  error: 'त्रुटि',
  retry: 'पुनः प्रयास',
  cancel: 'रद्द करें',
  confirm: 'पुष्टि करें',
  save: 'सहेजें',
  done: 'हो गया',

  home: {
    title: 'xShield',
    subtitle: 'डिवाइस सुरक्षा सक्रिय',
    privacyScore: 'गोपनीयता स्कोर',
    threatsBlocked: 'आज अवरुद्ध खतरे',
    lastScan: 'अंतिम स्कैन',
    scanNow: 'अभी स्कैन करें',
    allClear: 'सब सुरक्षित',
    threatsFound: 'खतरे मिले',
  },

  risk: {
    critical: 'गंभीर खतरा',
    high: 'उच्च खतरा',
    medium: 'मध्यम खतरा',
    low: 'कम खतरा',
    minimal: 'न्यूनतम खतरा',
    safe: 'सुरक्षित',
  },

  monitor: {
    title: 'ऐप सुरक्षा स्कैनर',
    subtitle: 'इंस्टॉल किए गए ऐप्स की जांच',
    scanning: 'ऐप्स स्कैन हो रहे हैं...',
    scanComplete: 'स्कैन पूर्ण',
    appsScanned: 'ऐप्स स्कैन किए गए',
    threatsFound: 'खतरे मिले',
    noThreats: 'कोई खतरा नहीं मिला',
    stalkerwareFound: 'निगरानी ऐप मिला!',
    uninstall: 'अनइंस्टॉल करें',
    ignore: 'अनदेखा करें',
  },

  sms: {
    title: 'SMS सुरक्षा',
    subtitle: 'SMS धोखाधड़ी से सुरक्षा',
    safe: 'यह संदेश सुरक्षित लगता है',
    suspicious: 'संदिग्ध संदेश मिला!',
    fraud_upi: 'UPI धोखाधड़ी चेतावनी',
    fraud_bank: 'बैंक फ़िशिंग चेतावनी',
    fraud_kyc: 'KYC घोटाला चेतावनी',
    fraud_lottery: 'लॉटरी घोटाला चेतावनी',
    fraud_otp: 'OTP चोरी चेतावनी',
    doNotShare: 'OTP कभी किसी से शेयर न करें',
    reportScam: 'घोटाला रिपोर्ट करें (संचार साथी)',
  },

  dpdp: {
    title: 'गोपनीयता अनुपालन',
    subtitle: 'DPDP अधिनियम 2023 अनुपालन स्कैनर',
    compliant: 'DPDP अनुरूप',
    partial: 'आंशिक रूप से अनुरूप',
    nonCompliant: 'अनुरूप नहीं',
    checkingApps: 'ऐप अनुपालन जांच रहे हैं...',
    violations: 'उल्लंघन मिले',
    noViolations: 'कोई उल्लंघन नहीं',
    learnMore: 'DPDP अधिनियम 2023 के बारे में जानें',
  },

  settings: {
    title: 'सेटिंग्स',
    language: 'भाषा',
    notifications: 'सूचनाएं',
    vpnAlwaysOn: 'हमेशा चालू VPN',
    blockMalware: 'मैलवेयर डोमेन ब्लॉक करें',
    blockTrackers: 'ट्रैकर ब्लॉक करें',
    reportAnonymous: 'अनाम खतरा रिपोर्टिंग',
    version: 'संस्करण',
    privacy: 'गोपनीयता नीति',
    terms: 'सेवा शर्तें',
  },

  mdm: {
    title: 'कॉर्पोरेट शील्ड',
    subtitle: 'डिवाइस प्रबंधन',
    notEnrolled: 'किसी संगठन में नामांकित नहीं',
    scanQr: 'नामांकन QR कोड स्कैन करें',
    enrolled: 'नामांकित',
    org: 'संगठन',
    policy: 'नीति',
    compliance: 'अनुपालन स्थिति',
    syncBlocklist: 'सुरक्षा नीति सिंक करें',
    unenroll: 'डिवाइस का नामांकन रद्द करें',
    unenrollConfirm: 'इससे सभी कॉर्पोरेट सुरक्षा नीतियाँ हट जाएंगी। जारी रखें?',
  },

  alerts: {
    title: 'खतरे की सूचनाएं',
    noAlerts: 'कोई सूचना नहीं — आप सुरक्षित हैं',
    critical: 'गंभीर खतरा',
    watchAlert: 'डोमेन जोखिम सूचना',
    smsAlert: 'SMS धोखाधड़ी सूचना',
  },
};
