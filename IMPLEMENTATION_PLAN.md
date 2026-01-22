# ankrshield - Technical Implementation Plan

**6-Month MVP Development Roadmap**

Version: 1.0.0
Date: January 2026

---

## Overview

This document outlines the detailed technical implementation plan for ankrshield MVP (Months 0-6), including architecture decisions, development sprints, dependencies, and success criteria.

---

## Timeline Summary

```
Month 1: Foundation & Infrastructure
Month 2: Core DNS & Network Monitoring
Month 3: Privacy Intelligence Engine
Month 4: Desktop Application & UI
Month 5: AI Agent Monitoring (Basic)
Month 6: Testing, Polish & Launch
```

---

## Month 1: Foundation & Infrastructure

### Week 1: Project Setup

**Tasks:**

- [x] Initialize GitHub repository
- [ ] Setup monorepo structure (pnpm workspaces)
- [ ] Configure TypeScript (tsconfig.json)
- [ ] Setup linting (ESLint) and formatting (Prettier)
- [ ] Configure Git hooks (husky + lint-staged)
- [ ] Setup CI/CD pipeline (GitHub Actions)

**Deliverables:**

```
ankrshield/
├── apps/
├── packages/
├── .github/workflows/ci.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── .eslintrc.json
└── .prettierrc
```

**Technologies:**

- pnpm 8+
- TypeScript 5.9+
- ESLint + Prettier
- husky + lint-staged

---

### Week 2: Database Setup

**Tasks:**

- [ ] Setup PostgreSQL + TimescaleDB + pgvector
- [ ] Design database schema (Prisma)
- [ ] Create initial migrations
- [ ] Setup Redis for caching
- [ ] Create seed data for development

**Deliverables:**

```prisma
// prisma/schema.prisma
- User model
- Device model
- NetworkEvent model (hypertable)
- Tracker model
- Policy model
- AIAgent model
```

**Setup Commands:**

```bash
# Install dependencies
pnpm add prisma @prisma/client
pnpm add ioredis

# Initialize Prisma
pnpm prisma init

# Create migrations
pnpm prisma migrate dev --name init

# Generate client
pnpm prisma generate

# Seed database
pnpm prisma db seed
```

---

### Week 3: API Foundation

**Tasks:**

- [ ] Setup Fastify server
- [ ] Configure Mercurius (GraphQL)
- [ ] Implement authentication (JWT)
- [ ] Setup rate limiting
- [ ] Configure CORS, Helmet
- [ ] WebSocket support

**Deliverables:**

```typescript
// apps/api/src/main.ts
- Fastify server running on port 4000
- GraphQL endpoint: /graphql
- Health check: /health
- Authentication middleware
```

**Code:**

```typescript
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { schema } from './graphql/schema';

const app = Fastify({ logger: true });

// Plugins
app.register(require('@fastify/cors'));
app.register(require('@fastify/helmet'));
app.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET!,
});
app.register(require('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute',
});

// GraphQL
app.register(mercurius, {
  schema,
  graphiql: process.env.NODE_ENV === 'development',
  context: (request) => ({
    prisma: db,
    user: request.user,
  }),
});

// Health check
app.get('/health', () => ({ status: 'ok' }));

await app.listen({ port: 4000, host: '0.0.0.0' });
```

---

### Week 4: Frontend Foundation

**Tasks:**

- [ ] Setup React + Vite
- [ ] Configure TailwindCSS
- [ ] Setup Apollo Client (GraphQL)
- [ ] Configure Zustand (state management)
- [ ] Create basic layout components
- [ ] Setup routing (React Router)

**Deliverables:**

```typescript
// apps/web/src/main.tsx
- React app running on port 3000
- Apollo Client configured
- Basic layout (Header, Sidebar, Content)
- Routes: /, /dashboard, /devices, /settings
```

**Technologies:**

- React 19
- Vite 5
- Apollo Client 3.9
- Zustand 4.5
- TailwindCSS 3.4
- React Router DOM 7

---

## Month 2: Core DNS & Network Monitoring

### Week 5-6: DNS Resolver

**Tasks:**

- [ ] Implement DNS-over-HTTPS client
- [ ] Build DNS query parser
- [ ] Create blocklist manager
- [ ] Implement DNS caching (Redis)
- [ ] Add DNS logging to database

**Deliverables:**

