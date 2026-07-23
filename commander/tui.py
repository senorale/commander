"""Commander TUI — live view of Claude sessions + dev-env lock state."""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.widgets import DataTable, Footer, Header, Input, RichLog, Static

from . import core


REFRESH_INTERVAL_SEC = 2.0


def _fmt_age(iso: str) -> str:
    try:
        t = datetime.fromisoformat(iso)
        delta = datetime.now(timezone.utc) - t
        secs = int(delta.total_seconds())
        if secs < 60:
            return f"{secs}s"
        if secs < 3600:
            return f"{secs // 60}m"
        return f"{secs // 3600}h{(secs % 3600) // 60}m"
    except Exception:
        return "?"


def _short_worktree(cwd: str) -> str:
    p = Path(cwd)
    home = str(Path.home())
    s = str(p)
    if s.startswith(home):
        s = "~" + s[len(home):]
    return s


def get_sessions() -> list[dict]:
    """Call `claude agents --json`. Return [] on failure."""
    try:
        r = subprocess.run(
            ["claude", "agents", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode != 0:
            return []
        return json.loads(r.stdout) or []
    except (subprocess.SubprocessError, json.JSONDecodeError, FileNotFoundError):
        return []


def get_locks() -> dict[str, dict]:
    """Map repo -> lock dict for repos currently held."""
    locks = {}
    for repo in core.load_registry().get("repos", {}):
        lk = core.read_lock(repo)
        if lk:
            locks[repo] = lk
    return locks


def enrich_rows() -> list[dict]:
    sessions = get_sessions()
    locks = get_locks()
    # Reverse index: session_id -> repo held
    session_to_repo: dict[str, str] = {}
    pid_to_repo: dict[int, str] = {}
    for repo, lk in locks.items():
        sid = lk.get("session_id")
        pid = lk.get("holder_pid")
        if sid:
            session_to_repo[sid] = repo
        if isinstance(pid, int):
            pid_to_repo[pid] = repo

    rows = []
    for s in sessions:
        sid = s.get("sessionId") or ""
        pid = s.get("pid") or 0
        held_repo = session_to_repo.get(sid) or pid_to_repo.get(pid, "")
        rows.append({
            "pid": pid,
            "cwd": s.get("cwd") or "",
            "kind": s.get("kind") or "",
            "status": s.get("status") or "",
            "waitingFor": s.get("waitingFor") or "",
            "name": s.get("name") or "",
            "sessionId": sid,
            "holds": held_repo,
        })
    # Sort: by cwd, then kind (interactive first), then pid
    rows.sort(key=lambda r: (r["cwd"], 0 if r["kind"] == "interactive" else 1, r["pid"]))
    return rows


_WAITING_LABELS = {
    "input": "waiting: input",
    "user_input": "waiting: input",
    "prompt": "waiting: input",
    "approval": "waiting: approval",
    "permission": "waiting: approval",
    "tool_use": "waiting: approval",
    "confirmation": "waiting: approval",
}


def _status_markup(row: dict) -> str:
    """Render status using status + waitingFor. waitingFor wins when populated."""
    status = (row.get("status") or "").lower()
    waiting_for = (row.get("waitingFor") or "").lower()

    if waiting_for:
        label = _WAITING_LABELS.get(waiting_for, f"waiting: {waiting_for}")
        color = "bold red" if "approval" in label else "bold yellow"
        return f"[{color}]{label}[/{color}]"

    if status == "waiting":
        # status=waiting but no waitingFor detail — generic prompt
        return "[bold yellow]waiting[/bold yellow]"
    if status == "busy":
        return "[green]busy[/green]"
    if status == "idle":
        # An "idle" interactive session is really "waiting for you to type the next prompt"
        return "[bold yellow]waiting: input[/bold yellow]"
    if status == "done":
        return "[dim]done[/dim]"
    return status


def _iterm_content_for_tty(tty: str, max_lines: int = 400) -> str:
    """Return the buffer contents of the iTerm session on `tty` (last `max_lines`)."""
    script = f'''
    tell application "iTerm2"
        repeat with w in windows
            repeat with t in tabs of w
                repeat with sess in sessions of t
                    if tty of sess is "{tty}" then
                        return contents of sess
                    end if
                end repeat
            end repeat
        end repeat
    end tell
    return ""
    '''
    try:
        r = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=3,
        )
    except (subprocess.SubprocessError, FileNotFoundError):
        return ""
    lines = (r.stdout or "").splitlines()
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    return "\n".join(lines)


def _iterm_send_for_tty(tty: str, text: str) -> tuple[bool, str]:
    """Type `text` (plus newline) into the iTerm session on `tty`. Returns (ok, detail).

    Two modes:
      - **Short sends (≤2 chars)** — permission-prompt answers like "1" / "y" / "no".
        Sent literally + CR. NO Esc+i prefix (that would dismiss the prompt and
        type "i<answer>" into the chat input instead of selecting the option).
      - **Longer sends** — chat messages. Sent as Esc → 150ms → i<text> → 100ms → CR.
        Guarantees the vim-mode input area lands in INSERT before typing.
    """
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    if len(text) <= 2:
        body = f'''
                        tell sess to write text ("{escaped}") newline NO
                        delay 0.05
                        tell sess to write text (ASCII character 13) newline NO
        '''
    else:
        body = f'''
                        tell sess to write text (ASCII character 27) newline NO
                        delay 0.15
                        tell sess to write text ("i" & "{escaped}") newline NO
                        delay 0.1
                        tell sess to write text (ASCII character 13) newline NO
        '''
    script = f'''
    tell application "iTerm2"
        repeat with w in windows
            repeat with t in tabs of w
                repeat with sess in sessions of t
                    if tty of sess is "{tty}" then
                        {body}
                        return "OK"
                    end if
                end repeat
            end repeat
        end repeat
    end tell
    return "MISS"
    '''
    try:
        r = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=3,
        )
        out = (r.stdout or "").strip()
        err = (r.stderr or "").strip()
        if out == "OK":
            return True, "sent"
        return False, err or out or f"applescript returned {out!r}"
    except (subprocess.SubprocessError, FileNotFoundError) as e:
        return False, str(e)


