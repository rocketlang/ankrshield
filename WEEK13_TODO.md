# Week 13-14: Desktop Application (Electron)

**Timeline:** Apr 16 - Apr 30, 2026 (Accelerated: Jan 22, 2026)
**Status:** In Progress
**Package:** `apps/desktop`

---

## Overview

Week 13-14 focuses on building a cross-platform desktop application using Electron that provides a native app experience for ankrshield. The app will integrate all backend services (DNS resolver, network monitoring, tracker classification, privacy scoring) into a user-friendly desktop interface with system tray, notifications, and auto-launch capabilities.

---

## Objectives

1. Create Electron application with React frontend
2. Implement system tray with quick actions
3. Build main window with dashboard integration
4. Add IPC (Inter-Process Communication) for backend integration
5. Implement auto-launch on system startup
6. Add native notifications for privacy alerts
7. Setup auto-update mechanism
8. Cross-platform testing (Windows, macOS, Linux)

---

## Architecture

### Application Structure

```
apps/desktop/
├── src/
│   ├── main/                    # Main process (Node.js)
│   │   ├── index.ts            # Main entry point
│   │   ├── tray.ts             # System tray manager
│   │   ├── window.ts           # Window manager
│   │   ├── ipc.ts              # IPC handlers
│   │   ├── auto-launch.ts      # Auto-launch manager
│   │   ├── notifications.ts    # Native notifications
│   │   └── services/           # Backend service integrations
│   │       ├── privacy.ts      # Privacy score service
│   │       ├── network.ts      # Network monitor service
│   │       └── dns.ts          # DNS resolver service
│   ├── renderer/               # Renderer process (React)
│   │   ├── App.tsx            # Main React app
│   │   ├── components/        # UI components
│   │   ├── pages/             # App pages
│   │   ├── hooks/             # Custom React hooks
│   │   └── store/             # State management
│   └── preload/               # Preload scripts
│       └── index.ts           # Context bridge
├── assets/
│   ├── icons/                 # App icons (multiple sizes)
│   └── tray/                  # Tray icons
├── electron-forge.config.ts   # Electron Forge config
├── package.json
└── tsconfig.json
```

---

## Tasks Breakdown

### Phase 1: Electron Setup (Days 1-2)

**Create Application Structure:**
- [ ] Initialize apps/desktop package
- [ ] Install Electron and Electron Forge
- [ ] Setup TypeScript configuration
- [ ] Create main process entry point
- [ ] Create renderer process (React)
- [ ] Setup Vite for renderer bundling
- [ ] Configure Electron Forge

**Dependencies:**
```json
{
  "dependencies": {
    "@electron/remote": "^2.1.2",
    "electron-squirrel-startup": "^1.0.0"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.2.0",
    "@electron-forge/maker-deb": "^7.2.0",
    "@electron-forge/maker-dmg": "^7.2.0",
    "@electron-forge/maker-squirrel": "^7.2.0",
    "@electron-forge/maker-zip": "^7.2.0",
    "@electron-forge/plugin-vite": "^7.2.0",
    "electron": "^28.0.0"
  }
}
```

**Main Process Setup:**
```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { createTray } from './tray';
import { setupIPC } from './ipc';
import { setupAutoLaunch } from './auto-launch';

app.whenReady().then(async () => {
  setupIPC();
  await setupAutoLaunch();
  createTray();
  createMainWindow();
});
```

---

### Phase 2: System Tray (Days 3-4)

**File:** `src/main/tray.ts`

**Features:**
- System tray icon with context menu
- Quick actions menu
- Privacy score display
- Show/hide main window
- Pause/resume protection
- Quit application

**Tray Menu:**
```
┌─────────────────────────────┐
│ ankrshield                  │
│ Privacy Score: 25/100 ✓     │
├─────────────────────────────┤
│ Show Dashboard              │
│ ───────────────────────     │
│ Protection: Enabled ✓       │
│ Pause Protection            │
│ ───────────────────────     │
│ Settings                    │
│ Check for Updates           │
│ ───────────────────────     │
│ Quit ankrshield             │
└─────────────────────────────┘
```

**Implementation:**
```typescript
import { Tray, Menu, nativeImage } from 'electron';

export function createTray(): Tray {
  const tray = new Tray(getTrayIcon());
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'ankrshield',
      enabled: false,
    },
    {
      label: 'Privacy Score: --',
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
      label: 'Protection: Enabled',
      id: 'protection-toggle',
      type: 'checkbox',
      checked: true,
      click: toggleProtection,
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => showSettings(),
    },
    {
      label: 'Check for Updates',
      click: () => checkForUpdates(),
    },
    { type: 'separator' },
    {
      label: 'Quit ankrshield',
      click: () => app.quit(),
    },
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('ankrshield - Privacy Protection');
  
  return tray;
}
```

