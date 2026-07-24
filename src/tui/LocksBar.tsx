import React from 'react';
import { Box, Text } from 'ink';
import { isLockStale } from '../lock.js';
import { fmtAge } from '../format.js';
import type { Lock } from '../types.js';

interface Props {
  locks: Record<string, Lock>;
}

export function LocksBar({ locks }: Props): React.ReactElement {
  const entries = Object.entries(locks);
  if (entries.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>no dev-env locks held</Text>
      </Box>
    );
  }
  return (
    <Box paddingX={1} flexWrap="wrap">
      {entries.map(([repo, lk], i) => {
        const stale = isLockStale(lk);
        const sess = (lk.session_id || '?').slice(0, 8);
        return (
          <React.Fragment key={repo}>
            {i > 0 && <Text dimColor>{'  |  '}</Text>}
            <Text color={stale ? 'red' : 'green'} bold>
              {stale ? 'STALE' : 'held'}
            </Text>
            <Text> </Text>
            <Text bold>{repo}</Text>
            <Text>{' branch='}{lk.branch}</Text>
            <Text>{' session='}{sess}</Text>
            <Text>{' age='}{fmtAge(lk.acquired_at)}</Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
