// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — OS notification DAN carrier (ASD-T-016)
//
// Fires a native OS notification (libnotify on Linux, Notification Center on
// macOS, toast on Windows) via Electron's Notification API. The notification
// is purely informational — actual approve/deny still happens in the renderer
// DanInbox. Clicking the notification focuses the main window so the inbox
// is visible.
//
// Electron is CJS — same default-import + destructure pattern used in
// ipc-handlers.ts so this loads under plain Node ESM too (vitest path).
// Falls back to a no-op when Notification is unavailable (test env).
//
// @rule:ASD-008 — DAN gate carrier
// @rule:INF-ASD-008 — OS notification is the default; WA/TG are opt-in (T-017)

import type { DanNotifier, DanRequest } from './pending-dan-queue.js';

export interface OsNotificationCarrierOptions {
  /** Override window-focus side effect (default: focus first BrowserWindow). */
  onClick?: () => void;
  /**
   * Optional injection point for tests. Default uses electron's Notification.
   * Receives notification options and is expected to fire-and-forget.
   */
  notifier?: (opts: { title: string; body: string; onClick: () => void }) => void;
}

export class OsNotificationDanCarrier implements DanNotifier {
  private readonly notifier: (opts: { title: string; body: string; onClick: () => void }) => void;
  private readonly onClickOverride?: () => void;

  constructor(opts: OsNotificationCarrierOptions = {}) {
    this.notifier = opts.notifier ?? defaultElectronNotifier;
    this.onClickOverride = opts.onClick;
  }

  notify(req: DanRequest): void {
    const top = req.highRiskTools[0];
    const more = req.highRiskTools.length - 1;
    const title = `ankrshield: ${req.appId} needs approval`;
    const body =
      top != null
        ? `${top.name} (${top.category})${more > 0 ? ` + ${more} more` : ''} → ${req.hostname}. ` +
          `Open ankrshield to approve.`
        : `Request to ${req.hostname} — open ankrshield to approve.`;
    this.notifier({ title, body, onClick: () => this.handleClick() });
  }

  private handleClick(): void {
    if (this.onClickOverride) {
      this.onClickOverride();
      return;
    }
    // Default: focus a main window if one exists. Imported lazily so test
    // environments without electron don't crash on module load.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as typeof import('electron');
      const wins = electron.BrowserWindow.getAllWindows();
      const w = wins.find((x) => !x.isDestroyed());
      if (w) {
        if (w.isMinimized()) w.restore();
        w.focus();
      }
    } catch {
      // electron not available (test) — no-op
    }
  }
}

function defaultElectronNotifier(opts: { title: string; body: string; onClick: () => void }): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron');
    if (!electron.Notification?.isSupported?.()) return;
    const n = new electron.Notification({
      title: opts.title,
      body: opts.body,
      urgency: 'critical',
      timeoutType: 'never',
    });
    n.on('click', () => {
      try {
        opts.onClick();
      } catch {
        // best-effort
      }
    });
    n.show();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[aegis-proxy] OS notification carrier could not show notification:',
      err instanceof Error ? err.message : err
    );
  }
}