**Platform-Specific Icons:**
- macOS: Template icon (black/white, 16x16@2x)
- Windows: ICO file (16x16, 24x24, 32x32, 48x48)
- Linux: PNG file (22x22, 24x24)

---

### Phase 3: Main Window (Days 5-7)

**File:** `src/main/window.ts`

**Features:**
- BrowserWindow with React renderer
- Window state persistence
- Minimize to tray
- Native menus (macOS)
- Keyboard shortcuts
- Dev tools in development

**Window Configuration:**
```typescript
import { BrowserWindow } from 'electron';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'ankrshield',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Show after ready-to-show
  });

  // Load React app
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile('dist/renderer/index.html');
  }

  // Show window when ready
  win.once('ready-to-show', () => {
    win.show();
  });

  // Minimize to tray instead of closing
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}
```

---

### Phase 4: IPC Communication (Days 8-9)

**File:** `src/main/ipc.ts`

**IPC Channels:**
```typescript
// Privacy score
ipcMain.handle('get-privacy-score', async () => {
  return await privacyService.getCurrentScore();
});

ipcMain.handle('get-score-history', async (event, days: number) => {
  return await privacyService.getScoreHistory(days);
});

// Network monitoring
ipcMain.handle('get-network-events', async (event, limit: number) => {
  return await networkService.getRecentEvents(limit);
});

ipcMain.handle('toggle-protection', async (event, enabled: boolean) => {
  return await networkService.setProtectionEnabled(enabled);
});

// DNS filtering
ipcMain.handle('get-dns-stats', async () => {
  return await dnsService.getStats();
});

// Trackers
ipcMain.handle('get-top-trackers', async (event, limit: number) => {
  return await trackerService.getTopTrackers(limit);
});

// Settings
ipcMain.handle('get-settings', async () => {
  return store.get('settings');
});

ipcMain.handle('update-settings', async (event, settings) => {
  store.set('settings', settings);
  return true;
});

// Notifications
ipcMain.on('show-notification', (event, { title, body }) => {
  notificationService.show(title, body);
});
```

**Preload Script:**
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Privacy
  getPrivacyScore: () => ipcRenderer.invoke('get-privacy-score'),
  getScoreHistory: (days: number) => ipcRenderer.invoke('get-score-history', days),
  
  // Network
  getNetworkEvents: (limit: number) => ipcRenderer.invoke('get-network-events', limit),
  toggleProtection: (enabled: boolean) => ipcRenderer.invoke('toggle-protection', enabled),
  
  // DNS
  getDNSStats: () => ipcRenderer.invoke('get-dns-stats'),
  
  // Trackers
  getTopTrackers: (limit: number) => ipcRenderer.invoke('get-top-trackers', limit),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),
  
  // Notifications
  showNotification: (title: string, body: string) => 
    ipcRenderer.send('show-notification', { title, body }),
});
```

---

### Phase 5: Auto-Launch (Days 10-11)

**File:** `src/main/auto-launch.ts`

**Features:**
- Auto-launch on system startup
- Launch minimized to tray
- Platform-specific implementations
- User-configurable in settings

**Implementation:**
```typescript
import AutoLaunch from 'auto-launch';

const autoLauncher = new AutoLaunch({
  name: 'ankrshield',
  path: app.getPath('exe'),
});

export async function setupAutoLaunch() {
  const settings = store.get('settings');
  
  if (settings.autoLaunch) {
    await autoLauncher.enable();
  } else {
    await autoLauncher.disable();
  }
}

export async function toggleAutoLaunch(enabled: boolean) {
  if (enabled) {
    await autoLauncher.enable();
  } else {
    await autoLauncher.disable();
  }
  
  store.set('settings.autoLaunch', enabled);
}

export async function isAutoLaunchEnabled(): Promise<boolean> {
  return await autoLauncher.isEnabled();
}
```

**Platform Behavior:**
- **macOS:** Login Items
- **Windows:** Registry (Run key)
- **Linux:** XDG Autostart (.desktop file)

---

### Phase 6: Native Notifications (Days 12-13)

**File:** `src/main/notifications.ts`

**Features:**
- Native OS notifications
- Privacy alerts
- Tracker detection notifications
- Click to open dashboard
- Do Not Disturb awareness

**Implementation:**
```typescript
import { Notification } from 'electron';

export class NotificationService {
  show(title: string, body: string, options?: NotificationOptions) {
    if (!Notification.isSupported()) {
      return;
    }

    const notification = new Notification({
      title,
      body,
      icon: getAppIcon(),
      silent: options?.silent || false,
      ...options,
    });

    notification.on('click', () => {
      showMainWindow();
    });

    notification.show();
  }

