#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('warrior')
  .description('xShield — Open-source threat intelligence platform')
  .version('1.0.0');

program
  .command('start')
  .description('Start the xShield API server (self-hosted)')
  .option('-p, --port <port>', 'Port to listen on', '4481')
  .option('--db <url>', 'PostgreSQL connection URL')
  .option('--no-banner', 'Skip the startup banner')
  .action(async (opts) => {
    const { startServer } = await import('./commands/start.js');
    await startServer(opts);
  });

program
  .command('scan <domain>')
  .description('Scan a domain and print risk report')
  .option('-k, --key <apiKey>', 'xShield API key')
  .option('--json', 'Output as JSON')
  .action(async (domain, opts) => {
    const { scanDomain } = await import('./commands/scan.js');
    await scanDomain(domain, opts);
  });

program
  .command('status')
  .description('Check if warrior server is running')
  .option('-p, --port <port>', 'Port to check', '4481')
  .action(async (opts) => {
    const { checkStatus } = await import('./commands/status.js');
    await checkStatus(opts);
  });

program
  .command('setup')
  .description('Interactive first-time setup wizard')
  .action(async () => {
    const { runSetup } = await import('./commands/setup.js');
    await runSetup();
  });

program.parse();
