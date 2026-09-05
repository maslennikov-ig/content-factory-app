#!/usr/bin/env python3
"""Run an orchestration check once per content fingerprint of its inputs.

A receipt is addressed by the SHA-256 of what the check actually depends on --
the declared input files with their content digests, the command, the working
directory, tool versions such as node, and the digest of this script itself.
Nothing about the clock, the branch, or the commit name enters the fingerprint,
so a receipt cannot be aged into or named into validity.

Failure is closed: a missing, malformed, edited, or renamed receipt means the
check runs again. The kill switch only ever forces more work, never less.

This is for intermediate orchestration checks. It does not touch and does not
replace the release gate in scripts/release/record-suite-receipt.sh.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import pathlib
import platform
import shutil
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


EVIDENCE_SCHEMA = "verification-evidence/v2"
PRODUCER_NAME = "orchestration-setup"
KILL_SWITCH_ENV = "ORCHESTRATION_EVIDENCE_REUSE_DISABLED"
TRUTHY = frozenset({"1", "true", "yes", "on"})
DEFAULT_STORE = ".codex/evidence/verification"
DEFAULT_TOOLS = ("node",)


class EvidenceError(RuntimeError):
    """The evidence contract is unsafe, incomplete, or malformed."""


@dataclass(frozen=True)
class ToolIdentity:
    """A tool whose version participates in the fingerprint."""

    name: str
    read_version: Callable[[], str]


@dataclass(frozen=True)
class EvidenceResult:
    status: str  # reused | verified | failed
    exit_code: int
    fingerprint: str
    receipt_path: pathlib.Path | None


def _canonical(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def fingerprint_of(identity: Mapping[str, Any]) -> str:
    """The content address of a check: SHA-256 over its canonical identity."""
    return _digest_bytes(_canonical(identity))


def reuse_disabled(environ: Mapping[str, str]) -> bool:
    """The switch is off by default, so the hash decides."""
    return environ.get(KILL_SWITCH_ENV, "").strip().lower() in TRUTHY


def _safe_relative(raw: object, *, label: str) -> pathlib.PurePosixPath:
    if not isinstance(raw, str) or not raw.strip():
        raise EvidenceError(f"{label} must be a non-empty repo-relative path")
    path = pathlib.PurePosixPath(raw.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts:
        raise EvidenceError(f"{label} rejects absolute and parent paths: {raw!r}")
    return path


def _reject_symlink_chain(
    repo_root: pathlib.Path, relative: pathlib.PurePosixPath
) -> pathlib.Path:
    current = repo_root
    for component in relative.parts:
        current = current / component
        if current.is_symlink():
            raise EvidenceError(
                f"verification inputs may not traverse symlinks: {relative}"
            )
    return current


def _record_file(
    repo_root: pathlib.Path,
    path: pathlib.Path,
    records: dict[str, dict[str, str]],
) -> None:
    relative = pathlib.PurePosixPath(path.relative_to(repo_root).as_posix())
    _reject_symlink_chain(repo_root, relative)
    records[relative.as_posix()] = {
        "path": relative.as_posix(),
        "digest": _digest_bytes(path.read_bytes()),
    }


def expand_inputs(
    repo_root: pathlib.Path, raw_inputs: Sequence[str]
) -> list[dict[str, str]]:
    """Every declared path or glob, flattened to sorted files with digests."""
    if not isinstance(raw_inputs, (list, tuple)) or not raw_inputs:
        raise EvidenceError("declare at least one input path or glob")
    records: dict[str, dict[str, str]] = {}
    for index, raw in enumerate(raw_inputs):
        relative = _safe_relative(raw, label=f"inputs[{index}]")
        matches = sorted(
            pathlib.PurePosixPath(item)
            for item in glob.glob(
                relative.as_posix(), root_dir=repo_root, recursive=True
            )
        )
        if not matches:
            raise EvidenceError(f"inputs[{index}] matched no files: {raw!r}")
        found = False
        for match in matches:
            candidate = _reject_symlink_chain(repo_root, match)
            if candidate.is_dir():
                for descendant in sorted(candidate.rglob("*")):
                    if descendant.is_symlink() or descendant.is_file():
                        _record_file(repo_root, descendant, records)
                        found = True
                continue
            if not candidate.is_file():
                raise EvidenceError(f"inputs[{index}] is not a regular file: {match}")
            _record_file(repo_root, candidate, records)
            found = True
        if not found:
            raise EvidenceError(f"inputs[{index}] matched no files: {raw!r}")
    return [records[key] for key in sorted(records)]


def executable_tool(name: str) -> ToolIdentity:
    """A tool identified by the `--version` of the executable on PATH."""

    def read_version() -> str:
        resolved = shutil.which(name)
        if not resolved:
            raise EvidenceError(f"tool not found on PATH: {name}")
        try:
            completed = subprocess.run(
                [resolved, "--version"],
                text=True,
                capture_output=True,
                check=False,
                timeout=15,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:  # pragma: no cover
            raise EvidenceError(f"cannot identify tool {name!r}: {exc}") from exc
        lines = (completed.stdout or completed.stderr).strip().splitlines()
        if not lines:
            raise EvidenceError(f"tool {name!r} reported no version")
        return lines[0].strip()

    return ToolIdentity(name, read_version)


def _tool_records(tools: Sequence[ToolIdentity]) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for tool in tools:
        if not isinstance(tool, ToolIdentity):
            raise EvidenceError("tools must be ToolIdentity values")
        version = tool.read_version()
        if not isinstance(version, str) or not version.strip():
            raise EvidenceError(f"tool {tool.name!r} reported no version")
        records.append({"name": tool.name, "version": version.strip()})
    names = [record["name"] for record in records]
    if len(names) != len(set(names)):
        raise EvidenceError("tools contains duplicate names")
    return sorted(records, key=lambda record: record["name"])


def _environment_records(
    names: Sequence[str], environ: Mapping[str, str]
) -> list[dict[str, str]]:
    if any(not isinstance(name, str) or not name.strip() for name in names):
        raise EvidenceError("environment names must be non-empty strings")
    if len(set(names)) != len(names):
        raise EvidenceError("environment contains duplicate names")
    return [
        {
            "name": name,
            "value_digest": _digest_bytes(
                environ.get(name, "<unset>").encode("utf-8")
            ),
        }
        for name in sorted(names)
    ]


def _implementation_digest() -> str:
    return _digest_bytes(pathlib.Path(__file__).resolve().read_bytes())


def compute_identity(
    *,
    repo_root: pathlib.Path,
    command: str,
    inputs: Sequence[str],
    cwd: str = ".",
    tools: Sequence[ToolIdentity] = (),
    environment_names: Sequence[str] = (),
    environ: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Everything the check depends on, in a form a hash can address."""
    root = pathlib.Path(repo_root).resolve()
    if not root.is_dir():
        raise EvidenceError(f"repository root is not a directory: {root}")
    if not isinstance(command, str) or not command.strip():
        raise EvidenceError("command must be a non-empty string")
    relative_cwd = _safe_relative(cwd or ".", label="cwd")
    cwd_path = _reject_symlink_chain(root, relative_cwd)
    if not cwd_path.is_dir():
        raise EvidenceError(f"cwd is not a directory: {relative_cwd}")
    return {
        "schema_version": EVIDENCE_SCHEMA,
        "producer": PRODUCER_NAME,
        "implementation_digest": _implementation_digest(),
        "command": command,
        "shell": ["bash", "-c"],
        "cwd": relative_cwd.as_posix(),
        "inputs": expand_inputs(root, inputs),
        "tools": _tool_records(tools),
        "environment": _environment_records(
            list(environment_names), environ if environ is not None else {}
        ),
        "runner": {"python_version": platform.python_version()},
        "platform": {"system": platform.system(), "machine": platform.machine()},
    }


