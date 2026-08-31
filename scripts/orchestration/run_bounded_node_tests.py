#!/usr/bin/env python3
"""Run one bounded Node test process group with exact lifecycle containment."""

from __future__ import annotations

import argparse
import ctypes
import fcntl
import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import NoReturn


LOCK_CONFLICT = 73
TIMEOUT = 124
LEAKED_PROCESS_GROUP = 125
SHUTDOWN_INCOMPLETE = 126


class RunnerInterrupted(Exception):
    def __init__(self, signum: int) -> None:
        self.signum = signum
        super().__init__(f"interrupted by signal {signum}")


def canonical_tests(cwd: Path, arguments: list[str]) -> list[str]:
    tests = []
    for value in arguments:
        if value.startswith("-"):
            continue
        candidate = Path(value)
        resolved = candidate.resolve() if candidate.is_absolute() else (cwd / candidate).resolve()
        tests.append(str(resolved))
    return sorted(set(tests))


def lock_identity(cwd: Path, arguments: list[str]) -> str:
    canonical_cwd = str(cwd.resolve())
    payload = json.dumps(
        {"cwd": canonical_cwd, "tests": canonical_tests(cwd.resolve(), arguments)},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def argv_digest(arguments: list[str]) -> str:
    return hashlib.sha256("\0".join(arguments).encode("utf-8")).hexdigest()


def safe_test_names(cwd: Path, arguments: list[str]) -> list[str]:
    names = []
    for value in canonical_tests(cwd, arguments):
        path = Path(value)
        try:
            names.append(str(path.relative_to(cwd)))
        except ValueError:
            names.append(path.name)
    return names


def diagnostic(event: str, *, cwd: Path, command: list[str], pgid: int | None) -> None:
    payload = {
        "event": event,
        "pgid": pgid,
        "cwd": str(cwd),
        "argv_sha256": argv_digest(command),
        "tests": safe_test_names(cwd, command[3:]),
    }
    print(f"bounded-node-tests: {event}; {json.dumps(payload, sort_keys=True)}", file=sys.stderr)


def enable_child_subreaper() -> None:
    if sys.platform != "linux":
        return
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        libc.prctl(36, 1, 0, 0, 0)  # PR_SET_CHILD_SUBREAPER
    except (AttributeError, OSError):
        pass


def group_members(pgid: int) -> list[int]:
    members = []
    proc_root = Path("/proc")
    if not proc_root.is_dir():
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return []
        except PermissionError:
            return [pgid]
        return [pgid]
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / "stat").read_text(encoding="utf-8")
            suffix = raw[raw.rfind(")") + 2 :].split()
            state = suffix[0]
            process_group = int(suffix[2])
        except (OSError, ValueError, IndexError):
            continue
        if process_group == pgid and state != "Z":
            members.append(int(entry.name))
    return sorted(members)


def reap_adopted_children(pgid: int) -> None:
    while True:
        try:
            pid, _ = os.waitpid(-pgid, os.WNOHANG)
        except ChildProcessError:
            return
        if pid <= 0:
            return


def wait_for_group_exit(pgid: int, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while True:
        reap_adopted_children(pgid)
        if not group_members(pgid):
            reap_adopted_children(pgid)
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.02)


def terminate_group(pgid: int, grace_seconds: float) -> bool:
    if not group_members(pgid):
        reap_adopted_children(pgid)
        return True
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return True
    if wait_for_group_exit(pgid, grace_seconds):
        return True
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    return wait_for_group_exit(pgid, grace_seconds)


def interrupted(signum: int, _frame: object) -> NoReturn:
    raise RunnerInterrupted(signum)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="node")
    parser.add_argument("--node-timeout-ms", type=int, default=30_000)
    parser.add_argument("--wall-timeout-seconds", type=float, default=60.0)
    parser.add_argument("--term-grace-seconds", type=float, default=2.0)
    parser.add_argument(
        "--lock-dir",
        type=Path,
        default=Path(tempfile.gettempdir()) / f"codex-bounded-node-tests-{os.getuid()}",
    )
    parser.add_argument("test_args", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.test_args[:1] == ["--"]:
        args.test_args = args.test_args[1:]
    if not args.test_args or not canonical_tests(Path.cwd(), args.test_args):
        parser.error("at least one Node test file is required")
    if args.node_timeout_ms < 1 or args.wall_timeout_seconds <= 0 or args.term_grace_seconds <= 0:
        parser.error("timeouts must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    if os.name != "posix":
        print("bounded-node-tests: POSIX process groups are required", file=sys.stderr)
        return 69
    args = parse_args(sys.argv[1:] if argv is None else argv)
    cwd = Path.cwd().resolve()
    identity = lock_identity(cwd, args.test_args)
    args.lock_dir.mkdir(parents=True, exist_ok=True)
    lock_path = args.lock_dir / f"{identity}.lock"
    command = [args.node, "--test", f"--test-timeout={args.node_timeout_ms}", *args.test_args]

    with lock_path.open("a+", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            diagnostic("already running", cwd=cwd, command=command, pgid=None)
            return LOCK_CONFLICT
        lock.seek(0)
        lock.truncate()
        lock.write(f"pid={os.getpid()}\nidentity={identity}\n")
        lock.flush()

        enable_child_subreaper()
        previous = {
            signum: signal.signal(signum, interrupted)
            for signum in (signal.SIGINT, signal.SIGTERM)
        }
        process: subprocess.Popen[bytes] | None = None
        try:
            process = subprocess.Popen(command, cwd=cwd, start_new_session=True)
            pgid = process.pid
            try:
                returncode = process.wait(timeout=args.wall_timeout_seconds)
            except subprocess.TimeoutExpired:
                diagnostic("deadline exceeded", cwd=cwd, command=command, pgid=pgid)
                if not terminate_group(pgid, args.term_grace_seconds):
                    diagnostic("shutdown incomplete", cwd=cwd, command=command, pgid=pgid)
                    return SHUTDOWN_INCOMPLETE
                process.wait(timeout=args.term_grace_seconds)
                return TIMEOUT

            survivors = group_members(pgid)
            if survivors:
                diagnostic("surviving process-group members", cwd=cwd, command=command, pgid=pgid)
                if not terminate_group(pgid, args.term_grace_seconds):
                    diagnostic("shutdown incomplete", cwd=cwd, command=command, pgid=pgid)
                    return SHUTDOWN_INCOMPLETE
                return LEAKED_PROCESS_GROUP
            reap_adopted_children(pgid)
            return returncode
        except RunnerInterrupted as exc:
            if process is not None:
                pgid = process.pid
                diagnostic("runner interrupted", cwd=cwd, command=command, pgid=pgid)
                terminate_group(pgid, args.term_grace_seconds)
            return 128 + exc.signum
        finally:
            for signum, handler in previous.items():
                signal.signal(signum, handler)


if __name__ == "__main__":
    raise SystemExit(main())
