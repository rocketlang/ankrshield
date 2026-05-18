/**
 * Auto-Launch Manager
 * Manages application auto-launch on system startup
 */

import { app } from 'electron';

/**
 * Check if auto-launch is supported
 */
function isAutoLaunchSupported(): boolean {
  // Auto-launch supported on macOS, Windows, and Linux with systemd
  return (
    process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux'
  );
}

/**
 * Setup auto-launch based on user settings
 */
export async function setupAutoLaunch(): Promise<void> {
  if (!isAutoLaunchSupported()) {
    console.log('Auto-launch not supported on this platform');
    return;
  }

  try {
    // TODO: Load from user settings
    const shouldAutoLaunch = false;

    if (shouldAutoLaunch) {
      await enableAutoLaunch();
    } else {
      await disableAutoLaunch();
    }
  } catch (error) {
    console.error('Error setting up auto-launch:', error);
  }
}

/**
 * Enable auto-launch
 */
export async function enableAutoLaunch(): Promise<boolean> {
  if (!isAutoLaunchSupported()) {
    return false;
  }

  try {
    // Use Electron's built-in app.setLoginItemSettings
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true, // Start minimized to tray
      path: app.getPath('exe'),
    });

    console.log('Auto-launch enabled');
    return true;
  } catch (error) {
    console.error('Error enabling auto-launch:', error);
    return false;
  }
}

/**
 * Disable auto-launch
 */
export async function disableAutoLaunch(): Promise<boolean> {
  if (!isAutoLaunchSupported()) {
    return false;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: false,
    });

    console.log('Auto-launch disabled');
    return true;
  } catch (error) {
    console.error('Error disabling auto-launch:', error);
    return false;
  }
}

/**
 * Check if auto-launch is enabled
 */
export function isAutoLaunchEnabled(): boolean {
  if (!isAutoLaunchSupported()) {
    return false;
  }

  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (error) {
    console.error('Error checking auto-launch status:', error);
    return false;
  }
}

/**
 * Toggle auto-launch
 */
export async function toggleAutoLaunch(): Promise<boolean> {
  const currentStatus = isAutoLaunchEnabled();

  if (currentStatus) {
    return await disableAutoLaunch();
  } else {
    return await enableAutoLaunch();
  }
}