def receipt_path(store: pathlib.Path, fingerprint: str) -> pathlib.Path:
    return pathlib.Path(store) / f"{fingerprint}.json"


def load_valid_receipt(
    store: pathlib.Path, fingerprint: str
) -> dict[str, Any] | None:
    """A receipt is only usable when it proves it describes this fingerprint.

    The file name, the recorded fingerprint, and the hash of the recorded
    identity must all agree. Editing the identity breaks the third check;
    copying a receipt onto the wanted name breaks the second.
    """
    path = receipt_path(store, fingerprint)
    if path.is_symlink() or not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("schema_version") != EVIDENCE_SCHEMA:
        return None
    if payload.get("producer") != PRODUCER_NAME:
        return None
    if payload.get("fingerprint") != fingerprint:
        return None
    identity = payload.get("identity")
    if not isinstance(identity, dict):
        return None
    if fingerprint_of(identity) != fingerprint:
        return None
    outcome = payload.get("outcome")
    if not isinstance(outcome, dict) or outcome.get("exit_code") != 0:
        return None
    return payload


def _write_receipt(
    store: pathlib.Path, step: str, fingerprint: str, identity: Mapping[str, Any]
) -> pathlib.Path:
    path = receipt_path(store, fingerprint)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": EVIDENCE_SCHEMA,
        "producer": PRODUCER_NAME,
        "step": step,
        "fingerprint": fingerprint,
        "identity": identity,
        "outcome": {
            "exit_code": 0,
            # Recorded for humans only; no decision reads it.
            "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
    }
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_bytes(_canonical(payload) + b"\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def run_with_evidence(
    *,
    repo_root: pathlib.Path,
    step: str,
    command: str,
    inputs: Sequence[str],
    cwd: str = ".",
    tools: Sequence[ToolIdentity] = (),
    environment_names: Sequence[str] = (),
    store: pathlib.Path | None = None,
    environ: Mapping[str, str] | None = None,
) -> EvidenceResult:
    """Reuse a matching receipt, otherwise run the command and record one."""
    root = pathlib.Path(repo_root).resolve()
    environment = dict(environ if environ is not None else os.environ)
    if not isinstance(step, str) or not step.strip():
        raise EvidenceError("step must be a non-empty string")
    identity = compute_identity(
        repo_root=root,
        command=command,
        inputs=inputs,
        cwd=cwd,
        tools=tools,
        environment_names=environment_names,
        environ=environment,
    )
    fingerprint = fingerprint_of(identity)
    receipt_store = pathlib.Path(store) if store is not None else root / DEFAULT_STORE

    if not reuse_disabled(environment):
        receipt = load_valid_receipt(receipt_store, fingerprint)
        if receipt is not None:
            return EvidenceResult(
                status="reused",
                exit_code=0,
                fingerprint=fingerprint,
                receipt_path=receipt_path(receipt_store, fingerprint),
            )

    # The command always runs in the real process environment. `environ` only
    # decides the switch and the digests of the variables the caller declared,
    # so a caller passing a partial mapping cannot strip PATH from the check.
    completed = subprocess.run(
        ["bash", "-c", command],
        cwd=root / identity["cwd"],
        check=False,
    )
    if completed.returncode != 0:
        return EvidenceResult(
            status="failed",
            exit_code=completed.returncode,
            fingerprint=fingerprint,
            receipt_path=None,
        )
    written = _write_receipt(receipt_store, step, fingerprint, identity)
    return EvidenceResult(
        status="verified", exit_code=0, fingerprint=fingerprint, receipt_path=written
    )


