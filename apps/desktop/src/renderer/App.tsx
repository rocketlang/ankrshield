/**
 * Main React App Component
 * Sets up routing and initializes app state
 */

import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/layout';
import {
  Dashboard,
  Analytics,
  Devices,
  Settings,
  AgentFeed,
  SetupRootCA,
  BudgetPanel,
  ReportCard,
  Replay,
  SettingsAegis,
} from './pages';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import './App.css';

function App() {
  const { refreshData, isLoading, error } = useAppStore();
  const syncWithBackend = useSettingsStore((state) => state.syncWithBackend);

  useEffect(() => {
    // Initialize app on mount
    const initialize = async () => {
      try {
        // Sync settings with backend (electron-store)
        await syncWithBackend();

        // Refresh app data from backend
        await refreshData();
      } catch (err) {
        console.error('Error initializing app:', err);
      }
    };

    initialize();

    // Set up auto-refresh interval (every 30 seconds)
    const interval = setInterval(() => {
      refreshData();
    }, 30000);

    return () => clearInterval(interval);
  }, [refreshData, syncWithBackend]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <div className="loading-spinner"></div>
        <p className="text-gray-400">Loading AnkrShield...</p>
      </div>
    );
  }

  // Error state (non-fatal - show app with error banner)
  if (error) {
    console.warn('App initialization error:', error);
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="devices" element={<Devices />} />
            <Route path="agents" element={<AgentFeed />} />
            <Route path="budget" element={<BudgetPanel />} />
            <Route path="report-card" element={<ReportCard />} />
            <Route path="replay" element={<Replay />} />
            <Route path="setup/root-ca" element={<SetupRootCA />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/aegis" element={<SettingsAegis />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
