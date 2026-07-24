import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  sessions: number;
  waiting: number;
}

export function StatusBar({ sessions, waiting }: Props): React.ReactElement {
  return (
    <Box paddingX={1}>
      <Text>{sessions} sessions</Text>
      <Text> | </Text>
      {waiting > 0 ? (
        <Text color="yellow" bold>{waiting} waiting</Text>
      ) : (
        <Text dimColor>0 waiting</Text>
      )}
    </Box>
  );
}
