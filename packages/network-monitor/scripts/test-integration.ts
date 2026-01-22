#!/usr/bin/env tsx
/**
 * Test Network Privacy Monitor Integration
 * Demonstrates DNS correlation, tracker enrichment, and privacy scoring
 */

import { NetworkPrivacyMonitor } from '../src/integration/network-privacy-monitor';
import { NetworkFlow } from '../src/types';

async function testIntegration() {
  console.log('=== Network Privacy Monitor Integration Test ===\n');

  // Create integrated monitor
  const monitor = new NetworkPrivacyMonitor({
    excludeLocalhost: true,
    enableDNSCorrelation: true,
    enableTrackerEnrichment: true,
    enablePrivacyScoring: true,
  });

  console.log('Starting integrated network privacy monitor...\n');

  // Event handlers
  monitor.on('enrichedFlow', (flow: NetworkFlow) => {
    console.log(`[Enriched Flow]`);
    console.log(`  ${flow.sourceIp}:${flow.sourcePort} -> ${flow.destinationIp}:${flow.destinationPort}`);
    console.log(`  Protocol: ${flow.protocol}`);
    console.log(`  Domain: ${flow.domain || 'N/A'}`);
    console.log(`  App: ${flow.app?.name || 'Unknown'}`);

    if (flow.tracker) {
      console.log(`  Tracker: ${flow.tracker.isTracker ? 'Yes' : 'No'}`);
      if (flow.tracker.isTracker) {
        console.log(`    Category: ${flow.tracker.category || 'Unknown'}`);
        console.log(`    Vendor: ${flow.tracker.vendor || 'Unknown'}`);
        console.log(`    Blocked: ${flow.tracker.blocked ? 'Yes' : 'No'}`);
      }
    }

    if (flow.privacyRisk !== undefined) {
      const riskLevel =
        flow.privacyRisk <= 20
          ? 'Low'
          : flow.privacyRisk <= 50
            ? 'Medium'
            : flow.privacyRisk <= 80
              ? 'High'
              : 'Critical';
      console.log(`  Privacy Risk: ${flow.privacyRisk}/100 (${riskLevel})`);
    }

    console.log('');
  });

  monitor.on('trackerDetected', (flow: NetworkFlow) => {
    console.log(`[Tracker Detected] ${flow.domain} (${flow.tracker?.category})`);
  });

  monitor.on('blockedConnection', (flow: NetworkFlow) => {
    console.log(`[Blocked] ${flow.domain} - Connection blocked by DNS resolver`);
  });

  monitor.on('highRiskFlow', (flow: NetworkFlow) => {
    console.log(
      `[High Risk] ${flow.domain || flow.destinationIp} - Privacy Score: ${flow.privacyRisk}`
    );
  });

  monitor.on('error', (error: Error) => {
    console.error('[Error]', error.message);
  });

  // Simulate DNS resolutions (in production, these would come from DNS resolver)
  console.log('Adding simulated DNS resolutions...\n');

  // Safe domain
  monitor.addDNSResolution('anthropic.com', ['104.26.13.63'], 300, false);

  // Tracker domain (blocked)
  monitor.addDNSResolution('doubleclick.net', ['142.250.74.46'], 300, true);

  // Analytics tracker
  monitor.addDNSResolution('google-analytics.com', ['142.250.74.46'], 300, false);

  try {
    // Start monitoring
    await monitor.start();

    // Run for 60 seconds
    console.log('Monitoring network traffic for 60 seconds...\n');
    console.log('Try browsing the web to generate traffic!\n');

    // Show stats every 10 seconds
    const statsInterval = setInterval(() => {
      const stats = monitor.getPrivacyStats();

      console.log('\n=== Current Statistics ===');
      console.log(`Total Flows: ${stats.totalFlows}`);
      console.log(`Tracker Flows: ${stats.trackerFlows}`);
      console.log(`Blocked Flows: ${stats.blockedFlows}`);
      console.log(`High Risk Flows: ${stats.highRiskFlows}`);
      console.log(`Avg Privacy Score: ${stats.avgPrivacyScore}/100`);

      if (stats.topTrackers.length > 0) {
        console.log('\nTop Trackers:');
        stats.topTrackers.slice(0, 5).forEach((t) => {
          console.log(`  ${t.domain}: ${t.count} connections`);
        });
      }

      if (stats.topApps.length > 0) {
        console.log('\nTop Apps by Privacy Score:');
        stats.topApps.slice(0, 5).forEach((a) => {
          console.log(`  ${a.app}: ${Math.round(a.privacyScore)}/100`);
        });
      }

      console.log('');
    }, 10000);

    // Wait for 60 seconds
    await new Promise((resolve) => setTimeout(resolve, 60000));

    clearInterval(statsInterval);

    // Stop monitoring
    await monitor.stop();

    // Final report
    console.log('\n=== Final Privacy Report ===');
    const report = monitor.getPrivacyReport();

    console.log(`Overall Privacy Score: ${report.overallScore}/100`);
    console.log(`Risk Level: ${report.riskLevel.toUpperCase()}`);
    console.log(`Total Trackers: ${report.trackerCount}`);
    console.log(`Blocked Connections: ${report.blockedCount}`);
    console.log(`High Risk Flows: ${report.highRiskFlows}`);

    if (Object.keys(report.categoryBreakdown).length > 0) {
      console.log('\nTracker Categories:');
      Object.entries(report.categoryBreakdown).forEach(([category, count]) => {
        console.log(`  ${category}: ${count}`);
      });
    }

    if (report.topRiskyDomains.length > 0) {
      console.log('\nTop Risky Domains:');
      report.topRiskyDomains.forEach((d) => {
        console.log(`  ${d.domain}: ${d.score}/100`);
      });
    }

    console.log('\n✓ Integration test complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testIntegration().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testIntegration };
