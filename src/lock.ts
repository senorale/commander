import fs from 'node:fs';
import { configDir, lockPath } from './paths.js';
import { LockSchema, type Lock } from './types.js';

export function readLock(repo: string): Lock | null {
  const p = lockPath(repo);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  return LockSchema.parse(JSON.parse(raw));
}

export function writeLock(repo: string, data: Lock): void {
  fs.mkdirSync(configDir(), { recursive: true });
  const body = JSON.stringify(data, null, 2) + '\n';
  const target = lockPath(repo);
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, target);
}

export function deleteLock(repo: string): void {
  const p = lockPath(repo);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/**
 * True if pid is a currently-running process. Matches Python semantics:
 * EPERM (process exists but not owned by us) counts as alive.
 */
export function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return false;
  }
}

export function isLockStale(lock: Lock): boolean {
  if (typeof lock.holder_pid !== 'number') return false;
  return !isPidAlive(lock.holder_pid);
}
