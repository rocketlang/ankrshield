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

  // Network Monitoring
  getNetworkEvents: (limit: number) => ipcRenderer.invoke('get-network-events', limit),
  getNetworkStats: () => ipcRenderer.invoke('get-network-stats'),
  toggleProtection: (enabled: boolean) => ipcRenderer.invoke('toggle-protection', enabled),

  // DNS
  getDNSStats: () => ipcRenderer.invoke('get-dns-stats'),
  getDNSQueries: (limit: number) => ipcRenderer.invoke('get-dns-queries', limit),

  // Trackers
  getTopTrackers: (limit: number) => ipcRenderer.invoke('get-top-trackers', limit),
  getTrackerStats: () => ipcRenderer.invoke('get-tracker-stats'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),

  // Notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.send('show-notification', { title, body }),

  // Reports
  generateDailyReport: (date: Date) => ipcRenderer.invoke('generate-daily-report', date),
  generateWeeklyReport: (startDate: Date) => ipcRenderer.invoke('generate-weekly-report', startDate),
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
  getPrivacyScore: () => Promise<any>;
  getScoreHistory: (days: number) => Promise<any[]>;
  getScoreBreakdown: () => Promise<any>;
  getNetworkEvents: (limit: number) => Promise<any[]>;
  getNetworkStats: () => Promise<any>;
  toggleProtection: (enabled: boolean) => Promise<any>;
  getDNSStats: () => Promise<any>;
  getDNSQueries: (limit: number) => Promise<any[]>;
  getTopTrackers: (limit: number) => Promise<any[]>;
  getTrackerStats: () => Promise<any>;
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;
  showNotification: (title: string, body: string) => void;
  generateDailyReport: (date: Date) => Promise<any>;
  generateWeeklyReport: (startDate: Date) => Promise<any>;
  generateMonthlyReport: (month: number, year: number) => Promise<any>;
  onPrivacyScoreUpdate: (callback: (score: any) => void) => void;
  onProtectionToggled: (callback: (enabled: boolean) => void) => void;
  onTrackerBlocked: (callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
