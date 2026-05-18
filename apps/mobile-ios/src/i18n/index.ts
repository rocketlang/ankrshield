/**
 * xShield i18n — A8
 * Supports: English (en), Hindi (hi), Tamil (ta), Telugu (te)
 *
 * Usage:
 *   import { t, useStrings, setLanguage, supportedLanguages } from '../i18n';
 *   const s = t();
 *   <Text>{s.home.title}</Text>
 */
import { NativeModules, Platform } from 'react-native';

import { en, type Strings } from './en';
import { hi } from './hi';
import { ta } from './ta';
import { te } from './te';

export type Lang = 'en' | 'hi' | 'ta' | 'te';

const translations: Record<Lang, Strings> = { en, hi, ta, te };

/**
 * Detect the device language from the OS.
 * Returns one of our supported Lang codes, defaulting to 'en'.
 */
function getDeviceLanguage(): Lang {
  let locale = 'en';
  try {
    if (Platform.OS === 'android') {
      locale =
        NativeModules.I18nManager?.localeIdentifier ??
        NativeModules.RNI18nManager?.localeIdentifier ??
        'en';
    } else {
      locale =
        NativeModules.SettingsManager?.settings?.AppleLocale ??
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ??
        'en';
    }
  } catch {
    locale = 'en';
  }

  // Normalise: 'hi_IN' → 'hi', 'ta-IN' → 'ta'
  const lang = locale.split('_')[0].split('-')[0].toLowerCase();
  if (lang in translations) return lang as Lang;
  return 'en';
}

let currentLang: Lang = getDeviceLanguage();

/** Programmatically switch language (e.g. from Settings screen). */
export function setLanguage(lang: Lang): void {
  currentLang = lang;
}

/** Return the active language code. */
export function getLanguage(): Lang {
  return currentLang;
}

/**
 * Get the full string map for the current language.
 * Call this at render time (not at module level) so language changes take effect.
 *
 * @example
 *   const s = t();
 *   <Text>{s.home.subtitle}</Text>
 */
export function t(): Strings {
  return translations[currentLang];
}

/**
 * Alias for use inside React components.
 *
 * @example
 *   function MyComponent() {
 *     const s = useStrings();
 *     return <Text>{s.risk.critical}</Text>;
 *   }
 */
export function useStrings(): Strings {
  return translations[currentLang];
}

/** Metadata for the language picker in Settings. */
export const supportedLanguages: {
  code: Lang;
  name: string;
  nativeName: string;
}[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
];

// Re-export types
export type { Strings };
