/**
 * Demo Mode Service
 * Simulates tracking activity across multiple devices for demonstration purposes
 */

import { EventEmitter } from 'events';
import type {
  DemoScenario,
  DemoDevice,
  DemoEvent,
  DemoStats,
  DemoCompany,
} from '../types/demo.js';
import { demoScenarios } from '../data/demo-scenarios.js';

export class DemoModeService extends EventEmitter {
  private isActive: boolean = false;
  private currentScenario: DemoScenario | null = null;
  private startTime: number = 0;
  private playbackSpeed: number = 1;
  private isPaused: boolean = false;
  private playbackInterval: NodeJS.Timeout | null = null;
  private currentTime: number = 0; // Current playback position in ms

  /**
   * Activate demo mode with a specific scenario
   */
  async activate(scenarioId: string): Promise<void> {
    if (this.isActive) {
      await this.deactivate();
    }

    this.currentScenario = this.getScenario(scenarioId);
    if (!this.currentScenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    this.isActive = true;
    this.startTime = Date.now();
    this.currentTime = 0;
    this.isPaused = false;
    this.startPlayback();

    this.emit('activated', {
      scenarioId,
      scenario: this.currentScenario,
    });
  }

  /**
   * Deactivate demo mode
   */
  async deactivate(): Promise<void> {
    this.stopPlayback();
    this.isActive = false;
    this.currentScenario = null;
    this.currentTime = 0;

    this.emit('deactivated');
  }

  /**
   * Start event playback
   */
  private startPlayback(): void {
    if (!this.currentScenario) return;

    // Clear any existing interval
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
    }

    // Play events every 100ms
    this.playbackInterval = setInterval(() => {
      if (this.isPaused || !this.currentScenario) return;

      // Calculate current playback time
      const elapsed = Date.now() - this.startTime;
      this.currentTime = elapsed * this.playbackSpeed;

      // Get events that should fire in this window
      const windowStart = this.currentTime - 100;
      const windowEnd = this.currentTime;

      const events = this.currentScenario.events.filter(
        (e) => e.timestamp >= windowStart && e.timestamp < windowEnd
      );

      // Emit each event
      events.forEach((event) => {
        this.emit('event', event);
      });

      // Loop scenario if we've reached the end
      if (this.currentTime >= this.currentScenario.duration) {
        this.startTime = Date.now();
        this.currentTime = 0;
        this.emit('loop');
      }

      // Emit stats update
      this.emit('stats', this.getStats());
    }, 100);
  }

  /**
   * Stop playback
   */
  private stopPlayback(): void {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.isPaused = true;
    this.emit('paused');
  }

  /**
   * Resume playback
   */
  play(): void {
    if (this.isPaused) {
      // Adjust start time to account for pause
      const pausedTime = this.currentTime / this.playbackSpeed;
      this.startTime = Date.now() - pausedTime;
      this.isPaused = false;
      this.emit('playing');
    }
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    if (speed <= 0) {
      throw new Error('Playback speed must be positive');
    }

    // Adjust start time to maintain current position
    const currentPosition = this.currentTime / this.playbackSpeed;
    this.playbackSpeed = speed;
    this.startTime = Date.now() - currentPosition;

    this.emit('speedChanged', speed);
  }

  /**
   * Seek to specific time
   */
  seekTo(timestamp: number): void {
    if (!this.currentScenario) return;

    if (timestamp < 0) timestamp = 0;
    if (timestamp > this.currentScenario.duration) {
      timestamp = this.currentScenario.duration;
    }

    this.currentTime = timestamp;
    this.startTime = Date.now() - timestamp / this.playbackSpeed;

    this.emit('seeked', timestamp);
  }

