import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { shortWorktree, statusDisplay, type EnrichedRow } from '../sessions.js';
import { useTheme } from '../theme.js';
import { statusColor } from './themeUtil.js';

interface Props {
  rows: EnrichedRow[];
  cursor: number;
}

// Fixed widths — Task absorbs whatever's left.
const FIXED = {
  worktree: 28,
  status: 10,
  holds: 14,
};
const MIN_TASK = 10;
const MIN_WORKTREE = 12;

interface ColWidths {
  worktree: number;
  status: number;
  task: number;
  holds: number;
}

function computeCols(termCols: number): ColWidths {
  // Reserve one column for safety so we never wrap.
  const usable = Math.max(0, termCols - 1);
  // Try full layout first
  const fullTotal = FIXED.worktree + FIXED.status + FIXED.holds + MIN_TASK;
  if (usable >= fullTotal) {
    return {
      worktree: FIXED.worktree,
      status: FIXED.status,
      holds: FIXED.holds,
      task: usable - FIXED.worktree - FIXED.status - FIXED.holds,
    };
  }
  // Drop the Holds column when very narrow
  const noHoldsTotal = FIXED.worktree + FIXED.status + MIN_TASK;
  if (usable >= noHoldsTotal) {
    return {
      worktree: FIXED.worktree,
      status: FIXED.status,
      holds: 0,
      task: usable - FIXED.worktree - FIXED.status,
    };
  }
  // Very narrow: shrink worktree, drop holds
  const worktree = Math.max(MIN_WORKTREE, usable - FIXED.status - MIN_TASK);
  return {
    worktree,
    status: FIXED.status,
    holds: 0,
    task: Math.max(MIN_TASK, usable - worktree - FIXED.status),
  };
}

function pad(s: string, n: number): string {
  if (n <= 0) return '';
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s.padEnd(n);
}

export function SessionTable({ rows, cursor }: Props): React.ReactElement {
  const theme = useTheme();
  const { stdout } = useStdout();
  const cols = computeCols(stdout?.columns ?? 200);
  return (
    <Box flexDirection="column">
      <Text bold={theme.useBold} underline={theme.useUnderline}>
        {pad('Worktree', cols.worktree)}
        {pad('Status', cols.status)}
        {pad('Task', cols.task)}
        {cols.holds > 0 ? pad('Holds', cols.holds) : ''}
      </Text>
      {rows.length === 0 && (
        <Box paddingY={1}>
          <Text dimColor={theme.useDim}>(no claude sessions — is `claude agents --json` working?)</Text>
        </Box>
      )}
      {rows.map((r, i) => {
        const selected = i === cursor;
        const bg = selected ? theme.selectedBg : undefined;
        const d = statusDisplay(r);
        const statusFg = statusColor(d.role, theme);
        const holdsStr = r.holds ? `🔒 ${r.holds}` : '';
        return (
          <Text key={`${r.pid}-${i}`} backgroundColor={bg}>
            {pad(shortWorktree(r.cwd), cols.worktree)}
            <Text color={statusFg} bold={d.bold && theme.useBold} dimColor={d.dim && theme.useDim}>
              {pad(d.label, cols.status)}
            </Text>
            <Text dimColor={!r.title && theme.useDim}>{pad(r.title || '-', cols.task)}</Text>
            {cols.holds > 0 ? pad(holdsStr, cols.holds) : ''}
          </Text>
        );
      })}
    </Box>
  );
}
