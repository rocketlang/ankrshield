/**
 * Settings Store
 * Manages user preferences with localStorage persistence
 * Syncs with electron-store backend when available
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Types
export type Theme = 'light' | 'dark' | 'auto';

export interface Settings {
  // Appearance
  theme: Theme;
  compactMode: boolean;

  // Notifications
  showNotifications: boolean;
  showDesktopNotifications: boolean;
  notifyOnBlock: boolean;

  // Privacy
  privacyLevel: number; // 1-10 scale
  autoBlockTrackers: boolean;
  blockAnalytics: boolean;
  blockAdvertising: boolean;
  blockSocialMedia: boolean;

  // System
  autoStart: boolean;
  minimizeToTray: boolean;
  startMinimized: boolean;

  // Advanced
  enableDnsLogging: boolean;
  enableNetworkLogging: boolean;
  batchSize: number;
  flushInterval: number;
}

// Store interface
interface SettingsState extends Settings {
  // Actions
  setTheme: (theme: Theme) => void;
  setCompactMode: (compact: boolean) => void;
  setShowNotifications: (show: boolean) => void;
  setShowDesktopNotifications: (show: boolean) => void;
  setNotifyOnBlock: (notify: boolean) => void;
  setPrivacyLevel: (level: number) => void;
  setAutoBlockTrackers: (block: boolean) => void;
  setBlockAnalytics: (block: boolean) => void;
  setBlockAdvertising: (block: boolean) => void;
  setBlockSocialMedia: (block: boolean) => void;
  setAutoStart: (autoStart: boolean) => void;
  setMinimizeToTray: (minimize: boolean) => void;
  setStartMinimized: (minimized: boolean) => void;
  setEnableDnsLogging: (enable: boolean) => void;
  setEnableNetworkLogging: (enable: boolean) => void;
  setBatchSize: (size: number) => void;
  setFlushInterval: (interval: number) => void;
  resetSettings: () => void;
  syncWithBackend: () => Promise<void>;
}

// Default settings
const defaultSettings: Settings = {
  // Appearance
  theme: 'dark',
  compactMode: false,

  // Notifications
  showNotifications: true,
  showDesktopNotifications: true,
  notifyOnBlock: false,

  // Privacy
  privacyLevel: 8,
  autoBlockTrackers: true,
  blockAnalytics: true,
  blockAdvertising: true,
  blockSocialMedia: false,

  // System
  autoStart: false,
  minimizeToTray: true,
  startMinimized: false,

  // Advanced
  enableDnsLogging: true,
  enableNetworkLogging: true,
  batchSize: 100,
  flushInterval: 5000,
};

// Create store with persistence
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, _get) => ({
      ...defaultSettings,

      // Setters
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
        syncSetting('theme', theme);
      },

      setCompactMode: (compact) => {
        set({ compactMode: compact });
        syncSetting('compactMode', compact);
      },

      setShowNotifications: (show) => {
        set({ showNotifications: show });
        syncSetting('showNotifications', show);
      },

      setShowDesktopNotifications: (show) => {
        set({ showDesktopNotifications: show });
        syncSetting('showDesktopNotifications', show);
      },

      setNotifyOnBlock: (notify) => {
        set({ notifyOnBlock: notify });
        syncSetting('notifyOnBlock', notify);
      },

      setPrivacyLevel: (level) => {
        // Clamp between 1-10
        const clampedLevel = Math.max(1, Math.min(10, level));
        set({ privacyLevel: clampedLevel });
        syncSetting('privacyLevel', clampedLevel);
      },

      setAutoBlockTrackers: (block) => {
        set({ autoBlockTrackers: block });
        syncSetting('autoBlockTrackers', block);
      },

      setBlockAnalytics: (block) => {
        set({ blockAnalytics: block });
        syncSetting('blockAnalytics', block);
      },

      setBlockAdvertising: (block) => {
        set({ blockAdvertising: block });
        syncSetting('blockAdvertising', block);
      },

      setBlockSocialMedia: (block) => {
        set({ blockSocialMedia: block });
        syncSetting('blockSocialMedia', block);
      },

      setAutoStart: (autoStart) => {
        set({ autoStart });
        syncSetting('autoStart', autoStart);
      },

      setMinimizeToTray: (minimize) => {
        set({ minimizeToTray: minimize });
        syncSetting('minimizeToTray', minimize);
      },

      setStartMinimized: (minimized) => {
        set({ startMinimized: minimized });
        syncSetting('startMinimized', minimized);
      },

      setEnableDnsLogging: (enable) => {
        set({ enableDnsLogging: enable });
        syncSetting('enableDnsLogging', enable);
      },

      setEnableNetworkLogging: (enable) => {
        set({ enableNetworkLogging: enable });
        syncSetting('enableNetworkLogging', enable);
      },

      setBatchSize: (size) => {
        set({ batchSize: size });
        syncSetting('batchSize', size);
      },

      setFlushInterval: (interval) => {
        set({ flushInterval: interval });
        syncSetting('flushInterval', interval);
      },

      // Reset to defaults
      resetSettings: () => {
        set(defaultSettings);
        applyTheme(defaultSettings.theme);
        // Sync all settings to backend
        if (window.electronAPI?.settingsReset) {
          window.electronAPI.settingsReset().catch(console.error);
        }
      },

      // Sync with backend
      syncWithBackend: async () => {
        if (!window.electronAPI?.settingsGetAll) {
          console.warn('Backend settings API not available');
          return;
        }

        try {
          const backendSettings = await window.electronAPI.settingsGetAll();
          if (backendSettings) {
            set(backendSettings);
            applyTheme(backendSettings.theme || defaultSettings.theme);
          }
        } catch (error) {
          console.error('Failed to sync settings from backend:', error);
        }
      },
    }),
    {
      name: 'ankrshield-settings', // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        // Only persist settings, not action functions
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure intentionally drops syncWithBackend from persisted shape
        const { syncWithBackend, ...settings } = state;
        return settings as Settings;
      },
    }
  )
);

// Apply theme to document
function applyTheme(theme: Theme) {
  const html = document.documentElement;

  if (theme === 'dark') {
    html.classList.add('dark');
  } else if (theme === 'light') {
    html.classList.remove('dark');
  } else {
    // Auto mode - use system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.classList.toggle('dark', prefersDark);
  }
}

// Sync setting to backend (electron-store)
async function syncSetting(key: string, value: any) {
  if (window.electronAPI?.settingsSet) {
    try {
      await window.electronAPI.settingsSet(key, value);
    } catch (error) {
      console.error(`Failed to sync setting ${key} to backend:`, error);
    }
  }
}

// Initialize theme on module load
if (typeof window !== 'undefined') {
  // Get initial theme from localStorage or default
  const stored = localStorage.getItem('ankrshield-settings');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      applyTheme(parsed.state?.theme || defaultSettings.theme);
    } catch {
      applyTheme(defaultSettings.theme);
    }
  } else {
    applyTheme(defaultSettings.theme);
  }

  // Listen for system theme changes when in auto mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentTheme = useSettingsStore.getState().theme;
    if (currentTheme === 'auto') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}

// Selector hooks
export const useTheme = () => useSettingsStore((state) => state.theme);
export const useCompactMode = () => useSettingsStore((state) => state.compactMode);
export const usePrivacyLevel = () => useSettingsStore((state) => state.privacyLevel);
export const useAutoStart = () => useSettingsStore((state) => state.autoStart);
