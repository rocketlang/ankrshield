# Introduction to ankrshield

## What is ankrshield?

**ankrshield** is a comprehensive privacy and AI security platform that protects you from invisible trackers across all your devices. It combines network monitoring, DNS-level blocking, and behavioral analysis to give you complete control over your digital privacy.

### The Problem

Every day, hundreds of trackers monitor your online activity:
- **319 trackers** in an average living room with 8 devices
- **2,847 tracking attempts** per hour
- **67 companies** collecting your data
- **$47** estimated value of your data to advertisers

Most people have no idea this is happening.

### The Solution

ankrshield makes tracking visible and gives you the power to stop it:

✅ **Real-time Detection** - See every tracker as it tries to connect
✅ **Intelligent Blocking** - DNS-over-HTTPS with 230,000+ tracker database
✅ **Privacy Scoring** - Know how exposed you are (0-100 scale)
✅ **Cross-Device Protection** - Desktop, mobile, and network-wide
✅ **Family Friendly** - Protect up to 10 devices (Pro tier)
✅ **VPN Included** - Complete privacy with built-in VPN (Pro tier)

---

## Key Features

### 🛡️ Multi-Layer Protection

```
Layer 1: Network Monitoring
├─ Real-time packet analysis
├─ Platform-specific capture (libpcap/WFP/NEF)
└─ Traffic flow analysis

Layer 2: DNS Blocking
├─ DNS-over-HTTPS (DoH)
├─ 230,000+ tracker database
├─ Custom blocklists
└─ Redis-backed caching

Layer 3: Behavioral Analysis
├─ Privacy score calculation
├─ Trend detection
├─ Anomaly identification
└─ Risk assessment
```

### 📊 Privacy Scoring

Your privacy score is calculated across multiple dimensions:

- **Network Score (40%)** - Tracker connections, data volume
- **DNS Score (30%)** - Tracking domains, query patterns
- **App Score (20%)** - Application behavior, permissions
- **AI Score (10%)** - Future: ML-based risk detection

**Score Range:**
- 0-30: 🟢 Excellent (well protected)
- 31-60: 🟡 Good (minor concerns)
- 61-80: 🟠 Poor (significant tracking)
- 81-100: 🔴 Critical (severely compromised)

### 🎬 Demo Mode

Our unique **"The Whole Room is Tracked"** demo mode visualizes the invisible web of surveillance:

- 6 pre-built scenarios (Living Room, Gaming, Smart Home, etc.)
- Real-time animated tracker flows
- Before/After comparison (with vs without ankrshield)
- Export to video for social sharing

Perfect for:
- Sales presentations
- Privacy awareness talks
- Trade show booths
- User onboarding

---

## How It Works

### Desktop Application (Electron)

```
┌─────────────────────────────────────┐
│         Renderer Process            │
│         (React UI)                  │
├─────────────────────────────────────┤
│         IPC Communication           │
├─────────────────────────────────────┤
│         Main Process                │
│  ┌──────────────────────────────┐  │
│  │  Privacy Service             │  │
│  │  ├─ Score calculation        │  │
│  │  └─ Trend analysis           │  │
│  ├──────────────────────────────┤  │
│  │  DNS Service                 │  │
│  │  ├─ DoH resolution           │  │
│  │  └─ Blocklist matching       │  │
│  ├──────────────────────────────┤  │
│  │  Network Service             │  │
│  │  ├─ Packet capture           │  │
│  │  └─ Flow analysis            │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
            ↓         ↓         ↓
     PostgreSQL    Redis    Network
```

### Technology Stack

**Frontend:**
- React 18 (TypeScript)
- Vite (build tool)
- Recharts (visualizations)
- Zustand (state management)

**Backend:**
- Node.js 20+
- Electron 28 (desktop wrapper)
- Prisma (ORM)
- PostgreSQL + TimescaleDB (time-series data)
- Redis (caching)

**Mobile:**
- React Native 0.73
- TypeScript
- React Navigation

**Network:**
- libpcap (Linux/macOS)
- Windows Filtering Platform (Windows)
- DNS-over-HTTPS (Cloudflare, Google)

