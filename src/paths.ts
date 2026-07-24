import { homedir } from 'node:os';
import path from 'node:path';

export function configDir(): string {
  const override = process.env.COMMANDER_CONFIG_DIR;
  if (override) return override;
  return path.join(homedir(), '.claude', 'commander');
}

export function registryPath(): string {
  return path.join(configDir(), 'registry.json');
}

export function lockPath(repo: string): string {
  return path.join(configDir(), `${repo}.lock`);
}
