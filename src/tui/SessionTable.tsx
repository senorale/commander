import React from 'react';
import { Box, Text } from 'ink';
import { shortWorktree, statusDisplay, type EnrichedRow } from '../sessions.js';

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
  selected: boolean;
  color?: 'red' | 'yellow' | 'green' | 'gray';
  bold?: boolean;
  dim?: boolean;
}

function Cell({ children, width, selected, color, bold, dim }: CellProps): React.ReactElement {
  const bg = selected ? 'blue' : undefined;
  return (
    <Text backgroundColor={bg} color={color} bold={bold} dimColor={dim}>
      {pad(children, width)}
    </Text>
  );
}

export function SessionTable({ rows, cursor }: Props): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold underline>{pad('Worktree', COL.worktree)}</Text>
        <Text bold underline>{pad('Status', COL.status)}</Text>
        <Text bold underline>{pad('Task', COL.task)}</Text>
        <Text bold underline>{pad('Holds', COL.holds)}</Text>
      </Box>
      {rows.length === 0 && (
        <Box paddingY={1}>
          <Text dimColor>(no claude sessions — is `claude agents --json` working?)</Text>
        </Box>
      )}
      {rows.map((r, i) => {
        const selected = i === cursor;
        const d = statusDisplay(r);
        return (
          <Box key={`${r.pid}-${i}`}>
            <Cell width={COL.worktree} selected={selected}>{shortWorktree(r.cwd)}</Cell>
            <Cell width={COL.status} selected={selected} color={d.color} bold={d.bold} dim={d.dim}>{d.label}</Cell>
            <Cell width={COL.task} selected={selected} dim={!r.title}>{r.title || '-'}</Cell>
            <Cell width={COL.holds} selected={selected}>{r.holds ? `🔒 ${r.holds}` : ''}</Cell>
          </Box>
        );
      })}
    </Box>
  );
}
