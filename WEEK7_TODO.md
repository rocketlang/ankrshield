# Week 7-8: Network Monitoring - TODO

**Target Dates**: January 23-29, 2026 (accelerated from Mar 5-19)
**Status**: 🚀 READY TO START (0/25 tasks)
**Dependencies**: Week 5-6 ✅ (DNS Resolver complete)
**Last Updated**: January 22, 2026 - 18:00

## 📋 Overview

Week 7-8 focuses on building the network monitoring layer that captures and analyzes all network traffic on the device. This integrates with the DNS resolver to provide complete visibility into network activity, tracker detection, and privacy analysis.

## 🎯 Goals

1. **Platform-Specific Packet Capture** - Monitor network traffic on Windows, macOS, and Linux
2. **Traffic Classification** - Identify protocols, apps, and domains
3. **SNI Extraction** - Extract domains from TLS handshakes
4. **App Attribution** - Link network flows to specific applications
5. **DNS Integration** - Correlate network flows with DNS resolutions
6. **Efficient Storage** - Store network events in TimescaleDB

## 📝 TODO List (25 Tasks)

### Phase 1: Package Setup (3 tasks)

- [ ] **Task 1**: Create network-monitor package structure
  - Create `packages/network-monitor` directory
  - Setup package.json with dependencies
  - Create tsconfig.json
  - Add to workspace
  - Setup cross-platform build configuration

- [ ] **Task 2**: Define network event data models
  - NetworkFlow interface
  - NetworkPacket interface
  - TrafficStats interface
  - Integration with Prisma NetworkEvent model

- [ ] **Task 3**: Create NetworkMonitor base class
  - Start/stop monitoring methods
  - Event emitter for flows
  - Error handling
  - Platform detection
  - Abstract capture interface

### Phase 2: Platform-Specific Implementations (9 tasks)

#### macOS Implementation (3 tasks)

- [ ] **Task 4**: macOS Network Extension setup
  - Research Network Extension framework
  - Create system extension target (if needed)
  - Implement packet tunnel provider
  - Handle entitlements and code signing
  - Test on macOS 12+

- [ ] **Task 5**: macOS packet capture
  - Capture inbound/outbound packets
  - Filter by protocol (TCP, UDP, ICMP)
  - Extract IP addresses and ports
  - Handle IPv4 and IPv6

- [ ] **Task 6**: macOS app attribution
  - Map process ID to app bundle ID
  - Get app name and path
  - Handle system processes
  - Cache app info for performance

#### Windows Implementation (3 tasks)

- [ ] **Task 7**: Windows WinDivert integration
  - Install WinDivert library
  - Setup WinDivert driver
  - Load native bindings (node-ffi-napi or N-API)
  - Handle admin privileges requirement

- [ ] **Task 8**: Windows packet capture
  - Capture using WinDivert
  - Parse packet headers (IP, TCP, UDP)
  - Extract connection tuples (src/dst IP:port)
  - Handle fragmented packets

- [ ] **Task 9**: Windows app attribution
  - Use Windows API to get process info
  - Map socket to process ID
  - Get executable name and path
  - Handle UWP apps

#### Linux Implementation (3 tasks)

- [ ] **Task 10**: Linux packet capture with libpcap
  - Install libpcap library
  - Use node-libpcap bindings
  - Setup packet filters (BPF)
  - Capture on all interfaces
  - Handle root permissions

- [ ] **Task 11**: Alternative: Linux eBPF implementation
  - Research eBPF for packet capture
  - Create eBPF program (C)
  - Load eBPF with bpftool
  - Read events from perf buffer
  - (Advanced: Optional for power users)

- [ ] **Task 12**: Linux app attribution
  - Read /proc/net/tcp and /proc/net/udp
  - Map inode to process ID
  - Get process name from /proc/[pid]/cmdline
  - Handle namespaces and containers

### Phase 3: Traffic Classification (5 tasks)

- [ ] **Task 13**: Protocol detection
  - Identify HTTP (port 80, headers)
  - Identify HTTPS/TLS (port 443, handshake)
  - Identify DNS (port 53, query format)
  - Identify QUIC (UDP port 443)
  - Identify WebRTC (STUN/TURN)
  - Unknown protocols → generic TCP/UDP

