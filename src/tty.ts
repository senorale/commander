import { execa } from 'execa';

export interface PsEntry {
  ppid: number;
  tty: string;
}

/** Snapshot of `ps -A -o pid=,ppid=,tty=` — one subprocess for the whole tree. */
export async function getPsTable(): Promise<Map<number, PsEntry>> {
  const table = new Map<number, PsEntry>();
  try {
    const { stdout } = await execa('ps', ['-A', '-o', 'pid=,ppid=,tty='], {
      timeout: 3000,
      reject: false,
    });
    for (const raw of stdout.split('\n')) {
      const parts = raw.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const pid = parseInt(parts[0], 10);
      const ppid = parseInt(parts[1], 10);
      const tty = parts[2];
      if (Number.isFinite(pid)) table.set(pid, { ppid, tty });
    }
  } catch {
    // return empty table
  }
  return table;
}

/** Same 6-hop tty walk as findTtyForPid but resolved against an in-memory ps table. */
export function findTtyForPidCached(pid: number, table: Map<number, PsEntry>): string | null {
  let current = pid;
  for (let i = 0; i < 6; i++) {
    const entry = table.get(current);
    if (!entry) return null;
    const { tty, ppid } = entry;
    if (tty && tty !== '?' && tty !== '??') {
      return tty.startsWith('/dev/') ? tty : `/dev/${tty}`;
    }
    if (!Number.isFinite(ppid) || ppid <= 1) return null;
    current = ppid;
  }
  return null;
}

/**
 * Return the controlling TTY device path (e.g. /dev/ttys004) for a pid, or null.
 * Walks up the process tree (bounded to 6 hops) if the pid itself has no
 * controlling tty — some daemonized Claude sessions fork; the interactive
 * parent shell has the tty.
 */
export async function findTtyForPid(pid: number): Promise<string | null> {
  let current = pid;
  for (let i = 0; i < 6; i++) {
    let stdout = '';
    try {
      const r = await execa('ps', ['-o', 'tty=,ppid=', '-p', String(current)], {
        timeout: 2000,
        reject: false,
      });
      stdout = r.stdout;
    } catch {
      return null;
    }
    const line = stdout.trim();
    if (!line) return null;
    const parts = line.split(/\s+/);
    if (parts.length < 2) return null;
    const [ttyVal, ppid] = parts;
    if (ttyVal && ttyVal !== '?' && ttyVal !== '??') {
      return ttyVal.startsWith('/dev/') ? ttyVal : `/dev/${ttyVal}`;
    }
    const next = parseInt(ppid, 10);
    if (!Number.isFinite(next) || next <= 1) return null;
    current = next;
  }
  return null;
}
