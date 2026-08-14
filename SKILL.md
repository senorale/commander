---
name: commander
description: Coordinates a shared docker dev-env across parallel Claude Code worktree sessions. Use before any command that runs code INSIDE the running containers (docker compose exec, tests that hit the running app, manual QA in a browser). Trigger phrases include "run this in the container", "test in dev env", "start the dev env", "run the app", "hit the UI". Do NOT use for edits, host-side unit tests, linters, or read-only ops.
---

# Commander — dev-env lock coordination

In my opinion, Claude Code parallelizes best when each session lives in its own git worktree — a separate directory pinned to a ticket branch, so multiple agents can work at once without fighting over `git checkout`. But your running docker containers are typically mounted against a single main worktree, so only one branch's code is actually executing in them at any moment. Commander is a lock-and-swap tool: whichever session needs to run code inside the containers takes the lock, commander swaps the main worktree onto that session's branch (and rebuilds the stack if needed), the session does its work, then releases so the next session can go.

Install commander first: <https://github.com/senorale/commander>. Then drop this skill at `~/.claude/skills/commander/SKILL.md`.

## When to use commander

**YES — needs commander:**

- `docker compose exec <service> ...` against code that must match the current branch
- Tests that hit the running dev stack (integration, e2e, browser)
- Manual QA against the running app in a browser
- Migrations run through the containerized app
- Anything that touches the running containers' mounted code

**NO — does NOT need commander:**

- Editing / reading / grepping files
- Unit tests that run on the host without touching containers
- Linters, formatters, static analysis
- Git operations (branch, commit, push, PR)
- Planning, code review, documentation

Rule of thumb: if the **running container** must be on your branch, use commander. If the command only reads your worktree's files, don't.

## Before running containerized code

Run **from your current worktree cwd**:

```bash
commander take --no-push
```

**`--no-push` is the default** — use the local committed branch as-is without pushing to `origin`. Only omit it (plain `commander take`) when you explicitly want to push the branch and reset the main worktree to match remote (e.g. before shared QA, or when another machine needs the branch).

This will:

1. Refuse if you have uncommitted changes — commit or stash first
2. (Without `--no-push`) Push your branch to `origin`, then `git reset --hard origin/<branch>` in main
3. Detach your worktree HEAD (temporarily releases the branch)
4. Check out your branch in the main worktree
5. Run the repo's rebuild command (rebuilds + starts the docker stack)

If another session holds the lock:

```
error: <repo> is LOCKED by session abc12345 branch=... since=... Use --wait to queue, --force to steal.
```

Options:

- `commander take --wait` — block until the current holder releases. Cheap for short-held locks.
- `commander take --force` — kick the current holder mid-work. **Ask the user before doing this** — it rebuilds containers on your branch and can crash the other session's in-flight test.
- `commander take --no-push` — default. Skip the push + `reset --hard origin/<branch>`; use the local committed HEAD directly. Composes with `--wait` / `--force`.

## After you're done

```bash
commander release
```

This will:

1. Verify you're the holder (session id / pid match)
2. In main: `git checkout <original_base>` (usually `develop` or `main`)
3. In your worktree: `git checkout <your_branch>` (reattach)
4. Delete the lock file

Release as soon as your containerized work is done — don't sit on the lock while you edit / plan / review, since that blocks other sessions.

## Status

```bash
commander status
# my_repo   held  branch=ticket-1234  session=e0f6a98c  held=3m
# other     free
```

Also `commander status --json` for machine-readable output.

## Stale locks

If a holder process dies without releasing (crash, killed session), the lock file remains but the pid is dead. `commander` detects this via a pid liveness check and treats the lock as free — the next `take` will clear it automatically.

To manually clear: `commander steal --repo <name>` (skips the polite queue, wipes any existing lock).

## Adding a new repo

```bash
commander register <name> --main /path/to/main/worktree \
  --rebuild docker compose -f /path/to/compose.yml up --build -d \
  --base develop
```

Persists to `~/.claude/commander/registry.json`.