- [ ] **Task 14**: SNI extraction from TLS
  - Parse TLS ClientHello message
  - Extract Server Name Indication (SNI)
  - Handle encrypted SNI (ESNI/ECH)
  - Extract ALPN protocols
  - Cache parsed connections

- [ ] **Task 15**: HTTP/HTTPS URL extraction
  - Parse HTTP Host header
  - Extract request path and query string
  - Identify HTTP methods (GET, POST, etc.)
  - Track referer and user-agent
  - Handle HTTP/2 and HTTP/3

- [ ] **Task 16**: IP geolocation lookup
  - Integrate MaxMind GeoIP2 or ip-api.com
  - Cache IP → country/city lookups
  - Store geolocation in NetworkEvent
  - Update on IP change

- [ ] **Task 17**: Traffic statistics aggregation
  - Track bytes sent/received per flow
  - Calculate bandwidth per app
  - Track connection duration
  - Identify long-lived connections
  - Detect unusual traffic patterns

### Phase 4: Integration with DNS Resolver (4 tasks)

- [ ] **Task 18**: Link flows to DNS resolutions
  - Match destination IP to resolved IP
  - Correlate by timestamp (within 5 min window)
  - Handle multiple IPs per domain (CDN)
  - Store domain in NetworkEvent

- [ ] **Task 19**: Enrich flows with tracker info
  - Query Tracker table by domain
  - Add tracker category
  - Add vendor attribution
  - Calculate privacy risk score
  - Mark as blocked if on blocklist

- [ ] **Task 20**: Create unified event stream
  - Merge DNS events + network flows
  - Deduplicate events
  - Order by timestamp
  - Emit via EventEmitter
  - Publish to GraphQL subscriptions

- [ ] **Task 21**: Privacy score calculation
  - Count tracker connections per app
  - Weight by tracker category (ads=high, CDN=low)
  - Normalize to 0-100 score
  - Update PrivacyScore table
  - Trigger alerts on score drop

### Phase 5: Performance & Optimization (2 tasks)

- [ ] **Task 22**: Optimize packet processing
  - Use worker threads for heavy parsing
  - Implement ring buffer for packets
  - Batch database inserts (100-500 events)
  - Async I/O for disk writes
  - Memory pooling for packet buffers

- [ ] **Task 23**: Resource monitoring
  - Track CPU usage (target <5%)
  - Track memory usage (target <100 MB)
  - Monitor packet drop rate
  - Alert on high resource usage
  - Implement backpressure handling

### Phase 6: Testing (2 tasks)

- [ ] **Task 24**: Platform-specific tests
  - Test on Windows 10/11
  - Test on macOS 12+ (Monterey, Ventura, Sonoma)
  - Test on Ubuntu 22.04 LTS
  - Test on Fedora (optional)
  - Verify all platforms detect common apps (Chrome, Firefox, Slack)

- [ ] **Task 25**: Load testing
  - Simulate 1,000+ flows/min
  - Test with concurrent apps (10+)
  - Verify no packet drops
  - Check memory doesn't leak
  - Benchmark CPU usage

## 📊 Success Criteria

By the end of Week 7-8, you should have:

1. ✅ **Network Monitoring Working**
   - Captures packets on Windows/macOS/Linux
   - No packet drops under normal load
   - <5% CPU usage
   - <100 MB memory usage

2. ✅ **Traffic Classification**
   - Identifies HTTP, HTTPS, DNS, QUIC
   - Extracts SNI from TLS
   - Attributes traffic to apps
   - Stores in TimescaleDB

3. ✅ **DNS Integration**
   - Links flows to DNS resolutions
   - Enriches with tracker info
   - Calculates privacy scores
   - Real-time event stream

4. ✅ **Production Ready**
   - Tested on all three platforms
   - Handles high traffic load
   - Error recovery implemented
   - Documentation complete

## 🔧 Technology Stack

### Platform-Specific

- **macOS**: Network Extension framework (NEPacketTunnelProvider)
- **Windows**: WinDivert (packet capture driver)
- **Linux**: libpcap (packet capture library) or eBPF (advanced)

