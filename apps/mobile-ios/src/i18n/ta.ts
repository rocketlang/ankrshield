/**
 * Tamil translations — xShield i18n (A8)
 * Key strings: risk levels, home screen, SMS shield, monitor.
 * Remaining sections fall back to English via the index.ts merger.
 */
import type { Strings } from './en';

export const ta: Strings = {
  loading: 'ஏற்றுகிறது...',
  error: 'பிழை',
  retry: 'மீண்டும் முயற்சி',
  cancel: 'ரத்துசெய்',
  confirm: 'உறுதிப்படுத்து',
  save: 'சேமி',
  done: 'முடிந்தது',

  home: {
    title: 'xShield',
    subtitle: 'சாதன பாதுகாப்பு செயலில் உள்ளது',
    privacyScore: 'தனியுரிமை மதிப்பெண்',
    threatsBlocked: 'இன்று தடுக்கப்பட்ட அச்சுறுத்தல்கள்',
    lastScan: 'கடைசி ஸ்கேன்',
    scanNow: 'இப்போது ஸ்கேன் செய்',
    allClear: 'அனைத்தும் பாதுகாப்பானது',
    threatsFound: 'அச்சுறுத்தல்கள் கண்டறியப்பட்டன',
  },

  risk: {
    critical: 'தீவிர ஆபத்து',
    high: 'அதிக ஆபத்து',
    medium: 'நடுத்தர ஆபத்து',
    low: 'குறைந்த ஆபத்து',
    minimal: 'மிகக் குறைந்த ஆபத்து',
    safe: 'பாதுகாப்பானது',
  },

  monitor: {
    title: 'ஆப் பாதுகாப்பு ஸ்கேனர்',
    subtitle: 'நிறுவப்பட்ட ஆப்களில் அச்சுறுத்தல்களை ஸ்கேன் செய்கிறது',
    scanning: 'ஆப்களை ஸ்கேன் செய்கிறது...',
    scanComplete: 'ஸ்கேன் முடிந்தது',
    appsScanned: 'ஆப்கள் ஸ்கேன் செய்யப்பட்டன',
    threatsFound: 'அச்சுறுத்தல்கள் கண்டறியப்பட்டன',
    noThreats: 'எந்த அச்சுறுத்தலும் கண்டறியப்படவில்லை',
    stalkerwareFound: 'கண்காணிப்பு ஆப் கண்டறியப்பட்டது!',
    uninstall: 'நிறுவல் நீக்கு',
    ignore: 'புறக்கணி',
  },

  sms: {
    title: 'SMS பாதுகாப்பு',
    subtitle: 'SMS மோசடியிலிருந்து பாதுகாப்பு',
    safe: 'இந்த செய்தி பாதுகாப்பானதாக தெரிகிறது',
    suspicious: 'சந்தேகமான செய்தி கண்டறியப்பட்டது!',
    fraud_upi: 'UPI மோசடி எச்சரிக்கை',
    fraud_bank: 'வங்கி ஃபிஷிங் எச்சரிக்கை',
    fraud_kyc: 'KYC மோசடி எச்சரிக்கை',
    fraud_lottery: 'லாட்டரி மோசடி எச்சரிக்கை',
    fraud_otp: 'OTP திருட்டு எச்சரிக்கை',
    doNotShare: 'OTP-ஐ யாரிடமும் பகிர வேண்டாம்',
    reportScam: 'மோசடியை புகாரளி (சஞ்சார் சாதி)',
  },

  dpdp: {
    title: 'தனியுரிமை இணக்கம்',
    subtitle: 'DPDP சட்டம் 2023 இணக்க ஸ்கேனர்',
    compliant: 'DPDP இணக்கமானது',
    partial: 'பகுதியளவு இணக்கமானது',
    nonCompliant: 'இணக்கமற்றது',
    checkingApps: 'ஆப் இணக்கத்தை சரிபார்க்கிறது...',
    violations: 'மீறல்கள் கண்டறியப்பட்டன',
    noViolations: 'மீறல்கள் இல்லை',
    learnMore: 'DPDP சட்டம் 2023 பற்றி அறிக',
  },

  settings: {
    title: 'அமைப்புகள்',
    language: 'மொழி',
    notifications: 'அறிவிப்புகள்',
    vpnAlwaysOn: 'எப்போதும் இயக்கத்தில் VPN',
    blockMalware: 'மால்வேர் டொமைன்களை தடு',
    blockTrackers: 'டிராக்கர்களை தடு',
    reportAnonymous: 'அநாமதேய அச்சுறுத்தல் அறிக்கையிடல்',
    version: 'பதிப்பு',
    privacy: 'தனியுரிமை கொள்கை',
    terms: 'சேவை விதிமுறைகள்',
  },

  mdm: {
    title: 'கார்பரேட் ஷீல்ட்',
    subtitle: 'சாதன மேலாண்மை',
    notEnrolled: 'எந்த நிறுவனத்திலும் சேர்க்கப்படவில்லை',
    scanQr: 'சேர்க்கை QR குறியீட்டை ஸ்கேன் செய்',
    enrolled: 'சேர்க்கப்பட்டது',
    org: 'நிறுவனம்',
    policy: 'கொள்கை',
    compliance: 'இணக்க நிலை',
    syncBlocklist: 'பாதுகாப்பு கொள்கையை ஒத்திசை',
    unenroll: 'சாதன சேர்க்கையை நீக்கு',
    unenrollConfirm: 'இது அனைத்து கார்பரேட் பாதுகாப்பு கொள்கைகளையும் நீக்கும். தொடரவா?',
  },

  alerts: {
    title: 'அச்சுறுத்தல் எச்சரிக்கைகள்',
    noAlerts: 'எச்சரிக்கைகள் இல்லை — நீங்கள் பாதுகாக்கப்பட்டுள்ளீர்கள்',
    critical: 'தீவிர அச்சுறுத்தல்',
    watchAlert: 'டொமைன் ஆபத்து எச்சரிக்கை',
    smsAlert: 'SMS மோசடி எச்சரிக்கை',
  },
};
