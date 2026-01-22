/**
 * macOS Network Monitor
 * Uses Network Extension framework via system calls
 */

import { BaseNetworkMonitor } from './base-monitor';
import {
  MonitorConfig,
  NetworkPacket,
  Protocol,
  Direction,
  CaptureError,
} from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * macOS Monitor using Network Extension framework
 *
 * Note: Full Network Extension requires a system extension with entitlements
 * This implementation uses lsof and nettop as fallback for basic monitoring
 * For production, implement a proper Network Extension provider in Swift/Obj-C
 */
export class MacOSMonitor extends BaseNetworkMonitor {
  private capturing: boolean = false;
  private captureProcess: any = null;
  private connectionCache: Map<string, NetworkPacket> = new Map();

  constructor(config: Partial<MonitorConfig> = {}) {
    super(config);
  }

  /**
   * Check if user has required permissions
   * On macOS 10.15+, this requires Full Disk Access or TCC approval
   */
  protected async checkPermissions(): Promise<boolean> {
    try {
      // Check if we can run lsof
      await execAsync('lsof -i -n -P | head -1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get permission instructions for macOS
   */
  protected getPermissionInstructions(): string {
    return [
      'On macOS, you need:',
      '1. Grant Full Disk Access in System Preferences > Security & Privacy > Privacy',
      '2. For production use, implement a Network Extension with entitlements',
      '3. Sign the app with a valid Developer ID',
      '4. Request user approval for System Extension',
    ].join('\n');
  }

  /**
   * Initialize network monitoring using lsof
   */
  protected async initialize(): Promise<void> {
    try {
      // Check macOS version
      const { stdout } = await execAsync('sw_vers -productVersion');
      const version = stdout.trim();
      console.log(`[MacOSMonitor] Running on macOS ${version}`);

      // Start monitoring using lsof
      await this.startLsofMonitoring();

      this.capturing = true;
      console.log('[MacOSMonitor] Network monitoring started');
    } catch (error) {
      throw new CaptureError(
        `Failed to initialize network monitoring: ${(error as Error).message}`,
        'darwin'
      );
    }
  }

  /**
   * Monitor network connections using lsof
   * lsof -i -n -P -r 1 (repeat every 1 second)
   */
  private async startLsofMonitoring(): Promise<void> {
    // Poll network connections periodically
    const pollInterval = setInterval(async () => {
      if (!this.capturing) {
        clearInterval(pollInterval);
        return;
      }

      try {
        // Get all network connections
        // -i: internet connections
        // -n: no DNS resolution
        // -P: no port name resolution
        // -F: machine-readable output
        const { stdout } = await execAsync(
          "lsof -i -n -P | grep -E 'ESTABLISHED|LISTEN' || true"
        );

        const lines = stdout.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          const packet = this.parseLsofLine(line);
          if (packet) {
            // Check if this is a new connection
            const key = `${packet.sourceIp}:${packet.sourcePort}:${packet.destinationIp}:${packet.destinationPort}`;

            if (!this.connectionCache.has(key)) {
              this.connectionCache.set(key, packet);
              this.handlePacket(packet);

              // Clean cache periodically
              if (this.connectionCache.size > 1000) {
                this.connectionCache.clear();
              }
            }
          }
        }
      } catch {
        // Ignore errors during polling
      }
    }, 1000); // Poll every second

    this.captureProcess = pollInterval;
  }

  /**
   * Parse lsof output line into NetworkPacket
   *
   * Example lsof output:
   * Chrome    1234 user   42u  IPv4 0x123abc  TCP 192.168.1.100:54321->93.184.216.34:443 (ESTABLISHED)
   */
  private parseLsofLine(line: string): NetworkPacket | null {
    try {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) return null;

      // Find the connection info (IP:PORT->IP:PORT)
      let connIndex = -1;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('->')) {
          connIndex = i;
          break;
        }
      }

      if (connIndex === -1) return null;

      const connPart = parts[connIndex];
      const [local, remote] = connPart.split('->');

      if (!local || !remote) return null;

      // Parse local (source)
      const localMatch = local.match(/(.+):(\d+)$/);
      if (!localMatch) return null;
      const sourceIp = localMatch[1];
      const sourcePort = parseInt(localMatch[2]);

      // Parse remote (destination)
      const remoteMatch = remote.match(/(.+):(\d+)$/);
      if (!remoteMatch) return null;
      const destinationIp = remoteMatch[1];
      const destinationPort = parseInt(remoteMatch[2]);

      // Determine protocol
      let protocol = Protocol.TCP;
      if (parts[connIndex - 1] === 'UDP') {
        protocol = Protocol.UDP;
      } else if (destinationPort === 443) {
        protocol = Protocol.HTTPS;
      } else if (destinationPort === 80) {
        protocol = Protocol.HTTP;
      } else if (destinationPort === 53) {
        protocol = Protocol.DNS;
      }

      // Direction
      const direction = this.isLocalIp(sourceIp)
        ? Direction.OUTBOUND
        : Direction.INBOUND;

      return {
        timestamp: new Date(),
        sourceIp,
        sourcePort,
        destinationIp,
        destinationPort,
        protocol,
        direction,
        length: 0, // Not available from lsof
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if IP is local
   */
  private isLocalIp(ip: string): boolean {
    return (
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.') ||
      ip === '127.0.0.1' ||
      ip.includes('::1') ||
      ip === 'localhost'
    );
  }

  /**
   * Cleanup monitoring
   */
  protected async cleanup(): Promise<void> {
    this.capturing = false;

    if (this.captureProcess) {
      clearInterval(this.captureProcess);
      this.captureProcess = null;
    }

    this.connectionCache.clear();
  }
}

/**
 * Note on Production Implementation:
 *
 * For production use on macOS, implement a proper Network Extension:
 *
 * 1. Create a System Extension target in Xcode
 * 2. Implement NEPacketTunnelProvider in Swift:
 *
 * ```swift
 * class PacketTunnelProvider: NEPacketTunnelProvider {
 *     override func startTunnel(options: [String: NSObject]?) async throws {
 *         // Configure tunnel
 *         let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
 *         try await setTunnelNetworkSettings(settings)
 *
 *         // Start reading packets
 *         packetFlow.readPackets { packets, protocols in
 *             // Process packets
 *             self.handlePackets(packets, protocols)
 *         }
 *     }
 * }
 * ```
 *
 * 3. Add entitlements:
 *    - com.apple.developer.networking.networkextension (Network Extension)
 *    - com.apple.security.app-sandbox (Sandbox)
 *
 * 4. Code sign with Developer ID
 * 5. Request user approval via System Preferences
 *
 * This provides real-time packet-level monitoring like Linux/Windows.
 */
