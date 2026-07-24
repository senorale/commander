import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLock, writeLock, deleteLock, isPidAlive, isLockStale } from './lock.js';
import { lockPath } from './paths.js';
import type { Lock } from './types.js';

let tmpDir: string;

const sampleLock: Lock = {
  repo: 'svc',
  branch: 'feature/x',
  holder_pid: process.pid,
  session_id: 'abc123',
  iterm_session_id: 'w0t0p0',
  tty: '/dev/ttys001',
  acquired_at: '2026-07-23T18:00:00+00:00',
  original_base: 'develop',
  worktree_path: '/tmp/wt',
  main_path: '/tmp/svc',
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commander-test-'));
  process.env.COMMANDER_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.COMMANDER_CONFIG_DIR;
});

describe('readLock', () => {
  it('returns null when lock file absent', () => {
    expect(readLock('svc')).toBeNull();
  });

  it('parses a valid lock', () => {
    fs.writeFileSync(lockPath('svc'), JSON.stringify(sampleLock));
    expect(readLock('svc')).toEqual(sampleLock);
  });
});

describe('writeLock / deleteLock', () => {
  it('writeLock persists atomically with trailing newline', () => {
    writeLock('svc', sampleLock);
    const body = fs.readFileSync(lockPath('svc'), 'utf8');
    expect(body.endsWith('\n')).toBe(true);
    expect(JSON.parse(body)).toEqual(sampleLock);
    expect(fs.readdirSync(tmpDir).filter(f => f.includes('.tmp'))).toEqual([]);
  });

  it('deleteLock removes the file; no-op if absent', () => {
    writeLock('svc', sampleLock);
    deleteLock('svc');
    expect(fs.existsSync(lockPath('svc'))).toBe(false);
    expect(() => deleteLock('svc')).not.toThrow();
  });
});

describe('isPidAlive', () => {
  it('returns true for current process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('returns false for pid 0 / negative', () => {
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-1)).toBe(false);
  });

  it('returns false for a definitely-dead pid', () => {
    // pid 2^31 - 1 (max int32) is not going to be a running process
    expect(isPidAlive(2147483646)).toBe(false);
  });

  it('returns true for pid 1 (init) — exists but not owned', () => {
    expect(isPidAlive(1)).toBe(true);
  });
});

describe('isLockStale', () => {
  it('false when holder pid is alive', () => {
    expect(isLockStale(sampleLock)).toBe(false);
  });

  it('true when holder pid is dead', () => {
    expect(isLockStale({ ...sampleLock, holder_pid: 2147483646 })).toBe(true);
  });
});
