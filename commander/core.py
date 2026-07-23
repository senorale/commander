"""Core lock/git/rebuild logic for commander."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONFIG_DIR = Path.home() / ".claude" / "commander"
REGISTRY_PATH = CONFIG_DIR / "registry.json"


class CommanderError(Exception):
    """Base error with a human-readable message."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _run(cmd: list[str], cwd: str | Path, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    kwargs: dict[str, Any] = {"cwd": str(cwd)}
    if capture:
        kwargs["capture_output"] = True
        kwargs["text"] = True
    return subprocess.run(cmd, check=check, **kwargs)


def _git(cwd: str | Path, *args: str) -> str:
    r = _run(["git", *args], cwd=cwd, capture=True)
    return r.stdout.strip()


def load_registry() -> dict:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not REGISTRY_PATH.exists():
        return {"repos": {}}
    return json.loads(REGISTRY_PATH.read_text())


def save_registry(reg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(reg, indent=2) + "\n")


def lock_path(repo: str) -> Path:
    return CONFIG_DIR / f"{repo}.lock"


def read_lock(repo: str) -> dict | None:
    p = lock_path(repo)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def write_lock(repo: str, data: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    lock_path(repo).write_text(json.dumps(data, indent=2) + "\n")


def delete_lock(repo: str) -> None:
    p = lock_path(repo)
    if p.exists():
        p.unlink()


def is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        # Process exists but we don't own it — still alive
        return True


def is_lock_stale(lock: dict) -> bool:
    pid = lock.get("holder_pid")
    if not isinstance(pid, int):
        return False
    return not is_pid_alive(pid)


def detect_repo(cwd: str | Path | None = None) -> tuple[str, dict, str]:
    """Return (repo_name, repo_cfg, main_path) for the repo owning cwd."""
    cwd = str(Path(cwd or os.getcwd()).resolve())
    try:
        common = _git(cwd, "rev-parse", "--git-common-dir")
    except subprocess.CalledProcessError:
        raise CommanderError(f"Not inside a git repository: {cwd}")

    # common is either absolute, or relative to cwd. Resolve to main .git dir.
    common_abs = Path(common)
    if not common_abs.is_absolute():
        common_abs = (Path(cwd) / common_abs).resolve()
    main_path = str(common_abs.parent.resolve())

    reg = load_registry()
    for name, cfg in reg.get("repos", {}).items():
        cfg_main = str(Path(cfg["main_path"]).expanduser().resolve())
        if cfg_main == main_path:
            return name, cfg, cfg_main
    raise CommanderError(
        f"Repo at {main_path} not registered. Run: commander register <name> --main {main_path} --rebuild ..."
    )


def current_branch(cwd: str | Path) -> str:
    b = _git(cwd, "rev-parse", "--abbrev-ref", "HEAD")
    if b == "HEAD":
        raise CommanderError(f"Detached HEAD in {cwd}; cannot infer branch")
    return b


def is_dirty(cwd: str | Path) -> bool:
    r = _run(["git", "status", "--porcelain"], cwd=cwd, capture=True)
    return bool(r.stdout.strip())


def is_main_worktree(cwd: str | Path, main_path: str) -> bool:
    toplevel = _git(cwd, "rev-parse", "--show-toplevel")
    return Path(toplevel).resolve() == Path(main_path).resolve()


def _wait_for_lock(repo: str, poll: float = 1.0) -> None:
    started = time.time()
    while True:
        lock = read_lock(repo)
        if lock is None or is_lock_stale(lock):
            return
        elapsed = int(time.time() - started)
        sys.stderr.write(
            f"\rwaiting for {repo}: held by session {lock.get('session_id', '?')[:8]} "
            f"branch={lock.get('branch')} elapsed={elapsed}s   "
        )
        sys.stderr.flush()
        time.sleep(poll)


def take(
    repo: str | None = None,
    branch: str | None = None,
    wait: bool = False,
    force: bool = False,
    cwd: str | Path | None = None,
) -> dict:
    cwd = str(Path(cwd or os.getcwd()).resolve())
    repo_name, cfg, main_path = detect_repo(cwd) if repo is None else _lookup(repo)
    if branch is None:
        branch = current_branch(cwd)

    in_main = is_main_worktree(cwd, main_path)

    existing = read_lock(repo_name)
    if existing and not is_lock_stale(existing):
        if force:
            sys.stderr.write(
                f"forcing takeover from session {existing.get('session_id', '?')[:8]} "
                f"(branch {existing.get('branch')})\n"
            )
        elif wait:
            _wait_for_lock(repo_name)
            sys.stderr.write("\n")
        else:
            raise CommanderError(
                f"{repo_name} is LOCKED by session {existing.get('session_id', '?')[:8]} "
                f"branch={existing.get('branch')} since={existing.get('acquired_at')}. "
                f"Use --wait to queue, --force to steal."
            )
    elif existing and is_lock_stale(existing):
        sys.stderr.write(f"clearing stale lock (dead pid {existing.get('holder_pid')})\n")

    # Prepare worktree side (if we're in one)
    worktree_path = cwd
    if not in_main:
        if is_dirty(cwd):
            raise CommanderError(
                f"Uncommitted changes in worktree {cwd}. Commit and retry."
            )
        _run(["git", "push", "origin", branch], cwd=cwd)
        _run(["git", "checkout", "--detach"], cwd=cwd)
    else:
        # In main; if branch is currently checked out in main, fine
        worktree_path = ""

    # Record original base for reattach on release
    original_base = current_branch(main_path) if not in_main else cfg.get("default_base", "develop")

    lock_data = {
        "repo": repo_name,
        "branch": branch,
        "holder_pid": int(os.environ.get("CLAUDE_PID", os.getpid())),
        "session_id": os.environ.get("CLAUDE_CODE_SESSION_ID", ""),
        "iterm_session_id": os.environ.get("ITERM_SESSION_ID", ""),
        "tty": os.environ.get("TTY", ""),
        "acquired_at": _now_iso(),
        "original_base": original_base,
        "worktree_path": worktree_path,
        "main_path": main_path,
    }
    write_lock(repo_name, lock_data)

    # Main-side: fetch, checkout, hard reset to remote, rebuild
    try:
        _run(["git", "fetch", "origin"], cwd=main_path)
        _run(["git", "checkout", branch], cwd=main_path)
        _run(["git", "reset", "--hard", f"origin/{branch}"], cwd=main_path)
        _run(list(cfg["rebuild_cmd"]), cwd=main_path)
    except subprocess.CalledProcessError as e:
        # Best-effort: leave lock; user can inspect / release manually
        raise CommanderError(f"main-side setup failed: {e}") from e

    return lock_data


def release(repo: str | None = None, cwd: str | Path | None = None) -> dict:
    cwd = str(Path(cwd or os.getcwd()).resolve())
    repo_name, cfg, main_path = detect_repo(cwd) if repo is None else _lookup(repo)

    lock = read_lock(repo_name)
    if lock is None:
        raise CommanderError(f"No lock held on {repo_name}")

    my_session = os.environ.get("CLAUDE_CODE_SESSION_ID", "")
    my_pid = int(os.environ.get("CLAUDE_PID", os.getpid()))
    if lock.get("session_id") != my_session and lock.get("holder_pid") != my_pid and not is_lock_stale(lock):
        raise CommanderError(
            f"Lock on {repo_name} held by session {lock.get('session_id', '?')[:8]}, not you. "
            f"Use `commander steal` to force."
        )

    # Main: return to original base
    original_base = lock.get("original_base") or cfg.get("default_base", "develop")
    _run(["git", "checkout", original_base], cwd=main_path)

    # Worktree: reattach branch if a worktree was involved
    wt = lock.get("worktree_path")
    if wt and Path(wt).exists():
        try:
            _run(["git", "checkout", lock["branch"]], cwd=wt)
        except subprocess.CalledProcessError:
            sys.stderr.write(f"warning: could not reattach {lock['branch']} in {wt}\n")

    delete_lock(repo_name)
    return lock


def steal(repo: str | None = None, cwd: str | Path | None = None) -> dict:
    cwd = str(Path(cwd or os.getcwd()).resolve())
    repo_name, _, main_path = detect_repo(cwd) if repo is None else _lookup(repo)
    existing = read_lock(repo_name)
    if existing and not is_lock_stale(existing) and is_dirty(main_path):
        raise CommanderError(
            f"refusing to steal {repo_name}: main worktree at {main_path} has uncommitted changes "
            f"(held by session {existing.get('session_id', '?')[:8]} on branch {existing.get('branch')}). "
            f"Ask the holder to commit or discard, then retry."
        )
    delete_lock(repo_name)
    return take(repo=repo_name, cwd=cwd)


def status(repo: str | None = None) -> list[dict]:
    reg = load_registry()
    rows = []
    names = [repo] if repo else list(reg.get("repos", {}).keys())
    for name in names:
        lock = read_lock(name)
        if lock is None:
            rows.append({"repo": name, "state": "free"})
        elif is_lock_stale(lock):
            rows.append({"repo": name, "state": "stale", **lock})
        else:
            rows.append({"repo": name, "state": "held", **lock})
    return rows


def register(name: str, main_path: str, rebuild_cmd: list[str], default_base: str = "develop") -> None:
    reg = load_registry()
    reg.setdefault("repos", {})[name] = {
        "main_path": str(Path(main_path).expanduser().resolve()),
        "rebuild_cmd": list(rebuild_cmd),
        "default_base": default_base,
    }
    save_registry(reg)


def _lookup(repo: str) -> tuple[str, dict, str]:
    reg = load_registry()
    if repo not in reg.get("repos", {}):
        raise CommanderError(f"Unknown repo: {repo}")
    cfg = reg["repos"][repo]
    return repo, cfg, str(Path(cfg["main_path"]).expanduser().resolve())
