/**
 * Tracker database
 */

export interface TrackerInfo {
  domain: string;
  category: string;
  vendor?: string;
  riskScore: number;
}

export class TrackerDatabase {
  private trackers = new Map<string, TrackerInfo>();

  add(tracker: TrackerInfo): void {
    this.trackers.set(tracker.domain, tracker);
  }

  lookup(domain: string): TrackerInfo | undefined {
    return this.trackers.get(domain);
  }

  isBlocked(domain: string): boolean {
    return this.trackers.has(domain);
  }
}
