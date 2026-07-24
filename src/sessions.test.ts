import { describe, it, expect } from 'vitest';
import { statusDisplay, shortWorktree, isWaitingRow } from './sessions.js';

describe('statusDisplay', () => {
  it('waitingFor=approval → red bold "waiting: approval"', () => {
    expect(statusDisplay({ status: '', waitingFor: 'approval', kind: 'interactive' })).toEqual({
      label: 'waiting: approval',
      color: 'red',
      bold: true,
    });
  });

  it('waitingFor=permission → same red bold approval label', () => {
    expect(statusDisplay({ status: '', waitingFor: 'permission', kind: 'interactive' })).toEqual({
      label: 'waiting: approval',
      color: 'red',
      bold: true,
    });
  });

  it('waitingFor=input → yellow bold "waiting: input"', () => {
    expect(statusDisplay({ status: '', waitingFor: 'input', kind: 'interactive' })).toEqual({
      label: 'waiting: input',
      color: 'yellow',
      bold: true,
    });
  });

  it('unknown waitingFor → "waiting: X" yellow', () => {
    expect(statusDisplay({ status: '', waitingFor: 'xyz', kind: 'interactive' })).toEqual({
      label: 'waiting: xyz',
      color: 'yellow',
      bold: true,
    });
  });

  it('status=busy → green', () => {
    expect(statusDisplay({ status: 'busy', waitingFor: '', kind: 'interactive' })).toEqual({
      label: 'busy',
      color: 'green',
    });
  });

  it('status=idle → yellow bold "waiting: input"', () => {
    expect(statusDisplay({ status: 'idle', waitingFor: '', kind: 'interactive' })).toEqual({
      label: 'waiting: input',
      color: 'yellow',
      bold: true,
    });
  });

  it('status=done → dim', () => {
    expect(statusDisplay({ status: 'done', waitingFor: '', kind: 'interactive' })).toEqual({
      label: 'done',
      dim: true,
    });
  });
});

describe('shortWorktree', () => {
  it('collapses $HOME to ~', () => {
    process.env.HOME = '/Users/alice';
    expect(shortWorktree('/Users/alice/code/foo')).toBe('~/code/foo');
  });

  it('leaves paths outside $HOME untouched', () => {
    process.env.HOME = '/Users/alice';
    expect(shortWorktree('/tmp/x')).toBe('/tmp/x');
  });
});

describe('isWaitingRow', () => {
  it('true for status=waiting', () => {
    expect(isWaitingRow({ status: 'waiting', waitingFor: '', kind: 'interactive' })).toBe(true);
  });
  it('true for any waitingFor', () => {
    expect(isWaitingRow({ status: 'busy', waitingFor: 'input', kind: 'interactive' })).toBe(true);
  });
  it('true for idle interactive', () => {
    expect(isWaitingRow({ status: 'idle', waitingFor: '', kind: 'interactive' })).toBe(true);
  });
  it('false for idle non-interactive', () => {
    expect(isWaitingRow({ status: 'idle', waitingFor: '', kind: 'background' })).toBe(false);
  });
  it('false for busy', () => {
    expect(isWaitingRow({ status: 'busy', waitingFor: '', kind: 'interactive' })).toBe(false);
  });
});
