# ankrshield - Revised TODO & Roadmap

**Date:** January 22, 2026 (Updated: 19:00)
**Status:** FREE Tier Desktop App 95% Complete - Demo Ready

---

## 📊 PROGRESS SUMMARY (Updated Jan 22, 2026)

### ✅ Completed Today (Jan 22, 2026)

**IPC Communication Layer (100%)**
- ✅ 13 IPC handlers (privacy, DNS, network, app)
- ✅ Type-safe preload script with contextBridge
- ✅ Full TypeScript declarations (electron.d.ts)
- ✅ Input validation on all handlers
- ✅ Error handling with IPCResponse<T> pattern

**React UI Components (95%)**
- ✅ Dashboard.tsx - Real-time data, 5-second refresh
- ✅ Header.tsx - Protection status and toggle
- ✅ RecentActivity.tsx - Network events + DNS queries
- ✅ Settings.tsx - Protection controls + app info
- ✅ PrivacyScoreCard.tsx - Score display
- ✅ StatsGrid.tsx - 6 stat cards
- ✅ ErrorBoundary.tsx - Error handling
- ✅ Loading states throughout
- ✅ Auto-refresh (5s/10s intervals)

**Build System (100%)**
- ✅ Clean builds: 0 TypeScript errors
- ✅ Bundle: 150.31 KB (48.02 KB gzipped)
- ✅ Build time: 534ms
- ✅ Vite + TypeScript configuration

**Installer Configuration (90%)**
- ✅ forge.config.js with 5 makers (DMG, Squirrel, DEB, RPM, ZIP)
- ✅ Code signing setup (macOS + Windows)
- ✅ entitlements.plist for macOS
- ✅ INSTALLER-BUILD-GUIDE.md (comprehensive)
- ✅ INSTALLER-STATUS.md (troubleshooting)
- ⚠️ Packaging blocked by pnpm/electron-forge issue (solutions documented)

**Documentation (100%)**
- ✅ FREE-TIER-APP-STATUS.md
- ✅ INSTALLER-BUILD-GUIDE.md
- ✅ INSTALLER-STATUS.md
- ✅ BUILD-COMPLETE.md
- ✅ assets/README.md

### 🎯 Can Demo NOW
```bash
cd /root/ankrshield/apps/desktop
pnpm dev
# App launches in ~3 seconds with REAL data from investor's device
```

### ⏳ Pending Items

**Immediate (Next 1-2 Days)**
- [ ] Test demo on investor's machine
- [ ] Resolve installer packaging (use npm OR electron-builder)
- [ ] Create branded assets (icons)
- [ ] Test installers on clean machines

**Short-term (This Week)**
- [ ] Demo mode implementation (Phase 2)
- [ ] Privacy History page
- [ ] Help/FAQ page
- [ ] Desktop notifications
- [ ] Tray icon

**Medium-term (Next 2 Weeks)**
- [ ] Testing infrastructure (Vitest)
- [ ] Database hardening
- [ ] Security audit
- [ ] Performance optimization
- [ ] Mobile apps

---

## 🎯 Current Status

✅ **Completed (Week 13-16):**
- Desktop app structure (Electron + React)
- Backend services integration (Privacy, DNS, Network)
- Database setup (PostgreSQL + 230k trackers)
- Redis caching
- React UI components
- Mobile app structure (React Native)

✅ **Completed (Week 17 - January 22, 2026):**
- Complete IPC communication layer (13 handlers)
- Type-safe IPC with full TypeScript declarations
- All React components updated with real backend data
- Settings page with protection controls
- Auto-refresh dashboards (5s/10s intervals)
- Electron Forge installer configuration
- Complete build documentation

📍 **Current Phase:** Demo Mode Development + Installer Testing

---

## 🔴 CRITICAL PATH - Next 2 Weeks

### Phase 1: Security & Foundation (Week 17-18)
**Priority: CRITICAL** | **Timeline: 5 days**

#### Day 1-2: Database & Security Hardening
- [ ] Clean invalid UUIDs from database
  ```sql
  DELETE FROM network_events WHERE id !~ '^[0-9a-f]{8}-...';
  ```
