# ankrshield - Technical Architecture & Stack

**Comprehensive Technical Design Document**

Version: 1.0.0
Date: January 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Data Architecture](#4-data-architecture)
5. [Security Architecture](#5-security-architecture)
6. [Network Architecture](#6-network-architecture)
7. [AI/ML Architecture](#7-aiml-architecture)
8. [Infrastructure & DevOps](#8-infrastructure--devops)
9. [API Design](#9-api-design)
10. [Client Applications](#10-client-applications)
11. [Performance & Scalability](#11-performance--scalability)
12. [Monitoring & Observability](#12-monitoring--observability)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  │
│  │  Desktop  │  │  Mobile   │  │  Browser  │  │  Gateway  │  │
│  │    App    │  │    App    │  │ Extension │  │  (Rasp Pi)│  │
│  │ (Electron)│  │(React Ntv)│  │           │  │           │  │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  │
│        │              │              │              │          │
│        └──────────────┴──────────────┴──────────────┘          │
│                           │                                     │
│                     GraphQL/WebSocket                           │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    API Gateway Layer                             │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Fastify Server + Mercurius GraphQL                      │  │
│  │  - Rate limiting, CORS, Helmet, JWT auth                 │  │
│  │  - WebSocket support for real-time                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                     Application Layer                            │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │
│  │  GraphQL   │  │   Policy   │  │  Privacy   │  │    AI    │ │
│  │  Resolvers │  │   Engine   │  │Intelligence│  │ Co-Pilot │ │
│  │  (Pothos)  │  │            │  │   Engine   │  │          │ │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └────┬─────┘ │
│        │               │               │               │        │
│        └───────────────┴───────────────┴───────────────┘        │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                      Service Layer                               │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   DNS    │  │  Network │  │   App    │  │    AI    │       │
│  │ Resolver │  │ Monitor  │  │ Behavior │  │  Agent   │       │
│  │  Service │  │  Service │  │  Service │  │  Service │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │              │
│       └─────────────┴─────────────┴─────────────┘              │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                       Data Layer                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  │
│  │PostgreSQL │  │ TimescaleDB│  │ pgvector  │  │   Redis   │  │
│  │ (Primary) │  │(Time-Series│  │(Embeddings│  │ (Cache +  │  │
│  │           │  │ Analytics) │  │    & AI)  │  │  Pub/Sub) │  │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Principles

**1. Privacy-First**

- Minimal data collection
- Local-first processing where possible
- End-to-end encryption for sensitive data
- User controls data retention

**2. Performance**

- Sub-100ms API response times
- Real-time monitoring with minimal CPU/battery impact
- Efficient caching strategies
- Database query optimization

**3. Scalability**

- Horizontal scaling for API servers
- Database partitioning and sharding
- CDN for static assets
- Microservices-ready architecture

**4. Security**

- Defense in depth
- Zero-trust architecture
- Least privilege access
- Regular security audits

**5. Maintainability**

- TypeScript throughout (type safety)
- Monorepo structure (code sharing)
- Comprehensive testing (unit + integration + E2E)
- Clear documentation

---

## 2. Technology Stack

### 2.1 Frontend Stack

**Core Framework:**

```json
{
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "typescript": "^5.9.3",
  "vite": "^5.0.12"
}
```

**State Management:**

```json
{
  "zustand": "^4.5.0",
  "@apollo/client": "^3.9.0"
}
```

**Styling:**

```json
{
  "tailwindcss": "^3.4.1",
  "postcss": "^8.4.33",
  "autoprefixer": "^10.4.17",
  "clsx": "^2.1.0"
}
```

**UI Components:**

```json
{
  "lucide-react": "^0.312.0",
  "recharts": "^2.10.0",
  "date-fns": "^3.3.0",
  "react-router-dom": "^7.0.0"
}
```

**Build Tools:**

```json
{
  "@vitejs/plugin-react": "^4.2.1"
}
```

### 2.2 Backend Stack

**Core Framework:**

```json
{
  "fastify": "^4.26.0",
  "mercurius": "^14.1.0",
  "graphql": "^16.8.0",
  "@pothos/core": "^3.38.0",
  "@pothos/plugin-prisma": "^3.61.0",
  "@pothos/plugin-validation": "^3.11.0"
}
```

**Database & ORM:**

```json
{
  "@prisma/client": "^5.22.0",
  "prisma": "^5.22.0",
  "ioredis": "^5.3.0"
}
```

**Validation & Security:**

```json
{
  "zod": "^3.22.0",
  "@fastify/jwt": "^8.0.0",
  "@fastify/cors": "^9.0.0",
  "@fastify/helmet": "^11.0.0",
  "@fastify/rate-limit": "^9.0.0",
  "@fastify/websocket": "^10.0.0"
}
```

**Utilities:**

```json
{
  "pino": "^8.18.0",
  "pino-pretty": "^10.3.0",
  "tsx": "^4.21.0"
}
```

### 2.3 Database Stack

**Primary Database:**

```yaml
PostgreSQL: 15+
Extensions:
  - TimescaleDB (time-series data)
  - pgvector (vector embeddings)
  - pg_stat_statements (query analytics)
  - pg_trgm (fuzzy text search)
```

**Caching & Pub/Sub:**

```yaml
Redis: 7+
Use Cases:
  - Session storage
  - Query result caching
  - Rate limiting counters
  - Real-time pub/sub
  - Job queues
```

### 2.4 Security & Networking Stack

**VPN & DNS:**

```yaml
WireGuard: Latest
DNS-over-HTTPS: Cloudflare, Google, Quad9
DNS-over-TLS: Supported
DNSSEC: Enabled
```

**Cryptography:**

```json
{
  "@noble/hashes": "^1.3.0",
  "@noble/ciphers": "^0.5.0",
  "crypto": "native Node.js"
}
```

**TLS:**

```yaml
Protocol: TLS 1.3
Certificates: Let's Encrypt (auto-renewal)
Cipher Suites: Modern, secure defaults
```

### 2.5 AI/ML Stack

**On-Device ML:**

```json
{
  "@tensorflow/tfjs": "^4.11.0",
  "@tensorflow/tfjs-node": "^4.11.0"
}
```

**Vector Storage:**

```yaml
pgvector: PostgreSQL extension
Dimensionality: 1536 (OpenAI embeddings)
Index: HNSW (fast similarity search)
```

**AI Integration (Optional):**

```json
{
  "openai": "^4.20.0",
  "langchain": "^0.1.0"
}
```

### 2.6 DevOps & Infrastructure

**Containerization:**

```yaml
Docker: 24+
Docker Compose: 2.0+
```

**Orchestration:**

```yaml
Kubernetes: 1.28+
Helm: 3+
```

**CI/CD:**

```yaml
GitHub Actions:
  - Automated testing
  - Build & deploy
  - Security scanning
```

**Monitoring:**

```json
{
  "prom-client": "^15.0.0",
  "@opentelemetry/api": "^1.6.0"
}
```

**Cloud Providers:**

```yaml
Primary: AWS (EC2, RDS, S3, CloudFront)
Alternatives: GCP, DigitalOcean, Hetzner
CDN: Cloudflare
```

### 2.7 Testing Stack

**Unit & Integration Testing:**

```json
{
  "vitest": "^1.2.0",
  "@testing-library/react": "^14.0.0",
  "@testing-library/jest-dom": "^6.1.0"
}
```

**E2E Testing:**

```json
{
  "playwright": "^1.40.0"
}
```

**Load Testing:**

```yaml
k6: Artillery alternative
Artillery: HTTP load testing
```

---

## 3. System Architecture

### 3.1 Monorepo Structure

```
ankrshield/
├── apps/
│   ├── api/                      # Fastify + Mercurius API
│   ├── web/                      # React dashboard (Vite)
│   ├── desktop/                  # Electron desktop app
│   ├── mobile-ios/               # React Native (iOS)
│   ├── mobile-android/           # React Native (Android)
│   ├── browser-extension/        # Chrome/Firefox extension
│   └── gateway/                  # Raspberry Pi gateway
│
├── packages/
│   ├── core/                     # Shared types, utilities
│   ├── api-client/               # GraphQL client (Apollo)
│   ├── ui/                       # Shared React components
│   ├── config/                   # Shared configuration
│   ├── dns-resolver/             # DNS resolution logic
│   ├── network-monitor/          # Network monitoring
│   ├── privacy-engine/           # Privacy intelligence
│   ├── policy-engine/            # Policy enforcement
│   ├── ai-governance/            # AI agent monitoring
│   ├── tracker-db/               # Tracker database
│   └── crypto/                   # Cryptography utilities
│
├── prisma/
│   ├── schema.prisma             # Database schema
│   ├── migrations/               # Database migrations
│   └── seed.ts                   # Seed data
│
├── docker/
│   ├── Dockerfile.api            # API container
│   ├── Dockerfile.web            # Web dashboard
│   └── docker-compose.yml        # Local development
│
├── k8s/                          # Kubernetes manifests
│   ├── api/
│   ├── web/
│   └── ingress/
│
├── .github/
│   └── workflows/                # CI/CD pipelines
│
├── docs/                         # Documentation
├── scripts/                      # Build/deploy scripts
├── pnpm-workspace.yaml           # pnpm monorepo config
├── package.json                  # Root package.json
└── tsconfig.json                 # Root TypeScript config
```

### 3.2 Application Structure

**API App (`apps/api`):**

```
apps/api/
├── src/
│   ├── main.ts                   # Fastify server entry
│   ├── graphql/
│   │   ├── schema/               # Pothos schema builder
│   │   │   ├── index.ts
│   │   │   ├── user.ts
│   │   │   ├── device.ts
│   │   │   ├── tracker.ts
│   │   │   ├── policy.ts
│   │   │   └── analytics.ts
│   │   └── context.ts            # GraphQL context
│   ├── services/
│   │   ├── dns.service.ts
│   │   ├── network.service.ts
│   │   ├── privacy.service.ts
│   │   ├── ai-agent.service.ts
│   │   └── user.service.ts
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   ├── device.repository.ts
│   │   ├── event.repository.ts
│   │   └── policy.repository.ts
│   ├── plugins/
│   │   ├── auth.ts               # JWT authentication
│   │   ├── cors.ts
│   │   ├── helmet.ts
│   │   ├── rate-limit.ts
│   │   └── websocket.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── crypto.ts
│   │   └── validation.ts
│   └── types/
│       └── index.ts
├── prisma/
│   └── schema.prisma
├── package.json
└── tsconfig.json
```

**Web App (`apps/web`):**

```
apps/web/
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Root component
│   ├── pages/
│   │   ├── Dashboard/
│   │   │   ├── index.tsx
│   │   │   └── Dashboard.tsx
│   │   ├── Analytics/
│   │   ├── Policies/
│   │   ├── Devices/
│   │   ├── Settings/
│   │   └── AIAgents/
│   ├── components/
│   │   ├── Layout/
│   │   ├── Charts/
│   │   ├── Tables/
│   │   └── Forms/
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── usePrivacyScore.ts
│   │   ├── useTrackers.ts
│   │   └── useRealtime.ts
│   ├── stores/
│   │   ├── authStore.ts          # Zustand store
│   │   ├── deviceStore.ts
│   │   └── settingsStore.ts
│   ├── graphql/
│   │   ├── client.ts             # Apollo Client setup
│   │   ├── queries/
│   │   ├── mutations/
│   │   └── subscriptions/
│   ├── utils/
│   └── types/
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── tsconfig.json
```

---

## 4. Data Architecture

### 4.1 Database Schema (Prisma)

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  extensions = [timescaledb, vector]
}

generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

// ============================================
// User Management
// ============================================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String?

  // Subscription
  tier          SubscriptionTier @default(FREE)
  stripeCustomerId String?  @unique
  subscriptionId   String?
  subscriptionStatus String?

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?

  // Relations
  devices       Device[]
  policies      Policy[]
  alerts        Alert[]
  sessions      Session[]
  apiKeys       ApiKey[]

  @@index([email])
  @@map("users")
}

enum SubscriptionTier {
  FREE
  PREMIUM
  FAMILY
  PRO
  ENTERPRISE
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token        String   @unique
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([token])
  @@map("sessions")
}

model ApiKey {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  key         String   @unique
  name        String
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([key])
  @@map("api_keys")
}

// ============================================
// Device Management
// ============================================

model Device {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Device Info
  name          String
  type          DeviceType
  os            String
  osVersion     String
  appVersion    String

  // Status
  status        DeviceStatus @default(ACTIVE)
  lastSeenAt    DateTime @default(now())

  // Configuration
  vpnEnabled    Boolean  @default(true)
  dnsEnabled    Boolean  @default(true)

  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  events        NetworkEvent[]
  policies      DevicePolicy[]
  aiAgents      AIAgent[]

  @@index([userId])
  @@index([status])
  @@map("devices")
}

enum DeviceType {
  DESKTOP
  MOBILE
  BROWSER
  GATEWAY
}

enum DeviceStatus {
  ACTIVE
  INACTIVE
  BLOCKED
}

// ============================================
// Network Monitoring (TimescaleDB)
// ============================================

model NetworkEvent {
  id            BigInt   @id @default(autoincrement())
  deviceId      String
  device        Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  // Event Details
  timestamp     DateTime @default(now())
  eventType     EventType

  // Network Info
  domain        String
  ip            String?
  port          Int?
  protocol      String

  // Classification
  category      TrackerCategory
  vendor        String?
  trackerId     String?
  tracker       Tracker? @relation(fields: [trackerId], references: [id])

  // Data Transfer
  bytesUp       BigInt   @default(0)
  bytesDown     BigInt   @default(0)

  // Action
  action        EventAction
  blocked       Boolean  @default(false)

  // App Attribution
  appName       String?
  appProcess    String?

  @@index([deviceId, timestamp])
  @@index([domain])
  @@index([trackerId])
  @@index([timestamp])
  @@map("network_events")
}

enum EventType {
  DNS_QUERY
  HTTP_REQUEST
  HTTPS_REQUEST
  WEBSOCKET
  UDP
  TCP
}

enum EventAction {
  ALLOWED
  BLOCKED
  MONITORED
}

enum TrackerCategory {
  ADVERTISING
  ANALYTICS
  SOCIAL_MEDIA
  CDN
  PAYMENT
  MAPS
  VIDEO
  TELEMETRY
  MALWARE
  UNKNOWN
}

// ============================================
// Tracker Database
// ============================================

model Tracker {
  id            String   @id @default(cuid())

  // Identification
  domain        String   @unique
  vendor        String
  category      TrackerCategory

  // Classification
  riskScore     Int      @default(50) // 1-100
  prevalence    Int      @default(0)  // How common

  // Metadata
  description   String?
  privacyPolicy String?

  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  events        NetworkEvent[]

  @@index([domain])
  @@index([vendor])
  @@index([category])
  @@map("trackers")
}

// ============================================
// AI Agent Management
// ============================================

model AIAgent {
  id            String   @id @default(cuid())
  deviceId      String
  device        Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  // Agent Info
  name          String
  type          AIAgentType
  vendor        String
  version       String?

  // Status
  status        AgentStatus @default(MONITORED)
  trustScore    Int      @default(50) // 1-100

  // Permissions
  fileAccess    Boolean  @default(false)
  networkAccess Boolean  @default(true)
  clipboardAccess Boolean @default(false)

  // Timestamps
  discoveredAt  DateTime @default(now())
  lastActiveAt  DateTime @default(now())

  // Relations
  activities    AIActivity[]
  policies      AIAgentPolicy[]

  @@index([deviceId])
  @@index([type])
  @@map("ai_agents")
}

enum AIAgentType {
  CHATBOT
  CODE_ASSISTANT
  SEARCH_ASSISTANT
  WRITING_ASSISTANT
  IMAGE_GENERATOR
  VOICE_ASSISTANT
  CUSTOM
}

enum AgentStatus {
  TRUSTED
  MONITORED
  RESTRICTED
  BLOCKED
}

model AIActivity {
  id            BigInt   @id @default(autoincrement())
  agentId       String
  agent         AIAgent  @relation(fields: [agentId], references: [id], onDelete: Cascade)

  // Activity Details
  timestamp     DateTime @default(now())
  activityType  AIActivityType

  // Context
  filePath      String?
  domain        String?
  dataSize      BigInt?

  // Action
  action        EventAction
  blocked       Boolean  @default(false)
  reason        String?

  @@index([agentId, timestamp])
  @@index([timestamp])
  @@map("ai_activities")
}

enum AIActivityType {
  FILE_READ
  FILE_WRITE
  NETWORK_REQUEST
  CLIPBOARD_ACCESS
  SCREENSHOT
  EMAIL_ACCESS
  DOCUMENT_SCAN
}

// ============================================
// Policy Management
// ============================================

model Policy {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Policy Info
  name          String
  description   String?
  enabled       Boolean  @default(true)

  // Policy Type
  policyType    PolicyType

  // Rules (JSON)
  rules         Json

  // Schedule
  scheduleEnabled Boolean @default(false)
  schedule      Json?

  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  devicePolicies DevicePolicy[]
  aiAgentPolicies AIAgentPolicy[]

  @@index([userId])
  @@map("policies")
}

enum PolicyType {
  NETWORK
  DNS
  APPLICATION
  AI_AGENT
  SCHEDULE
  CUSTOM
}

model DevicePolicy {
  id         String   @id @default(cuid())
  deviceId   String
  device     Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  policyId   String
  policy     Policy   @relation(fields: [policyId], references: [id], onDelete: Cascade)

  createdAt  DateTime @default(now())

  @@unique([deviceId, policyId])
  @@map("device_policies")
}

model AIAgentPolicy {
  id         String   @id @default(cuid())
  agentId    String
  agent      AIAgent  @relation(fields: [agentId], references: [id], onDelete: Cascade)
  policyId   String
  policy     Policy   @relation(fields: [policyId], references: [id], onDelete: Cascade)

  createdAt  DateTime @default(now())

  @@unique([agentId, policyId])
  @@map("ai_agent_policies")
}

// ============================================
// Analytics & Privacy Scores
// ============================================

model PrivacyScore {
  id            String   @id @default(cuid())
  userId        String
  deviceId      String?

  // Score
  score         Int      // 1-100
  previousScore Int?

  // Breakdown
  networkScore  Int
  dnsScore      Int
  appScore      Int
  aiScore       Int

  // Metrics
  trackersBlocked Int
  dataTransferSaved BigInt

  // Timestamp
  calculatedAt  DateTime @default(now())

  @@index([userId, calculatedAt])
  @@index([deviceId, calculatedAt])
  @@map("privacy_scores")
}

// ============================================
// Alerts & Notifications
// ============================================

model Alert {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Alert Details
  severity      AlertSeverity
  title         String
  message       String
  alertType     AlertType

  // Status
  read          Boolean  @default(false)
  dismissed     Boolean  @default(false)

  // Context
  metadata      Json?

  // Timestamp
  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
  @@index([severity])
  @@map("alerts")
}

enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
}

enum AlertType {
  NEW_TRACKER
  SUSPICIOUS_ACTIVITY
  POLICY_VIOLATION
  AI_AGENT_ANOMALY
  PRIVACY_SCORE_CHANGE
  SYSTEM
}

// ============================================
// Vector Embeddings (pgvector)
// ============================================

model TrackerEmbedding {
  id            String   @id @default(cuid())
  trackerId     String   @unique

  // Vector embedding (1536 dimensions for OpenAI)
  embedding     Unsupported("vector(1536)")

  // Metadata
  modelVersion  String
  createdAt     DateTime @default(now())

  @@map("tracker_embeddings")
}
```

### 4.2 Database Optimization

**TimescaleDB Hypertables:**

```sql
-- Convert network_events to hypertable (time-series)
SELECT create_hypertable('network_events', 'timestamp');

-- Create continuous aggregates for analytics
CREATE MATERIALIZED VIEW network_events_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS bucket,
  device_id,
  category,
  COUNT(*) as event_count,
  SUM(bytes_up) as total_bytes_up,
  SUM(bytes_down) as total_bytes_down,
  COUNT(CASE WHEN blocked THEN 1 END) as blocked_count
FROM network_events
GROUP BY bucket, device_id, category;

-- Auto-retention policy (90 days)
SELECT add_retention_policy('network_events', INTERVAL '90 days');
```

**pgvector Indexes:**

```sql
-- Create HNSW index for fast similarity search
CREATE INDEX tracker_embedding_idx ON tracker_embeddings
USING hnsw (embedding vector_cosine_ops);
```

**PostgreSQL Indexes:**

```sql
-- Composite indexes for common queries
CREATE INDEX idx_events_device_time ON network_events(device_id, timestamp DESC);
CREATE INDEX idx_events_domain ON network_events(domain) WHERE action = 'ALLOWED';
CREATE INDEX idx_ai_activities_agent_time ON ai_activities(agent_id, timestamp DESC);
```

**Partitioning:**

```sql
-- Partition network_events by month (TimescaleDB handles this)
-- Partition policies by user (for multi-tenancy)
```

---

## 5. Security Architecture

### 5.1 Authentication Flow

```
┌──────────┐                ┌──────────┐                ┌──────────┐
│  Client  │                │   API    │                │ Database │
└────┬─────┘                └────┬─────┘                └────┬─────┘
     │                           │                           │
     │  1. POST /auth/login      │                           │
     │  (email + password)       │                           │
     ├──────────────────────────>│                           │
     │                           │                           │
     │                           │  2. Validate credentials  │
     │                           ├──────────────────────────>│
     │                           │<──────────────────────────┤
     │                           │                           │
     │                           │  3. Generate JWT          │
     │                           │     (user id, tier, exp)  │
     │                           │                           │
     │  4. Return JWT + Refresh  │                           │
     │<──────────────────────────┤                           │
     │                           │                           │
     │  5. GraphQL Request       │                           │
     │  (Authorization: Bearer)  │                           │
     ├──────────────────────────>│                           │
     │                           │  6. Verify JWT            │
     │                           │                           │
     │                           │  7. Execute query         │
     │                           ├──────────────────────────>│
     │                           │<──────────────────────────┤
     │  8. Return data           │                           │
     │<──────────────────────────┤                           │
     │                           │                           │
```

**JWT Structure:**

```typescript
interface JWTPayload {
  sub: string; // User ID
  email: string;
  tier: SubscriptionTier;
  iat: number; // Issued at
  exp: number; // Expiration (24 hours)
}

interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  exp: number; // 30 days
}
```

**Implementation:**

```typescript
// apps/api/src/plugins/auth.ts

import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export default fp(async (fastify) => {
  fastify.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: {
      algorithm: 'HS256',
      expiresIn: '24h',
    },
  });

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
```

### 5.2 Authorization & RBAC

**Permission Model:**

```typescript
enum Permission {
  // Device permissions
  DEVICE_READ = 'device:read',
  DEVICE_WRITE = 'device:write',
  DEVICE_DELETE = 'device:delete',

  // Policy permissions
  POLICY_READ = 'policy:read',
  POLICY_WRITE = 'policy:write',
  POLICY_DELETE = 'policy:delete',

  // Analytics permissions
  ANALYTICS_READ = 'analytics:read',
  ANALYTICS_EXPORT = 'analytics:export',

  // Admin permissions
  ADMIN_USERS = 'admin:users',
  ADMIN_SYSTEM = 'admin:system',
}

const tierPermissions: Record<SubscriptionTier, Permission[]> = {
  FREE: [Permission.DEVICE_READ, Permission.POLICY_READ, Permission.ANALYTICS_READ],
  PREMIUM: [
    Permission.DEVICE_READ,
    Permission.DEVICE_WRITE,
    Permission.DEVICE_DELETE,
    Permission.POLICY_READ,
    Permission.POLICY_WRITE,
    Permission.POLICY_DELETE,
    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,
  ],
  // ... other tiers
};
```

### 5.3 Data Encryption

**At Rest:**

```yaml
Database Encryption:
  - PostgreSQL: Transparent Data Encryption (TDE)
  - RDS: Encryption at rest enabled
  - Backups: Encrypted with KMS

File Storage:
  - S3: Server-side encryption (SSE-S3)
  - Logs: Encrypted before storage

Sensitive Fields:
  - Password hashes: bcrypt (cost factor 12)
  - API keys: Encrypted with AES-256-GCM
```

**In Transit:**

```yaml
TLS Configuration:
  - Protocol: TLS 1.3
  - Certificates: Let's Encrypt
  - Cipher suites: Modern, strong only
  - HSTS: Enabled
  - Perfect Forward Secrecy: Yes

VPN:
  - Protocol: WireGuard
  - Encryption: ChaCha20-Poly1305
  - Key Exchange: Curve25519
```

**In Memory:**

```typescript
// Sensitive data cleared after use
import { timingSafeEqual, randomBytes } from 'crypto';

function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

// Secure random generation
function generateSecureToken(): string {
  return randomBytes(32).toString('base64url');
}
```

### 5.4 Rate Limiting

```typescript
// apps/api/src/plugins/rate-limit.ts

import rateLimit from '@fastify/rate-limit';

export default fp(async (fastify) => {
  fastify.register(rateLimit, {
    global: true,
    max: 100, // requests
    timeWindow: '1 minute',
    cache: 10000,
    redis: fastify.redis, // Use Redis for distributed rate limiting
    keyGenerator: (request) => {
      return request.user?.id || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}`,
      };
    },
  });
});
```

**Tiered Rate Limits:**

```typescript
const rateLimits: Record<SubscriptionTier, number> = {
  FREE: 100, // 100 requests/minute
  PREMIUM: 1000, // 1000 requests/minute
  PRO: 10000, // 10k requests/minute
  ENTERPRISE: -1, // Unlimited
};
```

---

## 6. Network Architecture

### 6.1 DNS Resolution Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    DNS Resolution Flow                        │
└──────────────────────────────────────────────────────────────┘

User App
   │
   │ 1. DNS Query (example.com)
   ├─────────────────────────────────────────┐
   │                                         │
   ▼                                         ▼
┌─────────────┐                    ┌─────────────┐
│   Local     │                    │  System DNS │
│ DNS Cache   │                    │   (OS)      │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 2. Cache Miss                    │
       ▼                                  │
┌──────────────────┐                      │
│ ankrshield DNS   │◄─────────────────────┘
│    Resolver      │
└────────┬─────────┘
         │
         │ 3. Check Blocklist
         ├──────────────────────────┐
         │                          │
         ▼                          ▼
    ┌────────┐               ┌────────┐
    │ Blocked│               │Allowed │
    │  List  │               │  List  │
    └────┬───┘               └───┬────┘
         │                       │
         │ 4a. BLOCKED           │ 4b. ALLOWED
         │ Return 0.0.0.0        │
         │                       ▼
         │              ┌──────────────┐
         │              │  Upstream    │
         │              │DNS (DoH/DoT) │
         │              │              │
         │              │ - Cloudflare │
         │              │ - Google     │
         │              │ - Quad9      │
         │              └──────┬───────┘
         │                     │
         │                     │ 5. Resolve
         │                     ▼
         │              ┌──────────────┐
         │              │ Authoritative│
         │              │   Nameserver │
         │              └──────┬───────┘
         │                     │
         │                     │ 6. IP Address
         │◄────────────────────┘
         │
         │ 7. Log Event
         ▼
┌──────────────────┐
│  Event Database  │
│  (TimescaleDB)   │
└──────────────────┘
```

**DNS Resolver Implementation:**

```typescript
// packages/dns-resolver/src/resolver.ts

import { DNSOverHTTPS } from './doh';
import { BlocklistManager } from './blocklist';
import { CacheManager } from './cache';

export class DNSResolver {
  private doh: DNSOverHTTPS;
  private blocklist: BlocklistManager;
  private cache: CacheManager;

  async resolve(domain: string, userId: string): Promise<ResolveResult> {
    // 1. Check cache
    const cached = await this.cache.get(domain);
    if (cached) {
      return { ...cached, cached: true };
    }

    // 2. Check blocklist
    const blockStatus = await this.blocklist.check(domain, userId);
    if (blockStatus.blocked) {
      await this.logEvent({
        domain,
        action: 'BLOCKED',
        reason: blockStatus.reason,
        userId,
      });

      return {
        domain,
        ip: '0.0.0.0',
        blocked: true,
        reason: blockStatus.reason,
      };
    }

    // 3. Resolve via DoH
    const result = await this.doh.resolve(domain);

    // 4. Cache result
    await this.cache.set(domain, result, result.ttl);

    // 5. Log event
    await this.logEvent({
      domain,
      ip: result.ip,
      action: 'ALLOWED',
      userId,
    });

    return result;
  }
}
```

### 6.2 VPN Architecture (WireGuard)

**VPN Tunnel Setup:**

```typescript
// packages/network-monitor/src/vpn.ts

import { spawn } from 'child_process';
import { generateKeyPair } from './crypto';

export class VPNManager {
  async setupTunnel(userId: string, deviceId: string): Promise<VPNConfig> {
    // 1. Generate key pair
    const { privateKey, publicKey } = await generateKeyPair();

    // 2. Request server config
    const serverConfig = await this.api.requestVPNConfig({
      userId,
      deviceId,
      publicKey,
    });

    // 3. Create WireGuard config
    const config = `
[Interface]
PrivateKey = ${privateKey}
Address = ${serverConfig.clientIP}/32
DNS = ${serverConfig.dnsServer}

[Peer]
PublicKey = ${serverConfig.serverPublicKey}
Endpoint = ${serverConfig.endpoint}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;

    // 4. Apply configuration
    await this.applyConfig(config);

    return {
      publicKey,
      clientIP: serverConfig.clientIP,
      endpoint: serverConfig.endpoint,
    };
  }

  private async applyConfig(config: string): Promise<void> {
    // Platform-specific WireGuard setup
    if (process.platform === 'win32') {
      await this.setupWindows(config);
    } else if (process.platform === 'darwin') {
      await this.setupMacOS(config);
    } else {
      await this.setupLinux(config);
    }
  }
}
```

### 6.3 Network Monitoring Architecture

```typescript
// packages/network-monitor/src/monitor.ts

import { EventEmitter } from 'events';
import { PacketCapture } from './pcap';
import { FlowAnalyzer } from './flow-analyzer';

export class NetworkMonitor extends EventEmitter {
  private pcap: PacketCapture;
  private analyzer: FlowAnalyzer;
  private running: boolean = false;

  async start(): Promise<void> {
    this.running = true;

    // Start packet capture
    this.pcap.on('packet', async (packet) => {
      try {
        // Parse packet
        const flow = await this.analyzer.analyze(packet);

        // Classify traffic
        const classification = await this.classify(flow);

        // Emit event
        this.emit('flow', {
          ...flow,
          ...classification,
        });

        // Store in database
        await this.storeEvent(flow, classification);
      } catch (err) {
        console.error('Packet analysis error:', err);
      }
    });

    await this.pcap.start();
  }

  private async classify(flow: NetworkFlow): Promise<Classification> {
    // 1. DNS-based classification
    if (flow.domain) {
      const tracker = await db.tracker.findUnique({
        where: { domain: flow.domain },
      });

      if (tracker) {
        return {
          category: tracker.category,
          vendor: tracker.vendor,
          riskScore: tracker.riskScore,
        };
      }
    }

    // 2. IP-based classification
    if (flow.destIP) {
      const geoIP = await this.geoIPLookup(flow.destIP);
      return {
        category: 'UNKNOWN',
        country: geoIP.country,
        riskScore: this.calculateRiskScore(geoIP),
      };
    }

    // 3. Protocol-based classification
    return {
      category: 'UNKNOWN',
      riskScore: 50,
    };
  }
}
```

---

## 7. AI/ML Architecture

### 7.1 AI Agent Monitoring

```typescript
// packages/ai-governance/src/agent-monitor.ts

import { FileSystemWatcher } from './fs-watcher';
import { ProcessMonitor } from './process-monitor';
import { NetworkMonitor } from '@ankrshield/network-monitor';

export class AIAgentMonitor {
  private fsWatcher: FileSystemWatcher;
  private processMonitor: ProcessMonitor;
  private networkMonitor: NetworkMonitor;

  // Known AI agents and their process signatures
  private readonly AI_SIGNATURES = {
    chatgpt: {
      processes: ['ChatGPT', 'OpenAI'],
      domains: ['chat.openai.com', 'api.openai.com'],
      ports: [443],
    },
    copilot: {
      processes: ['github-copilot', 'copilot-agent'],
      domains: ['copilot.github.com', 'api.github.com'],
      ports: [443],
    },
    claude: {
      processes: ['Claude'],
      domains: ['claude.ai', 'anthropic.com'],
      ports: [443],
    },
  };

  async start(): Promise<void> {
    // 1. Monitor file system access
    this.fsWatcher.on('access', async (event) => {
      const agent = await this.identifyAgent(event.process);
      if (agent) {
        await this.logAIActivity({
          agentId: agent.id,
          type: 'FILE_READ',
          filePath: event.path,
          timestamp: new Date(),
        });

        // Check against policies
        const violated = await this.checkPolicies(agent, event);
        if (violated) {
          await this.blockAccess(event);
          await this.alertUser(agent, event);
        }
      }
    });

    // 2. Monitor network activity
    this.networkMonitor.on('flow', async (flow) => {
      const agent = await this.identifyAgentByNetwork(flow);
      if (agent) {
        await this.logAIActivity({
          agentId: agent.id,
          type: 'NETWORK_REQUEST',
          domain: flow.domain,
          dataSize: flow.bytesUp,
          timestamp: new Date(),
        });
      }
    });

    // 3. Monitor process spawning
    this.processMonitor.on('spawn', async (process) => {
      const isAI = await this.isAIProcess(process);
      if (isAI) {
        await this.registerAgent(process);
      }
    });
  }

  private async identifyAgent(processName: string): Promise<AIAgent | null> {
    for (const [name, sig] of Object.entries(this.AI_SIGNATURES)) {
      if (sig.processes.some((p) => processName.includes(p))) {
        return await db.aiAgent.findFirst({
          where: {
            type: name.toUpperCase() as AIAgentType,
          },
        });
      }
    }
    return null;
  }

  private async checkPolicies(agent: AIAgent, event: FileAccessEvent): Promise<boolean> {
    const policies = await db.aiAgentPolicy.findMany({
      where: { agentId: agent.id },
      include: { policy: true },
    });

    for (const { policy } of policies) {
      const rules = policy.rules as PolicyRules;

      // Check file path restrictions
      if (rules.denyFilePaths) {
        for (const pattern of rules.denyFilePaths) {
          if (this.matchesPattern(event.path, pattern)) {
            return true; // Policy violated
          }
        }
      }

      // Check file size limits
      if (rules.maxFileSize && event.size > rules.maxFileSize) {
        return true;
      }
    }

    return false; // No violation
  }
}
```

### 7.2 Privacy Intelligence Engine

```typescript
// packages/privacy-engine/src/intelligence.ts

import { PrismaClient } from '@prisma/client';
import { TensorFlow } from '@tensorflow/tfjs-node';

export class PrivacyIntelligence {
  private db: PrismaClient;
  private model: TensorFlow.LayersModel;

  /**
   * Calculate privacy score for a user/device
   */
  async calculatePrivacyScore(userId: string, deviceId?: string): Promise<PrivacyScore> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Network metrics
    const networkMetrics = await this.getNetworkMetrics(userId, deviceId, weekAgo, now);
    const networkScore = this.scoreNetwork(networkMetrics);

    // 2. DNS metrics
    const dnsMetrics = await this.getDNSMetrics(userId, deviceId, weekAgo, now);
    const dnsScore = this.scoreDNS(dnsMetrics);

    // 3. App behavior metrics
    const appMetrics = await this.getAppMetrics(userId, deviceId, weekAgo, now);
    const appScore = this.scoreApps(appMetrics);

    // 4. AI agent metrics
    const aiMetrics = await this.getAIMetrics(userId, deviceId, weekAgo, now);
    const aiScore = this.scoreAI(aiMetrics);

    // 5. Calculate overall score (weighted average)
    const score = Math.round(networkScore * 0.3 + dnsScore * 0.3 + appScore * 0.2 + aiScore * 0.2);

    // 6. Store score
    const privacyScore = await this.db.privacyScore.create({
      data: {
        userId,
        deviceId,
        score,
        networkScore,
        dnsScore,
        appScore,
        aiScore,
        trackersBlocked: dnsMetrics.blockCount,
        dataTransferSaved: dnsMetrics.bytesSaved,
      },
    });

    return privacyScore;
  }

  private async getNetworkMetrics(
    userId: string,
    deviceId: string | undefined,
    from: Date,
    to: Date
  ) {
    const events = await this.db.networkEvent.findMany({
      where: {
        device: { userId },
        deviceId,
        timestamp: { gte: from, lte: to },
      },
    });

    return {
      totalEvents: events.length,
      uniqueDomains: new Set(events.map((e) => e.domain)).size,
      trackerEvents: events.filter((e) => e.category !== 'CDN' && e.category !== 'PAYMENT').length,
      blockCount: events.filter((e) => e.blocked).length,
      bytesSaved: events
        .filter((e) => e.blocked)
        .reduce((sum, e) => sum + BigInt(e.bytesDown), BigInt(0)),
    };
  }

  private scoreNetwork(metrics: NetworkMetrics): number {
    // Higher block rate = higher score
    const blockRate = metrics.blockCount / metrics.totalEvents;

    // Lower unique tracker domains = higher score
    const trackerRate = metrics.trackerEvents / metrics.totalEvents;

    return Math.round((blockRate * 0.6 + (1 - trackerRate) * 0.4) * 100);
  }

  /**
   * Detect anomalies using ML
   */
  async detectAnomalies(userId: string): Promise<Anomaly[]> {
    // 1. Get recent activity
    const events = await this.db.networkEvent.findMany({
      where: {
        device: { userId },
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    // 2. Extract features
    const features = this.extractFeatures(events);

    // 3. Run through anomaly detection model
    const predictions = await this.model.predict(features);

    // 4. Identify anomalies
    const anomalies: Anomaly[] = [];
    predictions.forEach((score, idx) => {
      if (score > 0.8) {
        // Threshold for anomaly
        anomalies.push({
          event: events[idx],
          anomalyScore: score,
          reason: this.explainAnomaly(events[idx], features[idx]),
        });
      }
    });

    return anomalies;
  }

  private extractFeatures(events: NetworkEvent[]): number[][] {
    return events.map((event) => [
      event.bytesUp,
      event.bytesDown,
      event.category === 'MALWARE' ? 1 : 0,
      event.blocked ? 1 : 0,
      // ... more features
    ]);
  }
}
```

### 7.3 Tracker Classification (ML)

```typescript
// packages/privacy-engine/src/classifier.ts

import * as tf from '@tensorflow/tfjs-node';
import { PrismaClient } from '@prisma/client';

export class TrackerClassifier {
  private model: tf.LayersModel;
  private db: PrismaClient;

  async classifyDomain(domain: string): Promise<Classification> {
    // 1. Check database first
    const existing = await this.db.tracker.findUnique({
      where: { domain },
    });

    if (existing) {
      return {
        category: existing.category,
        vendor: existing.vendor,
        riskScore: existing.riskScore,
        confidence: 1.0,
      };
    }

    // 2. Extract features from domain
    const features = this.extractDomainFeatures(domain);

    // 3. Classify using ML model
    const tensor = tf.tensor2d([features]);
    const prediction = (await this.model.predict(tensor)) as tf.Tensor;
    const scores = await prediction.data();

    // 4. Get top prediction
    const maxIdx = scores.indexOf(Math.max(...scores));
    const category = this.idxToCategory(maxIdx);
    const confidence = scores[maxIdx];

    // 5. Lookup vendor (WHOIS, ownership database)
    const vendor = await this.lookupVendor(domain);

    // 6. Calculate risk score
    const riskScore = this.calculateRiskScore(category, vendor, features);

    // 7. Store in database (if confidence high)
    if (confidence > 0.8) {
      await this.db.tracker.create({
        data: {
          domain,
          category,
          vendor,
          riskScore,
        },
      });
    }

    return { category, vendor, riskScore, confidence };
  }

  private extractDomainFeatures(domain: string): number[] {
    return [
      domain.length,
      domain.split('.').length, // subdomain count
      domain.includes('analytics') ? 1 : 0,
      domain.includes('ads') || domain.includes('ad') ? 1 : 0,
      domain.includes('tracker') || domain.includes('track') ? 1 : 0,
      domain.includes('facebook') || domain.includes('fb') ? 1 : 0,
      domain.includes('google') ? 1 : 0,
      // ... more features
    ];
  }

  private calculateRiskScore(
    category: TrackerCategory,
    vendor: string,
    features: number[]
  ): number {
    let score = 50; // Base score

    // Category risk
    const categoryRisk: Record<TrackerCategory, number> = {
      ADVERTISING: 70,
      ANALYTICS: 50,
      SOCIAL_MEDIA: 60,
      TELEMETRY: 65,
      MALWARE: 100,
      CDN: 10,
      PAYMENT: 20,
      MAPS: 30,
      VIDEO: 30,
      UNKNOWN: 50,
    };
    score = categoryRisk[category];

    // Vendor risk (known bad actors)
    if (this.isKnownBadActor(vendor)) {
      score += 20;
    }

    // Feature-based adjustments
    if (features[2] === 1) score += 10; // has 'analytics'
    if (features[3] === 1) score += 15; // has 'ads'

    return Math.min(100, Math.max(1, score));
  }
}
```

---

## 8. Infrastructure & DevOps

### 8.1 Docker Setup

**API Dockerfile:**

```dockerfile
# docker/Dockerfile.api

FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN pnpm --filter @ankrshield/api prisma generate

# Build
RUN pnpm --filter @ankrshield/api build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built app
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Start server
CMD ["node", "apps/api/dist/main.js"]
```

**Web Dockerfile:**

```dockerfile
# docker/Dockerfile.web

FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm --filter @ankrshield/web build

# Production image (nginx)
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config
COPY docker/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Docker Compose:**

```yaml
# docker-compose.yml

version: '3.9'

services:
  # PostgreSQL with TimescaleDB & pgvector
  postgres:
    image: timescale/timescaledb-ha:pg15-latest
    environment:
      POSTGRES_DB: ankrshield
      POSTGRES_USER: ankrshield
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ankrshield']
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5

  # API Server
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    environment:
      DATABASE_URL: postgresql://ankrshield:${DB_PASSWORD}@postgres:5432/ankrshield
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
    ports:
      - '4000:4000'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4000/health']
      interval: 30s
      timeout: 3s
      retries: 3

  # Web Dashboard
  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - '3000:80'
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
```

### 8.2 Kubernetes Deployment

**API Deployment:**

```yaml
# k8s/api/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: ankrshield-api
  labels:
    app: ankrshield-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ankrshield-api
  template:
    metadata:
      labels:
        app: ankrshield-api
    spec:
      containers:
        - name: api
          image: ankrshield/api:latest
          ports:
            - containerPort: 4000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ankrshield-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                configMapKeyRef:
                  name: ankrshield-config
                  key: redis-url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: ankrshield-secrets
                  key: jwt-secret
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
```

**Service & Ingress:**

```yaml
# k8s/api/service.yaml

apiVersion: v1
kind: Service
metadata:
  name: ankrshield-api
spec:
  selector:
    app: ankrshield-api
  ports:
    - protocol: TCP
      port: 80
      targetPort: 4000
  type: ClusterIP

---
# k8s/api/ingress.yaml

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ankrshield-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: '100'
spec:
  tls:
    - hosts:
        - api.ankrshield.com
      secretName: ankrshield-tls
  rules:
    - host: api.ankrshield.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ankrshield-api
                port:
                  number: 80
```

### 8.3 CI/CD Pipeline

**GitHub Actions:**

```yaml
# .github/workflows/ci-cd.yml

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: timescale/timescaledb-ha:pg15-latest
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Prisma migrations
        run: pnpm --filter @ankrshield/api prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

      - name: Run tests
        run: pnpm test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379

      - name: Run linting
        run: pnpm lint

      - name: Build
        run: pnpm build

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  deploy:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Build and push Docker images
        run: |
          docker build -f docker/Dockerfile.api -t ankrshield/api:${{ github.sha }} .
          docker build -f docker/Dockerfile.web -t ankrshield/web:${{ github.sha }} .
          docker push ankrshield/api:${{ github.sha }}
          docker push ankrshield/web:${{ github.sha }}
        env:
          DOCKER_USERNAME: ${{ secrets.DOCKER_USERNAME }}
          DOCKER_PASSWORD: ${{ secrets.DOCKER_PASSWORD }}

      - name: Deploy to Kubernetes
        uses: azure/k8s-deploy@v1
        with:
          manifests: |
            k8s/api/deployment.yaml
            k8s/web/deployment.yaml
          images: |
            ankrshield/api:${{ github.sha }}
            ankrshield/web:${{ github.sha }}
          kubeconfig: ${{ secrets.KUBE_CONFIG }}
```

---

## 9. API Design

### 9.1 GraphQL Schema (Pothos)

```typescript
// apps/api/src/graphql/schema/index.ts

import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import ValidationPlugin from '@pothos/plugin-validation';
import { PrismaClient } from '@prisma/client';
import type PrismaTypes from '@pothos/plugin-prisma/generated';

const prisma = new PrismaClient();

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: {
    prisma: PrismaClient;
    user: { id: string; email: string; tier: string } | null;
  };
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
    BigInt: {
      Input: bigint;
      Output: bigint;
    };
  };
}>({
  plugins: [PrismaPlugin, ValidationPlugin],
  prisma: {
    client: prisma,
  },
});

// DateTime scalar
builder.scalarType('DateTime', {
  serialize: (date) => date.toISOString(),
  parseValue: (value) => new Date(value as string),
});

// BigInt scalar
builder.scalarType('BigInt', {
  serialize: (value) => value.toString(),
  parseValue: (value) => BigInt(value as string),
});

export const schema = builder.toSchema();
```

**User Schema:**

```typescript
// apps/api/src/graphql/schema/user.ts

import { builder } from './index';

builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    tier: t.exposeString('tier'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    devices: t.relation('devices'),
    policies: t.relation('policies'),
    alerts: t.relation('alerts'),
    privacyScore: t.field({
      type: PrivacyScoreType,
      resolve: async (user, args, ctx) => {
        return await ctx.prisma.privacyScore.findFirst({
          where: { userId: user.id },
          orderBy: { calculatedAt: 'desc' },
        });
      },
    }),
  }),
});

const PrivacyScoreType = builder.prismaObject('PrivacyScore', {
  fields: (t) => ({
    id: t.exposeID('id'),
    score: t.exposeInt('score'),
    networkScore: t.exposeInt('networkScore'),
    dnsScore: t.exposeInt('dnsScore'),
    appScore: t.exposeInt('appScore'),
    aiScore: t.exposeInt('aiScore'),
    trackersBlocked: t.exposeInt('trackersBlocked'),
    dataTransferSaved: t.expose('dataTransferSaved', { type: 'BigInt' }),
    calculatedAt: t.expose('calculatedAt', { type: 'DateTime' }),
  }),
});

// Queries
builder.queryField('me', (t) =>
  t.prismaField({
    type: 'User',
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) {
        throw new Error('Not authenticated');
      }

      return await ctx.prisma.user.findUniqueOrThrow({
        ...query,
        where: { id: ctx.user.id },
      });
    },
  })
);

// Mutations
builder.mutationField('updateProfile', (t) =>
  t.prismaField({
    type: 'User',
    args: {
      name: t.arg.string({ required: false }),
    },
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) {
        throw new Error('Not authenticated');
      }

      return await ctx.prisma.user.update({
        ...query,
        where: { id: ctx.user.id },
        data: { name: args.name },
      });
    },
  })
);
```

**Device Schema:**

```typescript
// apps/api/src/graphql/schema/device.ts

import { builder } from './index';

builder.prismaObject('Device', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    type: t.exposeString('type'),
    os: t.exposeString('os'),
    osVersion: t.exposeString('osVersion'),
    status: t.exposeString('status'),
    lastSeenAt: t.expose('lastSeenAt', { type: 'DateTime' }),
    vpnEnabled: t.exposeBoolean('vpnEnabled'),
    dnsEnabled: t.exposeBoolean('dnsEnabled'),
    events: t.relation('events', {
      args: {
        limit: t.arg.int({ defaultValue: 100 }),
        offset: t.arg.int({ defaultValue: 0 }),
      },
      query: (args) => ({
        take: args.limit,
        skip: args.offset,
        orderBy: { timestamp: 'desc' },
      }),
    }),
    aiAgents: t.relation('aiAgents'),
  }),
});

