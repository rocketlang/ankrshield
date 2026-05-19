/**
 * AI agent monitoring
 *
 * Tracks activities from registered AI agents and emits events
 * that the AI Warrior can consume for threat correlation.
 */

import { EventEmitter } from 'node:events';

export interface AIActivity {
  agentId: string;
  type: 'file' | 'network' | 'clipboard';
  details: string;
  timestamp: Date;
}

// Typed EventEmitter declaration. The interface + class share a name
// intentionally — the standard TypeScript pattern for typing on/emit
// signatures on an EventEmitter subclass. lint flags it as "unsafe"
// because it can't see that the interface declares only methods; we
// vouch for it here and disable the rule pair-wise.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface AIAgentMonitor {
  on(event: 'activity', listener: (activity: AIActivity) => void): this;
  emit(event: 'activity', activity: AIActivity): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AIAgentMonitor extends EventEmitter {
  private activities: AIActivity[] = [];

  /** Maximum number of activities to keep in memory */
  private static readonly MAX_BUFFER = 10_000;

  logActivity(activity: AIActivity): void {
    this.activities.push(activity);

    // Bound buffer to prevent unbounded memory growth
    if (this.activities.length > AIAgentMonitor.MAX_BUFFER) {
      this.activities = this.activities.slice(-AIAgentMonitor.MAX_BUFFER);
    }

    // Emit so the AI Warrior (and any other listener) can react in real-time
    this.emit('activity', activity);
  }

  getActivities(agentId: string): AIActivity[] {
    // Return a copy to prevent external mutation of internal state
    return this.activities.filter((a) => a.agentId === agentId);
  }

  getAllActivities(): AIActivity[] {
    return [...this.activities];
  }

  clearActivities(): void {
    this.activities = [];
  }
}
