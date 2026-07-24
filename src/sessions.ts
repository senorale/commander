import { execa } from 'execa';
import { loadRegistry } from './registry.js';
import { readLock } from './lock.js';
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

/** Sessions × locks join, sorted by (cwd, interactive-first, pid). */
export async function enrichRows(): Promise<EnrichedRow[]> {
  const [sessions, locks] = [await getSessions(), getLocks()];
  const sessionToRepo: Record<string, string> = {};
  const pidToRepo: Record<number, string> = {};
  for (const [repo, lk] of Object.entries(locks)) {
    if (lk.session_id) sessionToRepo[lk.session_id] = repo;
    if (Number.isFinite(lk.holder_pid)) pidToRepo[lk.holder_pid] = repo;
  }
  const rows: EnrichedRow[] = sessions.map((s) => ({
    ...s,
    holds: sessionToRepo[s.sessionId] || pidToRepo[s.pid] || '',
  }));
  rows.sort((a, b) => {
    if (a.cwd !== b.cwd) return a.cwd < b.cwd ? -1 : 1;
    const ak = a.kind === 'interactive' ? 0 : 1;
    const bk = b.kind === 'interactive' ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.pid - b.pid;
  });
  return rows;
}

const WAITING_LABELS: Record<string, string> = {
  input: 'waiting: input',
  user_input: 'waiting: input',
  prompt: 'waiting: input',
  approval: 'waiting: approval',
  permission: 'waiting: approval',
  tool_use: 'waiting: approval',
  confirmation: 'waiting: approval',
};

export interface StatusDisplay {
  label: string;
  color?: 'red' | 'yellow' | 'green' | 'gray';
  bold?: boolean;
  dim?: boolean;
}

/** Map (status, waitingFor) → renderable label + color for Ink. */
export function statusDisplay(row: Pick<ClaudeSession, 'status' | 'waitingFor' | 'kind'>): StatusDisplay {
  const status = (row.status || '').toLowerCase();
  const waitingFor = (row.waitingFor || '').toLowerCase();

  if (waitingFor) {
    const label = WAITING_LABELS[waitingFor] ?? `waiting: ${waitingFor}`;
    return { label, color: label.includes('approval') ? 'red' : 'yellow', bold: true };
  }
  if (status === 'waiting') return { label: 'waiting', color: 'yellow', bold: true };
  if (status === 'busy') return { label: 'busy', color: 'green' };
  if (status === 'idle') return { label: 'waiting: input', color: 'yellow', bold: true };
  if (status === 'done') return { label: 'done', dim: true };
  return { label: status };
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
