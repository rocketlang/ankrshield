/**
 * Settings Service
 * Manages persistent user settings using electron-store
 */

import Store from 'electron-store';

// Settings schema
export interface Settings {
  // Appearance
  theme: 'light' | 'dark' | 'auto';
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

  // Window state (managed separately but stored here)
  windowState?: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized: boolean;
  };
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

  // Window state
  windowState: {
    width: 1200,
    height: 800,
    isMaximized: false,
  },
};

/**
 * Settings Service
 * Singleton service for managing application settings
 */
export class SettingsService {
  private store: Store<Settings>;
  private initialized = false;

  constructor() {
    this.store = new Store<Settings>({
      name: 'ankrshield-settings',
      defaults: defaultSettings,
      schema: {
        theme: {
          type: 'string',
          enum: ['light', 'dark', 'auto'],
          default: 'dark',
        },
        compactMode: {
          type: 'boolean',
          default: false,
        },
        showNotifications: {
          type: 'boolean',
          default: true,
        },
        showDesktopNotifications: {
          type: 'boolean',
          default: true,
        },
        notifyOnBlock: {
          type: 'boolean',
          default: false,
        },
        privacyLevel: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          default: 8,
        },
        autoBlockTrackers: {
          type: 'boolean',
          default: true,
        },
        blockAnalytics: {
          type: 'boolean',
          default: true,
        },
        blockAdvertising: {
          type: 'boolean',
          default: true,
        },
        blockSocialMedia: {
          type: 'boolean',
          default: false,
        },
        autoStart: {
          type: 'boolean',
          default: false,
        },
        minimizeToTray: {
          type: 'boolean',
          default: true,
        },
        startMinimized: {
          type: 'boolean',
          default: false,
        },
        enableDnsLogging: {
          type: 'boolean',
          default: true,
        },
        enableNetworkLogging: {
          type: 'boolean',
          default: true,
        },
        batchSize: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          default: 100,
        },
        flushInterval: {
          type: 'number',
          minimum: 1000,
          maximum: 60000,
          default: 5000,
        },
      },
    });
  }

  /**
   * Initialize service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('Settings service initialized');
    console.log('Store path:', this.store.path);
    this.initialized = true;
  }

  /**
   * Get a single setting by key
   */
  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.store.get(key);
  }

  /**
   * Set a single setting by key
   */
  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    // Validate privacyLevel range
    if (key === 'privacyLevel' && typeof value === 'number') {
      value = Math.max(1, Math.min(10, value)) as Settings[K];
    }

    this.store.set(key, value);
    console.log(`Setting updated: ${String(key)} =`, value);
  }

  /**
   * Get all settings
   */
  getAll(): Settings {
    return this.store.store;
  }

  /**
   * Update multiple settings at once
   */
  setAll(settings: Partial<Settings>): void {
    Object.entries(settings).forEach(([key, value]) => {
      this.set(key as keyof Settings, value);
    });
  }

  /**
   * Reset all settings to defaults
   */
  reset(): void {
    this.store.clear();
    console.log('Settings reset to defaults');
  }

  /**
   * Get window state
   */
  getWindowState(): Settings['windowState'] {
    return this.get('windowState');
  }

  /**
   * Save window state
   */
  saveWindowState(state: Settings['windowState']): void {
    this.set('windowState', state);
  }

  /**
   * Check if a specific feature is enabled
   */
  isFeatureEnabled(feature: keyof Settings): boolean {
    const value = this.get(feature);
    return typeof value === 'boolean' ? value : false;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    // electron-store doesn't need explicit cleanup
    this.initialized = false;
    console.log('Settings service cleaned up');
  }
}

// Singleton instance
let instance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!instance) {
    instance = new SettingsService();
  }
  return instance;
}

// Export singleton
export const settingsService = getSettingsService();
