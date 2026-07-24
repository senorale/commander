import { execa } from 'execa';
import { loadRegistry } from './registry.js';
import { readLock } from './lock.js';
import { getPsTable, findTtyForPidCached } from './tty.js';
import { getITermSessionNames } from './iterm.js';
import type { Lock } from './types.js';

export interface ClaudeSession {
  pid: number;
  cwd: string;
  kind: string;
  status: string;
  waitingFor: string;
  name: string;
  sessionId: string;
}

export interface EnrichedRow extends ClaudeSession {
  holds: string;
  title: string; // iTerm tab title (Claude-set task summary), '' if unavailable
}

/** Call `claude agents --json`. Returns [] on any failure. */
export async function getSessions(): Promise<ClaudeSession[]> {
  try {
    const { stdout, exitCode } = await execa('claude', ['agents', '--json'], {
      timeout: 10_000,
      reject: false,
    });
    if (exitCode !== 0) return [];
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => ({
      pid: s.pid ?? 0,
      cwd: s.cwd ?? '',
      kind: s.kind ?? '',
      status: s.status ?? '',
      waitingFor: s.waitingFor ?? '',
      name: s.name ?? '',
      sessionId: s.sessionId ?? '',
    }));
  } catch {
    return [];
  }
}

/** repo → lock for every repo in the registry that currently has a lock file. */
export function getLocks(): Record<string, Lock> {
  const reg = loadRegistry();
  const out: Record<string, Lock> = {};
  for (const repo of Object.keys(reg.repos)) {
    const lk = readLock(repo);
    if (lk) out[repo] = lk;
  }
  return out;
}

/** Sessions × locks × iTerm-tab-title join, sorted by (cwd, interactive-first, pid). */
export async function enrichRows(): Promise<EnrichedRow[]> {
  const [sessions, itermNames, psTable] = await Promise.all([
    getSessions(),
    getITermSessionNames(),
    getPsTable(),
  ]);
  const locks = getLocks();
  const sessionToRepo: Record<string, string> = {};
  const pidToRepo: Record<number, string> = {};
  for (const [repo, lk] of Object.entries(locks)) {
    if (lk.session_id) sessionToRepo[lk.session_id] = repo;
    if (Number.isFinite(lk.holder_pid)) pidToRepo[lk.holder_pid] = repo;
  }
  const rows: EnrichedRow[] = sessions.map((s) => {
    const tty = s.pid ? findTtyForPidCached(s.pid, psTable) : null;
    const rawTitle = (tty && itermNames[tty]) || '';
    return {
      ...s,
      holds: sessionToRepo[s.sessionId] || pidToRepo[s.pid] || '',
      title: stripParens(rawTitle),
    };
  });
  rows.sort((a, b) => {
    if (a.cwd !== b.cwd) return a.cwd < b.cwd ? -1 : 1;
    const ak = a.kind === 'interactive' ? 0 : 1;
    const bk = b.kind === 'interactive' ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.pid - b.pid;
  });
  return rows;
}

const APPROVAL_WAITS = new Set(['approval', 'permission', 'tool_use', 'confirmation']);
const INPUT_WAITS = new Set(['input', 'user_input', 'prompt']);

export type StatusRole = 'ok' | 'input' | 'approval' | undefined;

export interface StatusDisplay {
  label: string;
  role: StatusRole;
  bold?: boolean;
  dim?: boolean;
}

/** Map (status, waitingFor) → renderable label + semantic role. Colors are
 * resolved by the theme layer at render time. */
export function statusDisplay(row: Pick<ClaudeSession, 'status' | 'waitingFor' | 'kind'>): StatusDisplay {
  const status = (row.status || '').toLowerCase();
  const waitingFor = (row.waitingFor || '').toLowerCase();

  if (APPROVAL_WAITS.has(waitingFor)) return { label: 'approve?', role: 'approval', bold: true };
  if (INPUT_WAITS.has(waitingFor)) return { label: 'input', role: 'input', bold: true };
  if (waitingFor) return { label: waitingFor, role: 'input', bold: true };
  if (status === 'busy') return { label: 'running', role: 'ok' };
  if (status === 'idle' && row.kind === 'interactive') return { label: 'input', role: 'input', bold: true };
  return { label: status, role: undefined, dim: true };
}

/** Drop parenthetical suffixes iTerm adds to tab titles like " (claude)" / " (caffeinate)". */
export function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, '').trim();
}

export function shortWorktree(cwd: string): string {
  const home = process.env.HOME || '';
  if (home && cwd.startsWith(home)) return '~' + cwd.slice(home.length);
  return cwd;
}

export function isWaitingRow(row: Pick<EnrichedRow, 'status' | 'waitingFor' | 'kind'>): boolean {
  const s = (row.status || '').toLowerCase();
  return s === 'waiting' || !!row.waitingFor || (s === 'idle' && row.kind === 'interactive');
}
