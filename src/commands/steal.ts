import { steal } from '../core.js';
import { CommanderError } from '../errors.js';

export async function runSteal(opts: { repo?: string }): Promise<number> {
  try {
    const lock = await steal(opts);
    console.log(`stolen ${lock.repo} branch=${lock.branch}`);
    return 0;
  } catch (e) {
    if (e instanceof CommanderError) {
      console.error(`error: ${e.message}`);
      return 1;
    }
    throw e;
  }
}
