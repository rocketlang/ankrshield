/**
 * Main Process Entry Point
 * Electron main process for ankrshield desktop application
 */

import { app, BrowserWindow } from 'electron';
import { createTray } from './tray.js';
import { createMainWindow } from './window.js';
import { setupIPC } from './ipc.js';
import { setupAutoLaunch } from './auto-launch.js';
import { setupAutoUpdater } from './updater.js';
import { NotificationService } from './notifications.js';
import { serviceManager } from './services/service-manager.js';
import {
  startAegisProxy,
  attachAegisProxyToRenderer,
  registerAegisProxyIpcHandlers,
  registerTofuConsentHandlers,
  registerDanGateHandlers,
  registerDanCarrierCredsHandlers,
  registerDanTimeoutHandlers,
  registerConsentDialogHandlers,
  registerBudgetPanelHandlers,
  registerAegisLatencyHandlers,
  registerReportCardHandlers,
  registerKillSwitchHandlers,
  registerAuditRetentionHandlers,
  registerAuditExportHandlers,
  registerReplayHandlers,
  registerRequestAuditHandlers,
  type AegisProxyHandle,
} from './aegis-proxy/index.js';

// Enable sandbox bypass for development/testing (required when running as root)
app.commandLine.appendSwitch('no-sandbox');

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Global references
export const notificationService = new NotificationService();

// @rule:ASD-006 — agentic safeguard runs inside the same Electron main process
//   as the privacy engine; one trust boundary, one cockpit.
let aegisProxyHandle: AegisProxyHandle | null = null;

/**
 * App ready handler
 */
app.whenReady().then(async () => {
  console.log('ankrshield desktop starting...');

  try {
    // Initialize all services (database, DNS, network, privacy)
    await serviceManager.initialize();

    // Get service health status
    const health = serviceManager.getHealthSummary();
    console.log('Service health:', health.healthy ? '✓ Healthy' : '⚠ Degraded');
    health.services.forEach((s) => {
      const emoji = s.status === 'running' ? '✓' : s.status === 'degraded' ? '⚠' : '✗';
      console.log(`  ${emoji} ${s.name}: ${s.status} ${s.message ? `(${s.message})` : ''}`);
    });

    // Setup IPC handlers (requires services to be initialized)
    setupIPC();

    // Setup auto-launch
    await setupAutoLaunch();

    // Create system tray
    createTray();

    // Create main window
    createMainWindow();

    // Setup auto-updater
    setupAutoUpdater();

    // @rule:ASD-001 — start the local agentic-safeguard proxy on loopback only.
    //   Bind violations are fatal (exit 78). Other startup failures (port in use,
    //   etc.) are logged but non-fatal — privacy engine keeps running.
    try {
      // @rule:ASD-010 / INF-ASD-009 — wire dnsService.isBlocked as the
      //   privacy-engine block check that runs BEFORE the AEGIS path in
      //   forwardWithObservation. DNSService.isBlocked's declared return
      //   type is `{ blocked, reason? }` but its runtime value is the
      //   underlying resolver's boolean (the wrapper passes through
      //   unmodified). Normalise to a plain boolean here and fail-open.
      const dns = serviceManager.getDNSService();
      const isBlocked = dns
        ? async (host: string) => {
            try {
              const result = (await dns.isBlocked(host)) as unknown;
              if (typeof result === 'boolean') return result;
              if (result && typeof result === 'object' && 'blocked' in result) {
                return (result as { blocked: boolean }).blocked === true;
              }
              return false;
            } catch {
              return false; // privacy-engine outage → fail-open per ASD-T-009 notes
            }
          }
        : undefined;
      aegisProxyHandle = await startAegisProxy({ isBlocked });
      // @rule:ASD-006 — proxy events bridged to renderer for AgentFeed (ASD-T-008).
      attachAegisProxyToRenderer(aegisProxyHandle.events);
      // ASD-T-003: IPC handlers for the /setup/root-ca consent ceremony.
      registerAegisProxyIpcHandlers();
      // ASD-T-015: IPC handlers for TOFU consent (list pending + resolve + policy).
      registerTofuConsentHandlers(aegisProxyHandle.pendingConsent, aegisProxyHandle.appsPolicy);
      // ASD-T-016: IPC handlers for DAN gate (list pending + resolve + clear cache).
      registerDanGateHandlers(aegisProxyHandle.pendingDan, aegisProxyHandle.danDecisionCache);
      // ASD-T-017: IPC handlers for DAN carrier credential management (Settings page).
      registerDanCarrierCredsHandlers();
      // ASD-T-018: IPC handlers for DAN timeout config (Settings page).
      registerDanTimeoutHandlers(aegisProxyHandle.danTimeoutStore);
      // ASD-T-019: ConsentDialog → ConsentStore IPC (impression + decision PRAMANA records).
      registerConsentDialogHandlers();
      // ASD-T-020: BudgetPanel IPC (per-app spend summary + cap edits).
      registerBudgetPanelHandlers(
        aegisProxyHandle.appsPolicy,
        aegisProxyHandle.budgetLedger,
        aegisProxyHandle.budgetConfig
      );
      // ASD-T-022: AEGIS latency snapshot IPC (NFR-1 compliance tile).
      registerAegisLatencyHandlers(aegisProxyHandle.aegisLatency);
      // ASD-T-024: HanumanG report-card IPC (FR-17 — daily/per-app roll-up).
      registerReportCardHandlers({
        tally: aegisProxyHandle.eventTally,
        ledger: aegisProxyHandle.budgetLedger,
        appsPolicy: aegisProxyHandle.appsPolicy,
      });
      // ASD-T-026 + T-027: kill switch IPC (PAUSE/THROTTLE/LOCK per-app + global).
      registerKillSwitchHandlers(aegisProxyHandle.killSwitch);
      // ASD-T-028: audit retention IPC + worker tick (FR-14, Vivechana Decision 4).
      registerAuditRetentionHandlers(aegisProxyHandle.auditRetention, aegisProxyHandle.auditWorker);
      // ASD-T-029: audit export ZIP IPC (FR-20).
      registerAuditExportHandlers();
      // ASD-T-030: 24h replay IPC (FR-16 P3).
      registerReplayHandlers(aegisProxyHandle.requestLog);
      // ASD-T-031: persisted per-request audit receipts IPC (FR-13).
      registerRequestAuditHandlers(aegisProxyHandle.requestAudit);
    } catch (err) {
      console.warn(
        '[aegis-proxy] failed to start; privacy engine continues without agentic safeguard:',
        err instanceof Error ? err.message : err
      );
    }

    console.log('ankrshield desktop ready');
  } catch (error) {
    console.error('Failed to initialize ankrshield:', error);

    // Show error notification
    notificationService.showError(
      'Initialization Failed: ankrshield failed to start. Please check the logs.'
    );

    // Exit with error code
    app.exit(1);
  }
});

/**
 * All windows closed handler
 */
app.on('window-all-closed', () => {
  // On macOS, apps stay active until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Activate handler (macOS)
 */
app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

/**
 * Before quit handler
 */
app.on('before-quit', async () => {
  // Set flag so window close doesn't prevent quit
  (app as any).isQuitting = true;

  // Cleanup all services
  console.log('Shutting down services...');
  try {
    await serviceManager.shutdown();
    console.log('Services shutdown complete');
  } catch (error) {
    console.error('Error shutting down services:', error);
  }
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
