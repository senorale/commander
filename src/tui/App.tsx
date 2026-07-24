import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { enrichRows, getLocks, isWaitingRow, type EnrichedRow } from '../sessions.js';
import type { Lock } from '../types.js';
import { findTtyForPid } from '../tty.js';
import { contentForTty, focusTty, focusUniqueId, sendForTty } from '../iterm.js';
import { detectRepo, release, steal } from '../core.js';
import { CommanderError } from '../errors.js';
import { useTheme } from '../theme.js';
import { LocksBar } from './LocksBar.js';
import { SessionTable } from './SessionTable.js';
import { StatusBar } from './StatusBar.js';
import { PreviewPane } from './PreviewPane.js';
import { InputBox } from './InputBox.js';

const REFRESH_MS = 2000;

type Mode = 'table' | 'preview';

interface Preview {
  pid: number | null;
  tty: string | null;
  name: string;
  content: string;
  scrollOffset: number; // 0 = bottom
  atBottom: boolean;
  lastPid: number | null;
}

const EMPTY_PREVIEW: Preview = {
  pid: null,
  tty: null,
  name: '',
  content: '',
  scrollOffset: 0,
  atBottom: true,
  lastPid: null,
};

interface State {
  rows: EnrichedRow[];
  locks: Record<string, Lock>;
}

