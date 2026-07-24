import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  sessions: number;
  waiting: number;
  refreshSec: number;
  hint?: string;
}

export function StatusBar({ sessions, waiting, refreshSec, hint }: Props): React.ReactElement {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box>
        <Text>{sessions} sessions</Text>
        <Text> | </Text>
        {waiting > 0 ? (
          <Text color="yellow" bold>{waiting} waiting</Text>
        ) : (
          <Text dimColor>0 waiting</Text>
        )}
        <Text> | </Text>
        <Text dimColor>refresh {refreshSec}s</Text>
      </Box>
      <Box>
        <Text dimColor>{hint ?? 'q quit • j/k nav • gg/G ends • R refresh • Enter preview • i send • t focus • r release • s steal'}</Text>
      </Box>
    </Box>
  );
}
