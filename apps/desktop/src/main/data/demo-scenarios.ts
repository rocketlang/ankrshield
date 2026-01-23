/**
 * Demo Scenarios Data
 * Pre-built realistic scenarios showing tracking across different environments
 */

import type { DemoScenario, DemoEvent } from '../types/demo';

/**
 * Generate realistic tracking events for a given scenario
 */
function generateEvents(
  duration: number,
  deviceIds: string[],
  intensity: 'low' | 'medium' | 'high' | 'extreme'
): DemoEvent[] {
  const events: DemoEvent[] = [];

  const trackers = [
    { domain: 'google-analytics.com', company: 'Google', category: 'analytics' as const },
    { domain: 'doubleclick.net', company: 'Google', category: 'advertising' as const },
    { domain: 'facebook.com', company: 'Facebook', category: 'social' as const },
    { domain: 'connect.facebook.net', company: 'Facebook', category: 'tracking' as const },
    { domain: 'amazon-adsystem.com', company: 'Amazon', category: 'advertising' as const },
    { domain: 'ads.samsungads.com', company: 'Samsung', category: 'behavioral' as const },
    { domain: 'pixel.adsafeprotected.com', company: 'Integral Ad Science', category: 'tracking' as const },
    { domain: 'scorecardresearch.com', company: 'Comscore', category: 'analytics' as const },
    { domain: 'app-measurement.com', company: 'Google', category: 'analytics' as const },
    { domain: 'crashlytics.com', company: 'Google', category: 'analytics' as const },
    { domain: 'mixpanel.com', company: 'Mixpanel', category: 'analytics' as const },
    { domain: 'segment.com', company: 'Segment', category: 'analytics' as const },
    { domain: 'branch.io', company: 'Branch', category: 'tracking' as const },
    { domain: 'adjust.com', company: 'Adjust', category: 'tracking' as const },
    { domain: 'appsflyer.com', company: 'AppsFlyer', category: 'tracking' as const },
  ];

  // Determine events per second based on intensity
  const eventsPerSecond = {
    low: 0.5,
    medium: 1.5,
    high: 3,
    extreme: 5,
  }[intensity];

  const totalSeconds = duration / 1000;
  const totalEvents = Math.floor(totalSeconds * eventsPerSecond);

  for (let i = 0; i < totalEvents; i++) {
    const timestamp = Math.floor(Math.random() * duration);
    const deviceId = deviceIds[Math.floor(Math.random() * deviceIds.length)];
    const tracker = trackers[Math.floor(Math.random() * trackers.length)];

    const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
    const riskLevel = riskLevels[Math.floor(Math.random() * riskLevels.length)];

    const dataTypes = [
      'Device ID',
      'IP Address',
      'Location',
      'Browsing history',
      'App usage',
      'Demographics',
      'Purchase history',
      'Social connections',
    ];

    const selectedDataTypes = dataTypes
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * 3) + 1);

    // 90% blocked, 10% allowed (simulated ankrshield effectiveness)
    const blocked = Math.random() < 0.9;

    events.push({
      timestamp,
      deviceId,
      tracker: tracker.domain,
      domain: tracker.domain,
      company: tracker.company,
      category: tracker.category,
      riskLevel,
      dataTypes: selectedDataTypes,
      blocked,
    });
  }

  // Sort by timestamp
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Living Room Evening Scenario
 */
