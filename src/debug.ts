import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

// In Ink apps, stdout is owned by the renderer — console.log() garbles the UI.
// Route debug output to a file so `tail -f` in another tab works.
const LOG_PATH = process.env.COMMANDER_DEBUG_LOG ?? path.join(homedir(), '.claude', 'commander', 'debug.log');
const ENABLED = process.env.COMMANDER_DEBUG === '1';

export function dbg(...args: unknown[]): void {
  if (!ENABLED) return;
  const line = `${new Date().toISOString()} ${args.map(fmt).join(' ')}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    // swallow — debug must never crash the app
  }
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
