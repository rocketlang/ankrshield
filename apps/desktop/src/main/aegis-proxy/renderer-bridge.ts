// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — forward proxy events to renderer via IPC
//
// @rule:ASD-006 — single Electron main process; renderer receives events via IPC

import { BrowserWindow } from 'electron';

import type { AegisProxyEvent, AegisProxyEventBus } from './event-bus.js';

export const AEGIS_PROXY_IPC_CHANNEL = 'aegis-proxy-event';

/**
 * Wire the proxy event bus into the renderer process by broadcasting each
 * event to every open BrowserWindow. Returns an unsubscribe function so the
 * caller can detach (e.g. on app quit).
 *
 * Windows opened AFTER attachment automatically receive subsequent events —
 * we broadcast at emit time, not at attach time.
 */
export function attachAegisProxyToRenderer(bus: AegisProxyEventBus): () => void {
  const unsubscribe = bus.on((event: AegisProxyEvent) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send(AEGIS_PROXY_IPC_CHANNEL, event);
        } catch {
          // window may be tearing down; ignore.
        }
      }
    }
  });
  return unsubscribe;
}