const livingRoomScenario: DemoScenario = {
  id: 'living-room',
  name: 'Living Room Evening',
  description: 'Typical family evening with 8 devices',
  icon: '🏠',
  duration: 360000, // 6 minutes
  devices: [
    {
      id: 'iphone',
      name: "Dad's iPhone",
      icon: '📱',
      type: 'phone',
      trackers: 47,
      dataTransmitted: 456_000_000,
      riskLevel: 'high',
      apps: [
        { name: 'Facebook', trackers: 12 },
        { name: 'Instagram', trackers: 8 },
        { name: 'Weather App', trackers: 6 },
        { name: 'News App', trackers: 9 },
        { name: 'Safari', trackers: 12 },
      ],
    },
    {
      id: 'macbook',
      name: "Mom's MacBook",
      icon: '💻',
      type: 'laptop',
      trackers: 89,
      dataTransmitted: 1_200_000_000,
      riskLevel: 'critical',
      apps: [
        { name: 'Chrome', trackers: 34 },
        { name: 'Spotify', trackers: 18 },
        { name: 'Gmail', trackers: 23 },
        { name: 'Shopping sites', trackers: 14 },
      ],
    },
    {
      id: 'smart-tv',
      name: 'Samsung Smart TV',
      icon: '📺',
      type: 'tv',
      trackers: 67,
      dataTransmitted: 890_000_000,
      riskLevel: 'critical',
      apps: [
        { name: 'YouTube', trackers: 28 },
        { name: 'Netflix', trackers: 15 },
        { name: 'Smart TV OS', trackers: 24 },
      ],
    },
    {
      id: 'xbox',
      name: 'Xbox Series X',
      icon: '🎮',
      type: 'gaming',
      trackers: 34,
      dataTransmitted: 2_100_000_000,
      riskLevel: 'medium',
      apps: [
        { name: 'Xbox Live', trackers: 18 },
        { name: 'Game telemetry', trackers: 16 },
      ],
    },
    {
      id: 'alexa',
      name: 'Amazon Alexa',
      icon: '🔊',
      type: 'iot',
      trackers: 23,
      dataTransmitted: 134_000_000,
      riskLevel: 'high',
      apps: [
        { name: 'Voice assistant', trackers: 15 },
        { name: 'Skills', trackers: 8 },
      ],
    },
    {
      id: 'apple-watch',
      name: "Kid's Apple Watch",
      icon: '⌚',
      type: 'wearable',
      trackers: 19,
      dataTransmitted: 78_000_000,
      riskLevel: 'medium',
      apps: [
        { name: 'Health app', trackers: 6 },
        { name: 'Apps', trackers: 13 },
      ],
    },
    {
      id: 'vacuum',
      name: 'Robot Vacuum',
      icon: '🤖',
      type: 'iot',
      trackers: 12,
      dataTransmitted: 23_000_000,
      riskLevel: 'low',
      apps: [
        { name: 'Mapping service', trackers: 8 },
        { name: 'App control', trackers: 4 },
      ],
    },
    {
      id: 'doorbell',
      name: 'Ring Doorbell',
      icon: '📹',
      type: 'iot',
      trackers: 28,
      dataTransmitted: 450_000_000,
      riskLevel: 'high',
      apps: [
        { name: 'Cloud storage', trackers: 15 },
        { name: 'Analytics', trackers: 13 },
      ],
    },
  ],
  events: [],
  metadata: {
    totalTrackers: 319,
    totalEvents: 2847,
    estimatedDataSize: 5_331_000_000,
  },
};

// Generate events for living room
livingRoomScenario.events = generateEvents(
  livingRoomScenario.duration,
  livingRoomScenario.devices.map((d) => d.id),
  'high'
);

/**
 * Gaming Session Scenario
 */
