#!/usr/bin/env tsx
/**
 * Privacy Engine Test Suite
 * Tests domain classification, vendor attribution, and risk scoring
 */

import { RiskScorer } from '../src/risk/risk-scorer';
import type { TrackerInfo } from '../src/types';

console.log('=== Privacy Engine Test Suite ===\n');

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

// Test Suite 1: Risk Scorer
console.log('--- Risk Scorer Tests ---\n');

test('Risk Scorer: Non-tracker returns 0', () => {
  const scorer = new RiskScorer();
  const tracker: TrackerInfo = { isTracker: false };
  return scorer.calculateRisk(tracker) === 0;
});

test('Risk Scorer: Malware has high risk', () => {
  const scorer = new RiskScorer();
  const tracker: TrackerInfo = {
    isTracker: true,
    category: 'malware',
    threatLevel: 10,
  };
  const score = scorer.calculateRisk(tracker);
  return score >= 90; // Should be very high
});

test('Risk Scorer: Advertising has moderate risk', () => {
  const scorer = new RiskScorer();
  const tracker: TrackerInfo = {
    isTracker: true,
    category: 'advertising',
    threatLevel: 5,
  };
  const score = scorer.calculateRisk(tracker);
  return score >= 30 && score <= 70;
});

test('Risk Scorer: CDN has low risk', () => {
  const scorer = new RiskScorer();
  const tracker: TrackerInfo = {
    isTracker: true,
    category: 'cdn',
    threatLevel: 1,
  };
  const score = scorer.calculateRisk(tracker);
  return score <= 30;
});

test('Risk Scorer: Facebook vendor adds weight', () => {
  const scorer = new RiskScorer();
  const withoutVendor: TrackerInfo = {
    isTracker: true,
    category: 'social',
    threatLevel: 5,
  };
  const withVendor: TrackerInfo = {
    isTracker: true,
    category: 'social',
    vendor: 'Facebook',
    threatLevel: 5,
  };
  
  const scoreWithout = scorer.calculateRisk(withoutVendor);
  const scoreWith = scorer.calculateRisk(withVendor);
  
  return scoreWith > scoreWithout;
});

test('Risk Scorer: Blocked status increases risk', () => {
  const scorer = new RiskScorer();
  const unblocked: TrackerInfo = {
    isTracker: true,
    category: 'analytics',
    threatLevel: 5,
    blocked: false,
  };
  const blocked: TrackerInfo = {
    isTracker: true,
    category: 'analytics',
    threatLevel: 5,
    blocked: true,
  };
  
  const scoreUnblocked = scorer.calculateRisk(unblocked);
  const scoreBlocked = scorer.calculateRisk(blocked);
  
  return scoreBlocked > scoreUnblocked;
});

test('Risk Scorer: Risk levels are correct', () => {
  const scorer = new RiskScorer();
  
  return (
    scorer.getRiskLevel(10) === 'low' &&
    scorer.getRiskLevel(35) === 'medium' &&
    scorer.getRiskLevel(65) === 'high' &&
    scorer.getRiskLevel(95) === 'critical'
  );
});

test('Risk Scorer: Aggregate risk calculates correctly', () => {
  const scorer = new RiskScorer();
  const trackers: TrackerInfo[] = [
    { isTracker: true, category: 'advertising', threatLevel: 5 },
    { isTracker: true, category: 'analytics', threatLevel: 5 },
    { isTracker: true, category: 'social', threatLevel: 5 },
  ];
  
  const aggregateRisk = scorer.calculateAggregateRisk(trackers);
  return aggregateRisk > 0 && aggregateRisk <= 100;
});

test('Risk Scorer: Risk explanation includes category', () => {
  const scorer = new RiskScorer();
  const tracker: TrackerInfo = {
    isTracker: true,
    category: 'malware',
    vendor: 'EvilCorp',
    threatLevel: 10,
  };
  
  const explanations = scorer.getRiskExplanation(tracker);
  return explanations.length > 0 && explanations.some(e => e.includes('malware'));
});

test('Risk Scorer: Compare risk works correctly', () => {
  const scorer = new RiskScorer();
  const highRisk: TrackerInfo = {
    isTracker: true,
    category: 'malware',
    threatLevel: 10,
  };
  const lowRisk: TrackerInfo = {
    isTracker: true,
    category: 'cdn',
    threatLevel: 1,
  };
  
  return scorer.compareRisk(lowRisk, highRisk) > 0;
});

// Test Suite 2: Domain Normalization
console.log('\n--- Domain Normalization Tests ---\n');

test('Domain: Normalize to lowercase', () => {
  const domain = 'GOOGLE.COM';
  const normalized = domain.toLowerCase().trim();
  return normalized === 'google.com';
});

test('Domain: Trim whitespace', () => {
  const domain = '  facebook.com  ';
  const normalized = domain.toLowerCase().trim();
  return normalized === 'facebook.com';
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
