import { take } from '../core.js';
import { CommanderError } from '../errors.js';

export interface TakeCliOpts {
  repo?: string;
  branch?: string;
  wait?: boolean;
  force?: boolean;
  push?: boolean;
}

export async function runTake(opts: TakeCliOpts): Promise<number> {
  try {
    const lock = await take({ ...opts, noPush: opts.push === false });
    console.log(`acquired ${lock.repo} branch=${lock.branch}`);
    return 0;
  } catch (e) {
    if (e instanceof CommanderError) {
      console.error(`error: ${e.message}`);
      return 1;
    }
    throw e;
  }
}
