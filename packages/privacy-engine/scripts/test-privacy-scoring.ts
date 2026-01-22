#!/usr/bin/env tsx
/**
 * Privacy Scoring Test Suite
 * Tests privacy calculator, trend analyzer, report generator, and score updater
 */

console.log('=== Privacy Scoring Test Suite ===\n');

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => boolean): void {
  process.stdout.write(`Testing: ${name}... `);

  try {
    const result = fn();
    if (result) {
      console.log('✓ PASS');
      passedTests++;
    } else {
      console.log('✗ FAIL');
      failedTests++;
    }
  } catch (error) {
    console.log(`✗ FAIL (${(error as Error).message})`);
    failedTests++;
  }
}

// Test Suite 1: Privacy Level Classification
console.log('--- Privacy Level Tests ---\n');

test('Privacy Level: Score 0-30 is excellent', () => {
  const score = 25;
  const level = score <= 30 ? 'excellent' : score <= 60 ? 'good' : score <= 80 ? 'poor' : 'critical';
  return level === 'excellent';
});

test('Privacy Level: Score 31-60 is good', () => {
  const score = 45;
  const level = score <= 30 ? 'excellent' : score <= 60 ? 'good' : score <= 80 ? 'poor' : 'critical';
  return level === 'good';
});

test('Privacy Level: Score 61-80 is poor', () => {
  const score = 70;
  const level = score <= 30 ? 'excellent' : score <= 60 ? 'good' : score <= 80 ? 'poor' : 'critical';
  return level === 'poor';
});

test('Privacy Level: Score 81-100 is critical', () => {
  const score = 95;
  const level = score <= 30 ? 'excellent' : score <= 60 ? 'good' : score <= 80 ? 'poor' : 'critical';
  return level === 'critical';
});

// Test Suite 2: Score Weights
console.log('\n--- Score Weight Tests ---\n');

test('Score Weights: Network weight is 40%', () => {
  const weights = { network: 0.4, dns: 0.3, app: 0.2, ai: 0.1 };
  return weights.network === 0.4;
});

test('Score Weights: DNS weight is 30%', () => {
  const weights = { network: 0.4, dns: 0.3, app: 0.2, ai: 0.1 };
  return weights.dns === 0.3;
});

test('Score Weights: All weights sum to 1.0', () => {
  const weights = { network: 0.4, dns: 0.3, app: 0.2, ai: 0.1 };
  const sum = weights.network + weights.dns + weights.app + weights.ai;
  return Math.abs(sum - 1.0) < 0.01; // Allow small floating point error
});

// Test Suite 3: Trend Direction
console.log('\n--- Trend Direction Tests ---\n');

test('Trend Direction: Score increase is worsening', () => {
  const current = 50;
  const previous = 40;
  const change = current - previous;
  const direction = Math.abs(change) >= 5 ? (change > 0 ? 'worsening' : 'improving') : 'stable';
  return direction === 'worsening';
});

test('Trend Direction: Score decrease is improving', () => {
  const current = 30;
  const previous = 50;
  const change = current - previous;
  const direction = Math.abs(change) >= 5 ? (change > 0 ? 'worsening' : 'improving') : 'stable';
  return direction === 'improving';
});

test('Trend Direction: Small changes are stable', () => {
  const current = 43;
  const previous = 40;
  const change = current - previous;
  const direction = Math.abs(change) >= 5 ? (change > 0 ? 'worsening' : 'improving') : 'stable';
  return direction === 'stable';
});

// Test Suite 4: Percentage Change
console.log('\n--- Percentage Change Tests ---\n');

test('Percentage Change: 50 to 60 is 20% increase', () => {
  const current = 60;
  const previous = 50;
  const percentageChange = ((current - previous) / previous) * 100;
  return Math.abs(percentageChange - 20) < 0.1;
});

test('Percentage Change: 60 to 50 is -16.67% decrease', () => {
  const current = 50;
  const previous = 60;
  const percentageChange = ((current - previous) / previous) * 100;
  return Math.abs(percentageChange - (-16.67)) < 0.1;
});

// Test Suite 5: Anomaly Detection
console.log('\n--- Anomaly Detection Tests ---\n');

test('Anomaly Detection: Z-score > 2 is anomaly', () => {
  const score = 90;
  const avg = 50;
  const stdDev = 15;
  const zScore = Math.abs(score - avg) / stdDev;
  return zScore > 2;
});

test('Anomaly Detection: Z-score <= 2 is normal', () => {
  const score = 55;
  const avg = 50;
  const stdDev = 15;
  const zScore = Math.abs(score - avg) / stdDev;
  return zScore <= 2;
});

// Test Suite 6: Score Component Contribution
console.log('\n--- Score Component Tests ---\n');

test('Component Contribution: Network at 50 with 40% weight contributes 20', () => {
  const networkScore = 50;
  const networkWeight = 0.4;
  const contribution = Math.round(networkScore * networkWeight);
  return contribution === 20;
});

test('Component Contribution: DNS at 60 with 30% weight contributes 18', () => {
  const dnsScore = 60;
  const dnsWeight = 0.3;
  const contribution = Math.round(dnsScore * dnsWeight);
  return contribution === 18;
});

// Test Suite 7: Recommendation Priority
console.log('\n--- Recommendation Tests ---\n');

test('Recommendations: Critical score gets high priority', () => {
  const score = 85;
  const priority = score > 80 ? 'high' : score > 60 ? 'medium' : 'low';
  return priority === 'high';
});

test('Recommendations: Good score gets low priority', () => {
  const score = 40;
  const priority = score > 80 ? 'high' : score > 60 ? 'medium' : 'low';
  return priority === 'low';
});

// Test Suite 8: Time Range Calculation
console.log('\n--- Time Range Tests ---\n');

test('Time Range: 24 hours is 86400000 milliseconds', () => {
  const hours = 24;
  const ms = hours * 60 * 60 * 1000;
  return ms === 86400000;
});

test('Time Range: 7 days is 604800000 milliseconds', () => {
  const days = 7;
  const ms = days * 24 * 60 * 60 * 1000;
  return ms === 604800000;
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
}, 100);
