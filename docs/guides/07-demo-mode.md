# Demo Mode - "The Whole Room is Tracked"

**Date:** January 22, 2026
**Purpose:** Showcase the shocking reality of pervasive tracking across all devices in a typical room

---

## 🎯 Concept

**Vision:** Show users the invisible web of trackers monitoring every device in their home/office

**Use Cases:**
1. **Sales Demos** - Show potential customers what they're up against
2. **Trade Shows** - Eye-catching visualization for booths
3. **User Onboarding** - Educate new users about privacy risks
4. **Presentations** - Privacy awareness talks
5. **Social Media** - Shareable "OMG look at this" content

---

## 🏠 Demo Scenario: "A Typical Living Room"

### Simulated Devices (8 devices):
```
Living Room @ 7:30 PM (Family Evening)

📱 iPhone (Dad)          → 47 trackers active
💻 MacBook (Mom)         → 89 trackers active
🎮 Xbox Series X         → 34 trackers active
📺 Smart TV (Samsung)    → 67 trackers active
🔊 Alexa Echo            → 23 trackers active
⌚ Apple Watch (Kid)      → 19 trackers active
🤖 Robot Vacuum          → 12 trackers active
📹 Ring Doorbell         → 28 trackers active

Total: 319 trackers across 8 devices
Data shared: 2.3 GB in last hour
Companies tracking you: 67 unique entities
```

---

## 🎨 Visual Design

### Main Demo View

```
┌────────────────────────────────────────────────────────────┐
│  🏠 Demo Mode: Living Room                    [Exit Demo]  │
├────────────────────────────────────────────────────────────┤
│                                                              │
│         📱          💻           📺                          │
│       iPhone      MacBook      Smart TV                     │
│         ↓↓↓         ↓↓↓          ↓↓↓                       │
│         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░                      │
│                    ↓                                         │
│              [The Internet]                                  │
│         ↓         ↓         ↓        ↓                      │
│     Google    Facebook   Amazon   Microsoft                 │
│                                                              │
│  ⚡ Real-time Activity:                                     │
│  • iPhone → google-analytics.com (advertising)              │
│  • Smart TV → ads.samsungads.com (behavioral profiling)     │
│  • MacBook → doubleclick.net (cross-site tracking)          │
│  • Alexa → amazon-adsystem.com (purchase history)           │
│                                                              │
│  📊 Stats (Last Hour):                                      │
│  ├─ 319 trackers detected across 8 devices                  │
│  ├─ 2,847 tracking attempts (89% blocked by ankrshield)     │
│  ├─ 2.3 GB data transmitted                                 │
│  ├─ 67 companies received your data                         │
│  └─ Estimated value: $47 (your data to advertisers)         │
│                                                              │
│  🎯 Top Offenders:                                          │
│  1. 🥇 Google (127 tracking events)                         │
│  2. 🥈 Facebook (89 tracking events)                        │
│  3. 🥉 Amazon (67 tracking events)                          │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

---

## 🎬 Demo Mode Features

### 1. **Device Grid View**
Show all devices in the room with:
- Live tracker count
- Data flow animation
- Risk level indicator
- Click to see details

```typescript
interface DemoDevice {
  id: string;
  name: string;
  icon: string;
  type: 'phone' | 'laptop' | 'tv' | 'iot' | 'wearable' | 'gaming';
  trackers: number;
  dataTransmitted: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  liveActivity: DemoActivity[];
}

const demoDevices: DemoDevice[] = [
  {
    id: 'iphone',
    name: "Dad's iPhone",
    icon: '📱',
    type: 'phone',
    trackers: 47,
    dataTransmitted: 456_000_000, // 456 MB
    riskLevel: 'high',
    liveActivity: [...]
  },
  // ... more devices
];
```

### 2. **Animated Tracker Flow**
Visual representation of data flowing from devices to tracking companies:
- Particle effects showing data packets
- Color-coded by risk level (green → yellow → red)
- Speed indicates intensity
- Lines connecting devices to companies

### 3. **Real-time Activity Feed**
Scrolling list of tracking events:
```
[19:32:47] iPhone → google-analytics.com
           Location data transmitted
           Risk: HIGH 🔴

[19:32:46] Smart TV → ads.samsungads.com
           Viewing habits collected
           Risk: CRITICAL 🔴

[19:32:45] MacBook → doubleclick.net
           Browsing history tracked
           Risk: HIGH 🔴

[19:32:44] Alexa → amazon-adsystem.com
           Voice command analyzed
           Risk: MEDIUM 🟡