// Queries
builder.queryField('devices', (t) =>
  t.prismaField({
    type: ['Device'],
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) {
        throw new Error('Not authenticated');
      }

      return await ctx.prisma.device.findMany({
        ...query,
        where: { userId: ctx.user.id },
      });
    },
  })
);

// Mutations
builder.mutationField('registerDevice', (t) =>
  t.prismaField({
    type: 'Device',
    args: {
      name: t.arg.string({ required: true }),
      type: t.arg.string({ required: true }),
      os: t.arg.string({ required: true }),
      osVersion: t.arg.string({ required: true }),
      appVersion: t.arg.string({ required: true }),
    },
    resolve: async (query, root, args, ctx) => {
      if (!ctx.user) {
        throw new Error('Not authenticated');
      }

      return await ctx.prisma.device.create({
        ...query,
        data: {
          userId: ctx.user.id,
          name: args.name,
          type: args.type as any,
          os: args.os,
          osVersion: args.osVersion,
          appVersion: args.appVersion,
        },
      });
    },
  })
);
```

### 9.2 WebSocket Subscriptions

```typescript
// apps/api/src/graphql/schema/subscriptions.ts

import { builder } from './index';
import { pubsub } from '../pubsub';

// Network event subscription
builder.subscriptionField('networkEvents', (t) =>
  t.field({
    type: NetworkEventType,
    args: {
      deviceId: t.arg.string({ required: true }),
    },
    subscribe: (root, args, ctx) => {
      if (!ctx.user) {
        throw new Error('Not authenticated');
      }

      // Verify user owns device
      const device = await ctx.prisma.device.findFirst({
        where: {
          id: args.deviceId,
          userId: ctx.user.id,
        },
      });

      if (!device) {
        throw new Error('Device not found');
      }

      return pubsub.subscribe(`networkEvent:${args.deviceId}`);
    },
    resolve: (payload) => payload,
  })
);

// Privacy score update subscription
builder.subscriptionField('privacyScoreUpdated', (t) =>
  t.field({
    type: PrivacyScoreType,
    subscribe: (root, args, ctx) => {
      if (!ctx.user) {
        throw new Error('Not authenticated');
      }

      return pubsub.subscribe(`privacyScore:${ctx.user.id}`);
    },
    resolve: (payload) => payload,
  })
);

// AI agent alert subscription
builder.subscriptionField('aiAgentAlerts', (t) =>
  t.field({
    type: AIActivityType,
    args: {
      deviceId: t.arg.string({ required: true }),
    },
    subscribe: (root, args, ctx) => {
      if (!ctx.user) {
        throw new Error('Not authenticated');
      }

      return pubsub.subscribe(`aiAlert:${args.deviceId}`);
    },
    resolve: (payload) => payload,
  })
);
```

---

This technical architecture document continues with sections on Performance & Scalability, Monitoring & Observability, and more. Due to length constraints, I'll continue with the remaining documents. Would you like me to proceed with creating all the remaining documents (Deep Dive on AI Agent Governance, Implementation Plan, MVP Architecture, Competitive Analysis, Go-to-Market Strategy, Pitch Deck, and comprehensive Todo)?
