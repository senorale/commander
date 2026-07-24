import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

// Alt-screen escape codes — same as vim/less.
// Enter: switch to alternate buffer + save cursor. Leave: restore.
const ENTER_ALT = '\x1b[?1049h\x1b[H';
const LEAVE_ALT = '\x1b[?1049l';

export async function runTUI(): Promise<number> {
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    process.stdout.write(LEAVE_ALT);
  };
  process.stdout.write(ENTER_ALT);
  process.on('exit', leave);
  process.on('SIGTERM', leave);

  const instance = render(React.createElement(App));
  try {
    await instance.waitUntilExit();
  } finally {
    leave();
  }
  return 0;
}
