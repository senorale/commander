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

Requires Python 3.9+ and macOS (iTerm2 integration is AppleScript).

```bash
git clone https://github.com/senorale/commander.git ~/projects/commander
cd ~/projects/commander
make install
```

`make install` creates `~/projects/commander/.venv`, installs `textual`, and links `~/bin/commander`. Ensure `~/bin` is in your PATH:

```bash
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

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

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate up / down |
| `gg` | Jump to top |
| `G` | Jump to bottom |
| `Enter` | Open side panel showing the selected session's iTerm buffer |
| `Esc` | Close panel / cancel input |
| `i` | Open input box; type + Enter to send to the selected session's tty |
| `t` | Jump to that session's iTerm tab |
| `r` | Release the lock on the selected row's repo |
| `s` | Steal the lock on the selected row's repo (refuses if main worktree is dirty) |
| `F5` | Force refresh |
| `q` / `Ctrl+C` | Quit |

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

~/bin/commander              # shim that runs `.venv/bin/python -m commander.cli`
~/.claude/commander/
├── registry.json            # repo registry
└── <repo>.lock              # per-repo lock (present = held)
```

## Tech stack

- **Python 3.9+** — no compile step; venv-managed
- **[Textual](https://github.com/Textualize/textual)** — TUI framework
- **git CLI** — worktree / checkout / reset / push
- **AppleScript** — iTerm2 tab focus + buffer capture + text send-back
