/**
 * Preload script for Electron
 */

import { contextBridge } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Add API methods here
  version: process.versions.electron,
});
