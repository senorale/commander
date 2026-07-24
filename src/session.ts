export interface SessionEnv {
  pid: number;
  sessionId: string;
  itermSessionId: string;
  tty: string;
}

export function getSessionEnv(): SessionEnv {
  const envPid = process.env.CLAUDE_PID;
  const pid = envPid ? parseInt(envPid, 10) : process.pid;
  return {
    pid: Number.isFinite(pid) && pid > 0 ? pid : process.pid,
    sessionId: process.env.CLAUDE_CODE_SESSION_ID ?? '',
    itermSessionId: process.env.ITERM_SESSION_ID ?? '',
    tty: process.env.TTY ?? '',
  };
}
