// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-006 per-app identifier.

import { describe, it, expect } from 'vitest';

import {
  normaliseAppId,
  parseLinuxSsOutput,
  parseMacLsofOutput,
  parseWindowsNetstatForPid,
  parseWindowsTasklistOutput,
  type AppIdentity,
} from '../aegis-proxy/app-identifier.js';

const FALLBACK: AppIdentity = { appId: 'unknown:54321', pid: null, executable: null };

describe('ASD-T-006 — normaliseAppId', () => {
  it.each([
    ['claude', 'claude-desktop'],
    ['Claude', 'claude-desktop'],
    ['cursor', 'cursor'],
    ['Cursor', 'cursor'],
    ['code', 'vscode'],
    ['Code Helper', 'vscode'],
    ['windsurf', 'windsurf'],
    ['aider', 'aider'],
    ['curl', 'curl'],
    ['python3', 'python'],
    ['node', 'node'],
    ['some-unknown-binary', 'some-unknown-binary'],
  ])('normaliseAppId(%s) → %s', (executable, expected) => {
    expect(normaliseAppId(executable)).toBe(expected);
  });
});

describe('ASD-T-006 — parseLinuxSsOutput', () => {
  it('extracts pid + executable from typical ss line', () => {
    const stdout =
      'ESTAB  0  0   127.0.0.1:4857   127.0.0.1:54321   users:(("cursor",pid=12345,fd=42))\n';
    const result = parseLinuxSsOutput(stdout, 54321, FALLBACK);
    expect(result.executable).toBe('cursor');
    expect(result.pid).toBe(12345);
    expect(result.appId).toBe('cursor');
  });

  it('extracts claude → claude-desktop', () => {
    const stdout =
      'ESTAB  0  0   127.0.0.1:4857   127.0.0.1:54321   users:(("claude",pid=999,fd=12))\n';
    const result = parseLinuxSsOutput(stdout, 54321, FALLBACK);
    expect(result.appId).toBe('claude-desktop');
    expect(result.pid).toBe(999);
  });

  it('returns fallback on no match', () => {
    const result = parseLinuxSsOutput('', 54321, FALLBACK);
    expect(result).toBe(FALLBACK);
  });

  it('returns fallback on garbage input', () => {
    const result = parseLinuxSsOutput('nothing here', 54321, FALLBACK);
    expect(result).toBe(FALLBACK);
  });

  it('handles multi-process line by taking first match', () => {
    const stdout =
      'ESTAB 0 0 127.0.0.1:4857 127.0.0.1:54321 users:(("cursor",pid=1,fd=2),("zsh",pid=3,fd=4))\n';
    const result = parseLinuxSsOutput(stdout, 54321, FALLBACK);
    expect(result.executable).toBe('cursor');
    expect(result.pid).toBe(1);
  });
});

describe('ASD-T-006 — parseMacLsofOutput', () => {
  it('extracts pid + command from lsof -F pcn output', () => {
    const stdout = 'p12345\ncCursor\nn127.0.0.1:54321->127.0.0.1:4857\n';
    const result = parseMacLsofOutput(stdout, FALLBACK);
    expect(result.pid).toBe(12345);
    expect(result.executable).toBe('Cursor');
    expect(result.appId).toBe('cursor');
  });

  it('returns fallback when no command line present', () => {
    const stdout = 'p12345\nn127.0.0.1:54321->127.0.0.1:4857\n';
    const result = parseMacLsofOutput(stdout, FALLBACK);
    expect(result).toBe(FALLBACK);
  });
});

describe('ASD-T-006 — parseWindowsNetstatForPid', () => {
  it('extracts PID from netstat line matching both addresses', () => {
    const stdout =
      '  TCP    127.0.0.1:54321    127.0.0.1:4857    ESTABLISHED       12345\n' +
      '  TCP    127.0.0.1:99999    127.0.0.1:8080    ESTABLISHED       777\n';
    const pid = parseWindowsNetstatForPid(stdout, 54321, 4857);
    expect(pid).toBe(12345);
  });

  it('returns null when no matching line', () => {
    expect(parseWindowsNetstatForPid('  TCP 0.0.0.0:80 ... 0\n', 54321, 4857)).toBeNull();
  });
});

describe('ASD-T-006 — parseWindowsTasklistOutput', () => {
  it('extracts image name from CSV row + strips .exe', () => {
    const stdout = '"cursor.exe","12345","Console","1","123,456 K"\n';
    expect(parseWindowsTasklistOutput(stdout)).toBe('cursor');
  });

  it('handles non-.exe names without modification', () => {
    const stdout = '"python","12345","Console","1","123 K"\n';
    expect(parseWindowsTasklistOutput(stdout)).toBe('python');
  });

  it('returns null on empty output', () => {
    expect(parseWindowsTasklistOutput('')).toBeNull();
  });
});