```

### 4. **Statistics Dashboard**
Real-time updating stats:
- Total trackers count (animated)
- Data transmitted (with units)
- Companies tracking you
- Estimated value of your data
- Protection effectiveness

### 5. **Before/After Comparison**
Toggle to show:
- **Without ankrshield:** All trackers active (scary)
- **With ankrshield:** Most blocked (reassuring)

```
WITHOUT ankrshield:        WITH ankrshield:
╔═══════════════════╗      ╔═══════════════════╗
║ 319 trackers      ║      ║ 28 trackers       ║
║ 🔴🔴🔴🔴🔴        ║      ║ 🟢                ║
║                   ║      ║                   ║
║ 2,847 attempts    ║      ║ 312 attempts      ║
║ 0 blocked (0%)    ║      ║ 2,535 blocked (89%)║
║                   ║      ║                   ║
║ Privacy Score:    ║      ║ Privacy Score:    ║
║ 87/100 (POOR) 😰  ║      ║ 23/100 (GOOD) 😊  ║
╚═══════════════════╝      ╚═══════════════════╝
```

---

## 🎮 Interactive Elements

### 1. **Click a Device**
Show detailed view:
```
📱 Dad's iPhone
├─ 47 trackers detected
├─ Apps with trackers:
│  ├─ Facebook (12 trackers)
│  ├─ Instagram (8 trackers)
│  ├─ Weather App (6 trackers)
│  ├─ News App (9 trackers)
│  └─ Browser (12 trackers)
├─ Data types collected:
│  ├─ Location (GPS coordinates)
│  ├─ Device ID (IDFA)
│  ├─ Contacts (123 contacts)
│  ├─ Browsing history
│  └─ App usage patterns
└─ Risk Assessment: HIGH 🔴
```

### 2. **Click a Tracker**
Show tracker details:
```
🕵️ google-analytics.com

Company: Google LLC
Category: Analytics & Advertising
Risk Level: HIGH 🔴

Data Collected:
├─ Page views across 47 websites
├─ Time spent on each page
├─ Click patterns and interactions
├─ Device fingerprint
├─ Approximate location
└─ Demographics (inferred)

Tracked You On:
├─ iPhone (Safari)
├─ MacBook (Chrome)
└─ Smart TV (YouTube app)

Used For:
├─ Targeted advertising
├─ User profiling
└─ Cross-device tracking

Blocked by ankrshield: YES ✅
```

### 3. **Playback Controls**
```
⏮️ Rewind    ⏸️ Pause    ▶️ Play    ⏩ Fast Forward

Speed: 1x | 2x | 5x | 10x

Timeline: [████░░░░░░] 42%
          0:00        2:34        6:00
```

### 4. **Scenario Selector**
Switch between different demo scenarios:
```
📂 Demo Scenarios:

🏠 Living Room Evening
   8 devices, 319 trackers

🏢 Home Office Workday
   5 devices, 267 trackers

🛏️ Bedroom Morning Routine
   6 devices, 184 trackers

🎮 Gaming Session
   4 devices, 423 trackers (!!!!)

🎅 Smart Home (Full IoT)
   15 devices, 891 trackers (😱)

🏨 Hotel Room
   3 devices, 156 trackers
```

---

## 💻 Implementation

### Demo Mode Service

```typescript
// src/main/services/demo.service.ts

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  devices: DemoDevice[];
  duration: number; // seconds
  events: DemoEvent[];
}

export interface DemoEvent {
  timestamp: number; // milliseconds from start
  deviceId: string;
  tracker: string;
  domain: string;
  category: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  dataTypes: string[];
  blocked: boolean;
}

export class DemoModeService {
  private isActive = false;
  private currentScenario: DemoScenario | null = null;
  private startTime: number = 0;
  private playbackSpeed: number = 1;
  private isPaused = false;
  private eventEmitter = new EventEmitter();

  /**
   * Activate demo mode
   */
  async activate(scenarioId: string): Promise<void> {
    this.isActive = true;
    this.currentScenario = this.getScenario(scenarioId);
    this.startTime = Date.now();
    this.startPlayback();
  }

  /**
   * Deactivate demo mode
   */
  deactivate(): void {
    this.isActive = false;
    this.currentScenario = null;
    this.stopPlayback();
  }

  /**
   * Start event playback
   */
  private startPlayback(): void {
    if (!this.currentScenario) return;

    const playInterval = setInterval(() => {
      if (this.isPaused) return;

      const elapsed = (Date.now() - this.startTime) * this.playbackSpeed;
      const events = this.currentScenario!.events.filter(
        e => e.timestamp <= elapsed && e.timestamp > elapsed - 100
      );

      events.forEach(event => {
        this.eventEmitter.emit('demo:event', event);
      });

      // Loop scenario
      if (elapsed >= this.currentScenario!.duration) {
        this.startTime = Date.now();
      }
    }, 100); // Check every 100ms
  }

