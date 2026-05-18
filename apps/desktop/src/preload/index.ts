/**
 * Preload Script
 * Context bridge between main and renderer processes
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose protected methods to renderer via context bridge
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Privacy Score
  getPrivacyScore: () => ipcRenderer.invoke('get-privacy-score'),
  getScoreHistory: (days: number) => ipcRenderer.invoke('get-score-history', days),
  getScoreBreakdown: () => ipcRenderer.invoke('get-score-breakdown'),

  // Protection Status
  getProtectionStatus: () => ipcRenderer.invoke('get-protection-status'),
  getDnsProtectionStatus: () => ipcRenderer.invoke('get-dns-protection-status'),
  toggleProtection: (enabled: boolean) => ipcRenderer.invoke('toggle-protection', enabled),

  // Network Monitoring
  getNetworkEvents: (limit: number) => ipcRenderer.invoke('get-network-events', limit),
  getNetworkStats: () => ipcRenderer.invoke('get-network-stats'),

  // DNS
  getDnsStats: () => ipcRenderer.invoke('get-dns-stats'),
  getDnsQueries: (limit: number) => ipcRenderer.invoke('get-dns-queries', limit),

  // Trackers
  getTopTrackers: (limit: number) => ipcRenderer.invoke('get-top-trackers', limit),
  getTrackerStats: () => ipcRenderer.invoke('get-tracker-stats'),

  // Settings (individual getters/setters)
  settingsGet: (key: string) => ipcRenderer.invoke('settings:get', key),
  settingsSet: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  settingsGetAll: () => ipcRenderer.invoke('settings:getAll'),
  settingsReset: () => ipcRenderer.invoke('settings:reset'),

  // Settings (legacy - full object)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),

  // Notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.send('show-notification', { title, body }),

  // Reports
  generateDailyReport: (date: Date) => ipcRenderer.invoke('generate-daily-report', date),
  generateWeeklyReport: (startDate: Date) =>
    ipcRenderer.invoke('generate-weekly-report', startDate),
  generateMonthlyReport: (month: number, year: number) =>
    ipcRenderer.invoke('generate-monthly-report', month, year),

  // Events (one-way from main to renderer)
  onPrivacyScoreUpdate: (callback: (score: any) => void) => {
    ipcRenderer.on('privacy-score-updated', (_event, score) => callback(score));
  },
  onProtectionToggled: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('protection-toggled', (_event, enabled) => callback(enabled));
  },
  onTrackerBlocked: (callback: (data: any) => void) => {
    ipcRenderer.on('tracker-blocked', (_event, data) => callback(data));
  },
});

/**
 * Type definitions for renderer process
 */
export interface ElectronAPI {
  // Privacy Score
  getPrivacyScore: () => Promise<any>;
  getScoreHistory: (days: number) => Promise<any[]>;
  getScoreBreakdown: () => Promise<any>;

  // Protection Status
  getProtectionStatus: () => Promise<boolean>;
  getDnsProtectionStatus: () => Promise<boolean>;
  toggleProtection: (enabled: boolean) => Promise<any>;

  // Network Monitoring
  getNetworkEvents: (limit: number) => Promise<any[]>;
  getNetworkStats: () => Promise<any>;

  // DNS
  getDnsStats: () => Promise<any>;
  getDnsQueries: (limit: number) => Promise<any[]>;

  // Trackers
  getTopTrackers: (limit: number) => Promise<any[]>;
  getTrackerStats: () => Promise<any>;

  // Settings (individual)
  settingsGet: (key: string) => Promise<any>;
  settingsSet: (key: string, value: any) => Promise<void>;
  settingsGetAll: () => Promise<any>;
  settingsReset: () => Promise<void>;

  // Settings (legacy)
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;

  // Notifications
  showNotification: (title: string, body: string) => void;

  // Reports
  generateDailyReport: (date: Date) => Promise<any>;
  generateWeeklyReport: (startDate: Date) => Promise<any>;
  generateMonthlyReport: (month: number, year: number) => Promise<any>;

  // Events
  onPrivacyScoreUpdate: (callback: (score: any) => void) => void;
  onProtectionToggled: (callback: (enabled: boolean) => void) => void;
  onTrackerBlocked: (callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
