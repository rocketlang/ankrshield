# AnkrShield Desktop - Fresh TODO (Session Start)

**Date:** January 23, 2026
**Goal:** Complete essential features for working MVP
**Time Budget:** 4-6 hours

---

## 🎯 TODAY'S FOCUS: Quick Wins + Core Features

### Phase A: Essential UI Setup (1-2 hours) ✅ COMPLETE

#### 1. TailwindCSS Setup ⏱️ 30 min ✅ COMPLETE
- [x] Install TailwindCSS dependencies (tailwindcss@3.4.19, autoprefixer@10.4.23, postcss@8.5.6)
- [x] Create `tailwind.config.js` (with ankr brand colors)
- [x] Create `postcss.config.js`
- [x] Update `src/renderer/App.css` with Tailwind directives
- [x] Test: Verified Tailwind works (dev server starts successfully)

#### 2. Zustand State Management ⏱️ 45 min ✅ COMPLETE
- [x] Install Zustand (already installed: zustand@4.4.7)
- [x] Create `src/renderer/stores/appStore.ts` (with refreshData, selectors)
- [x] Create `src/renderer/stores/settingsStore.ts` (with localStorage persistence)
- [x] Add localStorage persistence to settings (using zustand/middleware persist)
- [x] Updated preload API with missing methods (getProtectionStatus, getDnsProtectionStatus, settings:*)
- [x] Created stores/index.ts for convenience exports

#### 3. React Router Setup ⏱️ 30 min ✅ COMPLETE
- [x] Configure HashRouter in App.tsx (with auto-redirect to /dashboard)
- [x] Add routes: /dashboard, /analytics, /devices, /settings
- [x] Create Layout component (Sidebar + Header + Outlet)
- [x] Create Sidebar with navigation (using NavLink for active highlighting)
- [x] Create Header with protection status and theme toggle
- [x] Create placeholder pages (Analytics, Devices, Settings)
- [x] Dashboard page re-exports existing Dashboard component
- [x] App now uses appStore for initialization and auto-refresh

---

### Phase B: Settings Persistence (1 hour) ✅ COMPLETE

#### 4. electron-store Integration ⏱️ 1 hour ✅ COMPLETE
- [x] Install electron-store (electron-store@11.0.2)
- [x] Create `src/main/services/settings.ts` (with schema validation)
- [x] Add IPC handlers: settings:get, settings:set, settings:getAll, settings:reset
- [x] Update preload API (added settingsGet, settingsSet, settingsGetAll, settingsReset)
- [x] Connect Settings component to real backend (already uses settingsStore)
- [x] Add window state persistence (position, size, maximized with validation)
- [x] Add settings service to service manager (initialization + cleanup)
- [x] Window state auto-saves on resize/move (debounced 500ms)
- [x] Window state validation ensures visibility on available displays

---

### Phase C: Network Service Completion (1.5 hours) ✅ COMPLETE

#### 5. Network Monitoring Integration ⏱️ 1.5 hours ✅ COMPLETE
- [x] Update NetworkService with real NetworkPrivacyMonitor
- [x] Add flow enrichment (DNS correlation with cache, tracker detection prepared)
- [x] Implement batch database writes (100 events or 5 seconds)
- [x] Add protection toggle with real blocking (start/stop monitor)
- [x] Emit events to event bus (NETWORK_FLOW, PROTECTION_TOGGLED)
- [x] Query real stats from database (last 24 hours aggregation)
- [x] Added DNS cache for IP -> domain correlation
- [x] Memory cache for quick recent events access
- [x] Graceful degradation if monitor fails (database-only mode)
- [x] Flush remaining events on cleanup

---

### Phase D: Privacy Service Completion (1 hour)

#### 6. Privacy Scoring Integration ⏱️ 1 hour
- [ ] Update PrivacyService with real PrivacyCalculator
- [ ] Add score calculation scheduler (every 15 minutes)
- [ ] Query real score history from database
- [ ] Aggregate tracker stats from NetworkEvents
- [ ] Emit privacy score updated events
- [ ] Test: Verify scores calculated

---

### Phase E: UI Components (1 hour)

#### 7. Component Library Basics ⏱️ 1 hour
- [ ] Copy Button component from web app
- [ ] Copy Card component from web app
- [ ] Copy Badge component from web app
- [ ] Copy Alert component from web app
- [ ] Create Layout component (Sidebar + Header + Content)
- [ ] Apply TailwindCSS to existing Dashboard
- [ ] Test: Components render with Tailwind

---

### Phase F: Integration & Testing (30 min)

#### 8. End-to-End Verification ⏱️ 30 min
- [ ] Start app and verify all services initialize
- [ ] Check database connection
- [ ] Verify DNS queries logged
- [ ] Verify network events captured (if permissions available)
- [ ] Verify privacy score calculated
- [ ] Test settings persistence
- [ ] Test navigation between pages
- [ ] Check for errors in console

---

## ✅ Success Criteria

At the end of today, the app should:
1. ✅ Use TailwindCSS for styling
2. ✅ Have proper state management (Zustand)
3. ✅ Navigate between multiple pages
4. ✅ Persist settings across restarts
5. ✅ Capture real network events (if permissions)
6. ✅ Calculate real privacy scores
7. ✅ Query real data from database
8. ✅ Look more professional with reusable components

**Target Completion:** 70-75% overall

---

## 🚀 Implementation Order

**Sprint 1: Foundation (90 min)**
1. TailwindCSS setup
2. Zustand stores
3. React Router
→ *Quick visual improvement, better state management*

**Sprint 2: Persistence (60 min)**
4. electron-store integration
→ *Settings work properly*

**Sprint 3: Backend (150 min)**
5. Network service completion
6. Privacy service completion
→ *Real data flowing*

**Sprint 4: Polish (90 min)**
7. Component library
8. Testing
→ *Professional appearance*

---

## 📝 Notes

- Focus on getting things working, not perfect
- Use mock data fallbacks for graceful degradation
- Test incrementally after each phase
- Document any blockers
- Commit code after each major milestone

---

## 🎯 Stretch Goals (if time permits)

- [ ] Add basic charts with Recharts
- [ ] Create Analytics page
- [ ] Add dark/light theme toggle
- [ ] Improve error handling in UI
- [ ] Add loading states
- [ ] Create professional app icon

---

**Let's build! 🚀**
