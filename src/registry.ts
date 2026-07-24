import fs from 'node:fs';
import path from 'node:path';
import { configDir, registryPath } from './paths.js';
import { RegistrySchema, type Registry } from './types.js';

export function loadRegistry(): Registry {
  fs.mkdirSync(configDir(), { recursive: true });
  const p = registryPath();
  if (!fs.existsSync(p)) {
    return { repos: {} };
  }
  const raw = fs.readFileSync(p, 'utf8');
  return RegistrySchema.parse(JSON.parse(raw));
}

export function saveRegistry(reg: Registry): void {
  fs.mkdirSync(configDir(), { recursive: true });
  const body = JSON.stringify(reg, null, 2) + '\n';
  atomicWrite(registryPath(), body);
}

function atomicWrite(target: string, body: string): void {
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, target);
}

export function registerRepo(
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
  if (p.startsWith('~/') || p === '~') {
    return path.join(process.env.HOME || '', p.slice(1));
  }
  return p;
}