  /**
   * Get current demo statistics
   */
  getStats(): DemoStats {
    if (!this.currentScenario) {
      return this.getEmptyStats();
    }

    // Get all events up to current time
    const eventsUpToNow = this.currentScenario.events.filter(
      (e) => e.timestamp <= this.currentTime
    );

    const blockedEvents = eventsUpToNow.filter((e) => e.blocked);
    const allowedEvents = eventsUpToNow.filter((e) => !e.blocked);

    // Count unique trackers
    const uniqueTrackers = new Set(eventsUpToNow.map((e) => e.tracker));

    // Count unique companies
    const uniqueCompanies = new Set(eventsUpToNow.map((e) => e.company));

    // Calculate data transmitted (estimate: 5KB per tracking event)
    const dataTransmitted = eventsUpToNow.length * 5000;

    // Estimate data value ($0.01 per tracking event)
    const estimatedValue = eventsUpToNow.length * 0.01;

    // Get top trackers
    const trackerCounts = new Map<string, number>();
    eventsUpToNow.forEach((e) => {
      trackerCounts.set(e.tracker, (trackerCounts.get(e.tracker) || 0) + 1);
    });

    const topTrackers = Array.from(trackerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tracker, count]) => ({ tracker, count }));

    // Get top companies
    const companyCounts = new Map<string, number>();
    eventsUpToNow.forEach((e) => {
      companyCounts.set(e.company, (companyCounts.get(e.company) || 0) + 1);
    });

    const topCompanies = Array.from(companyCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([company, count]) => ({ company, count }));

    // Calculate privacy score (inverse of tracking intensity)
    // More tracking = higher score (worse privacy)
    const trackingIntensity = eventsUpToNow.length / (this.currentTime / 1000 || 1);
    const privacyScore = Math.min(100, Math.round(trackingIntensity * 2));

    return {
      currentTime: this.currentTime,
      totalDuration: this.currentScenario.duration,
      playbackSpeed: this.playbackSpeed,
      isPaused: this.isPaused,
      totalDevices: this.currentScenario.devices.length,
      totalTrackers: uniqueTrackers.size,
      totalEvents: eventsUpToNow.length,
      blockedEvents: blockedEvents.length,
      allowedEvents: allowedEvents.length,
      blockRate: eventsUpToNow.length > 0 ? (blockedEvents.length / eventsUpToNow.length) * 100 : 0,
      dataTransmitted,
      uniqueCompanies: uniqueCompanies.size,
      estimatedValue,
      topTrackers,
      topCompanies,
      privacyScoreWithout: privacyScore,
      privacyScoreWith: Math.max(10, Math.round(privacyScore * (1 - this.getBlockRate()))),
    };
  }

  /**
   * Get empty stats (when no scenario active)
   */
  private getEmptyStats(): DemoStats {
    return {
      currentTime: 0,
      totalDuration: 0,
      playbackSpeed: 1,
      isPaused: false,
      totalDevices: 0,
      totalTrackers: 0,
      totalEvents: 0,
      blockedEvents: 0,
      allowedEvents: 0,
      blockRate: 0,
      dataTransmitted: 0,
      uniqueCompanies: 0,
      estimatedValue: 0,
      topTrackers: [],
      topCompanies: [],
      privacyScoreWithout: 0,
      privacyScoreWith: 0,
    };
  }

  /**
   * Get current block rate (simulated ankrshield effectiveness)
   */
  private getBlockRate(): number {
    // Simulate 89% block rate
    return 0.89;
  }

  /**
   * Get scenario by ID
   */
  private getScenario(id: string): DemoScenario | null {
    return demoScenarios[id] || null;
  }

  /**
   * Get all available scenarios
   */
  getAvailableScenarios(): DemoScenario[] {
    return Object.values(demoScenarios);
  }

  /**
   * Get current scenario
   */
  getCurrentScenario(): DemoScenario | null {
    return this.currentScenario;
  }

  /**
   * Check if demo mode is active
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Get playback state
   */
  getPlaybackState(): {
    isActive: boolean;
    isPaused: boolean;
    speed: number;
    currentTime: number;
    duration: number;
  } {
    return {
      isActive: this.isActive,
      isPaused: this.isPaused,
      speed: this.playbackSpeed,
      currentTime: this.currentTime,
      duration: this.currentScenario?.duration || 0,
    };
  }
}

// Export singleton instance
export const demoService = new DemoModeService();
