import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export async function runTUI(): Promise<number> {
  const instance = render(React.createElement(App));
  await instance.waitUntilExit();
  return 0;
}
