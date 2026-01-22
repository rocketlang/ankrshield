#!/usr/bin/env tsx
/**
 * Comprehensive Test Suite for Network Monitor
 * Tests all components of the network monitoring system
 */

import { HTTPParser } from '../src/capture/http-parser';
import { TLSParser } from '../src/capture/tls-parser';
import { DNSCorrelator } from '../src/integration/dns-correlator';
import { PrivacyScorer } from '../src/integration/privacy-scorer';
import { NetworkFlow, Protocol, Direction, ConnectionState } from '../src/types';

console.log('=== Network Monitor Test Suite ===\n');

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => boolean | Promise<boolean>): void {
  process.stdout.write(`Testing: ${name}... `);

  try {
    const result = fn();
    const isAsync = result instanceof Promise;

    if (isAsync) {
      result
        .then((passed) => {
          if (passed) {
            console.log('✓ PASS');
            passedTests++;
          } else {
            console.log('✗ FAIL');
            failedTests++;
          }
        })
        .catch((error) => {
          console.log(`✗ FAIL (${error.message})`);
          failedTests++;
        });
    } else {
      if (result) {
        console.log('✓ PASS');
        passedTests++;
      } else {
        console.log('✗ FAIL');
        failedTests++;
      }
    }
  } catch (error) {
    console.log(`✗ FAIL (${(error as Error).message})`);
    failedTests++;
  }
}

// Test Suite 1: HTTP Parser
console.log('--- HTTP Parser Tests ---\n');

test('HTTP Parser: Detects GET request', () => {
  const payload = Buffer.from('GET /api/users HTTP/1.1\r\nHost: example.com\r\n\r\n');
  return HTTPParser.isHTTPRequest(payload);
});

test('HTTP Parser: Detects POST request', () => {
  const payload = Buffer.from('POST /api/login HTTP/1.1\r\nHost: api.example.com\r\n\r\n');
  return HTTPParser.isHTTPRequest(payload);
});

test('HTTP Parser: Parses request headers', () => {
  const payload = Buffer.from(
    'GET /search?q=test HTTP/1.1\r\n' +
    'Host: www.google.com\r\n' +
    'User-Agent: Mozilla/5.0\r\n' +
    'Referer: https://www.google.com/\r\n' +
    '\r\n'
  );

  const httpInfo = HTTPParser.parseHTTPRequest(payload);
  return (
    httpInfo !== null &&
    httpInfo.method === 'GET' &&
    httpInfo.path === '/search' &&
    httpInfo.queryString === 'q=test' &&
    httpInfo.host === 'www.google.com' &&
    httpInfo.userAgent === 'Mozilla/5.0'
  );
});

test('HTTP Parser: Detects HTTP response', () => {
  const payload = Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n');
  return HTTPParser.isHTTPResponse(payload);
});

test('HTTP Parser: Parses response status code', () => {
  const payload = Buffer.from('HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\n\r\n');
  const httpInfo = HTTPParser.parseHTTPResponse(payload);
  return httpInfo !== null && httpInfo.statusCode === 404;
});

test('HTTP Parser: Detects tracking requests', () => {
  const httpInfo = { path: '/analytics/track', method: 'POST' };
  return HTTPParser.isTrackingRequest(httpInfo);
});

test('HTTP Parser: Extracts host header', () => {
  const payload = Buffer.from('GET / HTTP/1.1\r\nHost: anthropic.com\r\n\r\n');
  const host = HTTPParser.extractHostFromHTTP(payload);
  return host === 'anthropic.com';
});

// Test Suite 2: TLS Parser
console.log('\n--- TLS Parser Tests ---\n');

test('TLS Parser: Detects TLS ClientHello', () => {
  // Simplified TLS ClientHello packet (0x16 = Handshake, 0x01 = ClientHello)
  const payload = Buffer.from([
    0x16, 0x03, 0x01, // TLS Record: Handshake, TLS 1.0
    0x00, 0x10,       // Length
    0x01,             // Handshake Type: ClientHello
  ]);
  return TLSParser.isTLSHandshake(payload);
});

// Test Suite 3: DNS Correlator
console.log('\n--- DNS Correlator Tests ---\n');

test('DNS Correlator: Adds DNS resolution', () => {
  const correlator = new DNSCorrelator();
  correlator.addDNSResolution('example.com', ['93.184.216.34'], 300, false);

  const domain = correlator.findDomainForIP('93.184.216.34');
  return domain === 'example.com';
});

test('DNS Correlator: Finds multiple domains for IP', () => {
  const correlator = new DNSCorrelator();
  correlator.addDNSResolution('cdn1.example.com', ['1.2.3.4'], 300, false);
  correlator.addDNSResolution('cdn2.example.com', ['1.2.3.4'], 300, false);

  const domains = correlator.findAllDomainsForIP('1.2.3.4');
  return domains.length === 2;
});

test('DNS Correlator: Checks blocked status', () => {
  const correlator = new DNSCorrelator();
  correlator.addDNSResolution('tracker.com', ['5.6.7.8'], 300, true);

  return correlator.isDomainBlocked('tracker.com');
});

