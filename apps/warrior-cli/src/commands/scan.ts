export async function scanDomain(domain: string, opts: { key?: string; json?: boolean }) {
  const chalk = (await import('chalk')).default;
  const ora = (await import('ora')).default;

  const spinner = ora(`Scanning ${domain}...`).start();

  const base = process.env.XSHIELD_URL ?? 'https://xshieldai.com';
  const headers: Record<string, string> = {};
  if (opts.key) headers['X-API-Key'] = opts.key;

  try {
    const res = await fetch(`${base}/risk/score?domain=${encodeURIComponent(domain)}`, { headers });
    const data = (await res.json()) as any;
    spinner.stop();

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const levelColors: Record<string, any> = {
      MINIMAL: chalk.green,
      LOW: chalk.green,
      MEDIUM: chalk.yellow,
      HIGH: chalk.red,
      CRITICAL: chalk.bold.red,
    };
    const color = levelColors[data.level ?? data.riskLevel ?? 'MEDIUM'] ?? chalk.white;

    console.log(`\n  Domain:     ${chalk.bold(domain)}`);
    console.log(`  Risk Score: ${color(data.score ?? data.riskScore ?? '?')}/100`);
    console.log(`  Level:      ${color(data.level ?? data.riskLevel ?? 'UNKNOWN')}`);
    if (data.categories?.length) {
      console.log(`  Threats:    ${data.categories.join(', ')}`);
    }
    console.log();
  } catch (e: any) {
    spinner.fail(chalk.red(`Scan failed: ${e.message}`));
    process.exit(1);
  }
}
