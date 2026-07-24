import { statusRows } from '../core.js';
import { fmtAge } from '../format.js';

export interface StatusOpts {
  repo?: string;
  json?: boolean;
}

export function runStatus(opts: StatusOpts = {}): number {
  const rows = statusRows(opts.repo);
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  if (rows.length === 0) {
    console.log('(no repos registered — run: commander register ...)');
    return 0;
  }
  for (const r of rows) {
    const pad = r.repo.padEnd(20);
    if (r.state === 'free') {
      console.log(`${pad}  free`);
      continue;
    }
    const age = fmtAge(r.acquired_at);
    const sess = (r.session_id || '?').slice(0, 8);
    console.log(
      `${pad}  ${r.state}  branch=${r.branch}  session=${sess}  held=${age}`,
    );
  }
  return 0;
}
