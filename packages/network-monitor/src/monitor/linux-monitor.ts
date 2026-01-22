/**
 * Linux Network Monitor
 * Uses libpcap for packet capture on Linux
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

// Optional import - only available if node-libpcap is installed
let pcap: any = null;

export class LinuxMonitor extends BaseNetworkMonitor {
  private pcapSession: any = null;
  private device: string = 'any'; // Capture on all interfaces

  constructor(config: Partial<MonitorConfig> = {}) {
    super(config);

    // Try to load pcap
    try {
      pcap = require('node-libpcap');
    } catch {
      throw new CaptureError(
        'node-libpcap is not installed. Install with: npm install node-libpcap',
        'linux'
      );
    }
  }

  /**
   * Check if user has CAP_NET_RAW capability or is root
   */
  protected async checkPermissions(): Promise<boolean> {
    try {
      // Check if running as root
      if (process.getuid && process.getuid() === 0) {
        return true;
      }

      // Check for CAP_NET_RAW capability
      const { stdout } = await execAsync('getcap $(which node) 2>/dev/null');
      if (stdout.includes('cap_net_raw')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get permission instructions for Linux
   */
  protected getPermissionInstructions(): string {
    return [
      'On Linux, you need either:',
      '1. Run as root: sudo node your-app.js',
      '2. Grant CAP_NET_RAW capability: sudo setcap cap_net_raw=eip $(which node)',
      '3. Add user to pcap group (if available)',
    ].join('\n');
  }

  /**
   * Initialize libpcap capture
   */
  protected async initialize(): Promise<void> {
    try {
      // Select interface
      if (this.config.interfaces.length > 0) {
        this.device = this.config.interfaces[0];
      }

      // BPF filter (Berkeley Packet Filter)
      // Capture TCP and UDP only by default
      const filter = 'tcp or udp';

      // Create pcap session
      this.pcapSession = pcap.createSession(this.device, {
        filter,
        buffer_size: 10 * 1024 * 1024, // 10 MB buffer
        buffer_timeout: 10, // ms
        monitor_mode: false,
        promiscuous: false,
      });

      // Listen for packets
      this.pcapSession.on('packet', (rawPacket: any) => {
        try {
          const packet = this.parsePacket(rawPacket);
          if (packet) {
            this.handlePacket(packet);
          }
        } catch (error) {
          this.emit('error', error as Error);
        }
      });

      console.log(`[LinuxMonitor] Capturing on interface: ${this.device}`);
    } catch (error) {
      throw new CaptureError(
        `Failed to initialize packet capture: ${(error as Error).message}`,
        'linux'
      );
    }
  }

  /**
   * Parse raw packet into NetworkPacket
   */
  private parsePacket(rawPacket: any): NetworkPacket | null {
    try {
      const packet = pcap.decode.packet(rawPacket);

      // Extract Ethernet layer
      const ethernet = packet.payload;
      if (!ethernet || ethernet.ethertype !== 0x0800) {
        // Only handle IPv4 for now
        return null;
      }

      // Extract IP layer
      const ip = ethernet.payload;
      if (!ip) return null;

      const sourceIp = ip.saddr.toString();
      const destinationIp = ip.daddr.toString();

      // Extract transport layer (TCP/UDP)
      const transport = ip.payload;
      if (!transport) return null;

      let protocol: Protocol = Protocol.UNKNOWN;
      let sourcePort = 0;
      let destinationPort = 0;

      if (ip.protocol === 6) {
        // TCP
        protocol = this.identifyTCPProtocol(transport.dport);
        sourcePort = transport.sport;
        destinationPort = transport.dport;
      } else if (ip.protocol === 17) {
        // UDP
        protocol = this.identifyUDPProtocol(transport.dport);
        sourcePort = transport.sport;
        destinationPort = transport.dport;
      } else {
        return null; // Ignore other protocols for now
      }

      // Determine direction (simplified - assumes outbound if local source)
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
        length: rawPacket.header.len || 0,
        payload: this.config.capturePayload ? rawPacket.buf : undefined,
      };
    } catch (error) {
      // Silently ignore malformed packets
      return null;
    }
  }

  /**
   * Identify protocol based on TCP port
   */
  private identifyTCPProtocol(port: number): Protocol {
    if (port === 80) return Protocol.HTTP;
    if (port === 443) return Protocol.HTTPS;
    if (port === 53) return Protocol.DNS;
    return Protocol.TCP;
  }

  /**
   * Identify protocol based on UDP port
   */
  private identifyUDPProtocol(port: number): Protocol {
    if (port === 53) return Protocol.DNS;
    if (port === 443) return Protocol.QUIC; // QUIC uses UDP/443
    if (port >= 3478 && port <= 3497) return Protocol.WEBRTC; // STUN/TURN
    return Protocol.UDP;
  }

  /**
   * Check if IP is local (simplified)
   */
  private isLocalIp(ip: string): boolean {
    // Check if IP is in typical local ranges
    return (
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.') ||
      ip === '127.0.0.1'
    );
  }

  /**
   * Cleanup libpcap session
   */
  protected async cleanup(): Promise<void> {
    if (this.pcapSession) {
      this.pcapSession.close();
      this.pcapSession = null;
    }
  }
}
