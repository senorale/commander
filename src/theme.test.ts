import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTheme, DEFAULT_THEME, MONO_THEME, themeConfigPath, listBuiltInThemes } from './theme.js';

let tmpXdg: string;

beforeEach(() => {
  tmpXdg = fs.mkdtempSync(path.join(os.tmpdir(), 'commander-theme-test-'));
  process.env.XDG_CONFIG_HOME = tmpXdg;
  delete process.env.COMMANDER_THEME;
});

afterEach(() => {
  fs.rmSync(tmpXdg, { recursive: true, force: true });
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.COMMANDER_THEME;
});

describe('resolveTheme', () => {
  it('returns DEFAULT_THEME when nothing configured', () => {
    expect(resolveTheme()).toEqual(DEFAULT_THEME);
  });

  it('honors override arg', () => {
    expect(resolveTheme('mono')).toEqual(MONO_THEME);
  });

  it('honors $COMMANDER_THEME env', () => {
    process.env.COMMANDER_THEME = 'mono';
    expect(resolveTheme()).toEqual(MONO_THEME);
  });

  it('override arg beats env', () => {
    process.env.COMMANDER_THEME = 'mono';
    expect(resolveTheme('default')).toEqual(DEFAULT_THEME);
  });

  it('unknown name (no config file) → default with new name', () => {
    expect(resolveTheme('nope').name).toBe('nope');
    expect(resolveTheme('nope').primary).toBe(DEFAULT_THEME.primary);
  });

  it('reads ~/.config/commander/theme.json', () => {
    const cfgDir = path.join(tmpXdg, 'commander');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, 'theme.json'),
      JSON.stringify({ selectedBg: 'magenta', approval: 'red' }),
    );
    const t = resolveTheme();
    expect(t.selectedBg).toBe('magenta');
    expect(t.approval).toBe('red');
    expect(t.primary).toBe(DEFAULT_THEME.primary);
  });

  it('honors "extends" in theme.json', () => {
    const cfgDir = path.join(tmpXdg, 'commander');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, 'theme.json'),
      JSON.stringify({ extends: 'mono', primaryBorder: 'yellow' }),
    );
    const t = resolveTheme();
    expect(t.primaryBorder).toBe('yellow');
    expect(t.running).toBe(MONO_THEME.running);
  });

  it('bad JSON does not crash — falls back to default', () => {
    const cfgDir = path.join(tmpXdg, 'commander');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'theme.json'), '{ not json');
    expect(resolveTheme()).toEqual(DEFAULT_THEME);
  });

  it('named built-in still wins over config', () => {
    const cfgDir = path.join(tmpXdg, 'commander');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'theme.json'), JSON.stringify({ selectedBg: 'magenta' }));
    expect(resolveTheme('mono')).toEqual(MONO_THEME);
  });
});

describe('themeConfigPath', () => {
  it('falls back to ~/.config when XDG_CONFIG_HOME unset', () => {
    delete process.env.XDG_CONFIG_HOME;
    const p = themeConfigPath();
    expect(p.endsWith('/.config/commander/theme.json')).toBe(true);
  });
});

describe('listBuiltInThemes', () => {
  it('has default and mono', () => {
    expect(listBuiltInThemes()).toEqual(expect.arrayContaining(['default', 'mono']));
  });
});
