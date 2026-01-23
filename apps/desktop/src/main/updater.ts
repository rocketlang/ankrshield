/**
 * Auto-Updater
 * Manages application updates
 */

import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import { notificationService } from './index.js';

let updateCheckInterval: NodeJS.Timeout | null = null;

/**
 * Setup auto-updater
 */
export function setupAutoUpdater(): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('Auto-updater disabled in development mode');
    return;
  }

  // Configure auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates on startup (after 10 seconds)
  setTimeout(() => {
    checkForUpdates();
  }, 10000);

  // Check for updates every 4 hours
  updateCheckInterval = setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000);

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    notificationService.showUpdateAvailable(info.version);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('No updates available. Current version:', info.version);
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`Download progress: ${percent}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    notificationService.showUpdateDownloaded(info.version);
  });

  autoUpdater.on('error', (error) => {
    console.error('Update error:', error);
  });

  console.log('Auto-updater configured');
}

/**
 * Check for updates manually
 */
export function checkForUpdates(): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('Update check skipped (development mode)');
    return;
  }

  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Error checking for updates:', error);
  }
}

/**
 * Quit and install update
 */
export function quitAndInstall(): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('Quit and install skipped (development mode)');
    return;
  }

  try {
    (app as any).isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    console.error('Error installing update:', error);
  }
}

/**
 * Cleanup on app quit
 */
export function cleanupUpdater(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}
