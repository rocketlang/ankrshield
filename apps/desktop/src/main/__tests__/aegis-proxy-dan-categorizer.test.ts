// SPDX-License-Identifier: AGPL-3.0-only
// Tests for ASD-T-016 DAN tool-category classifier.

import { describe, it, expect } from 'vitest';

import {
  categorizeTool,
  categorizeHighRiskTools,
  extractToolDeclarations,
  HIGH_CATEGORIES,
} from '../aegis-proxy/dan-categorizer.js';

describe('ASD-T-016 — categorizeTool', () => {
  it('classifies bash/shell variants as shell_exec', () => {
    for (const name of [
      'bash',
      'shell',
      'exec',
      'execute',
      'run_command',
      'run_shell',
      'subprocess',
      'spawn_process',
      'terminal',
      'powershell',
      'cmd',
    ]) {
      const c = categorizeTool({ name });
      expect(c.category, `tool=${name}`).toBe('shell_exec');
    }
  });

  it('classifies file-write tools', () => {
    for (const name of [
      'write_file',
      'create_file',
      'edit_file',
      'append_file',
      'overwrite_file',
      'fs_write',
      'delete_file',
      'unlink',
      'mkdir',
      'chmod',
    ]) {
      expect(categorizeTool({ name }).category).toBe('file_write_outside_project_dir');
    }
  });

  it('classifies network egress tools', () => {
    for (const name of [
      'fetch',
      'fetch_url',
      'http_get_request',
      'curl',
      'wget',
      'web_request',
      'web_fetch',
      'web_scrape',
      'open_url',
      'send_webhook',
      'tcp_connect',
    ]) {
      expect(categorizeTool({ name }).category).toBe('network_egress_to_non_allowlisted_host');
    }
  });

  it('classifies payment tools', () => {
    for (const name of [
      'stripe_charge',
      'paypal_send',
      'razorpay_payout',
      'charge_card',
      'create_payment',
      'create_charge',
      'send_money',
      'initiate_transaction',
    ]) {
      expect(categorizeTool({ name }).category).toBe('payment_api_call');
    }
  });

  it('classifies database DDL tools', () => {
    for (const name of [
      'execute_sql',
      'run_query',
      'sql_exec',
      'db_query',
      'database_migrate',
      'migrate',
      'create_table',
      'drop_table',
      'alter_schema',
    ]) {
      expect(categorizeTool({ name }).category).toBe('database_ddl');
    }
  });

  it('falls through to low for unknown tools', () => {
    for (const name of ['get_weather', 'lookup_contact', 'translate', 'foo_bar']) {
      expect(categorizeTool({ name }).category).toBe('low');
    }
  });

  it('description-only match still classifies (shell_exec)', () => {
    const c = categorizeTool({
      name: 'unknown_runner',
      description: 'Used to execute shell commands the user requests.',
    });
    expect(c.category).toBe('shell_exec');
    expect(c.matchedBy).toMatch(/^desc:/);
  });

  it('description-only match still classifies (database_ddl)', () => {
    const c = categorizeTool({
      name: 'mystery_tool',
      description: 'Drop a table from the database when instructed.',
    });
    expect(c.category).toBe('database_ddl');
  });

  it('case-insensitive on tool name', () => {
    expect(categorizeTool({ name: 'BASH' }).category).toBe('shell_exec');
    expect(categorizeTool({ name: 'Write_File' }).category).toBe('file_write_outside_project_dir');
  });

  it('HIGH_CATEGORIES set excludes "low"', () => {
    expect(HIGH_CATEGORIES.has('low' as 'shell_exec')).toBe(false);
    expect(HIGH_CATEGORIES.size).toBe(5);
  });

  it('matchedBy is populated and informative', () => {
    const c = categorizeTool({ name: 'bash' });
    expect(c.matchedBy).toMatch(/^name:/);
  });
});

describe('ASD-T-016 — categorizeHighRiskTools', () => {
  it('returns only HIGH entries', () => {
    const result = categorizeHighRiskTools([
      { name: 'bash' },
      { name: 'get_weather' },
      { name: 'write_file' },
      { name: 'translate' },
    ]);
    expect(result.map((r) => r.name)).toEqual(['bash', 'write_file']);
  });

  it('empty input → empty output', () => {
    expect(categorizeHighRiskTools([])).toEqual([]);
  });

  it('all-low input → empty output', () => {
    expect(categorizeHighRiskTools([{ name: 'foo' }, { name: 'bar' }])).toEqual([]);
  });
});

describe('ASD-T-016 — extractToolDeclarations', () => {
  it('parses Anthropic shape (name + description + input_schema)', () => {
    const body = {
      model: 'claude-opus-4-7',
      messages: [],
      tools: [
        { name: 'bash', description: 'Run shell command', input_schema: {} },
        { name: 'read_file', description: 'Read file contents' },
      ],
    };
    const out = extractToolDeclarations(body);
    expect(out).toEqual([
      { name: 'bash', description: 'Run shell command' },
      { name: 'read_file', description: 'Read file contents' },
    ]);
  });

  it('parses OpenAI shape ({type: function, function: {name, description}})', () => {
    const body = {
      model: 'gpt-4',
      messages: [],
      tools: [
        {
          type: 'function',
          function: { name: 'execute_sql', description: 'Run a SQL statement', parameters: {} },
        },
        {
          type: 'function',
          function: { name: 'lookup', description: 'Look stuff up' },
        },
      ],
    };
    const out = extractToolDeclarations(body);
    expect(out).toEqual([
      { name: 'execute_sql', description: 'Run a SQL statement' },
      { name: 'lookup', description: 'Look stuff up' },
    ]);
  });

  it('returns [] for non-object / missing / malformed tools', () => {
    expect(extractToolDeclarations(null)).toEqual([]);
    expect(extractToolDeclarations(undefined)).toEqual([]);
    expect(extractToolDeclarations('string')).toEqual([]);
    expect(extractToolDeclarations({})).toEqual([]);
    expect(extractToolDeclarations({ tools: 'not an array' })).toEqual([]);
    expect(extractToolDeclarations({ tools: [] })).toEqual([]);
    expect(extractToolDeclarations({ tools: [null, 'string', 42] })).toEqual([]);
  });

  it('skips tool entries without a name', () => {
    const body = {
      tools: [
        { description: 'no name' },
        { name: 'good_tool' },
        { type: 'function', function: { description: 'no name in fn' } },
      ],
    };
    expect(extractToolDeclarations(body)).toEqual([{ name: 'good_tool' }]);
  });

  it('mixed Anthropic + OpenAI shapes in same request (defensive)', () => {
    const body = {
      tools: [{ name: 'anthro_tool' }, { type: 'function', function: { name: 'openai_tool' } }],
    };
    const out = extractToolDeclarations(body);
    expect(out.map((t) => t.name)).toEqual(['anthro_tool', 'openai_tool']);
  });
});