- [ ] Add database constraints and indexes
  ```sql
  CREATE INDEX idx_network_events_user_timestamp ON network_events(user_id, timestamp DESC);
  ```
- [ ] Setup data encryption layer
  ```typescript
  class DataEncryption {
    encrypt(data: string): string;
    decrypt(encrypted: string): string;
  }
  ```
- [ ] Implement environment config with validation (Zod)
- [ ] Create database backup strategy (pg_dump cron)

#### Day 3-4: IPC Communication Complete ✅
- [✅] Complete all IPC handlers in main process
  ```typescript
  // Privacy
  ipcMain.handle('privacy:getScore', async () => {...});
  ipcMain.handle('privacy:getBreakdown', async () => {...});
  ipcMain.handle('privacy:getHistory', async () => {...});

  // DNS
  ipcMain.handle('dns:getStats', async () => {...});
  ipcMain.handle('dns:getRecentQueries', async () => {...});
  ipcMain.handle('dns:toggleProtection', async () => {...});

  // Network
  ipcMain.handle('network:getEvents', async () => {...});
  ipcMain.handle('network:getStats', async () => {...});
  ipcMain.handle('network:toggleProtection', async () => {...});

  // Demo - PENDING (Phase 2)
  ipcMain.handle('demo:start', async (_, scenarioId) => {...});
  ipcMain.handle('demo:stop', async () => {...});
  ipcMain.handle('demo:getStats', async () => {...});
  ```
- [✅] Add type-safe IPC with shared types
  - Created src/renderer/types/electron.d.ts with full type definitions
  - Created src/preload.ts with ElectronAPI interface
- [✅] Implement input validation for all IPC calls
  - All handlers validate parameters and return IPCResponse<T>
- [✅] Add error boundaries in React
  - ErrorBoundary component exists and wraps Dashboard

#### Day 5: Testing Infrastructure
- [ ] Setup Vitest for unit tests
  ```bash
  pnpm add -D vitest @vitest/ui
  ```
- [ ] Write 20 critical unit tests
  - Privacy service (5 tests)
  - DNS service (5 tests)
  - Network service (5 tests)
  - React components (5 tests)
- [ ] Setup test coverage reporting (target: 70%)
- [ ] Add test scripts to package.json
  ```json
  "test": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest --coverage"
  ```

---

### Phase 2: Demo Mode (Week 19-20)
**Priority: HIGH** | **Timeline: 7 days**

#### Day 6-7: Demo Mode Service
- [ ] Create `DemoModeService` class
  ```typescript
  // apps/desktop/src/main/services/demo.service.ts
  export class DemoModeService {
    private isActive: boolean;
    private currentScenario: DemoScenario;
    private startTime: number;
    private playbackSpeed: number;

    async activate(scenarioId: string): Promise<void>;
    deactivate(): void;
    getStats(): DemoStats;
    pause(): void;
    play(): void;
    setSpeed(speed: number): void;
  }
  ```
- [ ] Generate realistic event timelines
  ```typescript
  function generateLivingRoomEvents(): DemoEvent[] {
    // Generate 6 minutes of tracking events
    // 319 trackers, 2847 events, realistic timing
  }
  ```
- [ ] Implement playback controls
- [ ] Create event emitter for real-time updates

#### Day 8-9: Demo Scenarios Data
- [ ] Living Room scenario (8 devices, 319 trackers)
  - iPhone, MacBook, Smart TV, Xbox, Alexa, Watch, Vacuum, Doorbell
- [ ] Gaming Session scenario (4 devices, 423 trackers)
  - Gaming PC, PS5, Phone, Webcam
- [ ] Smart Home scenario (15 devices, 891 trackers)
  - Every IoT device tracking you
- [ ] Home Office scenario (5 devices, 267 trackers)
- [ ] Bedroom scenario (6 devices, 184 trackers)
- [ ] Hotel Room scenario (3 devices, 156 trackers)

