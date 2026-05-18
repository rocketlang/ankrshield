/**
 * Window Manager
 * Creates and manages the main application window
 */

import { app, BrowserWindow, shell, screen } from 'electron';
import * as path from 'path';
import { settingsService } from './services/settings.js';

let mainWindow: BrowserWindow | null = null;

/**
 * Check if running in development mode
 */
function isDev(): boolean {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

/**
 * Create main application window
 */
export function createMainWindow(): BrowserWindow {
  // Restore window state from settings
  const savedState = settingsService.getWindowState();
  const windowState = validateWindowState(savedState);

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    title: 'ankrshield',
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
    },
    show: false, // Show after ready-to-show
    backgroundColor: '#1a1a1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Load the app
  if (isDev()) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    // Restore maximized state
    if (windowState.isMaximized && mainWindow) {
      mainWindow.maximize();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Save window state on resize and move (debounced)
  let saveTimeout: NodeJS.Timeout | null = null;
  const debouncedSave = () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveWindowState();
    }, 500); // Save after 500ms of no changes
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);
  mainWindow.on('maximize', () => saveWindowState());
  mainWindow.on('unmaximize', () => saveWindowState());

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Clean up reference on closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Get main window instance
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Show main window
 */
export function showMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
}

/**
 * Hide main window
 */
export function hideMainWindow(): void {
  mainWindow?.hide();
}

/**
 * Toggle main window visibility
 */
export function toggleMainWindow(): void {
  if (mainWindow?.isVisible()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

/**
 * Get app icon path
 */
function getAppIcon(): string {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, '../assets/icons', iconName);
}

/**
 * Save window state (for persistence)
 */
export function saveWindowState(): void {
  if (!mainWindow) return;

  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();

  settingsService.saveWindowState({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized,
  });
}

/**
 * Validate window state to ensure it's visible on available displays
 */
function validateWindowState(state: any): {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
} {
  // Default values
  const defaults = {
    width: 1200,
    height: 800,
    isMaximized: false,
  };

  if (!state || typeof state !== 'object') {
    return defaults;
  }

  // Use saved dimensions
  const windowState = {
    width: state.width || defaults.width,
    height: state.height || defaults.height,
    x: state.x,
    y: state.y,
    isMaximized: state.isMaximized || defaults.isMaximized,
  };

  // Validate that window is visible on at least one display
  if (windowState.x !== undefined && windowState.y !== undefined) {
    const displays = screen.getAllDisplays();
    const isVisible = displays.some((display) => {
      const { x, y, width, height } = display.bounds;
      return (
        windowState.x! >= x &&
        windowState.y! >= y &&
        windowState.x! < x + width &&
        windowState.y! < y + height
      );
    });

    // If window is off-screen, center it on primary display
    if (!isVisible) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      windowState.x = Math.floor((width - windowState.width) / 2);
      windowState.y = Math.floor((height - windowState.height) / 2);
    }
  }

  return windowState;
}
