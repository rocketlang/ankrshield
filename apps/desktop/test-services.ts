/**
 * Test script to verify backend services work
 */

import { PrivacyService } from './src/main/services/privacy.js';
import { DNSService } from './src/main/services/dns.js';
import { NetworkService } from './src/main/services/network.js';

async function testServices() {
  console.log('🧪 Testing ankrshield backend services...\n');

  // Test Privacy Service
  console.log('1️⃣ Testing Privacy Service...');
  try {
    const privacyService = new PrivacyService();
    const score = await privacyService.getCurrentScore();
    console.log('✅ Privacy Service working!');
    console.log('   Privacy Score:', score.totalScore);
    console.log('   Level:', score.level);
    console.log('   Network Score:', score.networkScore);
    console.log('   DNS Score:', score.dnsScore);
    console.log('   App Score:', score.appScore);
    await privacyService.close();
  } catch (error) {
    console.log('❌ Privacy Service error:', error.message);
  }

  console.log('\n2️⃣ Testing DNS Service...');
  try {
    const dnsService = new DNSService();
    const stats = await dnsService.getStats();
    console.log('✅ DNS Service working!');
    console.log('   Total Queries:', stats.totalQueries);
    console.log('   Blocked Queries:', stats.blockedQueries);
    console.log('   Cache Hits:', stats.cacheHits);
    await dnsService.close();
  } catch (error) {
    console.log('❌ DNS Service error:', error.message);
  }

  console.log('\n3️⃣ Testing Network Service...');
  try {
    const networkService = new NetworkService();
    const stats = await networkService.getStats();
    console.log('✅ Network Service working!');
    console.log('   Total Connections:', stats.totalConnections);
    console.log('   Blocked Connections:', stats.blockedConnections);
    console.log('   Protection Enabled:', stats.protectionEnabled);
    await networkService.close();
  } catch (error) {
    console.log('❌ Network Service error:', error.message);
  }

  console.log('\n✨ Service tests complete!\n');
}

// Run tests
testServices().catch(console.error);