const gamingScenario: DemoScenario = {
  id: 'gaming-session',
  name: 'Gaming Session',
  description: 'Late night gaming with streaming',
  icon: '🎮',
  duration: 300000, // 5 minutes
  devices: [
    {
      id: 'gaming-pc',
      name: 'Gaming PC',
      icon: '🖥️',
      type: 'laptop',
      trackers: 156,
      dataTransmitted: 5_600_000_000,
      riskLevel: 'critical',
      apps: [
        { name: 'Steam', trackers: 34 },
        { name: 'Discord', trackers: 28 },
        { name: 'Twitch', trackers: 42 },
        { name: 'Chrome (50 tabs)', trackers: 52 },
      ],
    },
    {
      id: 'ps5',
      name: 'PlayStation 5',
      icon: '🎮',
      type: 'gaming',
      trackers: 189,
      dataTransmitted: 8_900_000_000,
      riskLevel: 'critical',
      apps: [
        { name: 'PSN', trackers: 45 },
        { name: 'Game telemetry', trackers: 78 },
        { name: 'Streaming apps', trackers: 66 },
      ],
    },
    {
      id: 'phone-gaming',
      name: 'Gaming Phone',
      icon: '📱',
      type: 'phone',
      trackers: 67,
      dataTransmitted: 890_000_000,
      riskLevel: 'high',
      apps: [
        { name: 'Mobile games', trackers: 45 },
        { name: 'Chat apps', trackers: 22 },
      ],
    },
    {
      id: 'webcam',
      name: 'Streaming Webcam',
      icon: '📹',
      type: 'iot',
      trackers: 11,
      dataTransmitted: 1_200_000_000,
      riskLevel: 'medium',
      apps: [{ name: 'Streaming software', trackers: 11 }],
    },
  ],
  events: [],
  metadata: {
    totalTrackers: 423,
    totalEvents: 3200,
    estimatedDataSize: 16_590_000_000,
  },
};

gamingScenario.events = generateEvents(
  gamingScenario.duration,
  gamingScenario.devices.map((d) => d.id),
  'extreme'
);

/**
 * Smart Home Scenario (Maximum tracking)
 */
const smartHomeScenario: DemoScenario = {
  id: 'smart-home-full',
  name: 'Complete Smart Home',
  description: '😱 Every IoT device is tracking you',
  icon: '🏡',
  duration: 480000, // 8 minutes
  devices: [
    { id: 'phone', name: 'Phone', icon: '📱', type: 'phone' as const, trackers: 56, dataTransmitted: 567000000, riskLevel: 'high' as const, apps: [] },
    { id: 'laptop', name: 'Laptop', icon: '💻', type: 'laptop' as const, trackers: 78, dataTransmitted: 890000000, riskLevel: 'high' as const, apps: [] },
    { id: 'smart-tv', name: 'Smart TV', icon: '📺', type: 'tv' as const, trackers: 67, dataTransmitted: 1200000000, riskLevel: 'critical' as const, apps: [] },
    { id: 'fridge', name: 'Smart Fridge', icon: '🧊', type: 'iot' as const, trackers: 34, dataTransmitted: 123000000, riskLevel: 'medium' as const, apps: [] },
    { id: 'thermostat', name: 'Thermostat', icon: '🌡️', type: 'iot' as const, trackers: 28, dataTransmitted: 89000000, riskLevel: 'medium' as const, apps: [] },
    { id: 'lights', name: 'Smart Lights (12)', icon: '💡', type: 'iot' as const, trackers: 67, dataTransmitted: 234000000, riskLevel: 'low' as const, apps: [] },
    { id: 'lock', name: 'Smart Lock', icon: '🔐', type: 'iot' as const, trackers: 23, dataTransmitted: 45000000, riskLevel: 'high' as const, apps: [] },
    { id: 'cameras', name: 'Security Cameras (4)', icon: '📹', type: 'iot' as const, trackers: 89, dataTransmitted: 3400000000, riskLevel: 'critical' as const, apps: [] },
    { id: 'speakers', name: 'Smart Speakers (3)', icon: '🔊', type: 'iot' as const, trackers: 56, dataTransmitted: 456000000, riskLevel: 'high' as const, apps: [] },
    { id: 'doorbell', name: 'Video Doorbell', icon: '🔔', type: 'iot' as const, trackers: 45, dataTransmitted: 678000000, riskLevel: 'high' as const, apps: [] },
    { id: 'vacuum', name: 'Robot Vacuum', icon: '🤖', type: 'iot' as const, trackers: 23, dataTransmitted: 156000000, riskLevel: 'medium' as const, apps: [] },
    { id: 'watch', name: 'Smart Watch', icon: '⌚', type: 'wearable' as const, trackers: 34, dataTransmitted: 234000000, riskLevel: 'medium' as const, apps: [] },
    { id: 'scale', name: 'Smart Scale', icon: '⚖️', type: 'iot' as const, trackers: 12, dataTransmitted: 23000000, riskLevel: 'low' as const, apps: [] },
    { id: 'coffee', name: 'Smart Coffee Maker', icon: '☕', type: 'iot' as const, trackers: 8, dataTransmitted: 12000000, riskLevel: 'low' as const, apps: [] },
    { id: 'garage', name: 'Garage Door Opener', icon: '🚪', type: 'iot' as const, trackers: 15, dataTransmitted: 34000000, riskLevel: 'medium' as const, apps: [] },
  ],
  events: [],
  metadata: {
    totalTrackers: 891,
    totalEvents: 8500,
    estimatedDataSize: 8_141_000_000,
  },
};

