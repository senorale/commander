import { execa } from 'execa';

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
