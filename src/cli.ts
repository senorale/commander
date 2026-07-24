#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('commander')
  .description('Session coordinator for shared docker dev-envs across worktrees')
  .version('0.2.0-dev');

program
  .command('take')
  .description('acquire the dev-env lock for this repo')
  .option('--repo <name>', 'repo name (default: auto-detect from cwd)')
  .option('--branch <name>', 'branch (default: current branch in cwd)')
  .option('--wait', 'block until free')
  .option('--force', 'steal lock if held')
  .action(async (opts) => {
    const { runTake } = await import('./commands/take.js');
    process.exit(await runTake(opts));
  });

program
  .command('release')
  .description('release your lock')
  .option('--repo <name>', 'repo name (default: auto-detect)')
  .action(async (opts) => {
    const { runRelease } = await import('./commands/release.js');
    process.exit(await runRelease(opts));
  });

program
  .command('steal')
  .description('force-take a lock held by someone else')
  .option('--repo <name>', 'repo name (default: auto-detect)')
  .action(async (opts) => {
    const { runSteal } = await import('./commands/steal.js');
    process.exit(await runSteal(opts));
  });

program
  .command('status')
  .description('show lock state per repo')
  .option('--repo <name>', 'only this repo')
  .option('--json', 'machine-readable output')
  .action(async (opts) => {
    const { runStatus } = await import('./commands/status.js');
    process.exit(runStatus(opts));
  });

program
  .command('register <name>')
  .description('add or update a repo in the registry')
  .requiredOption('--main <path>', 'main worktree path')
  .requiredOption('--rebuild <cmd...>', 'rebuild command (argv)')
  .option('--base <branch>', 'default base branch', 'develop')
  .action(async (name, opts) => {
    const { runRegister } = await import('./commands/register.js');
    process.exit(runRegister({ name, main: opts.main, rebuild: opts.rebuild, base: opts.base }));
  });

program
  .command('view')
  .description('launch the live TUI dashboard')
  .action(async () => {
    const { runView } = await import('./commands/view.js');
    process.exit(await runView());
  });

// Bare `commander` → view (matches python behavior)
if (process.argv.length <= 2) {
  process.argv.push('view');
}

program.parseAsync(process.argv);
