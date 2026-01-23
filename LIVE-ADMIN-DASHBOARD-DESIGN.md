# Live Admin Dashboard - Real-Time Multi-Device Showcase

**Purpose:** Aggregate and visualize REAL tracking data from multiple ankrshield devices for presentations and demos

---

## 🎯 Concept

### The Setup
```
Living Room Demo:
├─ 8 devices running ankrshield (phones, laptops, TVs, IoT)
├─ All devices connected to central server
├─ Admin dashboard on big screen
└─ Shows REAL tracking happening across ALL devices in real-time
```

### The Impact
```
Presenter: "Let me show you what's happening right now in this room..."
[Opens admin dashboard on projector]
[Room gasps as they see 300+ trackers across 8 devices]
[Watch real tracking events flow in real-time]
[See ankrshield blocking them live]
```

**This is REAL, not simulated. Much more powerful!**

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Admin Dashboard (Web)                  │
│              [Big Screen Visualization]                 │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Device 1 │  │ Device 2 │  │ Device 3 │  ...         │
│  │ 47 track │  │ 89 track │  │ 67 track │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                          │
│         [Real-time Tracker Flow Animation]              │
│                                                          │
│  Stats:                                                  │
│  • 319 trackers across 8 devices                        │
│  • 2,847 attempts (89% blocked)                         │
│  • $47.23 data value                                    │
└─────────────────────────────────────────────────────────┘
                          ↕ WebSocket
┌─────────────────────────────────────────────────────────┐
│              Central Aggregation Server                  │
│                                                          │
│  ┌────────────┐  ┌──────────┐  ┌────────────┐          │
│  │ WebSocket  │  │  REST     │  │ PostgreSQL │          │
│  │ Server     │  │  API      │  │ TimescaleDB│          │
│  └────────────┘  └──────────┘  └────────────┘          │
│                                                          │
│  • Receives events from all clients                     │
│  • Aggregates statistics                                │
│  • Pushes updates to dashboard                          │
│  • Historical data queries                              │
└─────────────────────────────────────────────────────────┘
       ↕           ↕           ↕           ↕
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Device 1 │ │ Device 2 │ │ Device 3 │ │ Device 8 │
│ iPhone   │ │ MacBook  │ │ Smart TV │ │ ...      │
│          │ │          │ │          │ │          │
│ ankr     │ │ ankr     │ │ ankr     │ │ ankr     │
│ shield   │ │ shield   │ │ shield   │ │ shield   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

Each device reports:
• Tracker blocks
• DNS queries
• Network events
• Device info
• Privacy scores
```

---

## 📡 Data Flow

### 1. Device → Server
```typescript
// ankrshield client sends events to server
interface ClientEvent {
  deviceId: string;
  deviceName: string;
  deviceType: 'phone' | 'laptop' | 'tv' | 'iot' | 'wearable';
  timestamp: number;
  eventType: 'tracker_blocked' | 'dns_query' | 'network_event';
  data: {
    tracker?: string;
    domain?: string;
    company?: string;
    category?: string;
    blocked?: boolean;
    dataTypes?: string[];
  };
}

// Client code
async function reportEvent(event: ClientEvent) {
  await fetch('https://admin.ankrshield.local/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${deviceToken}`
    },
    body: JSON.stringify(event)
  });

  // Also send via WebSocket for real-time
  ws.send(JSON.stringify({
    type: 'event',
    payload: event
  }));
}
```

### 2. Server → Dashboard
```typescript
// Server aggregates and pushes to all connected dashboards
io.emit('tracker_blocked', {
  deviceId: 'iphone-123',
  deviceName: "Dad's iPhone",
  tracker: 'google-analytics.com',
  timestamp: Date.now()
});

