/**
 * IPC Handlers
 * Connect React UI to backend services
 */

import { ipcMain } from 'electron';
import { PrivacyService } from '../services/privacy';
import { DNSService } from '../services/dns';
import { NetworkService } from '../services/network';
import { settingsService } from '../services/settings';

// Create service instances
const privacyService = new PrivacyService();
const dnsService = new DNSService();
const networkService = new NetworkService();

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  // Privacy Service Handlers
  ipcMain.handle('privacy:getScore', async () => {
    try {
      const score = await privacyService.getCurrentScore();
      return { success: true, data: score };
    } catch (error) {
      console.error('IPC privacy:getScore error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('privacy:getBreakdown', async () => {
    try {
      const breakdown = await privacyService.getScoreBreakdown();
      return { success: true, data: breakdown };
    } catch (error) {
      console.error('IPC privacy:getBreakdown error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('privacy:getHistory', async (_, days: number = 7) => {
    try {
      const history = await privacyService.getScoreHistory(days);
      return { success: true, data: history };
    } catch (error) {
      console.error('IPC privacy:getHistory error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // DNS Service Handlers
  ipcMain.handle('dns:getStats', async () => {
    try {
      const stats = await dnsService.getStats();
      return { success: true, data: stats };
    } catch (error) {
      console.error('IPC dns:getStats error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('dns:getRecentQueries', async (_, limit: number = 50) => {
    try {
      const queries = await dnsService.getRecentQueries(limit);
      return { success: true, data: queries };
    } catch (error) {
      console.error('IPC dns:getRecentQueries error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('dns:toggleProtection', async (_, enabled: boolean) => {
    try {
      // TODO: Implement protection toggle in DNS service
      console.log(`DNS protection ${enabled ? 'enabled' : 'disabled'}`);
      return { success: true, data: { enabled } };
    } catch (error) {
      console.error('IPC dns:toggleProtection error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('dns:isProtectionEnabled', async () => {
    try {
      // TODO: Implement protection status in DNS service
      // For now, always return true (protection is always on)
      return { success: true, data: true };
    } catch (error) {
      console.error('IPC dns:isProtectionEnabled error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Network Service Handlers
  ipcMain.handle('network:getEvents', async (_, limit: number = 50) => {
    try {
      const events = await networkService.getRecentEvents(limit);
      return { success: true, data: events };
    } catch (error) {
      console.error('IPC network:getEvents error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('network:getStats', async () => {
    try {
      const stats = await networkService.getStats();
      return { success: true, data: stats };
    } catch (error) {
      console.error('IPC network:getStats error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('network:toggleProtection', async (_, enabled: boolean) => {
    try {
      await networkService.setProtectionEnabled(enabled);
      return { success: true, data: { enabled } };
    } catch (error) {
      console.error('IPC network:toggleProtection error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('network:isProtectionEnabled', async () => {
    try {
      const enabled = networkService.isProtectionEnabled();
      return { success: true, data: enabled };
    } catch (error) {
      console.error('IPC network:isProtectionEnabled error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Settings Handlers
  ipcMain.handle('settings:get', async (_, key: string) => {
    try {
      const value = settingsService.get(key as any);
      return { success: true, data: value };
    } catch (error) {
      console.error('IPC settings:get error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('settings:set', async (_, key: string, value: any) => {
    try {
      settingsService.set(key as any, value);
      return { success: true };
    } catch (error) {
      console.error('IPC settings:set error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('settings:getAll', async () => {
    try {
      const settings = settingsService.getAll();
      return { success: true, data: settings };
    } catch (error) {
      console.error('IPC settings:getAll error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('settings:reset', async () => {
    try {
      settingsService.reset();
      return { success: true };
    } catch (error) {
      console.error('IPC settings:reset error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Protection Status Handlers (for appStore)
  ipcMain.handle('get-protection-status', async () => {
    try {
      const enabled = networkService.isProtectionEnabled();
      return { success: true, data: enabled };
    } catch (error) {
      console.error('IPC get-protection-status error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-dns-protection-status', async () => {
    try {
      // TODO: Add real DNS protection status from dnsService
      // For now, return true (DNS is always on)
      return { success: true, data: true };
    } catch (error) {
      console.error('IPC get-dns-protection-status error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Legacy flat handlers (for backward compatibility)
  ipcMain.handle('get-privacy-score', async () => {
    try {
      const score = await privacyService.getCurrentScore();
      return { success: true, data: score };
    } catch (error) {
      console.error('IPC get-privacy-score error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-score-history', async (_, days: number = 7) => {
    try {
      const history = await privacyService.getScoreHistory(days);
      return { success: true, data: history };
    } catch (error) {
      console.error('IPC get-score-history error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-score-breakdown', async () => {
    try {
      const breakdown = await privacyService.getScoreBreakdown();
      return { success: true, data: breakdown };
    } catch (error) {
      console.error('IPC get-score-breakdown error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-network-events', async (_, limit: number = 50) => {
    try {
      const events = await networkService.getRecentEvents(limit);
      return { success: true, data: events };
    } catch (error) {
      console.error('IPC get-network-events error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-network-stats', async () => {
    try {
      const stats = await networkService.getStats();
      return { success: true, data: stats };
    } catch (error) {
      console.error('IPC get-network-stats error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('toggle-protection', async (_, enabled: boolean) => {
    try {
      await networkService.setProtectionEnabled(enabled);
      return { success: true, data: { enabled } };
    } catch (error) {
      console.error('IPC toggle-protection error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-dns-stats', async () => {
    try {
      const stats = await dnsService.getStats();
      return { success: true, data: stats };
    } catch (error) {
      console.error('IPC get-dns-stats error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-dns-queries', async (_, limit: number = 50) => {
    try {
      const queries = await dnsService.getRecentQueries(limit);
      return { success: true, data: queries };
    } catch (error) {
      console.error('IPC get-dns-queries error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-top-trackers', async (_, limit: number = 5) => {
    try {
      const trackers = await privacyService.getTopTrackers(limit);
      return { success: true, data: trackers };
    } catch (error) {
      console.error('IPC get-top-trackers error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-tracker-stats', async () => {
    try {
      const stats = await privacyService.getTrackerStats();
      return { success: true, data: stats };
    } catch (error) {
      console.error('IPC get-tracker-stats error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('get-settings', async () => {
    try {
      const settings = settingsService.getAll();
      return { success: true, data: settings };
    } catch (error) {
      console.error('IPC get-settings error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('update-settings', async (_, settings: any) => {
    try {
      settingsService.setAll(settings);
      return { success: true };
    } catch (error) {
      console.error('IPC update-settings error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // General App Handlers
  ipcMain.handle('app:getVersion', async () => {
    try {
      const { app } = await import('electron');
      return { success: true, data: app.getVersion() };
    } catch (error) {
      console.error('IPC app:getVersion error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('app:quit', async () => {
    try {
      const { app } = await import('electron');

      // Cleanup services
      await privacyService.close();
      await dnsService.close();
      await networkService.close();

      app.quit();
      return { success: true };
    } catch (error) {
      console.error('IPC app:quit error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  console.log('✅ IPC handlers registered');
}

/**
 * Cleanup IPC handlers
 */
export function unregisterIPCHandlers(): void {
  // Namespaced handlers
  ipcMain.removeHandler('privacy:getScore');
  ipcMain.removeHandler('privacy:getBreakdown');
  ipcMain.removeHandler('privacy:getHistory');
  ipcMain.removeHandler('dns:getStats');
  ipcMain.removeHandler('dns:getRecentQueries');
  ipcMain.removeHandler('dns:toggleProtection');
  ipcMain.removeHandler('dns:isProtectionEnabled');
  ipcMain.removeHandler('network:getEvents');
  ipcMain.removeHandler('network:getStats');
  ipcMain.removeHandler('network:toggleProtection');
  ipcMain.removeHandler('network:isProtectionEnabled');

  // Settings handlers
  ipcMain.removeHandler('settings:get');
  ipcMain.removeHandler('settings:set');
  ipcMain.removeHandler('settings:getAll');
  ipcMain.removeHandler('settings:reset');

  // Protection status handlers
  ipcMain.removeHandler('get-protection-status');
  ipcMain.removeHandler('get-dns-protection-status');

  // Legacy flat handlers
  ipcMain.removeHandler('get-privacy-score');
  ipcMain.removeHandler('get-score-history');
  ipcMain.removeHandler('get-score-breakdown');
  ipcMain.removeHandler('get-network-events');
  ipcMain.removeHandler('get-network-stats');
  ipcMain.removeHandler('toggle-protection');
  ipcMain.removeHandler('get-dns-stats');
  ipcMain.removeHandler('get-dns-queries');
  ipcMain.removeHandler('get-top-trackers');
  ipcMain.removeHandler('get-tracker-stats');
  ipcMain.removeHandler('get-settings');
  ipcMain.removeHandler('update-settings');

  // App handlers
  ipcMain.removeHandler('app:getVersion');
  ipcMain.removeHandler('app:quit');

  console.log('✅ IPC handlers unregistered');
}