#### Day 10-12: Demo Mode UI
- [ ] Create React components
  ```
  src/renderer/components/demo/
  ├── DemoMode.tsx              (Main container)
  ├── DemoSelector.tsx          (Scenario picker)
  ├── DeviceGrid.tsx            (Device cards)
  ├── DeviceCard.tsx            (Individual device)
  ├── TrackerFlow.tsx           (Animated visualization)
  ├── StatsBoard.tsx            (Real-time stats)
  ├── ActivityFeed.tsx          (Event stream)
  ├── PlaybackControls.tsx     (Play/pause/speed)
  ├── BeforeAfter.tsx          (Comparison view)
  └── ExportModal.tsx          (Share/export)
  ```
- [ ] Implement animated tracker flow (particle effects)
- [ ] Create stats dashboard with animations
- [ ] Build activity feed with auto-scroll
- [ ] Add device detail modals
- [ ] Add tracker detail modals
- [ ] Style with CSS animations

#### Day 13: Demo Mode Polish
- [ ] Add sound effects (optional, toggleable)
- [ ] Implement export to video/GIF
  ```typescript
  async function exportDemo(format: 'video' | 'gif') {
    // MediaRecorder API
  }
  ```
- [ ] Create shareable privacy report (PDF)
- [ ] Add educational tooltips
- [ ] Test all 6 scenarios
- [ ] Performance optimization (60fps animations)

---

### Phase 3: Free Tier Desktop App (Week 21-22)
**Priority: HIGH** | **Timeline: 7 days**

#### Day 14-15: Core Desktop Features ✅ (Partial)
- [✅] Complete Dashboard component
  - ✅ Real-time privacy score (5-second auto-refresh)
  - ✅ Stats grid (6 cards with real data)
  - ✅ Recent activity feed (network events + DNS queries, 10-second refresh)
  - ✅ Header with protection toggle
- [✅] Implement Settings page
  ```typescript
  // src/renderer/components/Settings.tsx - CREATED
  ✅ General settings section
  ✅ DNS protection toggle
  ✅ Network protection toggle
  ✅ App version display
  ✅ About section (license, tracker count)
  ⏳ DNS providers (Cloudflare, Google) - Future
  ⏳ Blocklist management - Future
  ⏳ Auto-start preferences - Placeholder created
  ⏳ Update settings - Future
  ```
- [ ] Add Privacy History page
  ```typescript
  // src/renderer/pages/History.tsx - NOT STARTED
  - 7-day chart (Free tier limit)
  - Score breakdown over time
  - Event timeline
  - Export capability
  ```
- [ ] Create Help/FAQ page - NOT STARTED
- [ ] Build onboarding flow - NOT STARTED
  ```typescript
  // First run wizard
  1. Welcome screen
  2. Permissions request
  3. Demo mode showcase
  4. Privacy scan
  5. Dashboard
  ```

#### Day 16-17: Desktop App Polish ✅ (Partial)
- [ ] Add desktop notifications - NOT STARTED
  ```typescript
  new Notification('ankrshield', {
    body: '47 trackers blocked in last hour!',
    icon: './icon.png'
  });
  ```
- [ ] Implement tray icon with quick stats - NOT STARTED
- [ ] Add keyboard shortcuts - NOT STARTED
  ```
  Cmd/Ctrl+D: Toggle demo mode
  Cmd/Ctrl+P: Toggle protection
  Cmd/Ctrl+, : Open settings
  ```
- [ ] Create system theme detection (light/dark) - NOT STARTED
- [✅] Add loading states and skeletons
  - ✅ Dashboard has loading spinner
  - ✅ Settings has loading state
  - ✅ RecentActivity has loading state
  - ✅ All components handle loading gracefully
- [✅] Error handling and user feedback
  - ✅ All IPC calls wrapped in try/catch
  - ✅ ErrorBoundary component
  - ✅ Fallback data on errors
  - ✅ Console logging for debugging
- [ ] Accessibility (ARIA labels, keyboard nav) - NOT STARTED