io.emit('stats_update', {
  totalDevices: 8,
  totalTrackers: 319,
  totalEvents: 2847,
  blockedEvents: 2535,
  // ... more stats
});
```

### 3. Dashboard Receives
```typescript
// Dashboard listens and updates UI
socket.on('tracker_blocked', (event) => {
  // Add particle animation
  addTrackerFlowAnimation(event);

  // Update device card
  updateDeviceStats(event.deviceId);

  // Update aggregate stats
  incrementTotalTrackers();
});
```

---

## 🖥️ Admin Dashboard Features

### 1. **Multi-Device Grid**
```
┌──────────────────────────────────────────────────┐
│  📱 Dad's iPhone    💻 Mom's MacBook  📺 Smart TV │
│  47 trackers       89 trackers       67 trackers │
│  🟢 Online         🟢 Online         🟢 Online   │
│                                                   │
│  🎮 Xbox           🔊 Alexa          ⌚ Watch     │
│  34 trackers       23 trackers       19 trackers │
│  🟢 Online         🟢 Online         🟢 Online   │
│                                                   │
│  🤖 Vacuum         📹 Doorbell                    │
│  12 trackers       28 trackers                   │
│  🟢 Online         🟢 Online                     │
└──────────────────────────────────────────────────┘
```

Each device card shows:
- Device icon and name
- Real-time tracker count (incrementing live)
- Connection status
- Last event timestamp
- Click to see device details

### 2. **Live Activity Feed**
```
┌─────────────────────────────────────────────────┐
│  🔴 LIVE TRACKING ACTIVITY                      │
├─────────────────────────────────────────────────┤
│  [19:32:47] iPhone → google-analytics.com       │
│             Location data | BLOCKED ✅           │
│                                                  │
│  [19:32:46] Smart TV → ads.samsungads.com       │
│             Viewing habits | BLOCKED ✅          │
│                                                  │
│  [19:32:45] MacBook → doubleclick.net           │
│             Browsing history | BLOCKED ✅        │
│                                                  │
│  [19:32:44] Alexa → amazon-adsystem.com         │
│             Voice data | BLOCKED ✅              │
│                                                  │
│  [Auto-scrolling...]                            │
└─────────────────────────────────────────────────┘
```

### 3. **Real-Time Statistics**
```
┌───────────────────────────────────────┐
│  📊 AGGREGATE STATISTICS (LIVE)       │
├───────────────────────────────────────┤
│  Total Devices:        8              │
│  Total Trackers:       319 ⬆️         │
│  Tracking Attempts:    2,847 ⬆️       │
│  Blocked:              2,535 (89%) ✅  │
│  Allowed:              312 (11%)      │
│  Data Transmitted:     2.3 GB ⬆️      │
│  Unique Companies:     67             │
│  Data Value:           $47.23 ⬆️      │
└───────────────────────────────────────┘
```

Numbers update in real-time with smooth animations

### 4. **Animated Tracker Flow**
```
         Devices                    Internet
    ┌─────────────┐              ┌──────────┐
    │   iPhone    │──●─●─●──────→│  Google  │
    │   MacBook   │────●─●───────→│ Facebook │
    │   Smart TV  │──●──●────────→│  Amazon  │
    └─────────────┘              └──────────┘

● = Particle representing data packet
   • Red = Blocked (fades away)
   • Green = Allowed (reaches destination)
```

Continuous animation of tracking attempts

### 5. **Top Offenders**
```
🥇 Google       (127 attempts)  ████████████░░
🥈 Facebook     (89 attempts)   ███████████░░░
🥉 Amazon       (67 attempts)   █████████░░░░░
4. Microsoft    (45 attempts)   ███████░░░░░░░
5. TikTok       (34 attempts)   █████░░░░░░░░░
```

Live leaderboard of worst trackers

### 6. **Presentation Mode**
```
[F] Fullscreen    [P] Pause Updates    [R] Reset Stats
[1-6] Switch View  [ESC] Exit
```

Keyboard shortcuts for live presentations

---

## 🔧 Implementation

### Backend: Aggregation Server

```typescript
// apps/admin-server/src/index.ts
import express from 'express';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});
const prisma = new PrismaClient();

// Store connected devices
const connectedDevices = new Map<string, DeviceInfo>();

