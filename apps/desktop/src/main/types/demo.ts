/**
 * Demo Mode Types
 */

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  duration: number; // Total duration in milliseconds
  devices: DemoDevice[];
  events: DemoEvent[];
  metadata: {
    totalTrackers: number;
    totalEvents: number;
    estimatedDataSize: number;
  };
}

export interface DemoDevice {
  id: string;
  name: string;
  icon: string;
  type: 'phone' | 'laptop' | 'tv' | 'iot' | 'wearable' | 'gaming';
  trackers: number;
  dataTransmitted: number; // bytes
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  apps: DemoApp[];
}

export interface DemoApp {
  name: string;
  trackers: number;
}

export interface DemoEvent {
  timestamp: number; // Milliseconds from scenario start
  deviceId: string;
  tracker: string;
  domain: string;
  company: string;
  category: DemoEventCategory;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  dataTypes: string[];
  blocked: boolean;
}

export type DemoEventCategory =
  | 'advertising'
  | 'analytics'
  | 'social'
  | 'tracking'
  | 'fingerprinting'
  | 'behavioral'
  | 'location'
  | 'device_info'
  | 'personal_data';

export interface DemoStats {
  currentTime: number;
  totalDuration: number;
  playbackSpeed: number;
  isPaused: boolean;
  totalDevices: number;
  totalTrackers: number;
  totalEvents: number;
  blockedEvents: number;
  allowedEvents: number;
  blockRate: number; // Percentage
  dataTransmitted: number; // bytes
  uniqueCompanies: number;
  estimatedValue: number; // USD
  topTrackers: Array<{ tracker: string; count: number }>;
  topCompanies: Array<{ company: string; count: number }>;
  privacyScoreWithout: number; // 0-100 (without ankrshield)
  privacyScoreWith: number; // 0-100 (with ankrshield)
}

export interface DemoCompany {
  name: string;
  trackers: string[];
  category: string;
  privacyPolicy?: string;
}
