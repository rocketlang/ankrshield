#!/usr/bin/env tsx
/**
 * Test Network Capture
 * Simple test script to verify network monitoring works
 */

import { createNetworkMonitor, getPlatformInfo } from '../src/monitor/factory';
import { NetworkFlow, NetworkPacket } from '../src/types';

async function testCapture() {
  console.log('=== Network Monitor Test ===\n');

  // Show platform info
  const platformInfo = getPlatformInfo();
  console.log('Platform Information:');
  console.log(`  Platform: ${platformInfo.platform}`);
  console.log(`  Supported: ${platformInfo.isSupported ? 'Yes' : 'No'}`);
  console.log(`  Requires Root: ${platformInfo.requiresRoot ? 'Yes' : 'No'}`);
  console.log(`  Capture Method: ${platformInfo.captureMethod}`);
  console.log('');

  // Create monitor
  const monitor = createNetworkMonitor({
    excludeLocalhost: true,
    enableAppAttribution: true,
    enableSNIExtraction: true,
  });

  console.log('Starting network monitor...\n');

  // Event handlers
  let packetCount = 0;
  let flowCount = 0;

  monitor.on('packet', (packet: NetworkPacket) => {
    packetCount++;

    if (packetCount <= 10) {
      // Show first 10 packets
      console.log(`[Packet #${packetCount}]`);
      console.log(`  ${packet.sourceIp}:${packet.sourcePort} -> ${packet.destinationIp}:${packet.destinationPort}`);
      console.log(`  Protocol: ${packet.protocol}`);
      console.log(`  Direction: ${packet.direction}`);
      console.log(`  Length: ${packet.length} bytes`);
      console.log('');
    }
  });

  monitor.on('flow', (flow: NetworkFlow) => {
    flowCount++;

    if (flowCount <= 5) {
      // Show first 5 flows
      console.log(`[Flow #${flowCount}] ${flow.flowId}`);
      console.log(`  ${flow.sourceIp}:${flow.sourcePort} -> ${flow.destinationIp}:${flow.destinationPort}`);
      console.log(`  Protocol: ${flow.protocol}`);
      console.log(`  State: ${flow.state}`);
      console.log(`  Domain: ${flow.domain || 'N/A'}`);
      console.log(`  App: ${flow.app?.name || 'Unknown'}`);
      console.log(`  Bytes In/Out: ${flow.bytesIn} / ${flow.bytesOut}`);
      console.log('');
    }
  });

  monitor.on('error', (error: Error) => {
    console.error('[Error]', error.message);
  });

  monitor.on('started', () => {
    console.log('✓ Monitor started successfully\n');
  });

  monitor.on('stopped', () => {
    console.log('\n✓ Monitor stopped');
  });

  // Start monitoring
  try {
    await monitor.start();

    // Run for 30 seconds
    console.log('Capturing traffic for 30 seconds...\n');
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Stop monitoring
    await monitor.stop();

    // Show statistics
    const stats = monitor.getStats();
    console.log('\n=== Statistics ===');
    console.log(`Total Packets: ${packetCount}`);
    console.log(`Total Flows: ${flowCount}`);
    console.log(`Active Flows: ${stats.activeFlows}`);
    console.log(`Total Bytes In: ${stats.totalBytesIn.toLocaleString()}`);
    console.log(`Total Bytes Out: ${stats.totalBytesOut.toLocaleString()}`);
    console.log('\nFlows by Protocol:');
    for (const [protocol, count] of Object.entries(stats.flowsByProtocol)) {
      console.log(`  ${protocol}: ${count}`);
    }

    console.log('\n✓ Test complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', (error as Error).message);
    console.error('\nTroubleshooting:');

    if (platformInfo.requiresRoot) {
      console.error('  - Try running with sudo (Linux) or as Administrator (Windows)');
    }

    if (platformInfo.platform === 'linux') {
      console.error('  - Ensure libpcap is installed: sudo apt-get install libpcap-dev');
      console.error('  - Ensure node-libpcap is installed: npm install node-libpcap');
    }

    if (platformInfo.platform === 'win32') {
      console.error('  - Ensure WinDivert is installed from https://reqrypt.org/windivert.html');
    }

    if (platformInfo.platform === 'darwin') {
      console.error('  - Grant Full Disk Access in System Preferences');
    }

    process.exit(1);
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCapture().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testCapture };