---

## Architecture Principles

### 1. **Privacy by Design**
- No cloud requirements for Free tier
- Local-first data storage
- End-to-end encryption (Pro tier)
- No telemetry without consent

### 2. **Open Core Model**
- Free tier is 100% open source (GPL v3)
- Commercial tiers add cloud sync, VPN, mobile apps
- Community can audit and contribute

### 3. **Performance First**
- <3s startup time
- <50ms DNS query latency
- <150MB memory footprint
- Minimal CPU impact (<5%)

### 4. **Graceful Degradation**
- Works offline (Free tier)
- Fallback to mock data if backends fail
- Progressive enhancement (feature detection)

---

## Use Cases

### 👨‍👩‍👧‍👦 Families
"Protect all family devices from trackers and inappropriate content"

- Parent dashboard to monitor kids' devices
- Age-appropriate content filtering
- Screen time insights
- Privacy education tools

### 💼 Remote Workers
"Secure your home office from corporate surveillance"

- VPN for public WiFi
- DNS blocking of work trackers
- Privacy score for professional reputation
- Activity logs for accountability

### 🏢 Small Businesses
"GDPR compliance without enterprise budgets"

- Employee privacy protection
- Visitor network monitoring
- Compliance reporting
- Audit logs

### 🎓 Educational Institutions
"Protect student privacy on campus networks"

- Network-wide deployment
- Student privacy compliance (FERPA)
- Research data protection
- Parental controls

### 🏥 Healthcare
"HIPAA-compliant privacy protection"

- PHI protection on devices
- Compliance audit logs
- Encrypted communications
- Third-party tracker blocking

---

## Comparison with Alternatives

| Feature | ankrshield | Little Snitch | Pi-hole | Ghostery |
|---------|-----------|---------------|---------|----------|
| **Platform** |
| Desktop (Win/Mac/Linux) | ✅ | ✅ Mac only | ❌ | ❌ |
| Mobile (iOS/Android) | ✅ Pro | ❌ | ❌ | ✅ |
| Network-wide | ✅ | ✅ | ✅ | ❌ |
| **Features** |
| DNS blocking | ✅ 230k | ❌ | ✅ | ✅ |
| Network monitoring | ✅ | ✅ | ✅ | ❌ |
| VPN included | ✅ Pro | ❌ | ❌ | ❌ |
| Privacy scoring | ✅ | ❌ | ❌ | ✅ |
| Demo mode | ✅ Unique! | ❌ | ❌ | ❌ |
| **Pricing** |
| Free tier | ✅ OSS | ❌ | ✅ | ✅ |
| Pro tier | $9.99/mo | $45 one-time | Free | Free |
| Enterprise | ✅ | ❌ | ❌ | ✅ |
| **Trust** |
| Open source | ✅ Free | ❌ | ✅ | Partial |
| Community audit | ✅ | ❌ | ✅ | ❌ |

**Unique Advantages:**
1. **All-in-one solution** (app + VPN + sync)
2. **Demo mode** for awareness
3. **Open core** for trust
4. **Family plan** (10 devices for $9.99)
5. **Privacy scoring** (gamification)

---

## Getting Started

Ready to protect your privacy?

1. **[Install ankrshield](./03-installation.md)** - Desktop app (Free tier)
2. **[Quick Start Guide](./02-quick-start.md)** - 5-minute setup
3. **[Try Demo Mode](./07-demo-mode.md)** - See what you're up against
4. **[Upgrade to Pro](./17-pricing.md)** - VPN + mobile + family

---

## Support & Community

- **Documentation:** You're reading it! 📚
- **Discord:** https://discord.gg/ankrshield
- **GitHub Issues:** https://github.com/ankrshield/ankrshield/issues
- **Email:** support@ankrshield.com
- **Twitter:** @ankrshield

---

## License

- **Free Tier:** GPL v3 (open source)
- **Pro Tier:** Commercial license
- **Enterprise:** Custom commercial license

See [LICENSE](../LICENSE) for details.

---

*Next: [Quick Start Guide →](./02-quick-start.md)*