def _default_repo_root() -> pathlib.Path:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
            capture_output=True,
            check=False,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired):  # pragma: no cover
        return pathlib.Path.cwd()
    top = completed.stdout.strip()
    return pathlib.Path(top) if completed.returncode == 0 and top else pathlib.Path.cwd()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mode", choices=["run", "fingerprint"])
    parser.add_argument("--step", required=True, help="short step id for the receipt")
    parser.add_argument("--command", required=True, help="shell command to verify")
    parser.add_argument(
        "--input",
        dest="inputs",
        action="append",
        default=[],
        help="repo-relative file, directory, or glob (repeatable, required)",
    )
    parser.add_argument("--cwd", default=".", help="repo-relative working directory")
    parser.add_argument(
        "--tool",
        dest="tools",
        action="append",
        default=[],
        help=f"executable whose version joins the hash (default: {', '.join(DEFAULT_TOOLS)})",
    )
    parser.add_argument(
        "--env",
        dest="environment",
        action="append",
        default=[],
        help="environment variable whose value joins the hash (repeatable)",
    )
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--store", default=None, help=f"default: {DEFAULT_STORE}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    root = (
        pathlib.Path(args.repo_root).resolve()
        if args.repo_root
        else _default_repo_root()
    )
    store = pathlib.Path(args.store) if args.store else root / DEFAULT_STORE
    tool_names = args.tools or list(DEFAULT_TOOLS)
    tools = [executable_tool(name) for name in tool_names]
    try:
        if args.mode == "fingerprint":
            identity = compute_identity(
                repo_root=root,
                command=args.command,
                inputs=args.inputs,
                cwd=args.cwd,
                tools=tools,
                environment_names=args.environment,
                environ=os.environ,
            )
            print(fingerprint_of(identity))
            return 0
        result = run_with_evidence(
            repo_root=root,
            step=args.step,
            command=args.command,
            inputs=args.inputs,
            cwd=args.cwd,
            tools=tools,
            environment_names=args.environment,
            store=store,
            environ=os.environ,
        )
    except EvidenceError as exc:
        print(f"verification evidence refused: {exc}", file=sys.stderr)
        return 2
    if result.status == "failed":
        print(
            f"failed {args.step} {result.fingerprint} exit={result.exit_code}",
            file=sys.stderr,
        )
        return result.exit_code
    print(f"{result.status} {args.step} {result.fingerprint}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
