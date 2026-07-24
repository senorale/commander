import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme.js';

interface Props {
  sessions: number;
  waiting: number;
}

export function StatusBar({ sessions, waiting }: Props): React.ReactElement {
  const theme = useTheme();
  return (
    <Box paddingX={1}>
      <Text>{sessions} sessions</Text>
      <Text> | </Text>
      {waiting > 0 ? (
        <Text color={theme.warn} bold={theme.useBold}>{waiting} waiting</Text>
      ) : (
        <Text dimColor={theme.useDim}>0 waiting</Text>
      )}
    </Box>
  );
}
