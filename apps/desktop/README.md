# ankrshield Desktop Application

Cross-platform desktop application built with Electron for privacy protection.

## Features

- **System Tray Integration**: Quick access to privacy status and controls
- **Real-Time Dashboard**: Live privacy score and network monitoring
- **Native Notifications**: Privacy alerts and tracker blocking notifications
- **Auto-Launch**: Start with system (configurable)
- **Auto-Update**: Automatic update checking and installation
- **Cross-Platform**: Windows, macOS, and Linux support

## Architecture

```
src/
├── main/               # Main process (Node.js)
│   ├── index.ts       # Entry point
│   ├── window.ts      # Window management
│   ├── tray.ts        # System tray
│   ├── ipc.ts         # IPC handlers
│   ├── auto-launch.ts # Auto-launch
│   ├── notifications.ts # Notifications
│   ├── updater.ts     # Auto-updater
│   └── services/      # Backend integrations
│       ├── privacy.ts # Privacy engine
│       ├── network.ts # Network monitor
│       └── dns.ts     # DNS resolver
├── renderer/          # Renderer process (Browser)
│   ├── index.html    # Main HTML
│   └── app.js        # Application logic
├── preload/          # Preload scripts
│   └── index.ts      # Context bridge
└── assets/           # Icons and assets
    ├── icons/        # App icons
    └── tray/         # Tray icons
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build TypeScript
pnpm build

# Create distributable packages
pnpm make

# Type check
pnpm typecheck

# Lint
pnpm lint
pnpm lint:fix
```

## Building

### macOS

```bash
pnpm make
# Output: out/make/zip/darwin/x64/
#         out/make/dmg/
```

### Windows

```bash
pnpm make
# Output: out/make/squirrel.windows/x64/
#         out/make/zip/win32/x64/
```

### Linux

```bash
pnpm make
# Output: out/make/deb/x64/
#         out/make/rpm/x64/
```

## IPC API

The main process exposes the following API to the renderer via `window.electronAPI`:

### Privacy Score

- `getPrivacyScore()`: Get current privacy score
- `getScoreHistory(days)`: Get score history
- `getScoreBreakdown()`: Get detailed breakdown

### Network Monitoring

- `getNetworkEvents(limit)`: Get recent events
- `getNetworkStats()`: Get statistics
- `toggleProtection(enabled)`: Enable/disable protection

### DNS

- `getDNSStats()`: Get DNS statistics
- `getDNSQueries(limit)`: Get recent queries

### Trackers

- `getTopTrackers(limit)`: Get top trackers
- `getTrackerStats()`: Get tracker statistics

### Reports

- `generateDailyReport(date)`: Generate daily report
- `generateWeeklyReport(startDate)`: Generate weekly report
- `generateMonthlyReport(month, year)`: Generate monthly report

### Events

- `onPrivacyScoreUpdate(callback)`: Listen for score updates
- `onProtectionToggled(callback)`: Listen for protection changes
- `onTrackerBlocked(callback)`: Listen for tracker blocks

## Configuration

Settings are stored in:

- **macOS**: `~/Library/Application Support/ankrshield/`
- **Windows**: `%APPDATA%\ankrshield\`
- **Linux**: `~/.config/ankrshield/`

## Platform-Specific Notes

### macOS

- Code signing required for distribution
- Notarization required for Gatekeeper
- Template icon for menu bar (16x16@2x)

### Windows

- Code signing recommended
- ICO file with multiple sizes (16, 24, 32, 48)
- NSIS installer or Squirrel

### Linux

- AppImage for universal distribution
- .deb for Debian/Ubuntu
- .rpm for Fedora/RHEL
- Desktop entry file for system integration

## Security

- Context Isolation: ✅ Enabled
- Node Integration: ❌ Disabled
- Sandbox: ✅ Enabled
- Content Security Policy: ✅ Enforced

## License

Copyright 2026 ankrshield Team