  showPrivacyAlert(score: number) {
    if (score > 80) {
      this.show(
        'Privacy Alert',
        `Your privacy score is critical: ${score}/100. Click to view details.`,
        { urgency: 'critical' }
      );
    } else if (score > 60) {
      this.show(
        'Privacy Warning',
        `Your privacy score is poor: ${score}/100. Consider reviewing your settings.`
      );
    }
  }

  showTrackerBlocked(domain: string, count: number) {
    this.show(
      'Tracker Blocked',
      `Blocked ${count} connection(s) to ${domain}`,
      { silent: true }
    );
  }
}
```

**Notification Types:**
- Privacy score alerts (critical/poor levels)
- Tracker detection
- Protection status changes
- Update available
- Service errors

---

### Phase 7: Auto-Update (Days 14-15)

**File:** `src/main/updater.ts`

**Features:**
- Automatic update checking
- Download and install updates
- Update notifications
- Rollback on failure

**Implementation:**
```typescript
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater() {
  // Check for updates on startup
  autoUpdater.checkForUpdatesAndNotify();

  // Check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    notificationService.show(
      'Update Available',
      `Version ${info.version} is available. Downloading...`
    );
  });

  autoUpdater.on('update-downloaded', (info) => {
    notificationService.show(
      'Update Ready',
      'Update downloaded. Restart to install.',
      {
        actions: [
          { type: 'button', text: 'Restart Now' },
          { type: 'button', text: 'Later' },
        ],
      }
    );
  });

  autoUpdater.on('error', (error) => {
    console.error('Update error:', error);
  });
}

export function checkForUpdates() {
  autoUpdater.checkForUpdates();
}

export function quitAndInstall() {
  autoUpdater.quitAndInstall();
}
```

---

### Phase 8: React Frontend Integration (Days 16-18)

**Dashboard Integration:**
```typescript
// src/renderer/App.tsx
import { useEffect, useState } from 'react';
import { PrivacyScore } from './components/PrivacyScore';
import { NetworkActivity } from './components/NetworkActivity';
import { TopTrackers } from './components/TopTrackers';

function App() {
  const [score, setScore] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrivacyScore();
    
    // Update every 30 seconds
    const interval = setInterval(loadPrivacyScore, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadPrivacyScore() {
    const scoreData = await window.electronAPI.getPrivacyScore();
    setScore(scoreData.totalScore);
    setLoading(false);
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <PrivacyScore score={score} />
      <NetworkActivity />
      <TopTrackers />
    </div>
  );
}
```

---

### Phase 9: Testing (Days 19-20)

**Test Coverage:**
- [ ] Main process unit tests
- [ ] IPC handler tests
- [ ] System tray functionality
- [ ] Auto-launch on each platform
- [ ] Notification display
- [ ] Window state persistence
- [ ] React component tests
- [ ] End-to-end tests

**Platform Testing:**
- [ ] macOS (Intel + ARM)
- [ ] Windows 10/11
- [ ] Linux (Ubuntu, Fedora)

---

## Deliverables

- [ ] Electron app running on all platforms
- [ ] System tray with quick actions
- [ ] Main window with React dashboard
- [ ] IPC communication working
- [ ] Auto-launch functional
- [ ] Native notifications working
- [ ] Auto-update configured
- [ ] Platform-specific builds (DMG, EXE, AppImage)

---

## Platform-Specific Considerations

### macOS
- Code signing with Apple Developer certificate
- Notarization for Gatekeeper
- DMG installer with background image
- App icon (ICNS file, multiple resolutions)
- Dock badge for notifications
- Menu bar integration

### Windows
- Code signing certificate
- NSIS or Squirrel installer
- ICO file (multiple sizes)
- Taskbar integration
- Windows notifications
- Start menu shortcut

### Linux
- AppImage for universal compatibility
- .deb for Debian/Ubuntu
- .rpm for Fedora/RHEL
- PNG icon (multiple sizes)
- .desktop file
- System tray (varies by desktop environment)

---

## Performance Targets

- Cold start time: <3 seconds
- Memory usage: <150MB (idle)
- CPU usage: <5% (idle), <15% (active)
- Package size: <100MB (compressed)

---

## Success Criteria

- [ ] App launches on all platforms
- [ ] System tray functional with menu
- [ ] Dashboard displays real-time data
- [ ] Privacy score updates automatically
- [ ] Auto-launch works on all platforms
- [ ] Notifications appear correctly
- [ ] Updates can be installed
- [ ] No critical bugs
- [ ] Cross-platform UI consistency

---

**Status:** Ready to begin
**Next Action:** Initialize apps/desktop package structure

---

*Created: January 22, 2026*
*Owner: ankrshield Engineering Team*
