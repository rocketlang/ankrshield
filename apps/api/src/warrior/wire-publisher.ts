/**
 * AnkrShield → AnkrWire Bridge Publisher
 *
 * Bridges AI Warrior threat events into the AnkrWire event bus so that
 * downstream notification services (WhatsApp, Telegram, in-app) receive
 * instant alerts when threats are detected.
 *
 * Topics published (matching ankr-wire/src/Topics.ts):
 *   shield.attack.detected
 *   shield.agent.quarantined
 *   shield.scope.violation
 *   shield.honeypot.triggered
 *   shield.policy.generated
 *   shield.incident.report
 *   shield.spyware.detected
 *
 * Transport: WebSocket (socket.io-client) → AnkrWire WebSocket service
 * Fallback: HTTP POST to AnkrWire REST endpoint
 * Offline: queues events in memory (ring buffer, max 1000) and flushes on reconnect
 */

import { EventEmitter } from 'node:events';
import type { AIWarrior, AttackChain, GeneratedPolicy, ScopeViolation, IncidentReport, HoneypotAsset, QuarantinedAgent } from '@ankrshield/ai-warrior';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface WirePublisherConfig {
  /** AnkrWire WebSocket URL. Default: env ANKR_WIRE_WS_URL or http://localhost:4007 */
  wireWsUrl?: string;
  /** AnkrWire REST base URL for fallback. Default: env ANKR_WIRE_URL or http://localhost:4007 */
  wireRestUrl?: string;
  /** Source identifier attached to all events. Default: 'ankrshield-api' */
  source?: string;
  /** Minimum threat score to publish attack events. Default: 50 */
  minThreatScore?: number;
  /** Enable WhatsApp notification channel */
  enableWhatsApp?: boolean;
  /** Enable Telegram notification channel */
  enableTelegram?: boolean;
  /** Max offline queue size */
  maxQueueSize?: number;
}

// ─── Event envelope (matches AnkrEvent<T> from ankr-wire) ────────────────────

