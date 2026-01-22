/**
 * Windows Network Monitor
 * Uses WinDivert for packet capture on Windows
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
 * Windows Monitor using WinDivert
 *
 * Note: WinDivert requires Administrator privileges and the driver to be installed
 * Download from: https://reqrypt.org/windivert.html
 */
export class WindowsMonitor extends BaseNetworkMonitor {
  private capturing: boolean = false;
  private captureProcess: any = null;

  constructor(config: Partial<MonitorConfig> = {}) {
    super(config);
  }

  /**
   * Check if running as Administrator
   */
  protected async checkPermissions(): Promise<boolean> {
    try {
      // Try to run a command that requires admin privileges
      const { stdout } = await execAsync(
        'NET SESSION >nul 2>&1 && echo admin || echo not-admin'
      );
      return stdout.trim() === 'admin';
    } catch {
      return false;
    }
  }

  /**
   * Get permission instructions for Windows
   */
  protected getPermissionInstructions(): string {
    return [
      'On Windows, you need:',
      '1. Run as Administrator (right-click -> Run as Administrator)',
      '2. Install WinDivert driver from https://reqrypt.org/windivert.html',
      '3. Ensure WinDivert.dll and WinDivert64.sys are in the PATH',
    ].join('\n');
  }

  /**
   * Initialize WinDivert capture
   */
  protected async initialize(): Promise<void> {
    try {
      // Check if WinDivert is available
      const hasWinDivert = await this.checkWinDivert();
      if (!hasWinDivert) {
        throw new CaptureError(
          'WinDivert is not installed or not accessible',
          'win32'
        );
      }

      // Start capture using fallback method (netsh trace or PowerShell)
      // In production, this would use FFI bindings to WinDivert.dll
      await this.startFallbackCapture();

      this.capturing = true;
      console.log('[WindowsMonitor] Packet capture started');
    } catch (error) {
      throw new CaptureError(
        `Failed to initialize packet capture: ${(error as Error).message}`,
        'win32'
      );
    }
  }

  /**
   * Check if WinDivert is available
   */
  private async checkWinDivert(): Promise<boolean> {
    try {
      // Try to find WinDivert.dll
      await execAsync('where WinDivert.dll');
      return true;
    } catch {
      // WinDivert not found, will use fallback
      return false;
    }
  }

  /**
   * Start fallback capture using PowerShell
   * In production, use FFI to WinDivert for real packet capture
   */
  private async startFallbackCapture(): Promise<void> {
    // Use PowerShell to monitor network connections
    // This is a simplified fallback - real implementation would use WinDivert FFI

    const script = `
      Get-NetTCPConnection | Where-Object {
        $_.State -eq 'Established'
      } | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess | ConvertTo-Json
    `;

    // Poll connections every second
    const pollInterval = setInterval(async () => {
      if (!this.capturing) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const { stdout } = await execAsync(
          `powershell -Command "${script.replace(/\n/g, ' ')}"`
        );

        const connections = JSON.parse(stdout || '[]');
        if (Array.isArray(connections)) {
          for (const conn of connections) {
            const packet = this.createPacketFromConnection(conn);
            if (packet) {
              this.handlePacket(packet);
            }
          }
        }
      } catch {
        // Ignore errors during polling
      }
    }, 1000);

    this.captureProcess = pollInterval;
  }

  /**
   * Create NetworkPacket from PowerShell connection object
   */
  private createPacketFromConnection(conn: any): NetworkPacket | null {
    try {
      // Parse connection info
      const sourceIp = conn.LocalAddress || '';
      const sourcePort = parseInt(conn.LocalPort) || 0;
      const destinationIp = conn.RemoteAddress || '';
      const destinationPort = parseInt(conn.RemotePort) || 0;

      if (!sourceIp || !destinationIp) {
        return null;
      }

      // Determine protocol based on port
      let protocol = Protocol.TCP;
      if (destinationPort === 443) protocol = Protocol.HTTPS;
      else if (destinationPort === 80) protocol = Protocol.HTTP;
      else if (destinationPort === 53) protocol = Protocol.DNS;

      // Direction: assume outbound if local IP
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
        length: 0, // Not available from PowerShell
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
      ip.includes('::1')
    );
  }

  /**
   * Cleanup capture
   */
  protected async cleanup(): Promise<void> {
    this.capturing = false;

    if (this.captureProcess) {
      clearInterval(this.captureProcess);
      this.captureProcess = null;
    }
  }
}

/**
 * Note on Production Implementation:
 *
 * For production use, this should use FFI bindings to WinDivert.dll:
 *
 * ```typescript
 * import ffi from 'ffi-napi';
 * import ref from 'ref-napi';
 *
 * const windivert = ffi.Library('WinDivert', {
 *   WinDivertOpen: ['pointer', ['string', 'int16']],
 *   WinDivertRecv: ['bool', ['pointer', 'pointer', 'uint32', 'pointer']],
 *   WinDivertClose: ['bool', ['pointer']],
 * });
 *
 * const handle = windivert.WinDivertOpen('true', 0);
 * // ... capture packets
 * ```
 *
 * This would provide real-time packet capture similar to Linux libpcap.
 */
