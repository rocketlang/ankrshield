export async function checkStatus(opts: { port: string }) {
  const chalk = (await import('chalk')).default;
  const url = `http://localhost:${opts.port}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as any;
    console.log(chalk.green(`✓ xShield warrior is running on port ${opts.port}`));
    if (data.version) console.log(`  Version: ${data.version}`);
    if (data.uptime) console.log(`  Uptime:  ${Math.floor(data.uptime / 60)}m`);
  } catch {
    console.log(chalk.red(`✗ No warrior server found on port ${opts.port}`));
    console.log(chalk.gray(`  Start one with: npx @xshieldai/warrior start`));
  }
}