smartHomeScenario.events = generateEvents(
  smartHomeScenario.duration,
  smartHomeScenario.devices.map((d) => d.id),
  'extreme'
);

/**
 * Home Office Scenario
 */
const homeOfficeScenario: DemoScenario = {
  id: 'home-office',
  name: 'Home Office Workday',
  description: 'Professional working from home',
  icon: '🏢',
  duration: 420000, // 7 minutes
  devices: [
    {
      id: 'work-laptop',
      name: 'Work Laptop',
      icon: '💻',
      type: 'laptop',
      trackers: 123,
      dataTransmitted: 2_300_000_000,
      riskLevel: 'critical',
      apps: [
        { name: 'Slack', trackers: 23 },
        { name: 'Zoom', trackers: 18 },
        { name: 'Chrome (work)', trackers: 56 },
        { name: 'MS Teams', trackers: 26 },
      ],
    },
    {
      id: 'personal-phone',
      name: 'Personal Phone',
      icon: '📱',
      type: 'phone',
      trackers: 45,
      dataTransmitted: 567_000_000,
      riskLevel: 'high',
      apps: [
        { name: 'Social media', trackers: 25 },
        { name: 'Email', trackers: 12 },
        { name: 'Messaging', trackers: 8 },
      ],
    },
    {
      id: 'tablet',
      name: 'iPad',
      icon: '📱',
      type: 'phone',
      trackers: 34,
      dataTransmitted: 345_000_000,
      riskLevel: 'medium',
      apps: [
        { name: 'News apps', trackers: 18 },
        { name: 'Reading apps', trackers: 16 },
      ],
    },
    {
      id: 'monitor',
      name: 'Smart Monitor',
      icon: '🖥️',
      type: 'iot',
      trackers: 23,
      dataTransmitted: 123_000_000,
      riskLevel: 'low',
      apps: [{ name: 'Monitor software', trackers: 23 }],
    },
    {
      id: 'printer',
      name: 'WiFi Printer',
      icon: '🖨️',
      type: 'iot',
      trackers: 42,
      dataTransmitted: 234_000_000,
      riskLevel: 'medium',
      apps: [{ name: 'Printer cloud', trackers: 42 }],
    },
  ],
  events: [],
  metadata: {
    totalTrackers: 267,
    totalEvents: 2100,
    estimatedDataSize: 3_569_000_000,
  },
};

homeOfficeScenario.events = generateEvents(
  homeOfficeScenario.duration,
  homeOfficeScenario.devices.map((d) => d.id),
  'medium'
);

/**
 * Bedroom Morning Scenario
 */