test('DNS Correlator: Correlates network flow', () => {
  const correlator = new DNSCorrelator();
  correlator.addDNSResolution('api.example.com', ['10.20.30.40'], 300, false);

  const flow: NetworkFlow = {
    flowId: 'test-flow',
    sourceIp: '192.168.1.100',
    sourcePort: 54321,
    destinationIp: '10.20.30.40',
    destinationPort: 443,
    protocol: Protocol.HTTPS,
    direction: Direction.OUTBOUND,
    startTime: new Date(),
    lastSeen: new Date(),
    state: ConnectionState.ESTABLISHED,
    bytesIn: 0,
    bytesOut: 0,
    packetsIn: 0,
    packetsOut: 0,
  };

  const enrichedFlow = correlator.correlateFlow(flow);
  return enrichedFlow.domain === 'api.example.com';
});

// Test Suite 4: Privacy Scorer
console.log('\n--- Privacy Scorer Tests ---\n');

test('Privacy Scorer: Calculates low risk score', () => {
  const scorer = new PrivacyScorer();

  const flow: NetworkFlow = {
    flowId: 'test-flow',
    sourceIp: '192.168.1.100',
    sourcePort: 54321,
    destinationIp: '104.26.13.63',
    destinationPort: 443,
    protocol: Protocol.HTTPS,
    direction: Direction.OUTBOUND,
    startTime: new Date(),
    lastSeen: new Date(),
    state: ConnectionState.ESTABLISHED,
    bytesIn: 1024,
    bytesOut: 512,
    packetsIn: 10,
    packetsOut: 5,
    domain: 'anthropic.com',
    tracker: { isTracker: false },
  };

  const score = scorer.calculateScore(flow);
  return score >= 0 && score <= 20; // Low risk
});

test('Privacy Scorer: Calculates high risk for tracker', () => {
  const scorer = new PrivacyScorer();

  const flow: NetworkFlow = {
    flowId: 'test-flow',
    sourceIp: '192.168.1.100',
    sourcePort: 54321,
    destinationIp: '142.250.74.46',
    destinationPort: 443,
    protocol: Protocol.HTTPS,
    direction: Direction.OUTBOUND,
    startTime: new Date(),
    lastSeen: new Date(),
    state: ConnectionState.ESTABLISHED,
    bytesIn: 1024,
    bytesOut: 5120, // Large outbound
    packetsIn: 10,
    packetsOut: 50,
    domain: 'doubleclick.net',
    tracker: {
      isTracker: true,
      category: 'advertising',
      threatLevel: 8,
      blocked: false,
    },
  };

  const score = scorer.calculateScore(flow);
  return score > 50; // High risk
});

test('Privacy Scorer: HTTP is riskier than HTTPS', () => {
  const scorer = new PrivacyScorer();

  const httpFlow: NetworkFlow = {
    flowId: 'http-flow',
    sourceIp: '192.168.1.100',
    sourcePort: 54321,
    destinationIp: '93.184.216.34',
    destinationPort: 80,
    protocol: Protocol.HTTP,
    direction: Direction.OUTBOUND,
    startTime: new Date(),
    lastSeen: new Date(),
    state: ConnectionState.ESTABLISHED,
    bytesIn: 1024,
    bytesOut: 512,
    packetsIn: 10,
    packetsOut: 5,
  };

  const httpsFlow: NetworkFlow = {
    ...httpFlow,
    flowId: 'https-flow',
    destinationPort: 443,
    protocol: Protocol.HTTPS,
  };

  const httpScore = scorer.calculateScore(httpFlow);
  const httpsScore = scorer.calculateScore(httpsFlow);

  return httpScore > httpsScore;
});

test('Privacy Scorer: Blocked connection increases risk', () => {
  const scorer = new PrivacyScorer();

  const unblockedFlow: NetworkFlow = {
    flowId: 'unblocked',
    sourceIp: '192.168.1.100',
    sourcePort: 54321,
    destinationIp: '1.2.3.4',
    destinationPort: 443,
    protocol: Protocol.HTTPS,
    direction: Direction.OUTBOUND,
    startTime: new Date(),
    lastSeen: new Date(),
    state: ConnectionState.ESTABLISHED,
    bytesIn: 1024,
    bytesOut: 512,
    packetsIn: 10,
    packetsOut: 5,
    tracker: { isTracker: true, category: 'analytics', blocked: false },
  };

  const blockedFlow: NetworkFlow = {
    ...unblockedFlow,
    flowId: 'blocked',
    tracker: { isTracker: true, category: 'analytics', blocked: true },
  };

  const unblockedScore = scorer.calculateScore(unblockedFlow);
  const blockedScore = scorer.calculateScore(blockedFlow);

  return blockedScore > unblockedScore;
});

test('Privacy Scorer: Gets correct risk level', () => {
  const scorer = new PrivacyScorer();

  return (
    scorer.getRiskLevel(10) === 'low' &&
    scorer.getRiskLevel(35) === 'medium' &&
    scorer.getRiskLevel(65) === 'high' &&
    scorer.getRiskLevel(95) === 'critical'
  );
});

// Summary
setTimeout(() => {
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Total: ${passedTests + failedTests}`);
  console.log(`Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n✗ ${failedTests} test(s) failed`);
    process.exit(1);
  }
}, 1000); // Wait for async tests
