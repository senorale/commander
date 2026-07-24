import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRegistry, saveRegistry, registerRepo } from './registry.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commander-test-'));
  process.env.COMMANDER_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.COMMANDER_CONFIG_DIR;
});

describe('loadRegistry', () => {
  it('returns empty repos when file absent', () => {
    expect(loadRegistry()).toEqual({ repos: {} });
  });

  it('creates config dir if missing', () => {
    loadRegistry();
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it('reads existing registry.json', () => {
    const reg = {
      repos: {
        foo: { main_path: '/tmp/foo', rebuild_cmd: ['echo', 'hi'], default_base: 'main' },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'registry.json'), JSON.stringify(reg));
    expect(loadRegistry()).toEqual(reg);
  });

  it('rejects malformed schema', () => {
    fs.writeFileSync(path.join(tmpDir, 'registry.json'), JSON.stringify({ repos: { bad: {} } }));
    expect(() => loadRegistry()).toThrow();
  });
});

describe('saveRegistry', () => {
  it('writes pretty JSON with trailing newline (python-compatible)', () => {
    saveRegistry({ repos: { foo: { main_path: '/x', rebuild_cmd: ['a'], default_base: 'develop' } } });
    const body = fs.readFileSync(path.join(tmpDir, 'registry.json'), 'utf8');
    expect(body.endsWith('\n')).toBe(true);
    expect(body).toContain('  "repos"');
  });

  it('write is atomic (leaves no .tmp files after success)', () => {
    saveRegistry({ repos: {} });
    const files = fs.readdirSync(tmpDir);
    expect(files.filter(f => f.includes('.tmp'))).toEqual([]);
  });

  it('roundtrips through loadRegistry', () => {
    const reg = {
      repos: { r: { main_path: '/x', rebuild_cmd: ['docker', 'up'], default_base: 'develop' } },
    };
    saveRegistry(reg);
    expect(loadRegistry()).toEqual(reg);
  });
});

describe('registerRepo', () => {
  it('adds a repo with resolved main_path', () => {
    registerRepo('svc', tmpDir, ['make', 'up']);
    const reg = loadRegistry();
    expect(reg.repos.svc.main_path).toBe(tmpDir);
    expect(reg.repos.svc.rebuild_cmd).toEqual(['make', 'up']);
    expect(reg.repos.svc.default_base).toBe('develop');
  });

  it('honors custom default_base', () => {
    registerRepo('svc', tmpDir, ['x'], 'main');
    expect(loadRegistry().repos.svc.default_base).toBe('main');
  });

  it('overwrites existing entry', () => {
    registerRepo('svc', tmpDir, ['first']);
    registerRepo('svc', tmpDir, ['second']);
    expect(loadRegistry().repos.svc.rebuild_cmd).toEqual(['second']);
  });
});