// REST API for events
app.post('/api/events', async (req, res) => {
  const event: ClientEvent = req.body;

  // Save to database
  await prisma.adminEvent.create({
    data: {
      deviceId: event.deviceId,
      deviceName: event.deviceName,
      deviceType: event.deviceType,
      eventType: event.eventType,
      tracker: event.data.tracker,
      domain: event.data.domain,
      company: event.data.company,
      blocked: event.data.blocked,
      timestamp: new Date(event.timestamp)
    }
  });

  // Broadcast to all connected dashboards
  io.emit('event', event);

  // Update aggregate stats
  const stats = await getAggregateStats();
  io.emit('stats', stats);

  res.json({ success: true });
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('Dashboard connected');

  // Send current state
  socket.emit('devices', Array.from(connectedDevices.values()));
  socket.emit('stats', await getAggregateStats());

  // Device registration
  socket.on('register_device', (device: DeviceInfo) => {
    connectedDevices.set(device.id, device);
    io.emit('device_online', device);
  });

  socket.on('disconnect', () => {
    console.log('Dashboard disconnected');
  });
});

// Aggregate statistics
async function getAggregateStats() {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600000);

  const events = await prisma.adminEvent.findMany({
    where: {
      timestamp: { gte: hourAgo }
    }
  });

  const blocked = events.filter(e => e.blocked).length;
  const uniqueTrackers = new Set(events.map(e => e.tracker)).size;
  const uniqueCompanies = new Set(events.map(e => e.company)).size;

  return {
    totalDevices: connectedDevices.size,
    totalEvents: events.length,
    blockedEvents: blocked,
    allowedEvents: events.length - blocked,
    blockRate: (blocked / events.length) * 100,
    uniqueTrackers,
    uniqueCompanies,
    dataTransmitted: events.length * 5000, // Estimate
    estimatedValue: events.length * 0.01,  // $0.01 per event
    topTrackers: getTopTrackers(events),
    topCompanies: getTopCompanies(events)
  };
}

httpServer.listen(4250, () => {
  console.log('Admin server running on :4250');
});
```

### Client: Report to Server

```typescript
// apps/desktop/src/main/services/admin-reporter.ts
import io from 'socket.io-client';

export class AdminReporter {
  private socket: ReturnType<typeof io> | null = null;
  private deviceId: string;
  private deviceName: string;
  private enabled: boolean = false;

  constructor(deviceId: string, deviceName: string) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
  }

  /**
   * Enable admin reporting
   */
  async enable(serverUrl: string) {
    this.socket = io(serverUrl);
    this.enabled = true;

    // Register device
    this.socket.emit('register_device', {
      id: this.deviceId,
      name: this.deviceName,
      type: process.platform === 'darwin' ? 'laptop' : 'laptop',
      timestamp: Date.now()
    });

    console.log(`Admin reporting enabled to ${serverUrl}`);
  }

  /**
   * Disable admin reporting
   */
  disable() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.enabled = false;
  }

  /**
   * Report tracker blocked event
   */
  reportTrackerBlocked(tracker: string, domain: string, company: string) {
    if (!this.enabled || !this.socket) return;

    const event: ClientEvent = {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: 'laptop',
      timestamp: Date.now(),
      eventType: 'tracker_blocked',
      data: {
        tracker,
        domain,
        company,
        blocked: true
      }
    };

    this.socket.emit('event', event);
  }

  /**
   * Report DNS query
   */
  reportDNSQuery(domain: string, blocked: boolean) {
    if (!this.enabled || !this.socket) return;

    const event: ClientEvent = {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: 'laptop',
      timestamp: Date.now(),
      eventType: 'dns_query',
      data: {
        domain,
        blocked
      }
    };

    this.socket.emit('event', event);
  }
}

