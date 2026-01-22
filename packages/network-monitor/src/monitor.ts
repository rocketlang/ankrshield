/**
 * Network monitoring
 */

export interface NetworkFlow {
  sourceIp: string;
  destinationIp: string;
  domain?: string;
  protocol: string;
  timestamp: Date;
}

export class NetworkMonitor {
  private running = false;

  start(): void {
    // TODO: Implement platform-specific network monitoring
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
