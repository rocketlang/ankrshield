/**
 * Preload script for Electron
 * Exposes IPC methods to renderer process with type safety
 */

import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface
export interface ElectronAPI {
  // Privacy Service
  privacy: {
    getScore: () => Promise<any>;
    getBreakdown: () => Promise<any>;
    getHistory: (timeRange?: { start: Date; end: Date }) => Promise<any>;
  };

  // DNS Service
  dns: {
    getStats: () => Promise<any>;
    getRecentQueries: (limit?: number) => Promise<any>;
    toggleProtection: (enabled: boolean) => Promise<any>;
    isProtectionEnabled: () => Promise<any>;
  };

  // Network Service
  network: {
    getEvents: (limit?: number) => Promise<any>;
    getStats: () => Promise<any>;
    toggleProtection: (enabled: boolean) => Promise<any>;
    isProtectionEnabled: () => Promise<any>;
  };

  // App
  app: {
    getVersion: () => Promise<any>;
    quit: () => Promise<any>;
  };
}

// Expose protected methods to renderer process
const electronAPI: ElectronAPI = {
  privacy: {
    getScore: () => ipcRenderer.invoke('privacy:getScore'),
    getBreakdown: () => ipcRenderer.invoke('privacy:getBreakdown'),
    getHistory: (timeRange?: { start: Date; end: Date }) =>
      ipcRenderer.invoke('privacy:getHistory', timeRange),
  },

  dns: {
    getStats: () => ipcRenderer.invoke('dns:getStats'),
    getRecentQueries: (limit: number = 50) =>
      ipcRenderer.invoke('dns:getRecentQueries', limit),
    toggleProtection: (enabled: boolean) =>
      ipcRenderer.invoke('dns:toggleProtection', enabled),
    isProtectionEnabled: () => ipcRenderer.invoke('dns:isProtectionEnabled'),
  },

  network: {
    getEvents: (limit: number = 50) => ipcRenderer.invoke('network:getEvents', limit),
    getStats: () => ipcRenderer.invoke('network:getStats'),
    toggleProtection: (enabled: boolean) =>
      ipcRenderer.invoke('network:toggleProtection', enabled),
    isProtectionEnabled: () => ipcRenderer.invoke('network:isProtectionEnabled'),
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
