/**
 * Settings Store with Zustand
 * Manages user preferences and settings
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'auto';

interface SettingsState {
  // State
  theme: Theme;
  privacyLevel: number; // 1-10 scale
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  language: string;

  // Actions
  setTheme: (theme: Theme) => void;
  setPrivacyLevel: (level: number) => void;
  toggleNotifications: () => void;
  toggleSound: () => void;
  setLanguage: (language: string) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS = {
  theme: 'dark' as Theme,
  privacyLevel: 5,
  notificationsEnabled: true,
  soundEnabled: true,
  language: 'en',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Initial state
      ...DEFAULT_SETTINGS,

      // Actions
      setTheme: (theme) => {
        set({ theme });

        // Apply theme to document
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          // Auto mode - check system preference
          const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },

      setPrivacyLevel: (level) => {
        // Validate level is between 1-10
        const validLevel = Math.max(1, Math.min(10, level));
        set({ privacyLevel: validLevel });
      },

      toggleNotifications: () =>
        set((state) => ({
          notificationsEnabled: !state.notificationsEnabled,
        })),

      toggleSound: () =>
        set((state) => ({
          soundEnabled: !state.soundEnabled,
        })),

      setLanguage: (language) =>
        set({ language }),

      resetSettings: () =>
        set(DEFAULT_SETTINGS),
    }),
    {
      name: 'ankrshield-settings', // localStorage key
    }
  )
);

// Initialize theme on load
const currentTheme = useSettingsStore.getState().theme;
if (currentTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else if (currentTheme === 'auto') {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
}

// Selector hooks
export const useTheme = () => useSettingsStore((state) => state.theme);
export const usePrivacyLevel = () => useSettingsStore((state) => state.privacyLevel);
export const useNotificationsEnabled = () => useSettingsStore((state) => state.notificationsEnabled);