#### Day 18-19: Build & Packaging ✅ (Configured, Testing Blocked)
- [✅] Configure Electron Forge for packaging
  ```javascript
  // forge.config.js - CREATED
  module.exports = {
    makers: [
      {
        name: '@electron-forge/maker-zip',
        platforms: ['darwin', 'win32', 'linux']
      },
      {
        name: '@electron-forge/maker-dmg',
        config: { /* macOS - COMPLETE */ }
      },
      {
        name: '@electron-forge/maker-squirrel',
        config: { /* Windows - COMPLETE */ }
      },
      {
        name: '@electron-forge/maker-deb',
        config: { /* Linux - COMPLETE */ }
      },
      {
        name: '@electron-forge/maker-rpm',
        config: { /* Linux - COMPLETE */ }
      }
    ]
  };
  ```
- [✅] Setup code signing (macOS + Windows)
  - ✅ Created entitlements.plist for macOS
  - ✅ Configure signing in forge.config.js
  - ✅ Environment variables documented
  - ⏳ Get certificates (production only, not needed for demos)
  - ⏳ Test notarization (macOS - production only)
- [⏳] Configure auto-updater
  ```typescript
  // electron-updater already in dependencies
  // Implementation pending
  ```
- [⚠️] Create installers for all platforms
  - ⚠️ macOS: DMG (configured, pnpm/forge issue)
  - ⚠️ Windows: Squirrel installer (configured, pnpm/forge issue)
  - ⚠️ Linux: deb, rpm (configured, pnpm/forge issue)
  - ✅ Documentation: INSTALLER-BUILD-GUIDE.md created
  - ✅ Status doc: INSTALLER-STATUS.md with solutions
  - 📝 Issue: pnpm workspace dependency resolution with electron-forge
  - 📝 Solutions: Use npm temporarily OR migrate to electron-builder

#### Day 20: Desktop Testing
- [ ] Manual testing on all platforms
  - Windows 10, 11
  - macOS 12, 13, 14
  - Ubuntu 20.04, 22.04
- [ ] Test installation/uninstallation
- [ ] Test auto-update flow
- [ ] Performance profiling
  - Startup time (<3s)
  - Memory usage (<150MB)
  - CPU usage (<5%)
- [ ] Fix critical bugs
- [ ] Create test report

---

### Phase 4: Freemium Mobile Apps (Week 23-25)
**Priority: MEDIUM** | **Timeline: 15 days**

#### Week 23: React Native Setup
- [ ] Install React Native dependencies
  ```bash
  # iOS
  cd apps/mobile-ios
  pnpm install
  cd ios && pod install

  # Android
  cd apps/mobile-android
  pnpm install
  ```
- [ ] Setup API client for backend
  ```typescript
  // src/services/api-client.ts
  class AnkrShieldAPI {
    async getPrivacyScore(userId: string): Promise<PrivacyScore>;
    async getDNSStats(userId: string): Promise<DNSStats>;
    async getNetworkEvents(userId: string): Promise<NetworkEvent[]>;
  }
  ```
- [ ] Configure environment variables
  ```
  API_URL=https://api.ankrshield.com
  WS_URL=wss://ws.ankrshield.com
  ```
- [ ] Setup push notifications (FCM + APNS)
- [ ] Configure deep linking

#### Week 24: Mobile Features
- [ ] Complete all screens
  ```
  src/screens/
  ├── HomeScreen.tsx          (Privacy score)
  ├── DashboardScreen.tsx     (Analytics)
  ├── ActivityScreen.tsx      (Events)
  ├── SettingsScreen.tsx      (Config)
  ├── OnboardingScreen.tsx    (First run)
  └── DemoScreen.tsx          (Demo mode - locked in Free)
  ```
- [ ] Implement API integration
- [ ] Add offline support (AsyncStorage)
- [ ] Create loading states
- [ ] Add pull-to-refresh
- [ ] Implement error handling

#### Week 25: Mobile Testing & Release
- [ ] Test on real devices
  - iPhone 12, 13, 14, 15
  - Various Android devices
- [ ] Fix platform-specific bugs
- [ ] Optimize performance (60fps)
- [ ] Prepare App Store assets
  - Screenshots (all sizes)
  - App icons
  - Descriptions
  - Privacy policy
- [ ] Submit to App Store (iOS)
  - TestFlight beta
  - App Store review
