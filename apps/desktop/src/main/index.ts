/**
 * Main Process Entry Point
 * Electron main process for ankrshield desktop application
 */

import { app, BrowserWindow } from 'electron';
import { createTray } from './tray';
import { createMainWindow } from './window';
import { setupIPC } from './ipc';
import { setupAutoLaunch } from './auto-launch';
import { setupAutoUpdater } from './updater';
import { NotificationService } from './notifications';
import { serviceManager } from './services/service-manager';
import './types';

// Enable sandbox bypass for development/testing (required when running as root)
app.commandLine.appendSwitch('no-sandbox');

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Global references
export const notificationService = new NotificationService();

/**
 * App ready handler
 */
app.whenReady().then(async () => {
  console.log('ankrshield desktop starting...');

  try {
    // Initialize all services (database, DNS, network, privacy)
    await serviceManager.initialize();

    // Get service health status
    const health = serviceManager.getHealthSummary();
    console.log('Service health:', health.healthy ? '✓ Healthy' : '⚠ Degraded');
    health.services.forEach((s) => {
      const emoji = s.status === 'running' ? '✓' : s.status === 'degraded' ? '⚠' : '✗';
      console.log(`  ${emoji} ${s.name}: ${s.status} ${s.message ? `(${s.message})` : ''}`);
    });

    // Setup IPC handlers (requires services to be initialized)
    setupIPC();

    // Setup auto-launch
    await setupAutoLaunch();

    // Create system tray
    createTray();

    // Create main window
    createMainWindow();

    // Setup auto-updater
    setupAutoUpdater();

    console.log('ankrshield desktop ready');
  } catch (error) {
    console.error('Failed to initialize ankrshield:', error);

    // Show error notification
    notificationService.showError(
      'Initialization Failed',
      'ankrshield failed to start. Please check the logs.'
    );

    // Exit with error code
    app.exit(1);
  }
});

/**
 * All windows closed handler
 */
app.on('window-all-closed', () => {
  // On macOS, apps stay active until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Activate handler (macOS)
 */
app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

/**
 * Before quit handler
 */
app.on('before-quit', async () => {
  // Set flag so window close doesn't prevent quit
  (app as any).isQuitting = true;

  // Cleanup all services
  console.log('Shutting down services...');
  try {
    await serviceManager.shutdown();
    console.log('Services shutdown complete');
  } catch (error) {
    console.error('Error shutting down services:', error);
  }
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