### Node.js Packages

- **node-libpcap** - libpcap bindings for Node.js
- **node-ffi-napi** - Call native libraries (WinDivert)
- **ref-napi** - C data structures in Node.js
- **pcap-parser** - Parse PCAP format

### Existing

- **Prisma** - Database ORM
- **Bull** - Job queue for batch processing
- **ioredis** - Redis client
- **@ankrshield/dns-resolver** - DNS integration

### Optional

- **maxmind/geoip2-node** - IP geolocation
- **node-abort-controller** - Cancellation support

## 📁 Directory Structure

```
packages/network-monitor/
├── src/
│   ├── monitor/
│   │   ├── base-monitor.ts        # Abstract base class
│   │   ├── macos-monitor.ts       # macOS implementation
│   │   ├── windows-monitor.ts     # Windows implementation
│   │   └── linux-monitor.ts       # Linux implementation
│   ├── capture/
│   │   ├── packet-parser.ts       # Parse packet headers
│   │   ├── tls-parser.ts          # Extract SNI from TLS
│   │   └── http-parser.ts         # Parse HTTP requests
│   ├── classification/
│   │   ├── protocol-detector.ts   # Identify protocols
│   │   ├── app-resolver.ts        # Get app name from PID
│   │   └── geo-lookup.ts          # IP geolocation
│   ├── integration/
│   │   ├── dns-correlator.ts      # Link flows to DNS
│   │   ├── tracker-enricher.ts    # Add tracker info
│   │   └── privacy-scorer.ts      # Calculate scores
│   ├── storage/
│   │   ├── event-logger.ts        # Log to database
│   │   └── batch-processor.ts     # Batch inserts
│   └── index.ts                   # Exports
├── native/
│   ├── macos/                     # macOS native code (Swift/Obj-C)
│   ├── windows/                   # Windows DLL bindings
│   └── linux/                     # Linux .so bindings
├── tests/
│   ├── monitor.test.ts
│   ├── classification.test.ts
│   └── integration.test.ts
├── scripts/
│   ├── test-capture.ts            # Test packet capture
│   └── benchmark.ts               # Performance tests
├── package.json
└── tsconfig.json
```

## 🚀 Getting Started

### Prerequisites

**macOS:**

```bash
# No additional dependencies
# May need to enable System Extension
```

**Windows:**

```bash
# Download WinDivert 2.2+
# Run as Administrator
```

**Linux:**

```bash
# Install libpcap
sudo apt-get install libpcap-dev  # Ubuntu/Debian
sudo dnf install libpcap-devel    # Fedora

# Or install eBPF tools (advanced)
sudo apt-get install linux-tools-common bpftool
```

### Task 1: Create package structure

```bash
# Create package
mkdir -p packages/network-monitor/src/{monitor,capture,classification,integration,storage}
mkdir -p packages/network-monitor/{native,tests,scripts}

# Initialize
cd packages/network-monitor
pnpm init

# Install dependencies (cross-platform)
pnpm add @prisma/client bull ioredis
pnpm add -D @types/node typescript vitest

# Platform-specific (install as needed)
pnpm add node-libpcap      # Linux
pnpm add ffi-napi ref-napi # Windows (for WinDivert)
```

## 📚 Resources

### Packet Capture