- [ ] Submit to Google Play (Android)
  - Internal testing
  - Beta track
  - Production release

---

### Phase 5: Production Readiness (Week 26-27)
**Priority: CRITICAL** | **Timeline: 10 days**

#### Monitoring & Observability
- [ ] Setup Winston logging
  ```typescript
  import winston from 'winston';

  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' })
    ]
  });
  ```
- [ ] Integrate Sentry error tracking
  ```typescript
  import * as Sentry from '@sentry/electron';

  Sentry.init({ dsn: process.env.SENTRY_DSN });
  ```
- [ ] Add health check endpoints
  ```typescript
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      services: {
        database: await checkDatabase(),
        redis: await checkRedis(),
        dns: await checkDNS()
      }
    });
  });
  ```
- [ ] Setup Prometheus metrics export
- [ ] Create monitoring dashboard (Grafana)

#### Documentation
- [ ] Complete all 27 documentation files (see docs/README.md)
- [ ] Write API documentation (if exposing APIs)
- [ ] Create troubleshooting guide
- [ ] Record video tutorials
  - Installation
  - Getting started
  - Demo mode
  - Settings
- [ ] Write FAQ

#### Legal & Compliance
- [ ] Write Privacy Policy
- [ ] Write Terms of Service
- [ ] GDPR compliance checklist
- [ ] Data retention policy
- [ ] Right to deletion implementation
- [ ] Cookie consent (if web interface)

---

## 🟡 IMPORTANT - Next 30 Days

### Week 28: Testing & QA
- [ ] Integration testing
  - Service integration tests
  - IPC communication tests
  - Database integration tests
- [ ] E2E testing with Playwright
  ```typescript
  test('complete user flow', async ({ page }) => {
    await page.goto('app://.');
    await page.click('text=Start Demo');
    // ...
  });
  ```
- [ ] Performance testing
  - Load testing (1000+ network events)
  - Stress testing (10 devices simultaneously)
  - Memory leak detection
- [ ] Security testing
  - Penetration testing
  - SQL injection attempts
  - XSS attempts
  - CSRF protection

### Week 29: Beta Testing
- [ ] Recruit 20-50 beta testers
  - Privacy advocates
  - Tech enthusiasts
  - Family users
  - Small businesses
- [ ] Create feedback forms
- [ ] Setup crash reporting
- [ ] Daily bug triage
- [ ] Weekly beta releases
- [ ] Gather user feedback

### Week 30: Launch Preparation
- [ ] Product Hunt submission
  - Create profile
  - Prepare launch materials
  - Schedule launch date
  - Hunter outreach
- [ ] Social media setup
  - Twitter account
  - Discord server
  - Reddit presence
- [ ] Press kit
  - Logo assets
  - Screenshots
  - Demo videos
  - Founder story
- [ ] Launch checklist
  - Website live
  - Download links ready
  - Support channels active
  - Analytics tracking

---

## 🟢 NICE-TO-HAVE - Future Phases

### Phase 6: Pro Tier Features (Month 4-5)
- [ ] VPN integration (WireGuard)
  - VPN server setup
  - Client integration
  - Server selection
  - Auto-connect rules
- [ ] Cloud sync infrastructure
  - User authentication (Firebase/Auth0)
  - Sync service (WebSocket)
  - Conflict resolution
  - Offline queue
- [ ] Advanced analytics
  - Custom date ranges
  - Export to CSV/PDF
  - Scheduled reports
  - Trend predictions
- [ ] Custom blocklists
  - User-defined rules
  - Whitelist domains
  - Per-app policies
  - Schedule-based rules

### Phase 7: Enterprise Features (Month 6-8)
- [ ] SSO/SAML integration
  - Okta
  - Azure AD
  - Google Workspace
- [ ] Audit logging
  - Compliance reports
  - User activity logs
  - Policy change tracking
- [ ] White-label support
  - Custom branding
  - Custom domain
  - Reseller program
- [ ] On-premise deployment
  - Docker Compose
  - Kubernetes
  - Installation docs
  - Migration tools

### Phase 8: Advanced Features (Month 9-12)
- [ ] Browser extensions
  - Chrome/Edge
  - Firefox
  - Safari
