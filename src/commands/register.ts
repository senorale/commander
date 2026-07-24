import { register } from '../core.js';

export interface RegisterOpts {
  name: string;
  main: string;
  rebuild: string[];
  base: string;
}

export function runRegister(opts: RegisterOpts): number {
  register(opts.name, opts.main, opts.rebuild, opts.base);
  console.log(`registered ${opts.name}`);
  return 0;
}
