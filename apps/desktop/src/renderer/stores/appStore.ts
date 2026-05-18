/**
 * App Store
 * Manages real-time application state (protection status, stats, scores)
 * No persistence - data refreshed from backend on app start
 */

import { create } from 'zustand';

// Types
export interface PrivacyScore {
  userId: string;
  timestamp: Date;
  totalScore: number;
  networkScore: number;
  dnsScore: number;
  appScore: number;
  level: string;
  trend?: any;
}

export interface NetworkStats {
  totalConnections: number;
  blockedConnections: number;
  activeConnections: number;
  totalBytes: number;
  bytesIn: number;
  bytesOut: number;
}

export interface DNSStats {
  totalQueries: number;
  blockedQueries: number;
  cacheHitRate: number;
  topDomains: Array<{ domain: string; count: number }>;
}

export interface TrackerInfo {
  domain: string;
  category: string;
  vendor?: string;
  connections: number;
  blocked: number;
  riskScore: number;
}

// Store interface
interface AppState {
  // Protection status
  protectionEnabled: boolean;
  dnsProtectionEnabled: boolean;
  networkProtectionEnabled: boolean;

  // Real-time data
  privacyScore: PrivacyScore | null;
  networkStats: NetworkStats | null;
  dnsStats: DNSStats | null;
  topTrackers: TrackerInfo[];

  // UI state
  isLoading: boolean;
  lastRefresh: Date | null;
  error: string | null;

  // Actions
  setProtectionEnabled: (enabled: boolean) => void;
  setDnsProtectionEnabled: (enabled: boolean) => void;
  setNetworkProtectionEnabled: (enabled: boolean) => void;
  setPrivacyScore: (score: PrivacyScore) => void;
  setNetworkStats: (stats: NetworkStats) => void;
  setDnsStats: (stats: DNSStats) => void;
  setTopTrackers: (trackers: TrackerInfo[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refreshData: () => Promise<void>;
  reset: () => void;
}

// Initial state
const initialState = {
  protectionEnabled: false,
  dnsProtectionEnabled: false,
  networkProtectionEnabled: false,
  privacyScore: null,
  networkStats: null,
  dnsStats: null,
  topTrackers: [],
  isLoading: true,
  lastRefresh: null,
  error: null,
};

// Create store
export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  // Simple setters
  setProtectionEnabled: (enabled) => set({ protectionEnabled: enabled }),
  setDnsProtectionEnabled: (enabled) => set({ dnsProtectionEnabled: enabled }),
  setNetworkProtectionEnabled: (enabled) => set({ networkProtectionEnabled: enabled }),
  setPrivacyScore: (score) => set({ privacyScore: score }),
  setNetworkStats: (stats) => set({ networkStats: stats }),
  setDnsStats: (stats) => set({ dnsStats: stats }),
  setTopTrackers: (trackers) => set({ topTrackers: trackers }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // Refresh all data from backend
  refreshData: async () => {
    set({ isLoading: true, error: null });

    try {
      // Check if electronAPI is available
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      // Fetch all data in parallel
      const [
        protectionEnabled,
        dnsProtectionEnabled,
        privacyScore,
        networkStats,
        dnsStats,
        topTrackers,
      ] = await Promise.all([
        window.electronAPI.getProtectionStatus().catch(() => false),
        window.electronAPI.getDnsProtectionStatus().catch(() => false),
        window.electronAPI.getPrivacyScore().catch(() => null),
        window.electronAPI.getNetworkStats().catch(() => null),
        window.electronAPI.getDnsStats().catch(() => null),
        window.electronAPI.getTopTrackers(5).catch(() => []),
      ]);

      // Update state
      set({
        protectionEnabled,
        dnsProtectionEnabled,
        networkProtectionEnabled: protectionEnabled, // Assuming network follows main protection
        privacyScore,
        networkStats,
        dnsStats,
        topTrackers,
        isLoading: false,
        lastRefresh: new Date(),
        error: null,
      });
    } catch (error) {
      console.error('Failed to refresh data:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load data',
      });
    }
  },

  // Reset to initial state
  reset: () => set(initialState),
}));

// Selector hooks for common patterns
export const useProtectionStatus = () => useAppStore((state) => state.protectionEnabled);

export const usePrivacyScore = () => useAppStore((state) => state.privacyScore);

export const useNetworkStats = () => useAppStore((state) => state.networkStats);

export const useDnsStats = () => useAppStore((state) => state.dnsStats);

export const useTopTrackers = () => useAppStore((state) => state.topTrackers);

export const useIsLoading = () => useAppStore((state) => state.isLoading);

export const useError = () => useAppStore((state) => state.error);