- [ ] Router integration
  - Network-wide deployment
  - Guest network isolation
  - Parental controls
- [ ] AI/ML features
  - Anomaly detection
  - Tracker identification
  - Privacy risk prediction
  - Smart recommendations
- [ ] Integrations
  - Pi-hole
  - Home Assistant
  - IFTTT/Zapier

---

## 📊 Success Metrics

### Week 17-22 (Free Tier Launch)
**Target:**
- [ ] Desktop app released (Mac, Windows, Linux)
- [ ] 1,000 downloads in Week 1
- [ ] 10,000 users by end of Month 1
- [ ] 4.0+ rating on Product Hunt
- [ ] <2% crash rate
- [ ] 70%+ test coverage

### Week 23-27 (Freemium Launch)
**Target:**
- [ ] Mobile apps released (iOS, Android)
- [ ] 5,000 freemium users
- [ ] 1,000 Pro conversions (20%)
- [ ] 4.5+ App Store rating
- [ ] 50% Day 1 retention
- [ ] 30% Day 7 retention

### Month 4-6 (Pro Launch)
**Target:**
- [ ] 10,000 Pro users
- [ ] $100k MRR ($1.2M ARR)
- [ ] <5% monthly churn
- [ ] 80%+ annual retention
- [ ] Profitability (breakeven + 20%)

### Year 1 (Enterprise)
**Target:**
- [ ] 100,000 free users
- [ ] 10,000 freemium users
- [ ] 10,000 Pro users ($1M ARR)
- [ ] 50 enterprise customers ($2.5M ARR)
- [ ] Total: $3.5M ARR
- [ ] Team: 10 people

---

## 🚀 Launch Roadmap

### Pre-Launch (Week 17-22)
```
Week 17: Security + IPC completion
Week 18: Testing infrastructure
Week 19: Demo mode backend
Week 20: Demo mode UI
Week 21: Desktop app features
Week 22: Build & packaging
```

### Launch Week (Week 23)
```
Monday:    Product Hunt launch
Tuesday:   Hacker News "Show HN"
Wednesday: Reddit r/privacy post
Thursday:  Twitter launch thread
Friday:    Press outreach
Weekend:   Community engagement
```

### Post-Launch (Week 24-30)
```
Week 24-25: Mobile app development
Week 26-27: Production hardening
Week 28:    Testing & QA
Week 29:    Beta testing
Week 30:    Launch preparation for Pro tier
```

---

## 🎯 Priorities Matrix

```
URGENT + IMPORTANT (Do First):
├─ Security hardening
├─ IPC completion
├─ Testing infrastructure
└─ Demo mode

IMPORTANT + NOT URGENT (Schedule):
├─ Mobile apps
├─ Documentation
├─ Beta testing
└─ Launch prep

URGENT + NOT IMPORTANT (Delegate):
├─ Social media setup
├─ Press kit
└─ Support channels

NOT URGENT + NOT IMPORTANT (Defer):
├─ Advanced features
├─ Integrations
└─ AI/ML
```

---

## 📝 Daily Checklist Template

```markdown
## Day X - [Date]

### Priority 1 (Must Do):
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

### Priority 2 (Should Do):
- [ ] Task 4
- [ ] Task 5

### Priority 3 (Nice to Have):
- [ ] Task 6

### Blockers:
- None / List blockers

### Notes:
- Implementation details
- Decisions made
- Questions to resolve
```

---

## 🔄 Review Cadence

- **Daily:** Standup (async via Discord)
- **Weekly:** Sprint review + planning
- **Monthly:** Metrics review + roadmap adjustment
- **Quarterly:** OKR review + strategy

---

## ✅ Definition of Done

A task is complete when:
1. ✅ Code written and works
2. ✅ Tests written (unit + integration)
3. ✅ Documentation updated
4. ✅ Code reviewed (if team)
5. ✅ Manually tested on all platforms
6. ✅ No regressions introduced
7. ✅ Performance acceptable
8. ✅ Committed to main branch

---

*Last updated: January 22, 2026*
*Next review: February 1, 2026*
