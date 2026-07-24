import path from 'node:path';
import { execa } from 'execa';
import { CommanderError } from './errors.js';
import { loadRegistry, saveRegistry } from './registry.js';
import { readLock, writeLock, deleteLock, isLockStale } from './lock.js';
import { currentBranch, isDirty, isMainWorktree, gitCommonDir } from './git.js';
import { getSessionEnv } from './session.js';
import { nowIso } from './time.js';
import type { Lock, RepoConfig } from './types.js';

export interface DetectedRepo {
  name: string;
  cfg: RepoConfig;
  mainPath: string;
}

export async function detectRepo(cwd?: string): Promise<DetectedRepo> {
  const c = path.resolve(cwd ?? process.cwd());
  const mainPath = await gitCommonDir(c);
  const reg = loadRegistry();
  for (const [name, cfg] of Object.entries(reg.repos)) {
    if (path.resolve(cfg.main_path) === mainPath) {
      return { name, cfg, mainPath };
    }
  }
  throw new CommanderError(
    `Repo at ${mainPath} not registered. Run: commander register <name> --main ${mainPath} --rebuild ...`,
  );
}

export function lookup(repo: string): DetectedRepo {
  const reg = loadRegistry();
  const cfg = reg.repos[repo];
  if (!cfg) throw new CommanderError(`Unknown repo: ${repo}`);
  return { name: repo, cfg, mainPath: path.resolve(cfg.main_path) };
}

async function resolveRepo(repo: string | undefined, cwd: string): Promise<DetectedRepo> {
  return repo ? lookup(repo) : await detectRepo(cwd);
}

async function waitForLock(repo: string, pollMs = 1000): Promise<void> {
  const started = Date.now();
  while (true) {
    const lock = readLock(repo);
    if (!lock || isLockStale(lock)) return;
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const sess = (lock.session_id || '?').slice(0, 8);
    process.stderr.write(
      `\rwaiting for ${repo}: held by session ${sess} branch=${lock.branch} elapsed=${elapsed}s   `,
    );
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export interface TakeOpts {
  repo?: string;
  branch?: string;
  wait?: boolean;
  force?: boolean;
  cwd?: string;
}

export async function take(opts: TakeOpts = {}): Promise<Lock> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const { name: repoName, cfg, mainPath } = await resolveRepo(opts.repo, cwd);
  const branch = opts.branch ?? (await currentBranch(cwd));

  const inMain = await isMainWorktree(cwd, mainPath);

  const existing = readLock(repoName);
  if (existing && !isLockStale(existing)) {
    if (opts.force) {
      const sess = (existing.session_id || '?').slice(0, 8);
      process.stderr.write(
        `forcing takeover from session ${sess} (branch ${existing.branch})\n`,
      );
    } else if (opts.wait) {
      await waitForLock(repoName);
      process.stderr.write('\n');
    } else {
      const sess = (existing.session_id || '?').slice(0, 8);
      throw new CommanderError(
        `${repoName} is LOCKED by session ${sess} branch=${existing.branch} since=${existing.acquired_at}. ` +
          `Use --wait to queue, --force to steal.`,
      );
    }
  } else if (existing && isLockStale(existing)) {
    process.stderr.write(`clearing stale lock (dead pid ${existing.holder_pid})\n`);
  }

  let worktreePath = cwd;
  if (!inMain) {
    if (await isDirty(cwd)) {
      throw new CommanderError(`Uncommitted changes in worktree ${cwd}. Commit and retry.`);
    }
    await execa('git', ['push', 'origin', branch], { cwd, stdio: 'inherit' });
    await execa('git', ['checkout', '--detach'], { cwd, stdio: 'inherit' });
  } else {
    worktreePath = '';
  }

  const originalBase = inMain
    ? cfg.default_base ?? 'develop'
    : await currentBranch(mainPath);

  const session = getSessionEnv();
  const lockData: Lock = {
    repo: repoName,
    branch,
    holder_pid: session.pid,
    session_id: session.sessionId,
    iterm_session_id: session.itermSessionId,
    tty: session.tty,
    acquired_at: nowIso(),
    original_base: originalBase,
    worktree_path: worktreePath,
    main_path: mainPath,
  };
  writeLock(repoName, lockData);

  try {
    await execa('git', ['fetch', 'origin'], { cwd: mainPath, stdio: 'inherit' });
    await execa('git', ['checkout', branch], { cwd: mainPath, stdio: 'inherit' });
    await execa('git', ['reset', '--hard', `origin/${branch}`], { cwd: mainPath, stdio: 'inherit' });
    await execa(cfg.rebuild_cmd[0], cfg.rebuild_cmd.slice(1), { cwd: mainPath, stdio: 'inherit' });
  } catch (e) {
    throw new CommanderError(`main-side setup failed: ${(e as Error).message}`);
  }

  return lockData;
}

export async function release(opts: { repo?: string; cwd?: string } = {}): Promise<Lock> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const { name: repoName, cfg, mainPath } = await resolveRepo(opts.repo, cwd);

  const lock = readLock(repoName);
  if (!lock) throw new CommanderError(`No lock held on ${repoName}`);

  const session = getSessionEnv();
  if (
    lock.session_id !== session.sessionId &&
    lock.holder_pid !== session.pid &&
    !isLockStale(lock)
  ) {
    const sess = (lock.session_id || '?').slice(0, 8);
    throw new CommanderError(
      `Lock on ${repoName} held by session ${sess}, not you. Use \`commander steal\` to force.`,
    );
  }

  const originalBase = lock.original_base || cfg.default_base || 'develop';
  await execa('git', ['checkout', originalBase], { cwd: mainPath, stdio: 'inherit' });

  const wt = lock.worktree_path;
  if (wt) {
    try {
      await execa('git', ['checkout', lock.branch], { cwd: wt, stdio: 'inherit' });
    } catch {
      process.stderr.write(`warning: could not reattach ${lock.branch} in ${wt}\n`);
    }
  }

  deleteLock(repoName);
  return lock;
}

