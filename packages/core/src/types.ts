/**
 * Shared types for ankrshield
 */

export interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Device {
  id: string;
  userId: string;
  name: string;
  platform: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  lastSeen: Date;
}

export interface NetworkEvent {
  id: string;
  deviceId: string;
  domain: string;
  ip?: string;
  blocked: boolean;
  timestamp: Date;
}

export interface Tracker {
  id: string;
  domain: string;
  category: string;
  vendor?: string;
  riskScore: number;
}

export interface PrivacyScore {
  id: string;
  userId: string;
  score: number;
  timestamp: Date;
}
