import { describe, it, expect } from 'vitest';
import { statusDisplay, shortWorktree, isWaitingRow } from './sessions.js';

describe('statusDisplay', () => {
  it('waitingFor=approval → red bold "approve?"', () => {
    expect(statusDisplay({ status: '', waitingFor: 'approval', kind: 'interactive' })).toEqual({
      label: 'approve?',
      role: 'approval',
      bold: true,
    });
  });

  it('waitingFor=permission → same', () => {
    expect(statusDisplay({ status: '', waitingFor: 'permission', kind: 'interactive' })).toEqual({
      label: 'approve?',
      role: 'approval',
      bold: true,
    });
  });

  it('waitingFor=input → yellow bold "input?"', () => {
    expect(statusDisplay({ status: '', waitingFor: 'input', kind: 'interactive' })).toEqual({
      label: 'input',
      role: 'input',
      bold: true,
    });
  });

  it('unknown waitingFor → shown raw yellow bold', () => {
    expect(statusDisplay({ status: '', waitingFor: 'xyz', kind: 'interactive' })).toEqual({
      label: 'xyz',
      role: 'input',
      bold: true,
    });
  });

  it('status=busy → green "running"', () => {
    expect(statusDisplay({ status: 'busy', waitingFor: '', kind: 'interactive' })).toEqual({
      label: 'running',
      role: 'ok',
    });
  });

  it('status=idle interactive → yellow bold "input?"', () => {
    expect(statusDisplay({ status: 'idle', waitingFor: '', kind: 'interactive' })).toEqual({
      label: 'input',
      role: 'input',
      bold: true,
    });
  });

  it('status=idle non-interactive → raw dim, no role', () => {
    expect(statusDisplay({ status: 'idle', waitingFor: '', kind: 'background' })).toEqual({
      label: 'idle',
      role: undefined,
      dim: true,
    });
  });

  it('unknown status → raw dim, no role', () => {
    expect(statusDisplay({ status: 'foo', waitingFor: '', kind: 'interactive' })).toEqual({
      label: 'foo',
      role: undefined,
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