export function App(): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<State>({ rows: [], locks: {} });
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('table');
  const [preview, setPreview] = useState<Preview>(EMPTY_PREVIEW);
  const [inputOpen, setInputOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [notice, setNotice] = useState<{ msg: string; kind: 'info' | 'warn' | 'error' } | null>(null);
  const lastKey = useRef<string>('');
  const noticeTimer = useRef<NodeJS.Timeout | null>(null);
  const cursorRef = useRef(cursor);
  const stateRef = useRef(state);
  const modeRef = useRef<Mode>(mode);
  const previewRef = useRef<Preview>(preview);

  cursorRef.current = cursor;
  stateRef.current = state;
  modeRef.current = mode;
  previewRef.current = preview;

  const flash = useCallback((msg: string, kind: 'info' | 'warn' | 'error' = 'info') => {
    setNotice({ msg, kind });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }, []);

  const load = useCallback(async () => {
    const [rows, locks] = [await enrichRows(), getLocks()];
    setState((prev) => {
      const prevPid = prev.rows[cursorRef.current]?.pid;
      const nextIdx = prevPid != null ? rows.findIndex((r) => r.pid === prevPid) : -1;
      if (nextIdx >= 0) setCursor(nextIdx);
      else if (cursorRef.current >= rows.length) setCursor(Math.max(0, rows.length - 1));
      return { rows, locks };
    });
  }, []);

  const refreshPreview = useCallback(async () => {
    if (modeRef.current !== 'preview') return;
    const row = stateRef.current.rows[cursorRef.current];
    if (!row) {
      setPreview({ ...EMPTY_PREVIEW });
      return;
    }
    const pid = row.pid;
    const isNewRow = pid !== previewRef.current.lastPid;
    const tty = pid ? await findTtyForPid(pid) : null;
    if (!tty) {
      setPreview((p) => ({
        ...p,
        pid,
        tty: null,
        name: row.name || '',
        content: '(no controlling tty — bg session or dead process)',
        lastPid: pid,
        scrollOffset: 0,
        atBottom: true,
      }));
      return;
    }
    const content = await contentForTty(tty);
    setPreview((p) => {
      const snap = isNewRow || p.atBottom;
      return {
        pid,
        tty,
        name: row.name || '',
        content: content || '(empty buffer or iTerm did not respond)',
        lastPid: pid,
        scrollOffset: snap ? 0 : p.scrollOffset,
        atBottom: snap,
      };
    });
  }, []);

  useEffect(() => {
    load();
    const dataTimer = setInterval(load, REFRESH_MS);
    const previewTimer = setInterval(refreshPreview, REFRESH_MS);
    return () => {
      clearInterval(dataTimer);
      clearInterval(previewTimer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [load, refreshPreview]);

  useEffect(() => {
    if (mode === 'preview') {
      setPreview({ ...EMPTY_PREVIEW });
      refreshPreview();
    }
  }, [mode, refreshPreview]);

  const openPreview = useCallback(() => {
    const row = stateRef.current.rows[cursorRef.current];
    if (!row) {
      flash('select a row first', 'warn');
      return;
    }
    setMode('preview');
  }, [flash]);

  const closePanels = useCallback(() => {
    if (inputOpen) {
      setInputValue('');
      setInputOpen(false);
      return;
    }
    if (modeRef.current === 'preview') {
      setMode('table');
    }
  }, [inputOpen]);

  const openInput = useCallback(() => {
    const row = stateRef.current.rows[cursorRef.current];
    if (!row) {
      flash('select a row first', 'warn');
      return;
    }
    setInputOpen(true);
  }, [flash]);

  const submitInput = useCallback(
    async (text: string) => {
      setInputValue('');
      if (!text.trim()) return;
      const row = stateRef.current.rows[cursorRef.current];
      if (!row?.pid) {
        flash('no row / no pid', 'error');
        return;
      }
      const tty = await findTtyForPid(row.pid);
      if (!tty) {
        flash('no tty for selected row', 'error');
        return;
      }
      const result = await sendForTty(tty, text);
      if (result.ok) {
        flash('sent');
        refreshPreview();
      } else {
        flash(`send failed: ${result.detail}`, 'error');
      }
    },
    [flash, refreshPreview],
  );

  const doFocusTab = useCallback(async () => {
    const row = stateRef.current.rows[cursorRef.current];
    if (!row?.pid) {
      flash('no row / no pid', 'warn');
      return;
    }
    const tty = await findTtyForPid(row.pid);
    if (tty) {
      await focusTty(tty);
      flash(`focused pid ${row.pid} (${tty})`);
      return;
    }
    // Fallback: iterm session id from lock file
    let itermSid = '';
    for (const lk of Object.values(stateRef.current.locks)) {
      if (lk.session_id === row.sessionId) {
        itermSid = lk.iterm_session_id || '';
        break;
      }
    }
    if (!itermSid) {
      flash(`could not resolve tty for pid ${row.pid}`, 'warn');
      return;
    }
    await focusUniqueId(itermSid);
    flash(`focused pid ${row.pid} (via lock)`);
  }, [flash]);

  const doRelease = useCallback(async () => {
    const row = stateRef.current.rows[cursorRef.current];
    if (!row) {
      flash('no row selected', 'warn');
      return;
    }
    try {
      const { name: repo } = await detectRepo(row.cwd);
      await release({ repo, cwd: row.cwd });
      flash(`released ${repo}`);
      load();
    } catch (e) {
      flash(e instanceof CommanderError ? e.message : String(e), 'error');
    }
  }, [flash, load]);

  const doSteal = useCallback(async () => {
    const row = stateRef.current.rows[cursorRef.current];
    if (!row) {
      flash('no row selected', 'warn');
      return;
    }
    try {
      const { name: repo } = await detectRepo(row.cwd);
      await steal({ repo, cwd: row.cwd });
      flash(`stolen ${repo}`);
      load();
    } catch (e) {
      flash(e instanceof CommanderError ? e.message : String(e), 'error');
    }
  }, [flash, load]);

  const termRows = stdout?.rows ?? 40;
  const previewHeight = Math.max(5, termRows - 8);

  useInput(
    (input, key) => {
      // While input box is focused, only handle Escape here; TextInput consumes the rest.
      if (inputOpen) {
        if (key.escape) closePanels();
        return;
      }

      // Global keys — work in both table and preview modes.
      if (key.ctrl && input === 'c') return exit();
      if (input === 'q') return exit();
      if (key.escape) return closePanels();
      if (input === 'i') {
        openInput();
        return;
      }
      if (input === 't') return void doFocusTab();
      if (input === 'r') return void doRelease();
      if (input === 's') return void doSteal();

      if (mode === 'preview') {
        const totalLines = preview.content ? preview.content.split('\n').length : 0;
        const maxScroll = Math.max(0, totalLines - previewHeight);
        const pageStep = Math.max(1, Math.floor(previewHeight / 2));
        if (input === 'j' || key.downArrow) {
          setPreview((p) => {
            const next = Math.max(0, p.scrollOffset - 1);
            return { ...p, scrollOffset: next, atBottom: next === 0 };
          });
          return;
        }
        if (input === 'k' || key.upArrow) {
          setPreview((p) => {
            const next = Math.min(maxScroll, p.scrollOffset + 1);
            return { ...p, scrollOffset: next, atBottom: next === 0 };
          });
          return;
        }
        if (key.ctrl && input === 'd') {
          setPreview((p) => {
            const next = Math.max(0, p.scrollOffset - pageStep);
            return { ...p, scrollOffset: next, atBottom: next === 0 };
          });
          return;
        }
        if (key.ctrl && input === 'u') {
          setPreview((p) => {
            const next = Math.min(maxScroll, p.scrollOffset + pageStep);
            return { ...p, scrollOffset: next, atBottom: next === 0 };
          });
          return;
        }
        if (input === 'G') {
          setPreview((p) => ({ ...p, scrollOffset: 0, atBottom: true }));
          return;
        }
        if (input === 'g') {
          if (lastKey.current === 'g') {
            setPreview((p) => ({ ...p, scrollOffset: maxScroll, atBottom: maxScroll === 0 }));
            lastKey.current = '';
            return;
          }
          lastKey.current = 'g';
          return;
        }
        if (input === 'R') {
          refreshPreview();
          flash('refreshed');
          return;
        }
        // No table-nav in preview mode
        return;
      }

      // Table mode
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
      if (key.return) return openPreview();
      lastKey.current = input;
    },
    { isActive: true },
  );

  const waitingCount = state.rows.filter(isWaitingRow).length;
  const theme = useTheme();
  const noticeColor =
    notice?.kind === 'error' ? theme.error : notice?.kind === 'warn' ? theme.warn : theme.info;

  return (
    <Box flexDirection="column">
      <Box paddingX={1} borderStyle="single" borderColor={theme.primaryBorder}>
        <Text bold={theme.useBold} color={theme.primary}>Commander</Text>
      </Box>
      <LocksBar locks={state.locks} />
      {mode === 'table' ? (
        <SessionTable rows={state.rows} cursor={cursor} />
      ) : (
        <PreviewPane
          pid={preview.pid}
          tty={preview.tty}
          name={preview.name}
          content={preview.content}
          scrollOffset={preview.scrollOffset}
          viewportHeight={previewHeight}
        />
      )}
      {inputOpen && (
        <InputBox
          value={inputValue}
          onChange={setInputValue}
          onSubmit={submitInput}
          focus={inputOpen}
        />
      )}
      {notice && (
        <Box paddingX={1}>
          <Text color={noticeColor}>{notice.msg}</Text>
        </Box>
      )}
      <StatusBar sessions={state.rows.length} waiting={waitingCount} />
    </Box>
  );
}
