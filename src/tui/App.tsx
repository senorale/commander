import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { enrichRows, getLocks, isWaitingRow, type EnrichedRow } from '../sessions.js';
import type { Lock } from '../types.js';
import { LocksBar } from './LocksBar.js';
import { SessionTable } from './SessionTable.js';
import { StatusBar } from './StatusBar.js';

const REFRESH_MS = 2000;

interface State {
  rows: EnrichedRow[];
  locks: Record<string, Lock>;
}

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<State>({ rows: [], locks: {} });
  const [cursor, setCursor] = useState(0);
  const [notice, setNotice] = useState<{ msg: string; kind: 'info' | 'warn' | 'error' } | null>(null);
  const lastKey = useRef<string>('');
  const noticeTimer = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    const [rows, locks] = [await enrichRows(), getLocks()];
    setState((prev) => {
      // Preserve cursor by pid when possible
      const prevPid = prev.rows[cursor]?.pid;
      const nextCursorIdx =
        prevPid != null ? rows.findIndex((r) => r.pid === prevPid) : -1;
      if (nextCursorIdx >= 0) setCursor(nextCursorIdx);
      else if (cursor >= rows.length) setCursor(Math.max(0, rows.length - 1));
      return { rows, locks };
    });
  }, [cursor]);

  const flash = useCallback((msg: string, kind: 'info' | 'warn' | 'error' = 'info') => {
    setNotice({ msg, kind });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(id);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [load]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') return exit();
    if (input === 'q') return exit();
    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(state.rows.length - 1, c + 1));
      lastKey.current = 'j';
      return;
    }
    if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      lastKey.current = 'k';
      return;
    }
    if (input === 'G') {
      setCursor(Math.max(0, state.rows.length - 1));
      lastKey.current = 'G';
      return;
    }
    if (input === 'g') {
      if (lastKey.current === 'g') {
        setCursor(0);
        lastKey.current = '';
        return;
      }
      lastKey.current = 'g';
      return;
    }
    if (input === 'R') {
      load();
      flash('refreshed');
      return;
    }
    lastKey.current = input;
  });

  const waitingCount = state.rows.filter(isWaitingRow).length;

  return (
    <Box flexDirection="column">
      <Box paddingX={1} borderStyle="single" borderColor="cyan">
        <Text bold color="cyan">Commander</Text>
      </Box>
      <LocksBar locks={state.locks} />
      <SessionTable rows={state.rows} cursor={cursor} />
      {notice && (
        <Box paddingX={1}>
          <Text
            color={notice.kind === 'error' ? 'red' : notice.kind === 'warn' ? 'yellow' : 'green'}
          >
            {notice.msg}
          </Text>
        </Box>
      )}
      <StatusBar sessions={state.rows.length} waiting={waitingCount} refreshSec={REFRESH_MS / 1000} />
    </Box>
  );
}