// Global instance
export const adminReporter = new AdminReporter(
  require('os').hostname(),
  require('os').hostname()
);
```

### Frontend: Admin Dashboard

```typescript
// apps/admin-dashboard/src/App.tsx
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function AdminDashboard() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    // Connect to admin server
    const ws = io('http://localhost:4250');
    setSocket(ws);

    // Listen for devices
    ws.on('devices', (devicesData: DeviceInfo[]) => {
      setDevices(devicesData);
    });

    // Listen for stats
    ws.on('stats', (statsData: AggregateStats) => {
      setStats(statsData);
    });

    // Listen for events
    ws.on('event', (event: ClientEvent) => {
      setEvents(prev => [event, ...prev].slice(0, 50));
    });

    // Listen for new devices
    ws.on('device_online', (device: DeviceInfo) => {
      setDevices(prev => [...prev, device]);
    });

    return () => ws.disconnect();
  }, []);

  return (
    <div className="admin-dashboard">
      <header>
        <h1>🛡️ ankrshield Live Admin Dashboard</h1>
        <div className="status">
          🟢 Connected to {devices.length} devices
        </div>
      </header>

      {/* Device Grid */}
      <div className="device-grid">
        {devices.map(device => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>

      {/* Stats Board */}
      {stats && <StatsBoard stats={stats} />}

      {/* Live Activity Feed */}
      <div className="activity-feed">
        <h2>🔴 Live Activity</h2>
        {events.map((event, i) => (
          <EventRow key={i} event={event} />
        ))}
      </div>

      {/* Tracker Flow Visualization */}
      <TrackerFlowVisualization events={events} />
    </div>
  );
}
```

---

## 🎪 Demo Setup

### Physical Setup
```
Conference Room:
├─ Big screen/projector (admin dashboard)
├─ 5-10 devices running ankrshield
│  ├─ 2-3 phones
│  ├─ 2 laptops
│  ├─ 1 tablet
│  ├─ Smart TV (if available)
│  └─ IoT devices (Alexa, etc.)
├─ Local WiFi network
└─ Admin server on laptop
```

### Software Setup
```bash
# 1. Start admin server
cd apps/admin-server
pnpm start
# Server running on http://localhost:4250

# 2. Open admin dashboard
cd apps/admin-dashboard
pnpm dev
# Dashboard at http://localhost:3000

# 3. On each device: Enable admin reporting
ankrshield settings
└─ Admin Mode: ON
└─ Server: http://192.168.1.100:4250
```

### Presentation Flow
```
1. Open dashboard on big screen (fullscreen)
2. "Let me show you what's happening right now..."
3. Everyone pulls out their phones
4. Use apps normally (browse, social media, etc.)
5. Watch live tracking events flood in
6. Point out specific trackers being blocked
7. Show aggregate stats growing in real-time
8. "This is happening 24/7, everywhere you go"
9. "ankrshield blocks 89% of it automatically"
10. "Imagine this across your whole family..."
```

---

## 🚀 Deployment Options

### Option 1: Local Network (Best for demos)
```
Admin Server: Laptop running server
Dashboard: Browser on big screen
Devices: All on same WiFi
No internet required!
```

### Option 2: Cloud Hosted
```
Admin Server: https://admin.ankrshield.com
Dashboard: Public URL for remote demos
Devices: Connect from anywhere
Requires internet
```

### Option 3: Enterprise (White-label)
```
Customer's own server
Custom branding
Their own devices
SOC2 compliant
```

---

## 📊 Data Privacy

### Important Considerations
```
⚠️ Admin Dashboard sees ALL tracking data from devices
⚠️ Only enable on demo devices or with user consent
⚠️ Enterprise: Audit logs for compliance
✅ Data encrypted in transit (WSS)
✅ Opt-in only (disabled by default)
✅ Can be self-hosted (no cloud)
```

---

## 🎯 Use Cases

### 1. Sales Demos
- Show prospects the real problem
- Live data is more convincing than charts
- Interactive (they can use their own devices)

### 2. Trade Shows
- Eye-catching booth display
- Attendees connect their phones
- See their own trackers blocked live

### 3. Privacy Workshops
- Educational tool
- Students see real tracking
- Discuss privacy implications

### 4. Enterprise Deployments
- Network-wide monitoring
- Compliance reporting
- Security operations center (SOC)

---

*This is a REAL admin dashboard showing LIVE data, not simulated!*
