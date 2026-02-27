export async function runSetup() {
  const chalk = (await import('chalk')).default;
  const inquirer = (await import('inquirer')).default;

  console.log(chalk.bold('\n  xShield First-Time Setup\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'port',
      message: 'Port to run xShield on:',
      default: '4481',
    },
    {
      type: 'input',
      name: 'dbUrl',
      message: 'PostgreSQL URL (leave blank for in-memory mode):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'openSource',
      message: 'Enable anonymous telemetry? (helps improve xShield)',
      default: false,
    },
  ]);

  console.log(chalk.green('\n  ✓ Setup complete!\n'));
  console.log(chalk.cyan(`  Run: warrior start --port ${answers.port}`));
  if (answers.dbUrl) {
    console.log(chalk.cyan(`       --db "${answers.dbUrl}"`));
  }
  console.log();
}
