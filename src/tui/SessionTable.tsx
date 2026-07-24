import React from 'react';
import { Box, Text } from 'ink';
import { shortWorktree, statusDisplay, type EnrichedRow } from '../sessions.js';
import { useTheme, type Color } from '../theme.js';
import { statusColor } from './themeUtil.js';

interface Props {
  rows: EnrichedRow[];
  cursor: number;
}

const COL = {
  worktree: 32,
  status: 10,
  task: 80,
  holds: 16,
};

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s.padEnd(n);
}

interface CellProps {
  children: string;
  width: number;
  selectedBg: Color;
  color?: Color;
  bold?: boolean;
  dim?: boolean;
}

function Cell({ children, width, selectedBg, color, bold, dim }: CellProps): React.ReactElement {
  return (
    <Text backgroundColor={selectedBg} color={color} bold={bold} dimColor={dim}>
      {pad(children, width)}
    </Text>
  );
}

export function SessionTable({ rows, cursor }: Props): React.ReactElement {
  const theme = useTheme();
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold={theme.useBold} underline={theme.useUnderline}>{pad('Worktree', COL.worktree)}</Text>
        <Text bold={theme.useBold} underline={theme.useUnderline}>{pad('Status', COL.status)}</Text>
        <Text bold={theme.useBold} underline={theme.useUnderline}>{pad('Task', COL.task)}</Text>
        <Text bold={theme.useBold} underline={theme.useUnderline}>{pad('Holds', COL.holds)}</Text>
      </Box>
      {rows.length === 0 && (
        <Box paddingY={1}>
          <Text dimColor={theme.useDim}>(no claude sessions — is `claude agents --json` working?)</Text>
        </Box>
      )}
      {rows.map((r, i) => {
        const selected = i === cursor;
        const bg = selected ? theme.selectedBg : undefined;
        const d = statusDisplay(r);
        return (
          <Box key={`${r.pid}-${i}`}>
            <Cell width={COL.worktree} selectedBg={bg}>{shortWorktree(r.cwd)}</Cell>
            <Cell
              width={COL.status}
              selectedBg={bg}
              color={statusColor(d.role, theme)}
              bold={d.bold && theme.useBold}
              dim={d.dim && theme.useDim}
            >
              {d.label}
            </Cell>
            <Cell width={COL.task} selectedBg={bg} dim={!r.title && theme.useDim}>{r.title || '-'}</Cell>
            <Cell width={COL.holds} selectedBg={bg}>{r.holds ? `🔒 ${r.holds}` : ''}</Cell>
          </Box>
        );
      })}
    </Box>
  );
}
