import { z } from 'zod';

export const RepoConfigSchema = z.object({
  main_path: z.string(),
  rebuild_cmd: z.array(z.string()),
  default_base: z.string().default('develop'),
});

export const RegistrySchema = z.object({
  repos: z.record(z.string(), RepoConfigSchema).default({}),
});

export const LockSchema = z.object({
  repo: z.string(),
  branch: z.string(),
  holder_pid: z.number().int(),
  session_id: z.string().default(''),
  iterm_session_id: z.string().default(''),
  tty: z.string().default(''),
  acquired_at: z.string(),
  original_base: z.string().default(''),
  worktree_path: z.string().default(''),
  main_path: z.string(),
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type Lock = z.infer<typeof LockSchema>;
