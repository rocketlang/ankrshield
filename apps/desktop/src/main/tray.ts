/**
 * System Tray Manager
 * Creates and manages the system tray icon and menu
 */

import { app, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { showMainWindow, toggleMainWindow } from './window';
import { checkForUpdates } from './updater';

let tray: Tray | null = null;
let privacyScore = 0;
let protectionEnabled = true;

/**
 * Create system tray
 */
export function createTray(): Tray {
  const icon = getTrayIcon();
  tray = new Tray(icon);

  updateTrayMenu();

  // Click handler (show/hide window)
  tray.on('click', () => {
    toggleMainWindow();
  });

  tray.setToolTip('ankrshield - Privacy Protection');

  return tray;
}

/**
 * Get tray icon based on platform
 */
function getTrayIcon(): ReturnType<typeof nativeImage.createEmpty> {
  const iconName = getTrayIconName();
  const iconPath = path.join(__dirname, '../assets/tray', iconName);

  let icon: ReturnType<typeof nativeImage.createEmpty>;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (error) {
    // Fallback: create a simple colored rectangle
    icon = nativeImage.createEmpty();
  }

  // macOS requires template images
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  return icon;
}

/**
 * Get platform-specific tray icon name
 */
function getTrayIconName(): string {
  switch (process.platform) {
    case 'darwin':
      return 'icon-Template.png'; // macOS template icon
    case 'win32':
      return 'icon.ico';
    default:
      return 'icon.png';
  }
}

/**
 * Update tray menu
 */
function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'ankrshield',
      enabled: false,
      icon: getStatusIcon(),
    },
    {
      label: `Privacy Score: ${privacyScore}/100`,
      id: 'privacy-score',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Dashboard',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: protectionEnabled ? 'Protection: Enabled ✓' : 'Protection: Disabled',
      id: 'protection-toggle',
      type: 'checkbox',
      checked: protectionEnabled,
      click: () => toggleProtection(),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        showMainWindow();
        // TODO: Navigate to settings page
      },
    },
    {
      label: 'Check for Updates',
      click: () => checkForUpdates(),
    },
    { type: 'separator' },
    {
      label: 'Quit ankrshield',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Get status icon based on privacy score
 */
function getStatusIcon(): ReturnType<typeof nativeImage.createEmpty> | undefined {
  // Optional: return different icon based on status
  return undefined;
}

/**
 * Update privacy score in tray
 */
export function updatePrivacyScore(score: number): void {
  privacyScore = score;
  updateTrayMenu();

  // Update tooltip
  if (tray) {
    const level = getScoreLevel(score);
    tray.setToolTip(`ankrshield - Privacy Score: ${score}/100 (${level})`);
  }
}

/**
 * Get score level label
 */
function getScoreLevel(score: number): string {
  if (score <= 30) return 'Excellent';
  if (score <= 60) return 'Good';
  if (score <= 80) return 'Poor';
  return 'Critical';
}

/**
 * Toggle protection status
 */
function toggleProtection(): void {
  protectionEnabled = !protectionEnabled;
  updateTrayMenu();

  // Emit event to main window
  app.emit('protection-toggled', protectionEnabled);
}

/**
 * Update protection status
 */
export function updateProtectionStatus(enabled: boolean): void {
  protectionEnabled = enabled;
  updateTrayMenu();
}

/**
 * Get tray instance
 */
export function getTray(): Tray | null {
  return tray;
}

/**
 * Destroy tray
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