export async function steal(opts: { repo?: string; cwd?: string } = {}): Promise<Lock> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const { name: repoName, mainPath } = await resolveRepo(opts.repo, cwd);
  const existing = readLock(repoName);
  if (existing && !isLockStale(existing) && (await isDirty(mainPath))) {
    const sess = (existing.session_id || '?').slice(0, 8);
    throw new CommanderError(
      `refusing to steal ${repoName}: main worktree at ${mainPath} has uncommitted changes ` +
        `(held by session ${sess} on branch ${existing.branch}). ` +
        `Ask the holder to commit or discard, then retry.`,
    );
  }
  deleteLock(repoName);
  return take({ repo: repoName, cwd });
}

export type StatusRow =
  | { state: 'free'; repo: string }
  | ({ state: 'held' | 'stale' } & Lock);

export function statusRows(repo?: string): StatusRow[] {
  const reg = loadRegistry();
  const names = repo ? [repo] : Object.keys(reg.repos);
  const rows: StatusRow[] = [];
  for (const name of names) {
    const lock = readLock(name);
    if (!lock) {
      rows.push({ state: 'free', repo: name });
    } else if (isLockStale(lock)) {
      rows.push({ state: 'stale', ...lock });
    } else {
      rows.push({ state: 'held', ...lock });
    }
  }
  return rows;
}

export function register(
  name: string,
  mainPath: string,
  rebuildCmd: string[],
  defaultBase = 'develop',
): void {
  const reg = loadRegistry();
  reg.repos[name] = {
    main_path: path.resolve(expandHome(mainPath)),
    rebuild_cmd: [...rebuildCmd],
    default_base: defaultBase,
  };
  saveRegistry(reg);
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') return path.join(process.env.HOME || '', p.slice(1));
  return p;
}
