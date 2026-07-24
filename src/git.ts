import path from 'node:path';
import { execa } from 'execa';
import { CommanderError } from './errors.js';

export async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await execa('git', args, { cwd });
    return stdout.trim();
  } catch (err) {
    throw new CommanderError(
      `git ${args.join(' ')} failed in ${cwd}: ${(err as Error).message}`,
    );
  }
}

export async function currentBranch(cwd: string): Promise<string> {
  const b = await git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (b === 'HEAD') {
    throw new CommanderError(`Detached HEAD in ${cwd}; cannot infer branch`);
  }
  return b;
}

export async function isDirty(cwd: string): Promise<boolean> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd });
  return stdout.trim().length > 0;
}

export async function isMainWorktree(cwd: string, mainPath: string): Promise<boolean> {
  const toplevel = await git(cwd, 'rev-parse', '--show-toplevel');
  return path.resolve(toplevel) === path.resolve(mainPath);
}

export async function gitCommonDir(cwd: string): Promise<string> {
  const common = await git(cwd, 'rev-parse', '--git-common-dir');
  const abs = path.isAbsolute(common) ? common : path.resolve(cwd, common);
  return path.resolve(path.dirname(abs));
}