```typescript
// packages/dns-resolver/src/resolver.ts
export class DNSResolver {
  async resolve(domain: string): Promise<DNSResult>;
  async checkBlocklist(domain: string): Promise<boolean>;
}
```

**Implementation:**

```typescript
import https from 'https';

export class DNSOverHTTPS {
  private upstream = 'https://cloudflare-dns.com/dns-query';

  async resolve(domain: string): Promise<DNSRecord[]> {
    const url = `${this.upstream}?name=${domain}&type=A`;

    const response = await fetch(url, {
      headers: { accept: 'application/dns-json' },
    });

    const data = await response.json();
    return data.Answer || [];
  }
}
```

**Blocklist Integration:**

```bash
# Download popular blocklists
curl https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts > blocklist.txt

# Import to database
pnpm tsx scripts/import-blocklist.ts blocklist.txt
```

---

### Week 7-8: Network Monitoring

**Tasks:**

- [ ] Implement network flow capture
- [ ] Build traffic classification engine
- [ ] Create app attribution logic
- [ ] Implement real-time event streaming
- [ ] Store events in TimescaleDB

**Deliverables:**

```typescript
// packages/network-monitor/src/monitor.ts
export class NetworkMonitor {
  async start(): Promise<void>;
  async stop(): Promise<void>;
  on(event: 'flow', handler: (flow: NetworkFlow) => void): void;
}
```

**Platform-Specific Implementations:**

**macOS (using Network Extension):**

```swift
// Swift code for macOS Network Extension
import NetworkExtension

class PacketTunnelProvider: NEPacketTunnelProvider {
    override func startTunnel(options: [String : NSObject]?) async throws {
        // Capture packets
    }
}
```

**Windows (using WinDivert):**

```typescript
import { WinDivert } from 'windivert';

const divert = new WinDivert('tcp.DstPort == 80 or tcp.DstPort == 443');
divert.open();

divert.recv((packet) => {
  // Process packet
});
```

**Linux (using libpcap):**

```typescript
import pcap from 'pcap';

const session = pcap.createSession('eth0', 'tcp');

session.on('packet', (rawPacket) => {
  const packet = pcap.decode.packet(rawPacket);
  // Process packet
});
```

---

## Month 3: Privacy Intelligence Engine

### Week 9-10: Tracker Classification

**Tasks:**

- [ ] Build tracker database schema
- [ ] Import tracker lists (EasyList, etc.)
- [ ] Implement domain categorization
- [ ] Add vendor attribution
- [ ] Calculate risk scores

**Deliverables:**

```typescript
// packages/privacy-engine/src/classifier.ts
export class TrackerClassifier {
  async classify(domain: string): Promise<Classification>;
}

interface Classification {
  category: TrackerCategory;
  vendor: string;
  riskScore: number; // 1-100
}
```

**Tracker Database:**

```sql
-- Import EasyList
INSERT INTO trackers (domain, vendor, category, risk_score)
VALUES
  ('doubleclick.net', 'Google', 'ADVERTISING', 85),
  ('facebook.com', 'Meta', 'SOCIAL_MEDIA', 75),
  ('analytics.google.com', 'Google', 'ANALYTICS', 60);
```

---

### Week 11-12: Privacy Scoring

**Tasks:**

- [ ] Design privacy score algorithm
- [ ] Implement score calculation
- [ ] Create continuous aggregates (TimescaleDB)
- [ ] Build trend analysis
- [ ] Generate privacy reports

**Deliverables:**

```typescript
// packages/privacy-engine/src/scoring.ts
export class PrivacyScorer {
  async calculateScore(userId: string): Promise<PrivacyScore>;
}

interface PrivacyScore {
  overall: number; // 1-100
  network: number;
  dns: number;
  app: number;
  ai: number;
}
```

**Scoring Algorithm:**

```typescript
function calculatePrivacyScore(metrics: PrivacyMetrics): number {
  const { totalEvents, blockedEvents, trackerEvents, uniqueTrackers, sensitiveDataAccess } =
    metrics;

  // Base score: 100
  let score = 100;

  // Penalty for trackers
  const blockRate = blockedEvents / totalEvents;
  score -= (1 - blockRate) * 30; // Up to -30 points

  // Penalty for unique trackers
  score -= Math.min(uniqueTrackers / 10, 20); // Up to -20 points

  // Penalty for sensitive data access
  score -= sensitiveDataAccess * 5; // Up to -50 points

  return Math.max(0, Math.min(100, Math.round(score)));
}
```

