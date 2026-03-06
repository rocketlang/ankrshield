/**
 * VpnService — React Native wrapper for the AnkrShield DNS VPN native module.
 *
 * The native module (DnsVpnModule.java) runs DnsVpnService which:
 *   1. Creates a local loopback VPN to intercept all DNS (UDP port 53)
 *   2. Checks each queried domain against tracker-db.sqlite (bundled in APK)
 *   3. Blocks trackers with a synthetic NXDOMAIN response
 *   4. Forwards clean queries to upstream resolver (Cloudflare 1.1.1.1)
 *
 * This runs entirely on-device. No data leaves the phone in the free tier.
 *
 * Event history:
 *   The singleton maintains a ring buffer of the last MAX_HISTORY events
 *   from the moment the JS bundle loads — regardless of which screen is open.
 *   ActivityScreen reads the full buffer on mount so past events are visible.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { DnsVpn } = NativeModules;

export interface VpnStats {
  totalQueries: number;
  blockedCount: number;
  allowedCount: number;
  lastBlocked: string;
  running: boolean;
  paused: boolean;
  pauseUntilMs: number;
}

export interface DnsQueryEvent {
  domain: string;
  blocked: boolean;
  category: string;
  vendor: string;
}

export interface FeedEvent extends DnsQueryEvent {
  id: string;
  ts: number;
}

const MAX_HISTORY = 500;

// Stub for iOS (VPN not implemented until Sprint 4 / NEDNSProxyProvider)
const stubStats: VpnStats = {
  totalQueries: 0,
  blockedCount: 0,
  allowedCount: 0,
  lastBlocked: '',
  running: false,
  paused: false,
  pauseUntilMs: 0,
};

export interface InstalledApp {
  packageName: string;
  appName: string;
  bypassed: boolean;
}

class AnkrShieldVpn {
  private emitter: NativeEventEmitter | null = null;
  private _eventHistory: FeedEvent[] = [];
  private _historyListeners: Array<(events: FeedEvent[]) => void> = [];
  private _eventCounter = 0;

  constructor() {
    if (Platform.OS === 'android' && DnsVpn) {
      this.emitter = new NativeEventEmitter(DnsVpn);
      // Subscribe globally so history accumulates from app start
      this.emitter.addListener('DnsQueryEvent', (raw: DnsQueryEvent) => {
        const entry: FeedEvent = {
          ...raw,
          id: String(this._eventCounter++),
          ts: Date.now(),
        };
        this._eventHistory = [entry, ...this._eventHistory].slice(0, MAX_HISTORY);
        this._historyListeners.forEach((fn) => fn(this._eventHistory));
      });
    }
  }

  /** Returns a snapshot of all events captured since app start (newest first). */
  getEventHistory(): FeedEvent[] {
    return this._eventHistory;
  }

  /**
   * Subscribe to the live event history.
   * Called with the full updated array every time a new DNS event arrives.
   * @returns unsubscribe function
   */
  onEventHistory(callback: (events: FeedEvent[]) => void): () => void {
    this._historyListeners.push(callback);
    return () => {
      this._historyListeners = this._historyListeners.filter((fn) => fn !== callback);
    };
  }

  /**
   * Request VPN permission (Android OS dialog) and start DNS interception.
   * Safe to call multiple times — no-ops if already running.
   */
  async start(): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (!DnsVpn) throw new Error('DnsVpn native module not available');
    await DnsVpn.start();
  }

  /**
   * Stop DNS interception and tear down the VPN interface.
   */
  async stop(): Promise<void> {
    if (Platform.OS !== 'android' || !DnsVpn) return;
    await DnsVpn.stop();
  }

  /**
   * Returns live DNS interception stats from the native layer.
   */
  async getStats(): Promise<VpnStats> {
    if (Platform.OS !== 'android' || !DnsVpn) return stubStats;
    return DnsVpn.getStats() as Promise<VpnStats>;
  }

  /**
   * Returns true if the DNS VPN is currently active.
   */
  async isRunning(): Promise<boolean> {
    if (Platform.OS !== 'android' || !DnsVpn) return false;
    return DnsVpn.isRunning() as Promise<boolean>;
  }

  /**
   * Pause DNS filtering for N minutes (intentional browsing bypass).
   * DNS queries will be forwarded to upstream unfiltered during this window.
   * Auto-resumes when the timer expires. Also triggered automatically during phone calls.
   */
  async pause(minutes: number): Promise<void> {
    if (Platform.OS !== 'android' || !DnsVpn) return;
    await DnsVpn.pause(minutes);
  }

  /**
   * Cancel any active pause and resume DNS filtering immediately.
   */
  async resume(): Promise<void> {
    if (Platform.OS !== 'android' || !DnsVpn) return;
    await DnsVpn.resume();
  }

  /**
   * Subscribe to real-time DNS query events.
   * The callback fires for every DNS query intercepted (blocked or allowed).
   * @returns unsubscribe function — call it to remove the listener
   */
  onDnsQuery(callback: (event: DnsQueryEvent) => void): () => void {
    if (!this.emitter) return () => {};
    const subscription = this.emitter.addListener('DnsQueryEvent', callback);
    return () => subscription.remove();
  }

  /** Returns all installed user apps with current bypass state (Android only). */
  async getInstalledApps(): Promise<InstalledApp[]> {
    if (Platform.OS !== 'android' || !DnsVpn) return [];
    return DnsVpn.getInstalledApps() as Promise<InstalledApp[]>;
  }

  /** Toggle bypass for a single package; rebuilds VPN interface if running. */
  async toggleBypassApp(packageName: string, bypass: boolean): Promise<void> {
    if (Platform.OS !== 'android' || !DnsVpn) return;
    await DnsVpn.toggleBypassApp(packageName, bypass);
  }

  /** Overwrite the entire bypass list atomically. */
  async setBypassApps(packages: string[]): Promise<void> {
    if (Platform.OS !== 'android' || !DnsVpn) return;
    await DnsVpn.setBypassApps(packages);
  }

  /** Enable/disable passive (observe-only) mode. */
  async setPassiveMode(enabled: boolean): Promise<void> {
    if (Platform.OS !== 'android' || !DnsVpn) return;
    await DnsVpn.setPassiveMode(enabled);
  }

  /** Returns true if passive mode is currently enabled. */
  async isPassiveMode(): Promise<boolean> {
    if (Platform.OS !== 'android' || !DnsVpn) return false;
    return DnsVpn.isPassiveMode() as Promise<boolean>;
  }
}

export const vpnService = new AnkrShieldVpn();
