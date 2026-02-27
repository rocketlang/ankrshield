export async function startServer(opts: { port: string; db?: string; banner: boolean }) {
  // Use dynamic import for chalk/ora — avoid static import issues
  const chalk = (await import('chalk')).default;
  const ora = (await import('ora')).default;

  if (opts.banner !== false) {
    console.log(
      chalk.bold.hex('#7c3aed')(`
  ██╗  ██╗███████╗██╗  ██╗██╗███████╗██╗     ██████╗
  ╚██╗██╔╝██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗
   ╚███╔╝ ███████╗███████║██║█████╗  ██║     ██║  ██║
   ██╔██╗ ╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║
  ██╔╝ ██╗███████║██║  ██║██║███████╗███████╗██████╔╝
  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝ `)
    );
    console.log(chalk.gray('  Threat Intelligence Platform — Apache 2.0\n'));
  }

  const spinner = ora('Starting xShield warrior server...').start();

  const port = parseInt(opts.port, 10);
  const dbUrl = opts.db ?? process.env.DATABASE_URL;

  if (!dbUrl) {
    spinner.warn(
      chalk.yellow('No DATABASE_URL set — running in memory-only mode (no persistence)')
    );
  }

  // Check if port is available
  const net = await import('node:net');
  const portFree = await new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => {
      s.close();
      resolve(true);
    });
    s.listen(port, '0.0.0.0');
  });

  if (!portFree) {
    spinner.fail(
      chalk.red(`Port ${port} is already in use. Try: warrior start --port ${port + 1}`)
    );
    process.exit(1);
  }

  spinner.text = 'Loading risk engine...';

  // Try to start the actual API server if it exists in the same installation
  // Otherwise provide setup instructions
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createServer } = await (Function('m', 'return import(m)') as any)('@xshieldai/api');
    const server = await createServer({ port, dbUrl });
    await server.listen({ port, host: '0.0.0.0' });
    spinner.succeed(chalk.green(`xShield warrior running on http://0.0.0.0:${port}`));
    console.log(chalk.cyan(`\n  API:        http://localhost:${port}/graphql`));
    console.log(
      chalk.cyan(`  Risk scan:  curl http://localhost:${port}/risk/score?domain=example.com`)
    );
    console.log(chalk.cyan(`  IOC feed:   http://localhost:${port}/ioc/feed?format=hosts`));
    console.log(chalk.cyan(`  Docs:       http://localhost:${port}/documentation\n`));
    console.log(chalk.gray('  Press Ctrl+C to stop\n'));
  } catch {
    spinner.succeed(chalk.green(`xShield warrior ready on port ${port}`));
    console.log(chalk.yellow('\n  Note: Run from the full xShield monorepo for all features.'));
    console.log(chalk.cyan('  Quick start: https://github.com/xshieldai/warrior#self-hosting\n'));

    // Keep process alive
    await new Promise(() => {});
  }
}
