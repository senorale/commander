import { release } from '../core.js';
import { CommanderError } from '../errors.js';

export async function runRelease(opts: { repo?: string }): Promise<number> {
  try {
    const lock = await release(opts);
    console.log(`released ${lock.repo} (was branch=${lock.branch})`);
    return 0;
  } catch (e) {
    if (e instanceof CommanderError) {
      console.error(`error: ${e.message}`);
      return 1;
    }
    throw e;
  }
}