- [libpcap Documentation](https://www.tcpdump.org/manpages/pcap.3pcap.html)
- [WinDivert (Windows)](https://reqrypt.org/windivert.html)
- [macOS Network Extension](https://developer.apple.com/documentation/networkextension)
- [eBPF Tutorial](https://ebpf.io/what-is-ebpf/)

### Protocol Specs

- [TLS 1.3 RFC 8446](https://datatracker.ietf.org/doc/html/rfc8446) (SNI extraction)
- [HTTP/2 RFC 7540](https://datatracker.ietf.org/doc/html/rfc7540)
- [QUIC RFC 9000](https://datatracker.ietf.org/doc/html/rfc9000)

### Tools

- [Wireshark](https://www.wireshark.org/) - Network analysis
- [tcpdump](https://www.tcpdump.org/) - Packet capture
- [Procmon (Windows)](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon)

## 💡 Implementation Notes

### Cross-Platform Strategy

Use factory pattern to load platform-specific monitor:

```typescript
// src/monitor/factory.ts
export function createNetworkMonitor(): BaseNetworkMonitor {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return new MacOSMonitor();
    case 'win32':
      return new WindowsMonitor();
    case 'linux':
      return new LinuxMonitor();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
```

### SNI Extraction

TLS ClientHello structure:

```
Handshake Type: 0x01 (Client Hello)
→ Extensions
  → Extension Type: 0x0000 (server_name)
    → Server Name: example.com
```

Parse with:

```typescript
function extractSNI(packet: Buffer): string | null {
  // Check if TLS ClientHello (byte 0 = 0x16, byte 5 = 0x01)
  if (packet[0] !== 0x16 || packet[5] !== 0x01) return null;

  // Parse extensions...
  // Find SNI extension (0x0000)
  // Extract domain name
}
```

### App Attribution Challenges

**macOS**: Use `lsof` or BSD syscalls

```bash
lsof -i TCP:443 -n -P | grep ESTABLISHED
```

**Windows**: Use `netstat` or Windows API

```bash
netstat -ano | findstr ESTABLISHED
```

**Linux**: Read `/proc/net/tcp`

```bash
cat /proc/net/tcp | awk '{print $2 " " $10}'
```

### Performance Targets

| Metric            | Target      | Notes                  |
| ----------------- | ----------- | ---------------------- |
| CPU usage         | <5%         | During normal browsing |
| Memory usage      | <100 MB     | Stable, no leaks       |
| Packet processing | >10,000/sec | With classification    |
| Database inserts  | >500/sec    | Batched                |
| Latency added     | <1ms        | To network requests    |

## 🐛 Known Challenges

1. **Permissions**
   - macOS: Requires System Extension approval
   - Windows: Requires Administrator
   - Linux: Requires root or CAP_NET_RAW
   - Solution: Detect permissions, guide user

2. **Encrypted Traffic**
   - SNI in ESNI/ECH is encrypted
   - Cannot see HTTP/2+ payloads
   - Solution: Best-effort SNI extraction, fallback to IP

3. **Performance**
   - High-bandwidth scenarios (4K streaming, downloads)
   - Solution: Sampling, rate limiting

4. **App Attribution**
   - Some apps use multiple processes
   - System processes hard to identify
   - Solution: Heuristics, maintain app DB

## ⏱️ Estimated Time

- **Phase 1**: 2-3 hours (Package setup)
- **Phase 2**: 12-16 hours (Platform implementations)
  - macOS: 4-5 hours
  - Windows: 4-5 hours
  - Linux: 4-6 hours
- **Phase 3**: 6-8 hours (Traffic classification)
- **Phase 4**: 4-6 hours (DNS integration)
- **Phase 5**: 2-3 hours (Performance)
- **Phase 6**: 3-4 hours (Testing)

**Total**: 29-40 hours (4-5 days)

## 🔗 Integration with DNS Resolver

```typescript
import { DNSResolver } from '@ankrshield/dns-resolver';
import { NetworkMonitor } from '@ankrshield/network-monitor';

// Create instances
const dnsResolver = new DNSResolver({
  /* config */
});
const networkMonitor = createNetworkMonitor();

await dnsResolver.initialize();

// Listen to network flows
networkMonitor.on('flow', async (flow) => {
  // Check if DNS resolution exists
  const dnsRecord = await dnsResolver.findByIP(flow.destinationIP);

  if (dnsRecord) {
    flow.domain = dnsRecord.domain;
    flow.blocked = dnsRecord.blocked;
  }

  // Enrich with tracker info
  if (flow.domain) {
    const tracker = await prisma.tracker.findUnique({
      where: { domain: flow.domain },
    });

    if (tracker) {
      flow.trackerCategory = tracker.category;
      flow.trackerVendor = tracker.vendor;
      flow.threatLevel = tracker.threatLevel;
    }
  }

  // Log to database
  await logNetworkEvent(flow);
});

// Start monitoring
await networkMonitor.start();
```

---

**Let's build the network monitor!** 🚀

**Jai Guru Ji** 🙏
