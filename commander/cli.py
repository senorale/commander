"""Commander CLI — argparse frontend over commander.core."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

from . import __version__, core


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


def cmd_take(args: argparse.Namespace) -> int:
    try:
        lock = core.take(
            repo=args.repo,
            branch=args.branch,
            wait=args.wait,
            force=args.force,
        )
    except core.CommanderError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"acquired {lock['repo']} branch={lock['branch']}")
    return 0


def cmd_release(args: argparse.Namespace) -> int:
    try:
        lock = core.release(repo=args.repo)
    except core.CommanderError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"released {lock['repo']} (was branch={lock['branch']})")
    return 0


def cmd_steal(args: argparse.Namespace) -> int:
    try:
        lock = core.steal(repo=args.repo)
    except core.CommanderError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"stolen {lock['repo']} branch={lock['branch']}")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    rows = core.status(repo=args.repo)
    if args.json:
        print(json.dumps(rows, indent=2))
        return 0
    if not rows:
        print("(no repos registered — run: commander register ...)")
        return 0
    for r in rows:
        state = r["state"]
        if state == "free":
            print(f"{r['repo']:20s}  free")
            continue
        age = _fmt_age(r.get("acquired_at", ""))
        sess = (r.get("session_id") or "?")[:8]
        print(
            f"{r['repo']:20s}  {state}  branch={r.get('branch')}  "
            f"session={sess}  held={age}"
        )
    return 0


def cmd_register(args: argparse.Namespace) -> int:
    core.register(
        name=args.name,
        main_path=args.main,
        rebuild_cmd=args.rebuild,
        default_base=args.base,
    )
    print(f"registered {args.name}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="commander", description="Dev-env lock coordination.")
    p.add_argument("--version", action="version", version=f"commander {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    take = sub.add_parser("take", help="acquire the dev-env lock for this repo")
    take.add_argument("--repo", help="repo name (default: auto-detect from cwd)")
    take.add_argument("--branch", help="branch (default: current branch in cwd)")
    take.add_argument("--wait", action="store_true", help="block until free")
    take.add_argument("--force", action="store_true", help="steal lock if held")
    take.set_defaults(func=cmd_take)

    release = sub.add_parser("release", help="release your lock")
    release.add_argument("--repo", help="repo name (default: auto-detect)")
    release.set_defaults(func=cmd_release)

    steal = sub.add_parser("steal", help="force-take a lock held by someone else")
    steal.add_argument("--repo", help="repo name (default: auto-detect)")
    steal.set_defaults(func=cmd_steal)

    status = sub.add_parser("status", help="show lock state per repo")
    status.add_argument("--repo", help="only this repo")
    status.add_argument("--json", action="store_true", help="machine-readable output")
    status.set_defaults(func=cmd_status)

    register = sub.add_parser("register", help="add or update a repo in the registry")
    register.add_argument("name", help="repo name (any short identifier)")
    register.add_argument("--main", required=True, help="main worktree path")
    register.add_argument("--rebuild", required=True, nargs="+", help="rebuild command (argv)")
    register.add_argument("--base", default="develop", help="default base branch")
    register.set_defaults(func=cmd_register)

    view = sub.add_parser("view", help="launch the live TUI dashboard")
    view.set_defaults(func=cmd_view)

    return p


def cmd_view(args: argparse.Namespace) -> int:
    try:
        from . import tui
    except ImportError as e:
        print(f"error: TUI requires textual — {e}", file=sys.stderr)
        print("       fix: pip install textual (or use the bundled venv)", file=sys.stderr)
        return 2
    return tui.run()


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    # Bare `commander` → launch the TUI dashboard.
    if not argv:
        argv = ["view"]
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