  /**
   * Get predefined scenario
   */
  private getScenario(id: string): DemoScenario {
    return demoScenarios[id] || demoScenarios['living-room'];
  }

  /**
   * Get current demo stats
   */
  getStats(): DemoStats {
    if (!this.currentScenario) {
      return this.getEmptyStats();
    }

    const elapsed = (Date.now() - this.startTime) * this.playbackSpeed;
    const eventsUpToNow = this.currentScenario.events.filter(
      e => e.timestamp <= elapsed
    );

    return {
      totalDevices: this.currentScenario.devices.length,
      totalTrackers: this.countUniqueTrackers(eventsUpToNow),
      totalEvents: eventsUpToNow.length,
      blockedEvents: eventsUpToNow.filter(e => e.blocked).length,
      dataTransmitted: this.calculateDataSize(eventsUpToNow),
      uniqueCompanies: this.countUniqueCompanies(eventsUpToNow),
      estimatedValue: this.calculateDataValue(eventsUpToNow),
      topTrackers: this.getTopTrackers(eventsUpToNow, 5),
    };
  }

  /**
   * Control playback
   */
  pause(): void {
    this.isPaused = true;
  }

  play(): void {
    this.isPaused = false;
  }

  setSpeed(speed: number): void {
    this.playbackSpeed = speed;
  }

  seekTo(timestamp: number): void {
    this.startTime = Date.now() - (timestamp / this.playbackSpeed);
  }
}
```

### Demo Scenarios Data

```typescript
// src/main/data/demo-scenarios.ts

export const demoScenarios: Record<string, DemoScenario> = {
  'living-room': {
    id: 'living-room',
    name: 'Living Room Evening',
    description: 'Typical family evening with multiple devices',
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
          { name: 'Weather', trackers: 6 },
          { name: 'News', trackers: 9 },
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
    events: generateLivingRoomEvents(), // Function to generate realistic timeline
  },

  'gaming-session': {
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
        id: 'gaming-console',
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
        apps: [
          { name: 'Streaming software', trackers: 11 },
        ],
      },
    ],
    events: generateGamingEvents(),
  },

  'smart-home-full': {
    id: 'smart-home-full',
    name: 'Complete Smart Home',
    description: '😱 Every device is tracking you',
    icon: '🏡',
    duration: 480000, // 8 minutes
    devices: [
      // ... 15 IoT devices (scary amount)
      { name: 'Smart Fridge', icon: '🧊', trackers: 34 },
      { name: 'Smart Thermostat', icon: '🌡️', trackers: 28 },
      { name: 'Smart Lights (12)', icon: '💡', trackers: 67 },
      { name: 'Smart Lock', icon: '🔐', trackers: 23 },
      { name: 'Security Cameras (4)', icon: '📹', trackers: 89 },
      { name: 'Smart Speakers (3)', icon: '🔊', trackers: 56 },
      // ... etc
    ],
    events: generateSmartHomeEvents(),
  },
};

/**
 * Generate realistic event timeline
 */
