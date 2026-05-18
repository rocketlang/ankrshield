import { EventEmitter } from 'events';

/**
 * Event types for type-safe event handling
 */
export enum EventType {
  // DNS events
  DNS_QUERY = 'dns:query',
  DNS_BLOCKED = 'dns:blocked',
  DNS_RESOLVED = 'dns:resolved',

  // Network events
  NETWORK_FLOW = 'network:flow',
  NETWORK_BLOCKED = 'network:blocked',
  TRACKER_DETECTED = 'tracker:detected',
  HIGH_RISK_FLOW = 'network:high-risk',

  // Privacy events
  PRIVACY_SCORE_UPDATED = 'privacy:score-updated',
  PRIVACY_ALERT = 'privacy:alert',

  // Service lifecycle events
  SERVICE_STARTED = 'service:started',
  SERVICE_STOPPED = 'service:stopped',
  SERVICE_ERROR = 'service:error',

  // System events
  PROTECTION_TOGGLED = 'protection:toggled',
  SETTINGS_CHANGED = 'settings:changed',
}

/**
 * Event payloads for type safety
 */
export interface EventPayloads {
  [EventType.DNS_QUERY]: {
    domain: string;
    recordType: string;
    resolvedIps: string[];
    blocked: boolean;
    timestamp: Date;
  };

  [EventType.DNS_BLOCKED]: {
    domain: string;
    reason: string;
    timestamp: Date;
  };

  [EventType.DNS_RESOLVED]: {
    domain: string;
    ips: string[];
    ttl: number;
    cached: boolean;
  };

  [EventType.NETWORK_FLOW]: {
    flowId: string;
    sourceIp: string;
    destinationIp: string;
    domain?: string;
    protocol: string;
    bytesIn: number;
    bytesOut: number;
    app?: {
      name: string;
      pid: number;
    };
    tracker?: {
      category: string;
      vendor: string;
      riskScore: number;
    };
  };

  [EventType.NETWORK_BLOCKED]: {
    flowId: string;
    reason: string;
    domain?: string;
    timestamp: Date;
  };

  [EventType.TRACKER_DETECTED]: {
    domain: string;
    category: string;
    vendor: string;
    threatLevel: number;
    riskScore: number;
  };

  [EventType.HIGH_RISK_FLOW]: {
    flowId: string;
    domain?: string;
    riskScore: number;
    reasons: string[];
  };

  [EventType.PRIVACY_SCORE_UPDATED]: {
    userId: string;
    totalScore: number;
    networkScore: number;
    dnsScore: number;
    appScore: number;
    level: string;
    timestamp: Date;
  };

  [EventType.PRIVACY_ALERT]: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details?: any;
    timestamp: Date;
  };

  [EventType.SERVICE_STARTED]: {
    serviceName: string;
    timestamp: Date;
  };

  [EventType.SERVICE_STOPPED]: {
    serviceName: string;
    reason?: string;
    timestamp: Date;
  };

  [EventType.SERVICE_ERROR]: {
    serviceName: string;
    error: Error;
    timestamp: Date;
  };

  [EventType.PROTECTION_TOGGLED]: {
    enabled: boolean;
    service: 'dns' | 'network' | 'all';
    timestamp: Date;
  };

  [EventType.SETTINGS_CHANGED]: {
    key: string;
    oldValue: any;
    newValue: any;
    timestamp: Date;
  };
}

/**
 * Event bus for inter-service communication
 * Type-safe event emitter with batching support
 */
class EventBus {
  private emitter: EventEmitter;
  private batchSize = 10;
  private batchTimeout = 1000; // ms
  private batches: Map<EventType, { events: any[]; timer: NodeJS.Timeout | null }> = new Map();

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50); // Increase max listeners for multiple subscribers
  }

  /**
   * Emit an event
   */
  emit<T extends EventType>(event: T, payload: EventPayloads[T]): void {
    this.emitter.emit(event, payload);
  }

  /**
   * Subscribe to an event
   */
  on<T extends EventType>(event: T, listener: (payload: EventPayloads[T]) => void): void {
    this.emitter.on(event, listener);
  }

  /**
   * Subscribe to an event once
   */
  once<T extends EventType>(event: T, listener: (payload: EventPayloads[T]) => void): void {
    this.emitter.once(event, listener);
  }

  /**
   * Unsubscribe from an event
   */
  off<T extends EventType>(event: T, listener: (payload: EventPayloads[T]) => void): void {
    this.emitter.off(event, listener);
  }

  /**
   * Emit event with batching (for high-frequency events)
   */
  emitBatched<T extends EventType>(event: T, payload: EventPayloads[T]): void {
    let batch = this.batches.get(event);

    if (!batch) {
      batch = { events: [], timer: null };
      this.batches.set(event, batch);
    }

    batch.events.push(payload);

    // Emit immediately if batch is full
    if (batch.events.length >= this.batchSize) {
      this.flushBatch(event);
      return;
    }

    // Schedule batch flush
    if (batch.timer) {
      clearTimeout(batch.timer);
    }

    batch.timer = setTimeout(() => {
      this.flushBatch(event);
    }, this.batchTimeout);
  }

  /**
   * Flush a batch of events
   */
  private flushBatch(event: EventType): void {
    const batch = this.batches.get(event);

    if (!batch || batch.events.length === 0) {
      return;
    }

    // Emit batched event
    this.emitter.emit(`${event}:batch`, batch.events);

    // Clear batch
    if (batch.timer) {
      clearTimeout(batch.timer);
    }
    this.batches.delete(event);
  }

  /**
   * Subscribe to batched events
   */
  onBatch<T extends EventType>(event: T, listener: (payloads: EventPayloads[T][]) => void): void {
    this.emitter.on(`${event}:batch`, listener);
  }

  /**
   * Get number of listeners for an event
   */
  listenerCount(event: EventType): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: EventType): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  /**
   * Flush all pending batches
   */
  flushAll(): void {
    for (const event of this.batches.keys()) {
      this.flushBatch(event);
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.flushAll();
    this.removeAllListeners();
  }
}

// Singleton instance
const eventBus = new EventBus();

export default eventBus;
export { eventBus };