const bedroomScenario: DemoScenario = {
  id: 'bedroom-morning',
  name: 'Bedroom Morning Routine',
  description: 'Waking up and getting ready',
  icon: '🛏️',
  duration: 240000, // 4 minutes
  devices: [
    {
      id: 'phone-morning',
      name: 'Phone',
      icon: '📱',
      type: 'phone',
      trackers: 67,
      dataTransmitted: 456_000_000,
      riskLevel: 'high',
      apps: [
        { name: 'Alarm app', trackers: 8 },
        { name: 'Weather', trackers: 12 },
        { name: 'Social media', trackers: 28 },
        { name: 'News', trackers: 19 },
      ],
    },
    {
      id: 'watch-morning',
      name: 'Smart Watch',
      icon: '⌚',
      type: 'wearable',
      trackers: 34,
      dataTransmitted: 123_000_000,
      riskLevel: 'medium',
      apps: [
        { name: 'Health tracking', trackers: 18 },
        { name: 'Notifications', trackers: 16 },
      ],
    },
    {
      id: 'speaker-morning',
      name: 'Smart Speaker',
      icon: '🔊',
      type: 'iot',
      trackers: 28,
      dataTransmitted: 89_000_000,
      riskLevel: 'medium',
      apps: [{ name: 'Music service', trackers: 28 }],
    },
    {
      id: 'lights-morning',
      name: 'Smart Lights',
      icon: '💡',
      type: 'iot',
      trackers: 18,
      dataTransmitted: 34_000_000,
      riskLevel: 'low',
      apps: [{ name: 'Lighting control', trackers: 18 }],
    },
    {
      id: 'thermostat-morning',
      name: 'Thermostat',
      icon: '🌡️',
      type: 'iot',
      trackers: 23,
      dataTransmitted: 56_000_000,
      riskLevel: 'low',
      apps: [{ name: 'Climate control', trackers: 23 }],
    },
    {
      id: 'coffee-morning',
      name: 'Smart Coffee Maker',
      icon: '☕',
      type: 'iot',
      trackers: 14,
      dataTransmitted: 23_000_000,
      riskLevel: 'low',
      apps: [{ name: 'Coffee app', trackers: 14 }],
    },
  ],
  events: [],
  metadata: {
    totalTrackers: 184,
    totalEvents: 1200,
    estimatedDataSize: 781_000_000,
  },
};

bedroomScenario.events = generateEvents(
  bedroomScenario.duration,
  bedroomScenario.devices.map((d) => d.id),
  'medium'
);

/**
 * Hotel Room Scenario
 */
const hotelScenario: DemoScenario = {
  id: 'hotel-room',
  name: 'Hotel Room',
  description: 'Traveling for business',
  icon: '🏨',
  duration: 300000, // 5 minutes
  devices: [
    {
      id: 'phone-hotel',
      name: 'Phone',
      icon: '📱',
      type: 'phone',
      trackers: 78,
      dataTransmitted: 890_000_000,
      riskLevel: 'critical',
      apps: [
        { name: 'Travel apps', trackers: 34 },
        { name: 'Work apps', trackers: 28 },
        { name: 'Social media', trackers: 16 },
      ],
    },
    {
      id: 'laptop-hotel',
      name: 'Laptop',
      icon: '💻',
      type: 'laptop',
      trackers: 56,
      dataTransmitted: 1_200_000_000,
      riskLevel: 'critical',
      apps: [
        { name: 'VPN', trackers: 8 },
        { name: 'Browser', trackers: 38 },
        { name: 'Email', trackers: 10 },
      ],
    },
    {
      id: 'hotel-tv',
      name: 'Hotel Smart TV',
      icon: '📺',
      type: 'tv',
      trackers: 22,
      dataTransmitted: 456_000_000,
      riskLevel: 'high',
      apps: [{ name: 'Hotel TV system', trackers: 22 }],
    },
  ],
  events: [],
  metadata: {
    totalTrackers: 156,
    totalEvents: 980,
    estimatedDataSize: 2_546_000_000,
  },
};

hotelScenario.events = generateEvents(
  hotelScenario.duration,
  hotelScenario.devices.map((d) => d.id),
  'medium'
);

/**
 * Export all scenarios
 */
export const demoScenarios: Record<string, DemoScenario> = {
  'living-room': livingRoomScenario,
  'gaming-session': gamingScenario,
  'smart-home-full': smartHomeScenario,
  'home-office': homeOfficeScenario,
  'bedroom-morning': bedroomScenario,
  'hotel-room': hotelScenario,
};
