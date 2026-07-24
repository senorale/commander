import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme.js';

interface Props {
  pid: number | null;
  tty: string | null;
  name: string;
  content: string;
  scrollOffset: number;
  viewportHeight: number;
}

export function PreviewPane({
  pid,
  tty,
  name,
  content,
  scrollOffset,
  viewportHeight,
}: Props): React.ReactElement {
  const theme = useTheme();
  const title = `Preview  pid=${pid ?? '?'}  tty=${tty ?? '?'}  ${name || ''}`;
  const lines = content ? content.split('\n') : [];
  const visibleH = Math.max(1, viewportHeight);
  const end = Math.max(0, lines.length - scrollOffset);
  const start = Math.max(0, end - visibleH);
  const slice = lines.slice(start, end);
  const positionLabel =
    lines.length === 0
      ? ''
      : scrollOffset === 0
        ? `[bottom · ${lines.length} lines]`
        : `[+${scrollOffset} from bottom · ${lines.length} lines]`;

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text bold={theme.useBold}>{title}</Text>
        <Text> </Text>
        <Text dimColor={theme.useDim}>{positionLabel}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {slice.length === 0 && <Text dimColor={theme.useDim}>(empty buffer)</Text>}
        {slice.map((l, i) => (
          <Text key={i} wrap="truncate">
            {l}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