def _find_tty_for_pid(pid: int) -> str | None:
    """Return the controlling TTY device path (e.g. /dev/ttys004) for a pid, or None.

    Walks up the process tree if the pid itself has no controlling tty (some daemonized
    Claude sessions fork; the interactive parent shell has the tty).
    """
    current = pid
    for _ in range(6):  # bounded walk
        try:
            r = subprocess.run(
                ["ps", "-o", "tty=,ppid=", "-p", str(current)],
                capture_output=True, text=True, timeout=2,
            )
        except (subprocess.SubprocessError, FileNotFoundError):
            return None
        line = r.stdout.strip()
        if not line:
            return None
        parts = line.split()
        if len(parts) < 2:
            return None
        tty_val, ppid = parts[0], parts[1]
        if tty_val and tty_val != "?" and tty_val != "??":
            # macOS ps returns e.g. "ttys004" — iTerm's `tty of session` gives "/dev/ttys004"
            return tty_val if tty_val.startswith("/dev/") else f"/dev/{tty_val}"
        try:
            current = int(ppid)
        except ValueError:
            return None
        if current <= 1:
            return None
    return None


class CommanderView(App):
    CSS = """
    Screen { layout: vertical; }
    #locks-bar {
        dock: top;
        height: auto;
        min-height: 1;
        background: $panel;
        color: $text;
        padding: 0 1;
    }
    #main-split { layout: horizontal; height: 1fr; }
    #table-wrap { width: 1fr; }
    #table-wrap.hidden { display: none; }
    #preview-wrap { width: 1fr; border-left: solid $primary; }
    #preview-wrap.hidden { display: none; }
    #preview-title {
        dock: top;
        height: 1;
        background: $panel;
        color: $text;
        padding: 0 1;
    }
    DataTable { height: 1fr; }
    DataTable > .datatable--cursor {
        background: $accent;
        color: $text;
    }
    RichLog#preview { height: 1fr; padding: 0 1; }
    Input#input-box {
        dock: bottom;
        display: none;
        border: solid $accent;
    }
    Input#input-box.visible { display: block; }
    #status-bar {
        dock: bottom;
        height: 1;
        background: $surface;
        color: $text-muted;
        padding: 0 1;
    }
    """

    TITLE = "Commander"

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("ctrl+c", "quit", "Quit", show=False, priority=True),
        Binding("j", "cursor_down", "Down", show=False),
        Binding("k", "cursor_up", "Up", show=False),
        Binding("G", "go_bottom", "Bottom", show=False),
        Binding("f5", "refresh", "Refresh"),
        Binding("escape", "close_panels", "Close", show=False),
        Binding("i", "open_input", "Send text"),
        Binding("t", "focus_tab", "iTerm tab"),
        Binding("r", "release_lock", "Release"),
        Binding("s", "steal_lock", "Steal"),
    ]

    _last_key = ""
    _preview_visible = False
    _last_preview_pid: int | None = None

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("", id="locks-bar")
        with Horizontal(id="main-split"):
            with Vertical(id="table-wrap"):
                yield DataTable(id="table")
            with Vertical(id="preview-wrap", classes="hidden"):
                yield Static("[bold]Preview[/bold] — select a row", id="preview-title")
                yield RichLog(id="preview", highlight=False, markup=False, wrap=True, max_lines=2000, auto_scroll=False)
        yield Input(placeholder="type message → Enter sends to selected session → Esc cancels", id="input-box")
        yield Static("", id="status-bar")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.cursor_type = "row"
        table.add_columns("Worktree", "Status", "PID", "Name", "Holds")
        self.load()
        self.set_interval(REFRESH_INTERVAL_SEC, self.load)
        self.set_interval(REFRESH_INTERVAL_SEC, self._refresh_preview)

    @work(thread=True, exclusive=True, group="load")
    def load(self) -> None:
        """Fetch sessions + locks in a background thread, then apply to UI on the main thread."""
        rows = enrich_rows()
        locks = get_locks()
        self.app.call_from_thread(self._apply_load, rows, locks)

    def _apply_load(self, rows: list[dict], locks: dict[str, dict]) -> None:
        table = self.query_one(DataTable)
        locks_bar = self.query_one("#locks-bar", Static)
        status_bar = self.query_one("#status-bar", Static)

        # Preserve cursor
        prev_key = None
        try:
            row_key, _ = table.coordinate_to_cell_key(table.cursor_coordinate)
            prev_key = row_key.value
        except Exception:
            pass

        table.clear()

        waiting = 0
        row_keys = []
        for r in rows:
            key = f"{r['pid']}"
            row_keys.append(key)
            status_disp = _status_markup(r)
            holds = f"🔒 {r['holds']}" if r["holds"] else ""
            table.add_row(
                _short_worktree(r["cwd"]),
                status_disp,
                str(r["pid"]),
                r["name"] or "-",
                holds,
                key=key,
            )
            s_lower = (r["status"] or "").lower()
            if s_lower == "waiting" or r.get("waitingFor") or (s_lower == "idle" and r["kind"] == "interactive"):
                waiting += 1

        # Restore cursor
        if prev_key and prev_key in row_keys:
            table.move_cursor(row=row_keys.index(prev_key))

        # Locks bar
        if not locks:
            locks_bar.update("[dim]no dev-env locks held[/dim]")
        else:
            parts = []
            for repo, lk in locks.items():
                stale = core.is_lock_stale(lk)
                tag = "[red]STALE[/red]" if stale else "[green]held[/green]"
                parts.append(
                    f"{tag} [bold]{repo}[/bold] branch={lk.get('branch')} "
                    f"session={(lk.get('session_id') or '?')[:8]} "
                    f"age={_fmt_age(lk.get('acquired_at') or '')}"
                )
            locks_bar.update("  |  ".join(parts))

        wait_msg = f"[bold yellow]{waiting} waiting[/bold yellow]" if waiting else "0 waiting"
        status_bar.update(f" {len(rows)} sessions | {wait_msg} | refresh {REFRESH_INTERVAL_SEC:.0f}s ")

    # Nav

    def on_key(self, event) -> None:
        if event.key == "g" and self._last_key == "g":
            self.query_one(DataTable).move_cursor(row=0)
            self._last_key = ""
            event.prevent_default()
            return
        self._last_key = event.key

    def action_cursor_down(self) -> None:
        self.query_one(DataTable).action_cursor_down()

    def action_cursor_up(self) -> None:
        self.query_one(DataTable).action_cursor_up()

    def action_go_bottom(self) -> None:
        table = self.query_one(DataTable)
        table.move_cursor(row=max(0, table.row_count - 1))

    def action_refresh(self) -> None:
        self.load()
        self._refresh_preview()
        self.notify("refreshed")

    # Preview pane

    def action_open_preview(self) -> None:
        """Enter: open the preview full-screen; Esc returns to the table."""
        self._preview_visible = True
        self.query_one("#preview-wrap").remove_class("hidden")
        self.query_one("#table-wrap").add_class("hidden")
        # Reset the pid cache so _refresh_preview treats this as a new session
        # → snaps to bottom of buffer.
        self._last_preview_pid = None
        self._refresh_preview()

    def action_close_panels(self) -> None:
        """Escape: close the input if visible, else collapse the preview back to the table."""
        inp = self.query_one("#input-box", Input)
        if inp.has_class("visible"):
            self.action_close_input()
            return
        if self._preview_visible:
            self._preview_visible = False
            self.query_one("#preview-wrap").add_class("hidden")
            self.query_one("#table-wrap").remove_class("hidden")
            self.query_one(DataTable).focus()

    def on_data_table_row_highlighted(self, event) -> None:  # noqa: ARG002
        self._refresh_preview()

    @work(thread=True, exclusive=True)
    def _refresh_preview(self) -> None:
        if not self._preview_visible:
            return
        try:
            log = self.query_one("#preview", RichLog)
            title = self.query_one("#preview-title", Static)
        except Exception:
            return
        r = self._selected_row()
        if not r:
            self._last_preview_pid = None
            self.app.call_from_thread(title.update, "[bold]Preview[/bold] — no row selected")
            self.app.call_from_thread(log.clear)
            return
        pid = r.get("pid")
        is_new_row = (pid != self._last_preview_pid)
        self._last_preview_pid = pid
        tty = _find_tty_for_pid(pid) if pid else None
        header = f"[bold]Preview[/bold] pid={pid} tty={tty or '?'} — {r.get('name') or ''}"
        self.app.call_from_thread(title.update, header)
        if not tty:
            self.app.call_from_thread(self._replace_preview, "(no controlling tty — bg session or dead process)", True)
            return
        content = _iterm_content_for_tty(tty)
        if not content:
            self.app.call_from_thread(self._replace_preview, "(empty buffer or iTerm did not respond)", True)
            return
        self.app.call_from_thread(self._replace_preview, content, is_new_row)

    def _replace_preview(self, content: str, snap_to_bottom: bool) -> None:
        """Rewrite the RichLog contents. Tail-`f` behavior:
        - `snap_to_bottom=True` (new row / open / F5) → always scroll to end.
        - `snap_to_bottom=False` (interval tick on same row) → if user was already
          at the bottom, follow the tail; if they scrolled up, preserve their spot.
        """
        log = self.query_one("#preview", RichLog)
        prev_scroll = log.scroll_y
        was_at_bottom = log.scroll_y >= max(0, log.max_scroll_y - 1)
        log.clear()
        log.write(content)
        if snap_to_bottom or was_at_bottom:
            log.scroll_end(animate=False)
        else:
            log.scroll_to(y=prev_scroll, animate=False)

    # Input modal

    def action_open_input(self) -> None:
        r = self._selected_row()
        if not r:
            self.notify("select a row first", severity="warning")
            return
        pid = r.get("pid")
        if not pid or not _find_tty_for_pid(pid):
            self.notify("selected row has no tty (cannot send input)", severity="warning")
            return
        inp = self.query_one("#input-box", Input)
        inp.add_class("visible")
        inp.focus()

    def action_close_input(self) -> None:
        inp = self.query_one("#input-box", Input)
        inp.value = ""
        inp.remove_class("visible")
        self.query_one(DataTable).focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id != "input-box":
            return
        text = getattr(event, "value", None)
        if text is None:
            text = event.input.value
        inp = self.query_one("#input-box", Input)
        inp.value = ""
        # Stay in "insert mode" so follow-ups don't require re-pressing `i`. Esc exits.
        inp.focus()
        if not (text or "").strip():
            return
        self._send_text(text)

    @work(thread=True)
    def _send_text(self, text: str) -> None:
        r = self._selected_row()
        if not r:
            return
        pid = r.get("pid")
        tty = _find_tty_for_pid(pid) if pid else None
        if not tty:
            self.app.call_from_thread(self.notify, "no tty for selected row", severity="error")
            return
        ok, detail = _iterm_send_for_tty(tty, text)
        if ok:
            self.app.call_from_thread(self._refresh_preview)
        else:
            self.app.call_from_thread(self.notify, f"send failed: {detail}", severity="error")

    # Row-scoped actions

    def _selected_row(self) -> dict | None:
        table = self.query_one(DataTable)
        try:
            row_idx = table.cursor_coordinate.row
        except Exception:
            return None
        rows = enrich_rows()
        if 0 <= row_idx < len(rows):
            return rows[row_idx]
        return None

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        """Fires when DataTable consumes Enter — hand off to open_preview."""
        self.action_open_preview()

    def action_focus_tab(self) -> None:
        self.notify("focus_tab: locating tab...")
        r = self._selected_row()
        if not r:
            self.notify("no row selected", severity="warning")
            return
        pid = r.get("pid")
        if not pid:
            self.notify("no pid on selected row", severity="warning")
            return

        # Prefer tty discovery from pid — works for any live process regardless of lock history.
        # Walk up parent processes if needed since `claude` may fork; the controlling TTY is inherited.
        tty = _find_tty_for_pid(pid)
        if tty:
            script = f'''
            tell application "iTerm2"
                activate
                repeat with w in windows
                    repeat with t in tabs of w
                        repeat with sess in sessions of t
                            if tty of sess is "{tty}" then
                                select sess
                                select t
                                select w
                                return
                            end if
                        end repeat
                    end repeat
                end repeat
            end tell
            '''
            try:
                subprocess.run(["osascript", "-e", script], check=False)
                self.notify(f"focused pid {pid} ({tty})")
                return
            except Exception as e:
                self.notify(f"focus failed: {e}", severity="error")
                return

        # Fallback: lock-file-recorded iTerm session id (older sessions before tty lookup existed).
        iterm_sid = ""
        for _repo, lk in get_locks().items():
            if lk.get("session_id") == r["sessionId"]:
                iterm_sid = lk.get("iterm_session_id") or ""
                break
        if not iterm_sid:
            self.notify(
                f"could not resolve tty for pid {pid} (process may be dead or bg-only)",
                severity="warning",
            )
            return
        script = f'''
        tell application "iTerm2"
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with sess in sessions of t
                        if unique id of sess is "{iterm_sid}" then
                            select sess
                            select t
                            select w
                            activate
                            return
                        end if
                    end repeat
                end repeat
            end tell
        end tell
        '''
        subprocess.run(["osascript", "-e", script], check=False)
        self.notify(f"focused pid {pid} (via lock)")

    @work(thread=True)
    def action_release_lock(self) -> None:
        r = self._selected_row()
        if not r:
            self.app.call_from_thread(self.notify, "no row selected", severity="warning")
            return
        try:
            repo, _cfg, _main = core.detect_repo(r["cwd"])
        except core.CommanderError as e:
            self.app.call_from_thread(self.notify, str(e), severity="error")
            return
        try:
            core.release(repo=repo, cwd=r["cwd"])
            self.app.call_from_thread(self.load)
            self.app.call_from_thread(self.notify, f"released {repo}", severity="information")
        except core.CommanderError as e:
            self.app.call_from_thread(self.notify, str(e), severity="error")

    @work(thread=True)
    def action_steal_lock(self) -> None:
        # Steal the lock on the repo of the currently-selected row's worktree.
        r = self._selected_row()
        if not r:
            self.app.call_from_thread(self.notify, "no row selected", severity="warning")
            return
        try:
            repo, _cfg, _main = core.detect_repo(r["cwd"])
        except core.CommanderError as e:
            self.app.call_from_thread(self.notify, str(e), severity="error")
            return
        try:
            core.steal(repo=repo, cwd=r["cwd"])
            self.app.call_from_thread(self.load)
            self.app.call_from_thread(self.notify, f"stolen {repo}", severity="information")
        except core.CommanderError as e:
            self.app.call_from_thread(self.notify, str(e), severity="error")


def run() -> int:
    CommanderView().run()
    return 0