---

## Month 4: Desktop Application & UI

### Week 13-14: Electron App

**Tasks:**

- [ ] Setup Electron
- [ ] Implement system tray
- [ ] Create native menus
- [ ] Handle IPC (main ↔ renderer)
- [ ] Implement auto-updates
- [ ] Code signing (macOS/Windows)

**Deliverables:**

```typescript
// apps/desktop/src/main/index.ts
- Electron main process
- System tray icon
- Auto-launch on startup
- Native notifications
```

**Code:**

```typescript
import { app, BrowserWindow, Tray, Menu } from 'electron';

let tray: Tray;
let mainWindow: BrowserWindow;

app.on('ready', () => {
  // Create window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL('http://localhost:3000');

  // Create tray
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Dashboard', click: () => mainWindow.show() },
    { label: 'Pause Protection', click: toggleProtection },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
});
```

---

### Week 15-16: Dashboard UI

**Tasks:**

- [ ] Design dashboard components
- [ ] Implement privacy score widget
- [ ] Create network activity chart
- [ ] Build tracker list view
- [ ] Add device management
- [ ] Implement settings panel

**Deliverables:**

```
Dashboard:
├── Privacy Score (87/100)
├── Activity Chart (last 24h)
├── Top Trackers Blocked
├── Recent Events
└── Quick Actions
```

**React Components:**

```typescript
// apps/web/src/pages/Dashboard/Dashboard.tsx

export function Dashboard() {
  const { data } = useQuery(GET_DASHBOARD_DATA);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Privacy Score */}
      <div className="col-span-4">
        <PrivacyScoreCard score={data.privacyScore} />
      </div>

      {/* Activity Chart */}
      <div className="col-span-8">
        <ActivityChart data={data.events} />
      </div>

      {/* Top Trackers */}
      <div className="col-span-6">
        <TopTrackersCard trackers={data.topTrackers} />
      </div>

      {/* Recent Events */}
      <div className="col-span-6">
        <RecentEventsCard events={data.recentEvents} />
      </div>
    </div>
  );
}
```

**Visualizations:**

```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

export function ActivityChart({ data }: { data: NetworkEvent[] }) {
  const chartData = aggregateByHour(data);

  return (
    <LineChart width={600} height={300} data={chartData}>
      <XAxis dataKey="hour" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="blocked" stroke="#ef4444" />
      <Line type="monotone" dataKey="allowed" stroke="#22c55e" />
    </LineChart>
  );
}
```

---

## Month 5: AI Agent Monitoring (Basic)

### Week 17-18: Agent Discovery

**Tasks:**

- [ ] Implement process monitoring
- [ ] Create AI agent signatures
- [ ] Build agent registry
- [ ] Add auto-discovery
- [ ] Manual agent registration

**Deliverables:**

```typescript
// packages/ai-governance/src/discovery.ts
export class AgentDiscovery {
  async scan(): Promise<AIAgent[]>;
  async register(agent: AIAgent): Promise<void>;
}
```

---

### Week 19-20: Activity Monitoring

**Tasks:**

- [ ] File access tracking
- [ ] Network monitoring (AI agents)
- [ ] Clipboard monitoring
- [ ] Activity logging
- [ ] Basic policies

**Deliverables:**

```typescript
// packages/ai-governance/src/monitor.ts
export class AIAgentMonitor {
  async monitorAgent(agent: AIAgent): Promise<void>;
  on(event: 'activity', handler: (activity: AIActivity) => void): void;
}
```

**Integration:**

```typescript
// Integrate with existing network monitor
networkMonitor.on('flow', async (flow) => {
  // Check if process is AI agent
  const agent = await agentRegistry.findByProcessId(flow.processId);

  if (agent) {
    await db.aiActivity.create({
      data: {
        agentId: agent.id,
        activityType: 'NETWORK_REQUEST',
        domain: flow.domain,
        dataSize: flow.bytesUp,
      },
    });
  }
});
```

---

## Month 6: Testing, Polish & Launch

### Week 21-22: Testing

**Tasks:**

- [ ] Unit tests (vitest)
- [ ] Integration tests
- [ ] E2E tests (Playwright)
- [ ] Performance testing
- [ ] Security audit

**Test Coverage Goals:**

- Core logic: >90%
- API resolvers: >80%
- UI components: >70%

**Example Tests:**

