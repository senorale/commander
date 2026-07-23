# Commander

Dev-env lock coordination + live session dashboard for parallel Claude Code worktree sessions.

Solves two problems:

1. **Branch juggling.** Each Claude session lives in its own git worktree, permanently pinned to a ticket branch. No more `git checkout` between conversations.
2. **Shared dev env.** Only one branch of `mycase_app` (or `mycase_login`) can hold the main worktree — its docker stack is too resource-heavy to run twice. Sessions coordinate via a lock file so they don't clobber each other mid-test.

## Features

- **CLI (`commander`)** — `take` / `release` / `steal` / `status` / `register` — agents call from their Bash tool
- **TUI (`commander view`)** — live view of every Claude session (`claude agents --json`) grouped by worktree, blocked-on-input highlighted in yellow, lock holders shown up top
- **Registry** — per-repo main path + rebuild command lives in `~/.claude/commander/registry.json`; add new repos with `commander register`
- **PID liveness detection** — stale locks (holder crashed) auto-cleared on next `take`
- **iTerm2 tab focus** — jump straight to the terminal running the blocked session (`Enter` in TUI)

## Install

Requires Python 3.9+ and macOS (iTerm2 focus is AppleScript).

```bash
git clone <this-repo> ~/projects/commander
cd ~/projects/commander
make install
```

`make install` creates `~/projects/commander/.venv`, installs `textual`, and links `~/bin/commander`. Ensure `~/bin` is in your PATH:

```bash
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## Bootstrap for MyCase

Registry lives at `~/.claude/commander/registry.json`. Seed with:

```bash
commander register mycase_app \
  --main ~/mycase/mycase_app \
  --rebuild docker compose \
    -f ~/mycase/mycase_app/docker-compose-services.yml \
    -f ~/mycase/mycase_app/docker-compose.yml \
    up --build -d

commander register mycase_login \
  --main ~/mycase/mycase_login \
  --rebuild docker compose \
    -f ~/mycase/mycase_login/docker-compose.yml \
    up --build -d
```

## Usage

### For humans

```bash
commander view          # launch the TUI
commander status        # quick text status
```

### For Claude sessions (agents)

**Before** running anything containerized (`docker compose exec front ...`):

```bash
commander take
```

**After** you're done:

```bash
commander release
```

Full details of when/why in `~/.claude/skills/commander/SKILL.md`.

## Keybindings (TUI)

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate up / down |
| `gg` | Jump to top |
| `G` | Jump to bottom |
| `Enter` | Focus that session's iTerm tab (via AppleScript) |
| `r` | Release the lock the selected row holds |
| `s` | Steal a held lock (MVP: first held) |
| `F5` | Force refresh |
| `q` | Quit |

## Lock lifecycle

`commander take` from a worktree at `~/mycase/mycase_app-cmdtest` on branch `cmdtest-branch`:

1. Detect repo (`mycase_app`) via `git rev-parse --git-common-dir`
2. Refuse if uncommitted changes in worktree
3. `git push origin cmdtest-branch`
4. `git checkout --detach` in worktree (releases branch)
5. Write `~/.claude/commander/mycase_app.lock` with `{repo, branch, holder_pid, session_id, iterm_session_id, acquired_at, original_base, worktree_path, main_path}`
6. In main: `git fetch && git checkout cmdtest-branch && git reset --hard origin/cmdtest-branch`
7. Run the repo's `rebuild_cmd`

`commander release`:

1. Verify caller session/pid matches holder
2. In main: `git checkout <original_base>` (usually `develop`)
3. In worktree: `git checkout <branch>` (reattach)
4. Delete lock file

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

~/bin/commander         # shim that runs `.venv/bin/python -m commander.cli`
~/.claude/commander/
├── registry.json       # repo registry
└── <repo>.lock         # per-repo lock (present = held)
~/.claude/skills/commander/SKILL.md   # agent instructions
```

## Tech Stack

- **Python 3.9+** — no compile step; venv-managed
- **[Textual](https://github.com/Textualize/textual)** — TUI framework
- **git CLI** — worktree / checkout / reset / push
- **docker CLI** — rebuild containers via registered command
- **AppleScript** — iTerm2 tab focus
