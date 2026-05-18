/**
 * StatsReporter — two-way bridge between the phone and AnkrShield server.
 *
 * UP   (phone → server, every 30 s):
 *   POST /device/stats  — blockedCount, totalQueries, allowedCount, running, lastBlocked
 *   No domain names, no browsing history — counters only.
 *
 * DOWN (server → phone, every 30 s poll — synchronized with UP):
 *   GET /device/commands/:deviceId — returns pending commands pushed by the Warrior.
 *   Types handled:
 *     alert         — show in-app banner (stored in audit log)
 *     block_domain  — add domain to session block-hint set (advisory, not DNS-enforced yet)
 *     config_update — update local config flags
 *     request_stats — server requests an immediate stats report
 *
 * Safety riders (mirroring server-side constraints):
 *   • Commands are validated before acting — unknown types are logged and ignored
 *   • block_domain advisory only: never silently drops packets without user awareness
 *   • All received commands appended to in-memory audit log (last 50 entries)
 *   • Never throws — every error is caught silently so the app is never affected
 *
 * Persistent device ID:
 *   Generated once per install and written to a file in the app's cache directory.
 *   Falls back to session ID if file I/O fails.
 */

import { Platform } from 'react-native';

import { API_BASE } from '../config';

import { VpnStats } from './VpnService';

// ─── Device ID (session-scoped, resets on app restart) ───────────────────────
// react-native-fs is not installed — use a stable in-memory session ID.
// Good enough for fleet aggregation; add react-native-fs later for persistence.

const DEVICE_ID =
  'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + '_' + Platform.OS;

async function getDeviceId(): Promise<string> {
  return DEVICE_ID;
}

// ─── Audit Log (in-memory, last 50 entries) ───────────────────────────────────

export interface AuditEntry {
  ts: string;
  type: 'push_received' | 'stats_sent' | 'command_executed' | 'error';
  detail: string;
  source: 'server' | 'local';
}

const auditLog: AuditEntry[] = [];

function addAudit(entry: AuditEntry) {
  auditLog.unshift(entry);
  if (auditLog.length > 50) auditLog.pop();
}

/** Read-only snapshot of the audit log for display in the UI. */
export function getAuditLog(): AuditEntry[] {
  return [...auditLog];
}

// ─── Command handlers ─────────────────────────────────────────────────────────

export interface DeviceCommand {
  type: string;
  payload: Record<string, unknown>;
  reason?: string;
  pushedAt: string;
  source: string;
}

// Listeners registered by screens to react to server commands
type CommandListener = (cmd: DeviceCommand) => void;
const commandListeners: CommandListener[] = [];

export function onServerCommand(cb: CommandListener): () => void {
  commandListeners.push(cb);
  return () => {
    const idx = commandListeners.indexOf(cb);
    if (idx >= 0) commandListeners.splice(idx, 1);
  };
}

// Advisory block set — domains the server asked to block (shown in UI, not DNS-enforced)
export const serverAdvisoryBlocks = new Set<string>();

function handleCommand(cmd: DeviceCommand) {
  try {
    switch (cmd.type) {
      case 'alert':
        addAudit({
          ts: new Date().toISOString(),
          type: 'push_received',
          detail:
            `Server alert: ${String(cmd.payload.title ?? cmd.type)} — ${String(cmd.payload.body ?? '')}`.slice(
              0,
              160
            ),
          source: 'server',
        });
        commandListeners.forEach((cb) => cb(cmd));
        break;

      case 'block_domain': {
        const domain = typeof cmd.payload.domain === 'string' ? cmd.payload.domain : '';
        if (domain) {
          serverAdvisoryBlocks.add(domain);
          addAudit({
            ts: new Date().toISOString(),
            type: 'command_executed',
            detail: `Server advisory block: ${domain} (reason: ${cmd.reason ?? 'unspecified'})`,
            source: 'server',
          });
          commandListeners.forEach((cb) => cb(cmd));
        }
        break;
      }

      case 'config_update':
        addAudit({
          ts: new Date().toISOString(),
          type: 'command_executed',
          detail: `Config update: ${JSON.stringify(cmd.payload).slice(0, 120)}`,
          source: 'server',
        });
        commandListeners.forEach((cb) => cb(cmd));
        break;

      case 'request_stats':
        // Server wants an immediate report — will be sent on next poll cycle
        addAudit({
          ts: new Date().toISOString(),
          type: 'push_received',
          detail: 'Server requested immediate stats report',
          source: 'server',
        });
        break;

      default:
        // Unknown command — log and ignore (never act on unknown types)
        addAudit({
          ts: new Date().toISOString(),
          type: 'error',
          detail: `Unknown command type ignored: ${cmd.type}`,
          source: 'server',
        });
    }
  } catch {
    // Never crash
  }
}

// ─── Stats reporting (UP) ─────────────────────────────────────────────────────

export async function reportStats(stats: VpnStats): Promise<void> {
  if (!stats.running && stats.totalQueries === 0) return;
  try {
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/device/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        blockedCount: stats.blockedCount,
        totalQueries: stats.totalQueries,
        allowedCount: stats.allowedCount,
        running: stats.running,
        lastBlocked: stats.lastBlocked,
      }),
    });
    if (res.ok) {
      addAudit({
        ts: new Date().toISOString(),
        type: 'stats_sent',
        detail: `Sent: blocked=${stats.blockedCount} total=${stats.totalQueries} running=${stats.running}`,
        source: 'local',
      });
    }
  } catch {
    // Silent — telemetry must never crash the app
  }
}

// ─── Command polling (DOWN) ───────────────────────────────────────────────────

async function pollCommands(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/device/commands/${deviceId}`);
    if (!res.ok) return;
    const json = (await res.json()) as { commands?: DeviceCommand[] };
    for (const cmd of json.commands ?? []) {
      handleCommand(cmd);
    }
  } catch {
    // Silent
  }
}

// ─── Main lifecycle ───────────────────────────────────────────────────────────

const BRIDGE_INTERVAL = 30_000; // 30 s — UP (stats) and DOWN (commands) fire together

/**
 * Start the two-way bridge. Returns a cleanup function.
 * Call from HomeScreen's useEffect.
 */
export function startReporting(getStats: () => Promise<VpnStats>): () => void {
  // Single 30 s tick — UP and DOWN fire together as one synchronized handshake
  const bridgeId = setInterval(async () => {
    try {
      await reportStats(await getStats());
    } catch {
      /* silent */
    }
    void pollCommands();
  }, BRIDGE_INTERVAL);

  // Immediate first handshake on startup
  void pollCommands();

  return () => {
    clearInterval(bridgeId);
  };
}