```typescript
// packages/dns-resolver/src/__tests__/resolver.test.ts

import { describe, it, expect } from 'vitest';
import { DNSResolver } from '../resolver';

describe('DNSResolver', () => {
  it('should resolve google.com', async () => {
    const resolver = new DNSResolver();
    const result = await resolver.resolve('google.com');

    expect(result.ip).toBeDefined();
    expect(result.blocked).toBe(false);
  });

  it('should block known tracker', async () => {
    const resolver = new DNSResolver();
    const result = await resolver.resolve('doubleclick.net');

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('Tracker');
  });
});
```

---

### Week 23: Polish & Optimization

**Tasks:**

- [ ] Performance optimization
- [ ] UI/UX improvements
- [ ] Bug fixes
- [ ] Documentation
- [ ] Onboarding flow

**Performance Targets:**

- API response time: <100ms (p95)
- DNS resolution: <50ms (p95)
- Dashboard load time: <2s
- Memory usage: <500MB
- CPU usage: <5% idle, <20% active

---

### Week 24: Launch Preparation

**Tasks:**

- [ ] Marketing website
- [ ] Documentation site
- [ ] App store submissions
- [ ] Beta tester recruitment
- [ ] Press kit preparation
- [ ] Launch announcement

**Launch Checklist:**

- [ ] Production infrastructure ready
- [ ] Monitoring & alerting configured
- [ ] Support system in place
- [ ] Pricing finalized
- [ ] Terms of Service & Privacy Policy
- [ ] App store listings approved
- [ ] Beta feedback incorporated
- [ ] Launch blog post ready
- [ ] Social media scheduled
- [ ] Press release distributed

---

## Development Workflow

### Daily Workflow

```bash
# Start development
pnpm dev

# Run tests
pnpm test

# Lint & format
pnpm lint
pnpm format

# Database migrations
pnpm prisma migrate dev

# Build
pnpm build
```

### Git Workflow

```bash
# Feature branch
git checkout -b feature/ai-agent-monitoring

# Commit with conventional commits
git commit -m "feat(ai-governance): add agent discovery"

# Push & create PR
git push origin feature/ai-agent-monitoring
```

### Deployment

```bash
# Staging deployment (automatic on push to develop)
git push origin develop

# Production deployment (automatic on push to main)
git push origin main
```

---

## Success Criteria (MVP)

**Functional Requirements:**

- [x] Users can create accounts
- [ ] Desktop app works on Windows/macOS/Linux
- [ ] DNS blocking works (>95% accuracy)
- [ ] Privacy score calculated correctly
- [ ] Dashboard shows real-time data
- [ ] AI agent detection works for top 5 agents
- [ ] Policies can be created and enforced

**Performance Requirements:**

- [ ] Handles 10,000 DNS queries/minute
- [ ] Dashboard loads in <2 seconds
- [ ] API response time <100ms (p95)
- [ ] CPU usage <5% idle, <20% active
- [ ] Memory usage <500MB

**Quality Requirements:**

- [ ] Zero critical bugs
- [ ] > 80% test coverage
- [ ] Security audit passed
- [ ] Accessibility (WCAG 2.1 AA)

**Business Requirements:**

- [ ] 1,000+ beta signups
- [ ] Payment integration (Stripe)
- [ ] Free & Premium tiers functional
- [ ] Analytics tracking
- [ ] Support system ready

---

## Risk Mitigation

**Technical Risks:**

1. **Platform-specific issues**: Test on all platforms weekly
2. **Performance problems**: Continuous profiling, load testing
3. **Security vulnerabilities**: Weekly security scans, audits

**Schedule Risks:**

1. **Scope creep**: Strict MVP scope, defer non-essential features
2. **Dependencies**: Identify critical path, have backups
3. **Team capacity**: Buffer time (20%), outsource if needed

**Business Risks:**

1. **Market competition**: Focus on differentiators (AI governance)
2. **User adoption**: Beta program, feedback loops
3. **Monetization**: Test pricing early, iterate

---

## Post-MVP Roadmap (Months 7-12)

**Month 7-8: Mobile Apps**

- iOS VPN app
- Android VPN app

**Month 9-10: Advanced AI Governance**

- Policy templates
- Anomaly detection
- ML-based classification

**Month 11-12: Additional Features**

- Identity protection
- IoT protection
- Browser extension (Firefox, Safari)

---

**Document Version:** 1.0.0
**Last Updated:** January 22, 2026