function generateLivingRoomEvents(): DemoEvent[] {
  const events: DemoEvent[] = [];
  const trackers = [
    'google-analytics.com',
    'doubleclick.net',
    'facebook.com',
    'connect.facebook.net',
    'amazon-adsystem.com',
    'ads.samsungads.com',
    'microsoft.com',
    'apple.com',
    'twitter.com',
    'linkedin.com',
  ];

  // Generate events over 6 minutes
  for (let t = 0; t < 360000; t += 1000) {
    const numEvents = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < numEvents; i++) {
      events.push({
        timestamp: t + Math.random() * 1000,
        deviceId: getRandomDevice(),
        tracker: getRandomTracker(trackers),
        domain: getRandomTracker(trackers),
        category: getRandomCategory(),
        riskLevel: getRandomRiskLevel(),
        dataTypes: getRandomDataTypes(),
        blocked: Math.random() > 0.1, // 90% blocked
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}
```

### React Component

```typescript
// src/renderer/components/DemoMode.tsx

import { useState, useEffect } from 'react';

export function DemoMode() {
  const [isActive, setIsActive] = useState(false);
  const [scenario, setScenario] = useState('living-room');
  const [stats, setStats] = useState<DemoStats | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    // Subscribe to demo events
    const unsubscribe = window.electronAPI.onDemoEvent((event: DemoEvent) => {
      setEvents(prev => [event, ...prev].slice(0, 50)); // Keep last 50
    });

    // Update stats every second
    const interval = setInterval(async () => {
      const newStats = await window.electronAPI.getDemoStats();
      setStats(newStats);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [isActive]);

  const startDemo = async () => {
    await window.electronAPI.startDemo(scenario);
    setIsActive(true);
  };

  const stopDemo = async () => {
    await window.electronAPI.stopDemo();
    setIsActive(false);
    setEvents([]);
    setStats(null);
  };

  const togglePlayPause = async () => {
    if (isPaused) {
      await window.electronAPI.playDemo();
    } else {
      await window.electronAPI.pauseDemo();
    }
    setIsPaused(!isPaused);
  };

  if (!isActive) {
    return (
      <div className="demo-mode-selector">
        <h1>🎬 Demo Mode</h1>
        <p>Showcase how tracking works across all devices in a room</p>

        <div className="scenarios">
          {Object.values(demoScenarios).map(s => (
            <div
              key={s.id}
              className="scenario-card"
              onClick={() => setScenario(s.id)}
            >
              <div className="scenario-icon">{s.icon}</div>
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <div className="scenario-stats">
                {s.devices.length} devices • {s.devices.reduce((sum, d) => sum + d.trackers, 0)} trackers
              </div>
            </div>
          ))}
        </div>

        <button onClick={startDemo} className="start-demo-btn">
          ▶️ Start Demo
        </button>
      </div>
    );
  }

  return (
    <div className="demo-mode-active">
      {/* Header */}
      <div className="demo-header">
        <h2>🏠 {demoScenarios[scenario].name}</h2>
        <button onClick={stopDemo} className="exit-btn">
          Exit Demo
        </button>
      </div>

      {/* Device Grid */}
      <div className="device-grid">
        {demoScenarios[scenario].devices.map(device => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>

      {/* Animated Tracker Flow */}
      <TrackerFlowVisualization events={events} />

      {/* Stats Dashboard */}
      {stats && (
        <div className="stats-dashboard">
          <StatCard
            icon="🎯"
            label="Trackers Detected"
            value={stats.totalTrackers}
            animated
          />
          <StatCard
            icon="🚫"
            label="Blocked"
            value={stats.blockedEvents}
            percentage={(stats.blockedEvents / stats.totalEvents) * 100}
          />
          <StatCard
            icon="📊"
            label="Data Transmitted"
            value={formatBytes(stats.dataTransmitted)}
          />
          <StatCard
            icon="🏢"
            label="Companies"
            value={stats.uniqueCompanies}
          />
          <StatCard
            icon="💰"
            label="Your Data Worth"
            value={`$${stats.estimatedValue.toFixed(2)}`}
          />
        </div>
      )}

      {/* Live Activity Feed */}
      <div className="activity-feed">
        <h3>🔴 Live Tracking Activity</h3>
        <div className="events-list">
          {events.map((event, i) => (
            <EventItem key={i} event={event} />
          ))}
        </div>
      </div>

      {/* Playback Controls */}
      <div className="playback-controls">
        <button onClick={togglePlayPause}>
          {isPaused ? '▶️ Play' : '⏸️ Pause'}
        </button>
        <select
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
        >
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>
      </div>

      {/* Before/After Comparison */}
      <BeforeAfterComparison stats={stats} />
    </div>
  );
}
```

---

## 🎨 Styling & Animations

```css
/* Demo Mode Styles */
.demo-mode-active {
  background: linear-gradient(135deg, #1a1a1a 0%, #2d1f1f 100%);
  min-height: 100vh;
  padding: 20px;
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.device-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  position: relative;
  overflow: hidden;
  transition: transform 0.3s;
}

.device-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(255, 0, 0, 0.3);
}

.device-card.high-risk {
  border: 2px solid #f44336;
  animation: pulse-red 2s infinite;
}

@keyframes pulse-red {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
  }
}

/* Tracker Flow Animation */
.tracker-flow {
  position: relative;
  height: 300px;
  margin: 40px 0;
}

.tracker-particle {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  animation: flow 3s linear infinite;
}

.tracker-particle.blocked {
  background: #4caf50;
}

.tracker-particle.allowed {
  background: #f44336;
  animation: flow-danger 3s linear infinite;
}

@keyframes flow {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(300px) scale(0.3);
    opacity: 0;
  }
}

/* Stats Dashboard */
.stats-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 15px;
  margin: 30px 0;
}

.stat-card {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}

.stat-value {
  font-size: 2.5em;
  font-weight: bold;
  margin: 10px 0;
}

.stat-value.animated {
  animation: count-up 1s ease-out;
}

@keyframes count-up {
  from {
    transform: scale(1.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Activity Feed */
.activity-feed {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
}

.event-item {
  padding: 10px;
  margin: 5px 0;
  border-left: 3px solid;
  animation: slide-in 0.3s ease-out;
}

.event-item.high-risk {
  border-color: #f44336;
  background: rgba(244, 67, 54, 0.1);
}

.event-item.blocked {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

@keyframes slide-in {
  from {
    transform: translateX(-20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Before/After Comparison */
.before-after {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin: 40px 0;
  padding: 30px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 15px;
}

.comparison-side {
  text-align: center;
  padding: 20px;
  border-radius: 10px;
}

.comparison-side.before {
  background: rgba(244, 67, 54, 0.1);
  border: 2px solid #f44336;
}

.comparison-side.after {
  background: rgba(76, 175, 80, 0.1);
  border: 2px solid #4caf50;
}

.comparison-value {
  font-size: 3em;
  font-weight: bold;
  margin: 20px 0;
}
```

---

## 📱 Additional Features

### 1. **Share Demo**
Export video or GIF of demo mode:
```typescript
async function exportDemo(format: 'video' | 'gif') {
  // Capture canvas/screen
  const mediaRecorder = new MediaRecorder(stream);
  // ... record demo session
  // Download as MP4 or GIF
}
```

### 2. **Custom Scenarios**
Let users create their own scenarios:
```typescript
interface CustomScenario {
  name: string;
  devices: string[]; // Device IDs to include
  duration: number;
  intensityLevel: 'low' | 'medium' | 'high' | 'extreme';
}
```

### 3. **Educational Tooltips**
Hover over elements for explanations:
```
"What is a tracker?"
"Why is this risky?"
"How does ankrshield block this?"
```

### 4. **Print/Export Report**
Generate shareable privacy report:
```
📄 Privacy Audit Report
   Living Room - January 22, 2026

   🏠 Devices Scanned: 8
   🎯 Trackers Found: 319
   🚫 Blocked by ankrshield: 284 (89%)
   💰 Data Value: $47.23

   [Detailed breakdown...]
   [Recommendations...]
```

---

## 🚀 Use Cases

### 1. **Sales Presentations**
```
"Let me show you what's happening in your home right now..."
[Launch demo mode]
[Watch their jaw drop at 319 trackers]
"With ankrshield, we block 89% of these..."
```

### 2. **Trade Show Booth**
- Large screen with demo mode running
- Eye-catching numbers
- QR code to download app

### 3. **Social Media Content**
- Screen recording of demo
- "😱 You won't believe how many trackers..."
- Goes viral → app downloads

### 4. **User Onboarding**
```
First Launch:
"Welcome to ankrshield!
 Would you like to see what we protect you from?"

[Show Demo Mode]

"This is happening right now in your home.
 Ready to take control of your privacy?"
```

---

## ✅ Implementation Checklist

```
Phase 1: Core Demo Mode (Week 1)
├─ [ ] Create DemoModeService with scenarios
├─ [ ] Generate realistic event timelines
├─ [ ] Implement playback controls
├─ [ ] Add IPC handlers for demo mode
└─ [ ] Test with "Living Room" scenario

Phase 2: UI & Visualization (Week 2)
├─ [ ] Build React components
├─ [ ] Add device grid view
├─ [ ] Implement animated tracker flow
├─ [ ] Create stats dashboard
├─ [ ] Add activity feed
└─ [ ] Style with animations

Phase 3: Interactive Features (Week 3)
├─ [ ] Click device for details
├─ [ ] Click tracker for info
├─ [ ] Before/After comparison
├─ [ ] Scenario selector
├─ [ ] Playback speed control
└─ [ ] Export/Share functionality

Phase 4: Additional Scenarios (Week 4)
├─ [ ] Gaming Session scenario
├─ [ ] Smart Home scenario
├─ [ ] Home Office scenario
├─ [ ] Bedroom scenario
└─ [ ] Hotel Room scenario

Phase 5: Polish (Week 5)
├─ [ ] Educational tooltips
├─ [ ] Sound effects (optional)
├─ [ ] Export to video/GIF
├─ [ ] Print report
└─ [ ] Performance optimization
```

---

## 🎉 Expected Impact

**User Reaction:**
- 😱 "OMG I had no idea!"
- 🤯 "This is happening RIGHT NOW?!"
- ✅ "I need this app immediately"

**Marketing Value:**
- Viral potential: Very high
- Conversion rate: 10x normal
- Demo requests: Will skyrocket

**Educational Value:**
- Makes abstract concept tangible
- Shows real-world impact
- Motivates privacy action

---

*This demo mode will be a game-changer for ankrshield awareness and adoption!*

