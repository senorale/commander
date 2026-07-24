# Commander

Dev-env lock coordination + live session dashboard for parallel Claude Code worktree sessions.

Solves two problems:

1. **Branch juggling.** Each Claude session lives in its own git worktree, permanently pinned to a ticket branch. No more `git checkout` between conversations.
2. **Shared dev env.** When your dev stack is too heavy to run twice (typical for large docker-compose projects), only one branch can hold the "main worktree" at a time. Sessions coordinate via a lock file so they don't clobber each other mid-test.

## Features

- **CLI (`commander`)** — `take` / `release` / `steal` / `status` / `register` — agents call from their Bash tool
- **TUI (`commander view`, default when run bare)** — live view of every Claude session (`claude agents --json`) grouped by worktree, blocked-on-input highlighted in yellow, lock holders shown up top
- **Registry** — per-repo main path + rebuild command lives in `~/.claude/commander/registry.json`; add new repos with `commander register`
- **PID liveness detection** — stale locks (holder crashed) auto-cleared on next `take`
- **iTerm2 integration** — jump to a session's tab (`t`), preview its buffer in a side pane, send text or menu answers back without leaving commander

## Install

Requires Node 20+ and macOS (iTerm2 integration is AppleScript).

```bash
git clone https://github.com/senorale/commander.git ~/projects/commander
cd ~/projects/commander
make install
```

`make install` runs `npm install`, builds the TypeScript, and links `~/.local/bin/commander` (XDG). Ensure `~/.local/bin` is in your PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Install warns if iTerm2 is not the current terminal — commander drives iTerm2 via AppleScript (tab focus, buffer capture). Install with `brew install --cask iterm2`.


## Register your repos

Registry lives at `~/.claude/commander/registry.json`. Add each repo with its main worktree path and the command that rebuilds its dev stack:

```bash
commander register my_repo \
  --main ~/code/my_repo \
  --rebuild docker compose -f ~/code/my_repo/docker-compose.yml up --build -d \
  --base main
```

`--rebuild` takes an argv list (everything after the flag). Point it at whatever command spins up your dev environment on the current branch (docker compose, tilt, `bin/dev`, etc.). `--base` is the branch to return to on `release` (defaults to `develop`).

Register as many repos as you want — each gets its own lock file.

## Usage

### For humans

```bash
commander              # launches the TUI (same as `commander view`)
commander status       # quick text status
```

### For Claude sessions (agents)

**Before** running anything that hits containerized code (`docker compose exec ...`, tests that need the running app):

```bash
commander take
```

**After** you're done:

```bash
commander release
```

Ship a skill (`.claude/skills/commander/SKILL.md`) or a snippet in your project `CLAUDE.md` that instructs sessions when to call these — commander is only useful if agents actually invoke it.

## TUI keybindings

Standard vim motions (`j`/`k`/`gg`/`G`/`Ctrl-U`/`Ctrl-D`) work for nav in the table and scroll in the preview.

| Key | Action |
|-----|--------|
| `Enter` | Open the selected session's iTerm buffer in preview |
| `Esc` | Close input box, or leave preview back to the table |
| `i` | Open input box; type + Enter to send text to the selected session's tty |
| `t` | Jump to that session's iTerm tab |
| `r` | Release the lock on the selected row's repo |
| `s` | Steal the lock on the selected row's repo (refuses if main worktree is dirty) |
| `R` | Force refresh |
| `q` / `Ctrl+C` | Quit |

## Theming

Commander respects your terminal's color scheme — named colors (`cyan`, `green`, `red`, etc.) resolve through your iTerm profile, so a light-mode iTerm just works. Two built-in themes and a config-file escape hatch:

- `--theme default` — colored, uses terminal palette (the default)
- `--theme mono` — no colors, emphasis via bold/underline only (accessibility / high-contrast / color-blindness)

Resolution priority (highest wins):

1. `--theme <name>` flag on `commander view`
2. `$COMMANDER_THEME` env var
3. `~/.config/commander/theme.json` (or `$XDG_CONFIG_HOME/commander/theme.json`)
4. Built-in `default`

The config file is a partial override, optionally extending a built-in:

```json
{
  "extends": "default",
  "selectedBg": "magenta",
  "approval": "#ff5555",
  "input": "yellow",
  "useDim": false
}
```

Semantic tokens: `primary`, `primaryBorder`, `selectedBg`, `lockHeld`, `lockStale`, `running`, `input`, `approval`, `info`, `warn`, `error`, `inputBorder`, `inputChevron`, `useBold`, `useUnderline`, `useDim`. Values are Ink color names (`red`/`yellow`/`green`/…) or hex strings.

## Lock lifecycle

`commander take` from a worktree at `~/code/my_repo-featureX` on branch `featureX`:

1. Detect repo (`my_repo`) via `git rev-parse --git-common-dir`
2. Refuse if uncommitted changes in the worktree
3. `git push origin featureX`
4. `git checkout --detach` in the worktree (releases the branch grip)
5. Write `~/.claude/commander/my_repo.lock` with holder metadata: `{repo, branch, holder_pid, session_id, iterm_session_id, acquired_at, original_base, worktree_path, main_path}`
6. In main: `git fetch && git checkout featureX && git reset --hard origin/featureX`
7. Run the repo's `rebuild_cmd`

`commander release`:

1. Verify the caller's session/pid matches the lock holder
2. In main: `git checkout <original_base>`
3. In the original worktree: `git checkout <branch>` (reattach)
4. Delete the lock file

Stale locks (holder pid no longer alive) are detected via `os.kill(pid, 0)` and auto-cleared by the next `take`.

## Layout

```
~/projects/commander/
├── commander/
│   ├── __init__.py
│   ├── core.py         # lock / git / registry / PID liveness / rebuild trigger
│   ├── cli.py          # argparse frontend
│   └── tui.py          # Textual dashboard
├── .venv/              # created by `make install`
├── Makefile
└── README.md

~/.local/bin/commander       # shim that runs `.venv/bin/python -m commander.cli`
~/.claude/commander/
├── registry.json            # repo registry
└── <repo>.lock              # per-repo lock (present = held)
```

## Tech stack

- **Python 3.9+** — no compile step; venv-managed
- **[Textual](https://github.com/Textualize/textual)** — TUI framework
- **git CLI** — worktree / checkout / reset / push
- **AppleScript** — iTerm2 tab focus + buffer capture + text send-back
