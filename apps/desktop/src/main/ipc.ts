/**
 * IPC Handler
 * Inter-Process Communication between main and renderer
 */

import { ipcMain } from 'electron';
import { PrivacyService } from './services/privacy.js';
import { NetworkService } from './services/network.js';
import { DNSService } from './services/dns.js';
import { updatePrivacyScore, updateProtectionStatus } from './tray.js';

// Service instances
const privacyService = new PrivacyService();
const networkService = new NetworkService();
const dnsService = new DNSService();

/**
 * Setup IPC handlers
 */
export function setupIPC(): void {
  console.log('Setting up IPC handlers...');

  // Privacy Score
  ipcMain.handle('get-privacy-score', async () => {
    try {
      const score = await privacyService.getCurrentScore();
      updatePrivacyScore(score.totalScore);
      return score;
    } catch (error) {
      console.error('Error getting privacy score:', error);
      return { totalScore: 0, level: 'unknown', error: String(error) };
    }
  });

  ipcMain.handle('get-score-history', async (_event, days: number) => {
    try {
      return await privacyService.getScoreHistory(days);
    } catch (error) {
      console.error('Error getting score history:', error);
      return [];
    }
  });

  ipcMain.handle('get-score-breakdown', async () => {
    try {
      return await privacyService.getScoreBreakdown();
    } catch (error) {
      console.error('Error getting score breakdown:', error);
      return null;
    }
  });

  // Network Monitoring
  ipcMain.handle('get-network-events', async (_event, limit: number) => {
    try {
      return await networkService.getRecentEvents(limit);
    } catch (error) {
      console.error('Error getting network events:', error);
      return [];
    }
  });

  ipcMain.handle('get-network-stats', async () => {
    try {
      return await networkService.getStats();
    } catch (error) {
      console.error('Error getting network stats:', error);
      return null;
    }
  });

  ipcMain.handle('toggle-protection', async (_event, enabled: boolean) => {
    try {
      await networkService.setProtectionEnabled(enabled);
      updateProtectionStatus(enabled);
      return { success: true, enabled };
    } catch (error) {
      console.error('Error toggling protection:', error);
      return { success: false, error: String(error) };
    }
  });

  // DNS
  ipcMain.handle('get-dns-stats', async () => {
    try {
      return await dnsService.getStats();
    } catch (error) {
      console.error('Error getting DNS stats:', error);
      return null;
    }
  });

  ipcMain.handle('get-dns-queries', async (_event, limit: number) => {
    try {
      return await dnsService.getRecentQueries(limit);
    } catch (error) {
      console.error('Error getting DNS queries:', error);
      return [];
    }
  });

  // Trackers
  ipcMain.handle('get-top-trackers', async (_event, limit: number) => {
    try {
      return await privacyService.getTopTrackers(limit);
    } catch (error) {
      console.error('Error getting top trackers:', error);
      return [];
    }
  });

  ipcMain.handle('get-tracker-stats', async () => {
    try {
      return await privacyService.getTrackerStats();
    } catch (error) {
      console.error('Error getting tracker stats:', error);
      return null;
    }
  });

  // Settings
  ipcMain.handle('get-settings', async () => {
    try {
      // TODO: Implement settings storage (electron-store)
      return {
        autoLaunch: false,
        notifications: true,
        protectionEnabled: true,
      };
    } catch (error) {
      console.error('Error getting settings:', error);
      return null;
    }
  });

  ipcMain.handle('update-settings', async (_event, settings: any) => {
    try {
      // TODO: Implement settings storage
      console.log('Updating settings:', settings);
      return { success: true };
    } catch (error) {
      console.error('Error updating settings:', error);
      return { success: false, error: String(error) };
    }
  });

  // Notifications
  ipcMain.on('show-notification', (_event, { title, body }) => {
    // Handled by NotificationService in main process
    console.log('Notification request:', title, body);
  });

  // Reports
  ipcMain.handle('generate-daily-report', async (_event, date: Date) => {
    try {
      return await privacyService.generateDailyReport(date);
    } catch (error) {
      console.error('Error generating daily report:', error);
      return null;
    }
  });

  ipcMain.handle('generate-weekly-report', async (_event, startDate: Date) => {
    try {
      return await privacyService.generateWeeklyReport(startDate);
    } catch (error) {
      console.error('Error generating weekly report:', error);
      return null;
    }
  });

  ipcMain.handle('generate-monthly-report', async (_event, month: number, year: number) => {
    try {
      return await privacyService.generateMonthlyReport(month, year);
    } catch (error) {
      console.error('Error generating monthly report:', error);
      return null;
    }
  });

  console.log('IPC handlers ready');
}
