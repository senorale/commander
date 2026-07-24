#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('commander')
  .description('Session coordinator for shared docker dev-envs across worktrees')
  .version('0.2.0-dev');

program
  .command('status')
  .description('Print quick text status of all registered repos')
  .action(async () => {
    const { runStatus } = await import('./commands/status.js');
    await runStatus();
  });

program.parseAsync(process.argv);