interface AnkrEvent<T = unknown> {
  id: string;
  topic: string;
  source: string;
  timestamp: string;
  data: T;
  metadata?: {
    correlationId?: string;
    channels?: string[];   // which notification channels to hit
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

// ─── WirePublisher ────────────────────────────────────────────────────────────

export class WirePublisher extends EventEmitter {
  private config: Required<WirePublisherConfig>;
  private ws: ReturnType<typeof import('socket.io-client').io> | null = null;
  private connected = false;
  private queue: Array<AnkrEvent> = [];
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: WirePublisherConfig = {}) {
    super();
    this.config = {
      wireWsUrl: config.wireWsUrl ?? process.env.ANKR_WIRE_WS_URL ?? 'http://localhost:4007',
      wireRestUrl: config.wireRestUrl ?? process.env.ANKR_WIRE_URL ?? 'http://localhost:4007',
      source: config.source ?? 'ankrshield-api',
      minThreatScore: config.minThreatScore ?? 50,
      enableWhatsApp: config.enableWhatsApp ?? (process.env.ANKR_WIRE_WHATSAPP !== 'false'),
      enableTelegram: config.enableTelegram ?? (process.env.ANKR_WIRE_TELEGRAM !== 'false'),
      maxQueueSize: config.maxQueueSize ?? 1000,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    try {
      // Dynamically import socket.io-client (may not be installed — graceful degradation)
      const { io } = await import('socket.io-client');
      this.ws = io(this.config.wireWsUrl, {
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: Infinity,
        timeout: 10_000,
      });

      this.ws.on('connect', () => {
        this.connected = true;
        console.log('[AnkrShield Wire] Connected to AnkrWire:', this.config.wireWsUrl);
        this.flushQueue();
      });

      this.ws.on('disconnect', () => {
        this.connected = false;
        console.warn('[AnkrShield Wire] Disconnected from AnkrWire — queuing events');
      });

      this.ws.on('connect_error', (err) => {
        this.connected = false;
        console.warn('[AnkrShield Wire] Connection error:', err.message, '— will retry');
      });
    } catch {
      // socket.io-client not available — fall back to HTTP-only mode
      console.warn('[AnkrShield Wire] socket.io-client not available — HTTP fallback only');
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.disconnect();
      this.ws = null;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connected = false;
  }

  // ─── Warrior Wiring ────────────────────────────────────────────────────────

  /**
   * Wire all warrior events into AnkrWire topics automatically.
   * Call after warrior.start() and wire.connect().
   */
  wire(warrior: AIWarrior): void {
    warrior.on('attack-detected', (chain: AttackChain) => {
      if (chain.threatScore < this.config.minThreatScore) return;
      this.publish('shield.attack.detected', chain, {
        priority: chain.threatScore >= 80 ? 'critical' : 'high',
        channels: this.notifyChannels(chain.threatScore),
      });
    });

    warrior.on('agent-quarantined', (agent: QuarantinedAgent) => {
      this.publish('shield.agent.quarantined', agent, {
        priority: 'critical',
        channels: this.notifyChannels(100),
      });
    });

    warrior.on('scope-violation', (violation: ScopeViolation) => {
      this.publish('shield.scope.violation', violation, {
        priority: violation.action === 'QUARANTINE' ? 'critical' : 'high',
        channels: violation.action === 'QUARANTINE' ? this.notifyChannels(100) : ['notify.in_app'],
      });
    });

    warrior.on('honeypot-triggered', (asset: HoneypotAsset) => {
      this.publish('shield.honeypot.triggered', asset, {
        priority: 'critical',
        channels: this.notifyChannels(100),
      });
    });

    warrior.on('policy-generated', (policy: GeneratedPolicy) => {
      this.publish('shield.policy.generated', policy, {
        priority: 'medium',
        channels: ['notify.in_app'],
      });
    });

    warrior.on('incident-report', (report: IncidentReport) => {
      this.publish('shield.incident.report', {
        id: report.id,
        riskScore: report.riskScore,
        executiveSummary: report.executiveSummary,
        topThreats: report.topThreats,
        generatedAt: report.generatedAt,
      }, {
        priority: report.riskScore >= 70 ? 'high' : 'medium',
        channels: report.riskScore >= 70 ? this.notifyChannels(report.riskScore) : ['notify.in_app'],
      });
    });
  }

  // ─── Publishing ────────────────────────────────────────────────────────────

  publish(topic: string, data: unknown, meta?: { priority?: string; channels?: string[]; correlationId?: string }): void {
    const event: AnkrEvent = {
      id: `shield-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      topic,
      source: this.config.source,
      timestamp: new Date().toISOString(),
      data,
      metadata: {
        correlationId: meta?.correlationId,
        channels: meta?.channels,
        priority: meta?.priority as AnkrEvent['metadata']['priority'],
      },
    };

    if (this.connected && this.ws) {
      this.ws.emit('shield-event', event);
      this.ws.emit(topic, event); // also emit on the topic directly
    } else {
      this.enqueue(event);
      // Best-effort HTTP fallback for critical events
      if (meta?.priority === 'critical') {
        void this.httpFallback(event);
      }
    }
  }

  // ─── Queue Management ─────────────────────────────────────────────────────

  private enqueue(event: AnkrEvent): void {
    this.queue.push(event);
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue.shift(); // drop oldest
    }
  }

  private flushQueue(): void {
    if (!this.connected || !this.ws || this.queue.length === 0) return;
    const flushed = this.queue.splice(0);
    for (const event of flushed) {
      this.ws.emit('shield-event', event);
      this.ws.emit(event.topic, event);
    }
    if (flushed.length > 0) {
      console.log(`[AnkrShield Wire] Flushed ${flushed.length} queued events`);
    }
  }

  // ─── HTTP Fallback ────────────────────────────────────────────────────────

  private async httpFallback(event: AnkrEvent): Promise<void> {
    try {
      await fetch(`${this.config.wireRestUrl}/shield/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Silently discard — offline mode
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private notifyChannels(score: number): string[] {
    const channels = ['notify.in_app'];
    if (score >= 60 && this.config.enableTelegram) channels.push('notify.telegram');
    if (score >= 75 && this.config.enableWhatsApp) channels.push('notify.whatsapp');
    return channels;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let publisher: WirePublisher | null = null;

export function getWirePublisher(): WirePublisher {
  if (!publisher) {
    publisher = new WirePublisher();
  }
  return publisher;
}

export async function startWirePublisher(warrior: AIWarrior): Promise<void> {
  const pub = getWirePublisher();
  await pub.connect();
  pub.wire(warrior);
  console.log('[AnkrShield Wire] Publisher started — warrior events → AnkrWire topics');
}

export function stopWirePublisher(): void {
  if (publisher) {
    publisher.disconnect();
    publisher = null;
  }
}
