/**
 * Score Updater
 * Real-time privacy score updates
 */

import { EventEmitter } from 'events';

import { PrismaClient } from '@prisma/client';

import { PrivacyCalculator } from '../scoring/privacy-calculator';
import type { PrivacyScore } from '../types';

/**
 * Score update events
 */
export interface ScoreUpdateEvents {
  scoreUpdated: (userId: string, score: PrivacyScore) => void;
  scoreCalculated: (userId: string, score: number) => void;
  error: (error: Error) => void;
}

/**
 * Score Updater
 * Manages real-time privacy score updates and notifications
 */
export class ScoreUpdater extends EventEmitter {
  private updateQueue: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number = 5000; // 5 seconds

  constructor(
    private prisma: PrismaClient,
    private calculator: PrivacyCalculator
  ) {
    super();
  }

  /**
   * Trigger score update for user (debounced)
   */
  triggerUpdate(userId: string): void {
    // Clear existing timeout
    const existing = this.updateQueue.get(userId);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.performUpdate(userId);
      this.updateQueue.delete(userId);
    }, this.debounceMs);

    this.updateQueue.set(userId, timeout);
  }

  /**
   * Perform actual score update
   */
  private async performUpdate(userId: string): Promise<void> {
    try {
      const score = await this.calculator.calculateTotalScore(userId);

      // Emit events
      this.emit('scoreCalculated', userId, score.totalScore);
      this.emit('scoreUpdated', userId, score);
    } catch (error) {
      this.emit('error', error as Error);
    }
  }

  /**
   * Force immediate score update (bypass debouncing)
   */
  async forceUpdate(userId: string): Promise<PrivacyScore> {
    // Clear any pending update
    const existing = this.updateQueue.get(userId);
    if (existing) {
      clearTimeout(existing);
      this.updateQueue.delete(userId);
    }

    const score = await this.calculator.calculateTotalScore(userId);
    this.emit('scoreUpdated', userId, score);
    return score;
  }

  /**
   * Set debounce time
   */
  setDebounceTime(ms: number): void {
    this.debounceMs = ms;
  }

  /**
   * Clear all pending updates
   */
  clearPending(): void {
    for (const timeout of this.updateQueue.values()) {
      clearTimeout(timeout);
    }
    this.updateQueue.clear();
  }

  /**
   * Get pending update count
   */
  getPendingCount(): number {
    return this.updateQueue.size;
  }
}
