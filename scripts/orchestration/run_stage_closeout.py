#!/usr/bin/env python3
"""Run stage close verification based on the repo-local orchestration contract."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
from xml.etree import ElementTree

DEBT_MARKER_PATTERN = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b", re.IGNORECASE)
DEBT_POLICY_REFERENCE_PATTERNS = (
    "TODO/FIXME/HACK/XXX",
    "DEBT_MARKER_PATTERN",
    "debt marker",
    "debt markers",
)
PROJECT_INDEX_REVIEW_MARKER = "project-index: reviewed-no-change"
DOCS_REVIEW_MARKER = "docs-reviewed:"
# Accepts the kernel's own `Documentation:` spelling as well as the explicit
# label, so an agent that recorded the decision in kernel form is not failed for
# using a different word. Requires real content after the colon: a bare marker
# or `n/a` would make the gate decorative. `check_project_index_review` accepts
# DOCS_REVIEW_MARKER, so neither spelling may share that prefix.
DOCUMENTATION_DECISION_RE = re.compile(
    r"(?:^|;)\s*documentation(?:-decision)?:\s*(?P<value>[^;\n]*\S)",
    re.IGNORECASE | re.MULTILINE,
)
# Trigger on dependency lockfiles only. `documentation_impact` classifies impact
# on *project documentation*, and its `structural` prefixes (`app/`, `packages/`,
# `frontend/`) match nearly every diff in a Next.js app or a monorepo, so reusing
# it here would turn this into the blanket default it is meant to avoid. A
# dependency bump is the one diff that reliably depends on external versioned
# behavior.
DEPENDENCY_LOCKFILES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "poetry.lock",
    "uv.lock",
    "Pipfile.lock",
    "requirements.txt",
    "go.sum",
    "Cargo.lock",
    "Gemfile.lock",
    "composer.lock",
}
# Acceptance commands already run the typecheckers and linters that know an API
# was removed or deprecated, but their output only ever reached the terminal:
# the exit code cannot carry a warning. Surfacing those lines is the one signal
# here that needs no guessing — a deprecation warning is a fact the toolchain
# reports, not an inference from the diff. Kept deliberately small; widen only
# after a real miss, because every added pattern is a chance to report noise.
DEPRECATION_PATTERNS = (
    re.compile(r"\bDeprecationWarning\b"),
    re.compile(r"\bPendingDeprecationWarning\b"),
    re.compile(r"\bis deprecated\b", re.IGNORECASE),
    re.compile(r"\bdeprecated:", re.IGNORECASE),
    re.compile(r"\bnpm warn deprecated\b", re.IGNORECASE),
    # TS6385/TS6387: symbol and signature deprecation reported by tsc.
    re.compile(r"\bTS638[57]\b"),
)
# One command can repeat the same warning per file it compiles. Report the
# distinct lines and stop: this is a pointer to work, not a log.
DEPRECATION_REPORT_LIMIT = 20
DEPRECATION_LINE_LIMIT = 300
# A receipt that records only "passed" cannot answer how much passed, so every
# count a stage summary would quote had to be taken on trust. These patterns
# keep the summary lines the runners already print. Kept narrow on purpose:
# a wrong line here becomes a wrong number in an acceptance record.
RESULT_COUNT_PATTERNS = (
    # unittest
    re.compile(r"^Ran \d+ tests? in "),
    re.compile(r"^OK(?: \(.*\))?$"),
    re.compile(r"^FAILED \(.*\)$"),
    # Jest. Without these the repository's own `pnpm test` attested nothing
    # about its Jest half: the command runs Jest and then unittest, so the only
    # counts the receipt carried were the Python tail, and the Jest totals lived
    # in prose that nothing checked — which is the failure this whole function
    # exists to prevent.
    re.compile(r"^Test Suites:\s+\d"),
    re.compile(r"^Tests:\s+\d"),
    # Playwright and similar runners
    re.compile(r"^\d+ (?:passed|failed|skipped|flaky)\b"),
    # node --test
    re.compile(r"^\u2139 (?:tests|pass|fail|skipped|todo) \d+$"),
    # Node 22's non-TTY TAP reporter uses plain TAP diagnostics rather than
    # the Unicode spec-reporter marker above.
    re.compile(r"^# (?:tests|pass|fail|skipped|todo) \d+$"),
)
RESULT_COUNT_REPORT_LIMIT = 12
RESULT_COUNT_LINE_LIMIT = 200
GENERIC_RESULT_COUNT_RE = re.compile(r"^\d+ (?:passed|failed|skipped|flaky)\b")
TAP_ENVIRONMENT_GATE_RE = re.compile(
    r"^ok\s+\d+\s+-\s+(?P<name>.+?)\s+# SKIP "
    r"(?P<environment>[A-Z][A-Z0-9_]*) is not configured$"
)
RECEIPT_SUFFIX_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
PLACEHOLDERS = {"", "n/a", "<short cleanup result or blocker>"}
STRUCTURAL_CHANGE_PREFIXES = (
    "app/",
    "apps/",
    "api/",
    "pages/",
    "routes/",
    "packages/",
    "src/api/",
    "src/app/",
    "src/integrations/",
    "src/routes/",
    "src/server/",
    "src/services/",
    "migrations/",
    "db/migrations/",
    "supabase/migrations/",
    ".github/workflows/",
    "scripts/orchestration/",
    "frontend/",
)
STRUCTURAL_CHANGE_FILES = {
    "AGENTS.md",
    "README.md",
    "package.json",
    "pnpm-workspace.yaml",
    "pyproject.toml",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.dev.yml",
    ".codex/orchestrator.toml",
    "src/main.py",
    "src/worker.py",
}
ORCHESTRATION_LEVEL_ORDER = (
    "inner_loop",
    "slice_acceptance",
    "integration",
    "release",
)
RUNTIME_VERSION_COMMANDS = {
    "node": ("node", "--version"),
    "npm": ("npm", "--version"),
    "npx": ("npx", "--version"),
    "pnpm": ("pnpm", "--version"),
    "yarn": ("yarn", "--version"),
    "bun": ("bun", "--version"),
    "deno": ("deno", "--version"),
}
NODE_RUNTIME_HINTS = ("node", "npm", "npx", "pnpm", "yarn", "playwright", "vitest", "jest")
LEGACY_LEVEL_ALIASES = {
    "inner": "inner_loop",
    "delta": "slice_acceptance",
}
def normalize_orchestration_level(value: str | None, *, legacy_default: bool) -> str:
    if value is None or not value.strip():
        return "integration" if legacy_default else "slice_acceptance"
    raw = value.strip().lower()
    normalized = LEGACY_LEVEL_ALIASES.get(raw, raw)
    if normalized not in ORCHESTRATION_LEVEL_ORDER:
        accepted = ", ".join((*ORCHESTRATION_LEVEL_ORDER, *LEGACY_LEVEL_ALIASES))
        raise SystemExit(
            f"unsupported orchestration level: {value!r}; expected one of {accepted}"
        )
    return normalized


def _clean_commands(raw_commands: object, *, label: str) -> list[str]:
    if not isinstance(raw_commands, list):
        raise SystemExit(f"{label} must be a list of non-empty command strings")
    commands: list[str] = []
    for raw in raw_commands:
        if not isinstance(raw, str) or not raw.strip():
            raise SystemExit(f"{label} must contain only non-empty command strings")
        command = raw.strip()
        if command not in commands:
            commands.append(command)
    return commands


def load_commands_file(repo_root: pathlib.Path, raw_path: str) -> list[str]:
    relative = pathlib.Path(raw_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise SystemExit("--commands-file must be a repo-relative JSON file")
    path = repo_root / relative
    if path.is_symlink() or not path.is_file():
        raise SystemExit("--commands-file must be a regular repo-relative JSON file")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read --commands-file: {exc}") from exc
    return _clean_commands(document, label="--commands-file")


def select_acceptance_commands(
    contract: dict[str, object], level: str, explicit_commands: list[str]
) -> list[str]:
    """Select exact root-owned commands without risk/surface inference."""
    normalized_level = normalize_orchestration_level(level, legacy_default=False)
    verification = contract.get("verification")
    if not isinstance(verification, dict):
        verification = {}
    release_commands = _clean_commands(
        verification.get("release_commands", []),
        label="verification.release_commands",
    )
    commands = _clean_commands(explicit_commands, label="explicit acceptance commands")
    if normalized_level == "release":
        if commands:
            raise SystemExit(
                "release acceptance uses only configured verification.release_commands; "
                "omit --command/--commands-file"
            )
        if not release_commands:
            raise SystemExit("release acceptance requires verification.release_commands")
        return release_commands
    if not commands:
        raise SystemExit(
            f"{normalized_level} requires at least one explicit --command or --commands-file"
        )
    forbidden = [command for command in commands if command in release_commands]
    if forbidden:
        raise SystemExit(
            "task acceptance cannot run a configured release command: "
            + ", ".join(forbidden)
        )
    return commands


def _git_acceptance_state(
    repo_root: pathlib.Path,
    stage_id: str,
    receipt_name: str = "acceptance-receipt.json",
) -> tuple[str, str]:
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if head.returncode != 0:
        raise SystemExit("acceptance receipt requires a Git worktree with a valid HEAD")
    excluded = [
        f":(exclude).codex/stages/{stage_id}/{receipt_name}",
        f":(exclude).codex/stages/{stage_id}/closeout-result.json",
        f":(exclude).codex/stages/{stage_id}/.closeout.lock",
        f":(exclude).codex/stages/{stage_id}/evidence/**",
    ]
    diff = subprocess.run(
        ["git", "diff", "--binary", "HEAD", "--", ".", *excluded],
        cwd=repo_root,
        capture_output=True,
        check=False,
    )
    if diff.returncode != 0:
        raise SystemExit(f"cannot compute acceptance diff: {diff.stderr.decode().strip()}")
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "-z"],
        cwd=repo_root,
        capture_output=True,
        check=False,
    )
    if untracked.returncode != 0:
        raise SystemExit("cannot enumerate untracked acceptance inputs")
    ignored_prefix = f".codex/stages/{stage_id}/"
    ignored_names = {
        f"{ignored_prefix}{receipt_name}",
        f"{ignored_prefix}closeout-result.json",
        f"{ignored_prefix}.closeout.lock",
    }
    hasher = hashlib.sha256()
    hasher.update(diff.stdout)
    for encoded_path in sorted(item for item in untracked.stdout.split(b"\0") if item):
        relative = encoded_path.decode("utf-8", errors="surrogateescape")
        if relative in ignored_names or relative.startswith(f"{ignored_prefix}evidence/"):
            continue
        path = repo_root / relative
        if path.is_symlink() or not path.is_file():
            continue
        hasher.update(len(encoded_path).to_bytes(8, "big"))
        hasher.update(encoded_path)
        content = path.read_bytes()
        hasher.update(len(content).to_bytes(8, "big"))
        hasher.update(content)
    return head.stdout.strip(), hasher.hexdigest()


def acceptance_identity(
    repo_root: pathlib.Path,
    contract: dict[str, object],
    stage_id: str,
    level: str,
    commands: list[str],
    receipt_name: str = "acceptance-receipt.json",
) -> dict[str, object]:
    git_head, diff_digest = _git_acceptance_state(repo_root, stage_id, receipt_name)
    evidence = contract.get("evidence")
    configured_marker = (
        evidence.get("environment_marker") if isinstance(evidence, dict) else None
    )
    environment_marker = (
        configured_marker.strip()
        if isinstance(configured_marker, str) and configured_marker.strip()
        else f"{platform.system()}-{platform.machine()}-python-{sys.version_info.major}.{sys.version_info.minor}"
    )
    runtime_versions = relevant_runtime_versions(repo_root, commands)
    if runtime_versions:
        environment_marker += "|" + ",".join(
            f"{name}={version}" for name, version in runtime_versions.items()
        )
    return {
        "stage_id": stage_id,
        "orchestration_level": normalize_orchestration_level(
            level, legacy_default=False
        ),
        "commands": commands,
        "git_head": git_head,
        "diff_digest": diff_digest,
        "environment_marker": environment_marker,
    }


def _mentions_command(command_text: str, name: str) -> bool:
    return re.search(rf"(?<![A-Za-z0-9_.-]){re.escape(name)}(?![A-Za-z0-9_.-])", command_text) is not None


def _read_runtime_version(executable: str | pathlib.Path) -> str | None:
    try:
        result = subprocess.run(
            [str(executable), "--version"],
            text=True,
            capture_output=True,
            check=False,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    output = (result.stdout or result.stderr).strip().splitlines()
    return output[0].strip() if output else None


def relevant_runtime_versions(
    repo_root: pathlib.Path, commands: list[str]
) -> dict[str, str]:
    """Fingerprint only runtimes directly implicated by selected commands."""
    command_text = "\n".join(commands).lower()
    names = {
        name
        for name in RUNTIME_VERSION_COMMANDS
        if _mentions_command(command_text, name)
    }
    if any(_mentions_command(command_text, hint) for hint in NODE_RUNTIME_HINTS):
        names.add("node")

    versions: dict[str, str] = {}
    for name in sorted(names):
        executable = shutil.which(RUNTIME_VERSION_COMMANDS[name][0])
        if not executable:
            continue
        version = _read_runtime_version(executable)
        if version:
            versions[name] = version

    if _mentions_command(command_text, "playwright"):
        local_playwright = repo_root / "node_modules" / ".bin" / "playwright"
        try:
            resolved_playwright = local_playwright.resolve(strict=True)
            resolved_playwright.relative_to(repo_root.resolve())
        except (OSError, ValueError):
            resolved_playwright = None
        if resolved_playwright is not None and resolved_playwright.is_file():
            version = _read_runtime_version(resolved_playwright)
            if version:
                versions["playwright"] = version
    return versions


def acceptance_fingerprint(identity: dict[str, object]) -> str:
    encoded = json.dumps(identity, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def is_process_owned_path(raw: object) -> bool:
    path = str(raw).strip().replace("\\", "/")
    if not path or path.startswith("<") or path.startswith(".codex/stages/"):
        return False
    return (
        path == "AGENTS.md"
        or path == ".codex/orchestrator.toml"
        or path.startswith(".codex/")
        or path.startswith("scripts/orchestration/")
    )


def stage_changed_paths(repo_root: pathlib.Path, stage_id: str) -> list[str]:
    """Paths this stage touched, from the commit that introduced its manifest.

    Stage artifacts are optional metadata. A stage that records none still
    changes files, and the process gate names files rather than artifacts, so
    reading only the artifact list let a change to the orchestration contract
    pass the boundary unverified.
    """

    def git(*args: str) -> tuple[int, str]:
        done = subprocess.run(
            ["git", *args], cwd=repo_root, text=True, capture_output=True, check=False
        )
        return done.returncode, done.stdout

    paths: set[str] = set()
    code, pending = git("diff", "--name-only", "HEAD")
    if code == 0:
        paths.update(line.strip() for line in pending.splitlines() if line.strip())

    manifest = f".codex/stages/{stage_id}/stage-manifest.json"
    code, log = git("log", "--diff-filter=A", "--format=%H", "--", manifest)
    revisions = [line.strip() for line in log.splitlines() if line.strip()]
    if code != 0 or not revisions:
        # No committed manifest yet: the stage is whatever is still pending.
        return sorted(paths)

    first = revisions[-1]
    code, committed = git("diff", "--name-only", f"{first}^", "HEAD")
    if code != 0:
        # The stage began at the root commit, which has no parent.
        code, committed = git("diff", "--name-only", first, "HEAD")
        if code == 0:
            introduced_code, introduced = git(
                "show", "--pretty=", "--name-only", first
            )
            if introduced_code == 0:
                committed += introduced
    if code == 0:
        paths.update(line.strip() for line in committed.splitlines() if line.strip())
    return sorted(paths)


def process_check_needed(
    artifacts: list[dict[str, object]],
    changed_paths: list[str] | tuple[str, ...] = (),
) -> bool:
    for artifact in artifacts:
        changed_files = artifact.get("changed_files")
        if not isinstance(changed_files, list):
            continue
        if any(is_process_owned_path(raw) for raw in changed_files):
            return True
    return any(is_process_owned_path(path) for path in changed_paths)


def _stage_path_error(
    repo_root: pathlib.Path,
    expected_stage: pathlib.Path,
    label: str,
    raw_value: object,
) -> str | None:
    if not isinstance(raw_value, str) or not raw_value.strip():
        return f"{label} is missing"
    raw_path = pathlib.Path(raw_value)
    if raw_path.is_absolute() or ".." in raw_path.parts:
        return f"{label} must be a repo-relative path inside {expected_stage}"
    candidate = repo_root / raw_path
    for component in (candidate, *candidate.parents):
        if component.is_symlink():
            return f"{label} may not traverse a symlink: {raw_value}"
        if component == repo_root:
            break
    resolved = candidate.resolve()
    if resolved.parent != expected_stage:
        return f"{label} points outside exact stage root {expected_stage}: {raw_value}"
    return None


def validate_stage_state(
    repo_root: pathlib.Path, contract: dict[str, object], stage_id: str
) -> list[str]:
    """Return actionable exact-stage reconciliation errors."""
    root = repo_root.resolve()
    expected = root / ".codex" / "stages" / stage_id
    errors: list[str] = []
    if not expected.is_dir() or expected.is_symlink():
        errors.append(f"expected stage directory is missing or unsafe: {expected}")

    workspace = contract.get("workspace")
    current_stage = workspace.get("current_stage_id") if isinstance(workspace, dict) else None
    if current_stage != stage_id:
        errors.append(
            f"workspace.current_stage_id must equal requested stage {stage_id!r}; found {current_stage!r}"
        )

    artifacts = contract.get("artifacts")
    summary = artifacts.get("current_stage_summary") if isinstance(artifacts, dict) else None
    summary_error = _stage_path_error(
        root, expected, "artifacts.current_stage_summary", summary
    )
    if summary_error:
        errors.append(summary_error)

    delegation = contract.get("delegation")
    launcher = delegation.get("launcher") if isinstance(delegation, dict) else None
    inbox = contract.get("completion_inbox")
    if launcher != "none" or isinstance(inbox, dict):
        if not isinstance(inbox, dict):
            errors.append("completion_inbox is required for delegated stage state")
        else:
            for key in ("events_file", "review_state_file"):
                inbox_error = _stage_path_error(
                    root,
                    expected,
                    f"completion_inbox.{key}",
                    inbox.get(key),
                )
                if inbox_error:
                    errors.append(inbox_error)
    return errors


@contextmanager
def stage_closeout_lock(repo_root: pathlib.Path, stage_id: str):
    path = repo_root / ".codex" / "stages" / stage_id / ".closeout.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise SystemExit(f"nested closeout detected for stage {stage_id}") from exc
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _load_acceptance_receipt(path: pathlib.Path, key: str) -> dict[str, object] | None:
    if not path.is_file() or path.is_symlink():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("idempotency_key") != key or payload.get("result") != "passed":
        return None
    return payload


def resolve_acceptance_receipt_path(
    repo_root: pathlib.Path, stage_id: str, suffix: str | None
) -> pathlib.Path:
    """Return an exact-stage receipt path without allowing path traversal."""

    stage_part = pathlib.PurePath(stage_id)
    if (
        stage_part.is_absolute()
        or len(stage_part.parts) != 1
        or stage_id in {"", ".", ".."}
    ):
        raise SystemExit("--stage must name one directory under .codex/stages")
    repository = repo_root.resolve()
    codex_root = repository / ".codex"
    stages_root = codex_root / "stages"
    stage_root = stages_root / stage_id
    if (
        codex_root.is_symlink()
        or stages_root.is_symlink()
        or stage_root.is_symlink()
        or not stage_root.is_dir()
    ):
        raise SystemExit(f"receipt stage directory is missing or unsafe: {stage_root}")
    try:
        if stage_root.resolve(strict=True).parent != stages_root.resolve(strict=True):
            raise SystemExit(f"receipt stage directory escapes .codex/stages: {stage_root}")
    except OSError as exc:
        raise SystemExit(f"cannot resolve receipt stage directory: {exc}") from exc

    if suffix is None:
        name = "acceptance-receipt.json"
    else:
        if (
            not RECEIPT_SUFFIX_RE.fullmatch(suffix)
            or ".." in suffix
            or "/" in suffix
            or "\\" in suffix
        ):
            raise SystemExit(
                "--receipt-suffix must be a path-safe name using letters, digits, '.', '_' or '-'"
            )
        name = f"acceptance-receipt.{suffix}.json"
    path = stage_root / name
    if path.is_symlink():
        raise SystemExit(f"acceptance receipt may not be a symlink: {path}")
    return path


def _save_acceptance_receipt(path: pathlib.Path, payload: dict[str, object]) -> None:
    if path.is_symlink():
        raise SystemExit(f"acceptance receipt may not be a symlink: {path}")
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        text=True,
    )
    temporary = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = -1
            handle.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def parse_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("file must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter closing marker not found")

    return text[4:end], text[end + 5 :]


def parse_artifact(path: pathlib.Path) -> dict[str, object]:
    frontmatter, _ = parse_frontmatter(path.read_text())
    data: dict[str, object] = {}
    current_key: str | None = None

    for raw_line in frontmatter.splitlines():
        if not raw_line:
            continue
        if raw_line.startswith("  - ") or raw_line.startswith("- "):
            if current_key is not None:
                values = data.setdefault(current_key, [])
                if isinstance(values, list):
                    values.append(raw_line.split("-", 1)[1].strip())
            continue
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value:
            data[key] = value
            current_key = None
        else:
            data[key] = []
            current_key = key

    return data


def load_stage_artifacts(repo_root: pathlib.Path, stage_id: str) -> list[dict[str, object]]:
    artifacts_dir = repo_root / ".codex" / "stages" / stage_id / "artifacts"
    if not artifacts_dir.exists():
        return []

    artifacts: list[dict[str, object]] = []
    for path in sorted(artifacts_dir.glob("*.md")):
        artifact = parse_artifact(path)
        artifact_stage = artifact.get("stage_id")
        if artifact_stage != stage_id:
            raise SystemExit(
                f"artifact stage_id mismatch for {path}: "
                f"expected {stage_id!r}, found {artifact_stage!r}"
            )
        artifacts.append(artifact)
    return artifacts


def meaningful_scalar(value: object) -> str:
    if not isinstance(value, str):
        return ""
    stripped = value.strip()
    if not stripped or (stripped.startswith("<") and stripped.endswith(">")):
        return ""
    if stripped in PLACEHOLDERS:
        return ""
    return stripped


def check_child_acceptance_cleanup(artifacts: list[dict[str, object]]) -> None:
    failures: list[str] = []
    for artifact in artifacts:
        task_id = meaningful_scalar(artifact.get("task_id")) or "<unknown-task>"
        status = meaningful_scalar(artifact.get("status"))
        accepted = meaningful_scalar(artifact.get("accepted_by_orchestrator"))
        if status not in {"accepted", "merged"} and accepted != "yes":
            continue

        delivery_method = meaningful_scalar(artifact.get("delivery_method"))
        cleanup_status = meaningful_scalar(artifact.get("cleanup_status"))
        cleanup_notes = meaningful_scalar(artifact.get("cleanup_notes"))

        if delivery_method in {"", "not accepted"}:
            failures.append(f"{task_id}: accepted stream missing delivery_method")
        if accepted != "yes":
            failures.append(f"{task_id}: accepted stream missing accepted_by_orchestrator: yes")
        if cleanup_status not in {"cleaned", "blocked"}:
            failures.append(f"{task_id}: accepted stream cleanup_status must be cleaned or blocked")
        if not cleanup_notes:
            failures.append(f"{task_id}: accepted stream missing cleanup_notes")

    if not failures:
        print("child acceptance cleanup OK")
        return

    print("Final stage closeout needs child delivery and cleanup state:", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)


def resolve_inbox_path(
    repo_root: pathlib.Path, inbox: dict[str, object], key: str
) -> pathlib.Path:
    raw_path = inbox.get(key)
    if not isinstance(raw_path, str) or not raw_path:
        raise SystemExit(f"completion_inbox.{key} is required")
    path = pathlib.Path(raw_path)
    if inbox.get("scope", "repo_root") != "git_common_dir":
        return repo_root / path

    common_dir_raw = subprocess.check_output(
        ["git", "rev-parse", "--git-common-dir"], cwd=repo_root, text=True
    ).strip()
    common_dir = pathlib.Path(common_dir_raw)
    if not common_dir.is_absolute():
        common_dir = (repo_root / common_dir).resolve()
    return common_dir / path


def resolve_review_state_path(repo_root: pathlib.Path, inbox: dict[str, object]) -> pathlib.Path:
    return resolve_inbox_path(repo_root, inbox, "review_state_file")


def load_completion_events(path: pathlib.Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    events: list[dict[str, object]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise SystemExit(f"cannot read completion events {path}: {exc}") from exc
    for line_number, raw_line in enumerate(lines, start=1):
        if not raw_line.strip():
            continue
        try:
            event = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            raise SystemExit(
                f"invalid completion event JSON at {path}:{line_number}: {exc}"
            ) from exc
        if not isinstance(event, dict):
            raise SystemExit(f"completion event at {path}:{line_number} must be an object")
        events.append(event)
    return events


def validate_event_artifact_identity(
    repo_root: pathlib.Path, stage_id: str, event: dict[str, object]
) -> list[str]:
    errors: list[str] = []
    event_id = event.get("event_id")
    task_id = event.get("task_id")
    event_stage = event.get("stage_id")
    raw_artifact = event.get("artifact_path")
    if not isinstance(event_id, str) or not event_id:
        errors.append("completion event is missing event_id")
    if not isinstance(task_id, str) or not task_id:
        errors.append(f"event {event_id!r} is missing task_id")
    if event_stage != stage_id:
        errors.append(
            f"event {event_id!r} stage_id {event_stage!r} does not match {stage_id!r}"
        )
    if not isinstance(raw_artifact, str) or not raw_artifact:
        errors.append(f"event {event_id!r} is missing artifact_path")
        return errors
    relative = pathlib.Path(raw_artifact)
    if relative.is_absolute() or ".." in relative.parts:
        errors.append(f"event {event_id!r} artifact_path must be repo-relative")
        return errors
    candidate = repo_root / relative
    for component in (candidate, *candidate.parents):
        if component.is_symlink():
            errors.append(f"event {event_id!r} artifact_path traverses a symlink")
            return errors
        if component == repo_root:
            break
    expected_parent = (repo_root / ".codex" / "stages" / stage_id / "artifacts").resolve()
    try:
        artifact = candidate.resolve(strict=True)
    except OSError:
        errors.append(f"event {event_id!r} artifact does not exist: {raw_artifact}")
        return errors
    if artifact.parent != expected_parent:
        errors.append(f"event {event_id!r} artifact escapes exact stage artifacts root")
        return errors
    try:
        artifact_values = parse_artifact(artifact)
    except (OSError, ValueError) as exc:
        errors.append(f"event {event_id!r} artifact is unreadable: {exc}")
        return errors
    if artifact_values.get("task_id") != task_id:
        errors.append(f"event {event_id!r} task_id does not match artifact task_id")
    if artifact_values.get("stage_id") != stage_id:
        errors.append(f"event {event_id!r} stage_id does not match artifact stage_id")
    return errors


def check_pending_completion_events(
    repo_root: pathlib.Path,
    contract: dict[str, object],
    stage_id: str,
    *,
    exact_identity: bool,
) -> None:
    inbox = contract.get("completion_inbox")
    if not isinstance(inbox, dict):
        return
    events_path = resolve_inbox_path(repo_root, inbox, "events_file")
    state_path = resolve_inbox_path(repo_root, inbox, "review_state_file")
    events = load_completion_events(events_path)
    reviewed = load_reviewed_state(state_path)
    failures: list[str] = []
    relevant: list[dict[str, object]] = []
    for event in events:
        if exact_identity:
            failures.extend(validate_event_artifact_identity(repo_root, stage_id, event))
            relevant.append(event)
        elif event.get("stage_id") == stage_id:
            relevant.append(event)
    pending = [
        event.get("event_id")
        for event in relevant
        if event.get("event_id") not in reviewed
    ]
    if pending:
        failures.append(
            "relevant completion events remain pending: "
            + ", ".join(str(event_id) for event_id in pending)
        )
    if failures:
        raise SystemExit("completion inbox state mismatch:\n- " + "\n- ".join(failures))


def load_reviewed_state(path: pathlib.Path) -> dict[str, dict[str, object]]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read completion review state {path}: {exc}") from exc
    reviewed = payload.get("reviewed") if isinstance(payload, dict) else None
    if not isinstance(reviewed, dict):
        raise SystemExit(f"completion review state {path} is missing a reviewed object")
    if any(not isinstance(event_id, str) or not isinstance(entry, dict) for event_id, entry in reviewed.items()):
        raise SystemExit(f"completion review state {path} contains an invalid reviewed entry")
    return reviewed


@contextmanager
def review_state_read_lock(path: pathlib.Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_SH)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def unresolved_blocking_review_findings(
    reviewed: dict[str, dict[str, object]], stage_id: str | None = None
) -> list[str]:
    scoped = {
        event_id: entry
        for event_id, entry in reviewed.items()
        if stage_id is None or entry.get("stage_id") == stage_id
    }
    resolved: set[str] = set()
    for entry in scoped.values():
        if entry.get("decision") != "accepted":
            continue
        if entry.get("verify") != "passed" or not isinstance(entry.get("artifact_path"), str):
            continue
        links = entry.get("resolves_review")
        if isinstance(links, list):
            resolved.update(link for link in links if isinstance(link, str) and link)

    failures: list[str] = []
    for event_id, entry in scoped.items():
        severity = entry.get("severity")
        if severity not in {"P0", "P1"}:
            continue
        decision = entry.get("decision")
        if decision == "accepted":
            failures.append(f"{event_id}: P0/P1 finding cannot be accepted directly; record a linked correction")
        elif event_id not in resolved:
            failures.append(f"{event_id}: {severity} finding has no linked accepted correction")
    return failures


def check_blocking_review_findings(
    repo_root: pathlib.Path, contract: dict[str, object], stage_id: str | None = None
) -> None:
    limits = contract.get("stage_limits")
    if not isinstance(limits, dict) or limits.get("p0_p1_block_acceptance") is not True:
        return
    inbox = contract.get("completion_inbox")
    if not isinstance(inbox, dict):
        raise SystemExit("p0_p1_block_acceptance requires a [completion_inbox] section")
    state_path = resolve_review_state_path(repo_root, inbox)
    # An absent inbox used to read as an empty one, so the guard printed OK for
    # a stage whose findings nobody had recorded. Empty and unrecorded are not
    # the same answer, and only one of them is evidence.
    if not state_path.exists():
        raise SystemExit(
            "p0_p1_block_acceptance has no data source: the declared review "
            f"state file does not exist: {state_path}. Record the stage's "
            "delegated completions with review_completion_inbox.py before "
            "acceptance; a stage with no findings still has to say so."
        )
    with review_state_read_lock(state_path):
        reviewed = load_reviewed_state(state_path)
    failures = unresolved_blocking_review_findings(reviewed, stage_id)
    if not failures:
        scoped = [
            event_id
            for event_id, entry in reviewed.items()
            if stage_id is None or entry.get("stage_id") == stage_id
        ]
        print(
            f"blocking review findings OK ({len(scoped)} reviewed entries "
            f"read from {state_path})"
        )
        return
    print("P0/P1 review findings must be fixed before stage acceptance:", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)


def collect_deprecations(output: str) -> list[str]:
    """Distinct deprecation lines from one command's output, in order."""

    found: list[str] = []
    seen: set[str] = set()
    for raw in output.splitlines():
        line = raw.strip()
        if not line or not any(pattern.search(line) for pattern in DEPRECATION_PATTERNS):
            continue
        line = line[:DEPRECATION_LINE_LIMIT]
        if line in seen:
            continue
        seen.add(line)
        found.append(line)
        if len(found) >= DEPRECATION_REPORT_LIMIT:
            break
    return found


def collect_result_counts(output: str) -> list[str]:
    """The count lines a reader would quote for one command, in order.

    The receipt attests what passed; without these it could not say how much,
    and every quoted total lived in prose that nothing checked.
    """

    found: list[str] = []
    for raw in output.splitlines():
        line = raw.strip()
        if not line or not any(pattern.search(line) for pattern in RESULT_COUNT_PATTERNS):
            continue
        found.append(line[:RESULT_COUNT_LINE_LIMIT])
    if len(found) <= RESULT_COUNT_REPORT_LIMIT:
        return found

    # Generic per-shard reporter lines can be numerous. Keep the framework
    # summaries (Jest, TAP, unittest) first so one half of a composite command
    # cannot disappear merely because it ran before the other half.
    selected = {
        index
        for index, line in enumerate(found)
        if not GENERIC_RESULT_COUNT_RE.search(line)
    }
    if len(selected) > RESULT_COUNT_REPORT_LIMIT:
        ordered = sorted(selected)
        head_size = RESULT_COUNT_REPORT_LIMIT // 3
        selected = set(
            ordered[:head_size]
            + ordered[-(RESULT_COUNT_REPORT_LIMIT - head_size) :]
        )
    else:
        for index in range(len(found) - 1, -1, -1):
            if len(selected) >= RESULT_COUNT_REPORT_LIMIT:
                break
            selected.add(index)
    return [line for index, line in enumerate(found) if index in selected]


def collect_environment_gates(output: str) -> list[dict[str, str]]:
    """Exact TAP skips caused by an absent native-test environment variable."""

    gates: list[dict[str, str]] = []
    for raw in output.splitlines():
        match = TAP_ENVIRONMENT_GATE_RE.fullmatch(raw.strip())
        if not match:
            continue
        environment = match.group("environment")
        gates.append(
            {
                "test_name": match.group("name"),
                "environment_variable": environment,
                "reason": f"{environment} is not configured",
                "status": "skipped",
            }
        )
    return gates


JEST_JUNIT_REPORT = pathlib.Path("coverage/junit.xml")


def collect_jest_skips(
    repo_root: pathlib.Path, started_at: float
) -> list[dict[str, str]]:
    """Names of the Jest tests a run skipped.

    The native half of `pnpm test` announces its skips in TAP, with the
    environment variable that caused each one, so a receipt can say what was not
    proven. Jest's default reporter announces only a total: `1 skipped` with no
    name attached. That total is what made two accepted receipts irreproducible
    — a reader could see that something had not run but not what.

    `jest-junit` already writes every skipped case by name, so the names exist;
    nothing was reading them. The reason does not exist anywhere machine
    readable, and inventing one would be worse than admitting it.

    A stale report is worse than none: it would name tests from an older run as
    though this one had skipped them, so a file untouched by this command is
    ignored.
    """

    report = repo_root / JEST_JUNIT_REPORT
    try:
        if report.stat().st_mtime < started_at:
            return []
        root = ElementTree.parse(report).getroot()
    except (OSError, ElementTree.ParseError):
        return []

    skips: list[dict[str, str]] = []
    for case in root.iter("testcase"):
        if case.find("skipped") is None:
            continue
        name = (case.get("name") or "").strip()
        if not name:
            continue
        skips.append(
            {
                "test_name": name,
                "reason": "skipped by Jest; the runner does not report why",
                "status": "skipped",
                "source": "jest-junit",
            }
        )
        if len(skips) >= RESULT_COUNT_REPORT_LIMIT:
            break
    return skips


def report_deprecations(results: list[dict[str, object]]) -> None:
    """Print what the toolchain said about deprecated APIs.

    Reporting only. Failing closeout on a warning would make the check fire on
    ordinary work, which is exactly how two earlier attempts at this boundary
    were reverted; the value is that the agent reads the lines and fixes them,
    not that a gate refuses to close.
    """

    flagged = [entry for entry in results if entry.get("deprecations")]
    if not flagged:
        return
    print("\ndeprecations reported by acceptance commands:")
    for entry in flagged:
        print(f"  $ {entry['command']}")
        for line in entry["deprecations"]:  # type: ignore[index]
            print(f"    {line}")


def run_shell(command: str, cwd: pathlib.Path, dry_run: bool) -> str:
    """Run one acceptance command, streaming its output and returning it.

    The output has to stay live — waiting in silence for a long test run is a
    real regression — so this reads the merged stream line by line instead of
    buffering it. Merging stderr into stdout is deliberate: deprecation
    warnings mostly arrive there, and interleaving keeps them next to the step
    that produced them. Exit-code behavior is unchanged.
    """

    print(f"$ {command}")
    if dry_run:
        return ""
    process = subprocess.Popen(
        command,
        shell=True,
        cwd=cwd,
        executable="/bin/bash",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
        bufsize=1,
    )
    captured: list[str] = []
    assert process.stdout is not None
    with process.stdout:
        for line in process.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            captured.append(line)
    if process.wait() != 0:
        raise subprocess.CalledProcessError(process.returncode, command)
    return "".join(captured)


def git_available(repo_root: pathlib.Path) -> bool:
    return subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    ).returncode == 0


def git_diff_text(repo_root: pathlib.Path) -> str:
    result = subprocess.run(
        ["git", "diff", "--unified=0", "HEAD", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        return result.stdout

    fallback = subprocess.run(
        ["git", "diff", "--unified=0", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    return fallback.stdout if fallback.returncode == 0 else ""


def changed_line_debt_hits(repo_root: pathlib.Path) -> list[str]:
    if not git_available(repo_root):
        return []

    hits: list[str] = []
    current_file = "<unknown>"
    for line in git_diff_text(repo_root).splitlines():
        if line.startswith("+++ b/"):
            current_file = line.removeprefix("+++ b/")
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        content = line[1:].strip()
        if any(pattern in content for pattern in DEBT_POLICY_REFERENCE_PATTERNS):
            continue
        if DEBT_MARKER_PATTERN.search(content):
            hits.append(f"{current_file}: {content}")

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if untracked.returncode != 0:
        return hits

    for raw_path in untracked.stdout.splitlines():
        path = repo_root / raw_path
        if not path.is_file():
            continue
        try:
            # Repository exception: binary assets can contain marker bytes that
            # are not actionable source debt.
            with path.open("rb") as candidate:
                if b"\0" in candidate.read(8192):
                    continue
            for line_number, line in enumerate(path.read_text(errors="ignore").splitlines(), start=1):
                if any(pattern in line for pattern in DEBT_POLICY_REFERENCE_PATTERNS):
                    continue
                if DEBT_MARKER_PATTERN.search(line):
                    hits.append(f"{raw_path}:{line_number}: {line.strip()}")
        except OSError:
            continue

    return hits


def explicit_defers_body(repo_root: pathlib.Path, contract: dict[str, object]) -> str:
    handoff_path = repo_root / str(contract.get("handoff_file", ".codex/handoff.md"))
    if not handoff_path.exists():
        return ""

    match = re.search(
        r"^## Explicit defers\s*\n(?P<body>.*?)(?=^## |\Z)",
        handoff_path.read_text(),
        re.MULTILINE | re.DOTALL,
    )
    return match.group("body").strip() if match else ""


def git_changed_files(repo_root: pathlib.Path) -> list[str]:
    if not git_available(repo_root):
        return []

    changed: list[str] = []
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        changed.extend(line.strip() for line in result.stdout.splitlines() if line.strip())

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if untracked.returncode == 0:
        changed.extend(line.strip() for line in untracked.stdout.splitlines() if line.strip())

    return sorted(set(changed))


def stage_summary_text(repo_root: pathlib.Path, stage_id: str) -> str:
    summary = repo_root / ".codex" / "stages" / stage_id / "summary.md"
    if not summary.exists():
        return ""
    return summary.read_text(errors="ignore")


def check_project_index_review(repo_root: pathlib.Path, contract: dict[str, object], stage_id: str) -> None:
    project_index_path = str(contract.get("project_index_file", ".codex/project-index.md"))
    changed = git_changed_files(repo_root)
    if not changed:
        print("project index review OK (no changed files)")
        return

    if project_index_path in changed:
        print("project index review OK (index updated)")
        return

    structural_changes = [
        path
        for path in changed
        if path in STRUCTURAL_CHANGE_FILES
        or any(path.startswith(prefix) for prefix in STRUCTURAL_CHANGE_PREFIXES)
    ]
    if not structural_changes:
        print("project index review OK (no structural changes detected)")
        return

    summary = stage_summary_text(repo_root, stage_id).lower()
    if PROJECT_INDEX_REVIEW_MARKER in summary or DOCS_REVIEW_MARKER in summary:
        print("project index review OK (stage summary records no-change review)")
        return

    print("Structural changes require project index review before stage close:", file=sys.stderr)
    for path in structural_changes[:20]:
        print(f"- {path}", file=sys.stderr)
    if len(structural_changes) > 20:
        print(f"- ... {len(structural_changes) - 20} more", file=sys.stderr)
    print(
        f"Update {project_index_path} or add `{PROJECT_INDEX_REVIEW_MARKER}` to the stage summary with a brief reason.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def documentation_impact(changed: list[str]) -> list[str]:
    if not changed:
        return ["none"]

    categories: set[str] = set()
    non_docs = [
        path
        for path in changed
        if not (
            path.endswith(".md")
            or path.startswith("docs/")
            or path.startswith(".codex/stages/")
            or path == ".codex/handoff.md"
        )
    ]
    if not non_docs:
        return ["docs-only"]

    if all(path.startswith("tests/") or "/tests/" in path or path.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", "_test.py")) for path in non_docs):
        categories.add("tests-only")

    structural = [
        path
        for path in non_docs
        if path in STRUCTURAL_CHANGE_FILES
        or any(path.startswith(prefix) for prefix in STRUCTURAL_CHANGE_PREFIXES)
    ]
    if structural:
        categories.add("structural")

    if any(path.startswith(("migrations/", "db/migrations/", "supabase/migrations/")) for path in non_docs):
        categories.add("migration")

    if any(
        path in {"Dockerfile", "docker-compose.yml", "docker-compose.dev.yml"}
        or path.startswith((".github/workflows/", "deploy/", "infra/", "ops/"))
        for path in non_docs
    ):
        categories.add("ops-deploy")

    if any(
        path.startswith(("api/", "src/api/", "src/server/", "packages/shared", "packages/shared-types"))
        or "contract" in path.lower()
        or "schema" in path.lower()
        for path in non_docs
    ):
        categories.add("api-contract")

    if not categories:
        categories.add("behavior")
    return sorted(categories)


def check_documentation_review(repo_root: pathlib.Path, stage_id: str) -> None:
    changed = git_changed_files(repo_root)
    if not changed:
        print("documentation review OK (no changed files)")
        return

    summary = stage_summary_text(repo_root, stage_id).lower()
    if DOCS_REVIEW_MARKER in summary:
        impact = ", ".join(documentation_impact(changed))
        print(f"documentation review OK ({impact})")
        return

    impact = documentation_impact(changed)
    print("Stage close requires a documentation review marker:", file=sys.stderr)
    print(f"- impact: {', '.join(impact)}", file=sys.stderr)
    print(
        "- add `docs-reviewed: updated - <what changed>` or "
        "`docs-reviewed: no-change-needed - <reason>` to the stage summary",
        file=sys.stderr,
    )
    print("- update stable docs first when the impact changes navigation, contracts, ops, migrations, integrations, or durable behavior", file=sys.stderr)
    raise SystemExit(1)


def check_documentation_decision(
    repo_root: pathlib.Path, stage_id: str, artifacts: list[dict[str, object]]
) -> None:
    """Close the docs preflight loop where the diff can actually depend on it.

    The preflight has an entry obligation and no exit check, so a skipped
    decision leaves no trace. Requiring the marker on every stage would just
    produce a ritual line on local-only work, so this gates on the same impact
    categories the documentation review already computes.
    """

    # `git_changed_files` only sees the working tree, so a stage whose work is
    # already committed would report nothing and pass silently. Stage artifacts
    # record their own changed files and survive the commit.
    changed = set(git_changed_files(repo_root))
    for artifact in artifacts:
        recorded = artifact.get("changed_files")
        if isinstance(recorded, list):
            changed.update(str(raw).strip().replace("\\", "/") for raw in recorded)
    touched_lockfiles = sorted(
        path for path in changed if pathlib.PurePath(path).name in DEPENDENCY_LOCKFILES
    )
    if not touched_lockfiles:
        print("documentation decision not required (no dependency lockfile changed)")
        return

    match = DOCUMENTATION_DECISION_RE.search(stage_summary_text(repo_root, stage_id))
    value = match.group("value").strip().lower() if match else ""
    if value and value not in PLACEHOLDERS:
        print(f"documentation decision OK ({', '.join(touched_lockfiles)})")
        return

    print("Stage close requires a documentation decision marker:", file=sys.stderr)
    print(f"- changed lockfiles: {', '.join(touched_lockfiles)}", file=sys.stderr)
    print(
        "- add `documentation-decision: docs-resolve - <package@version, status>` or "
        "`documentation-decision: no external/versioned boundary - <reason>` "
        "to the stage summary",
        file=sys.stderr,
    )
    raise SystemExit(1)


def has_tracked_defer(body: str) -> bool:
    normalized = body.strip().lower()
    if not normalized or normalized in {"none", "- none"}:
        return False
    return re.search(r"\b(bd|bead|beads|task|tracked)\b", normalized) is not None


def check_debt_markers(repo_root: pathlib.Path, contract: dict[str, object]) -> None:
    debt_scan = contract.get("debt_scan", {})
    if isinstance(debt_scan, dict) and debt_scan.get("enabled") is False:
        print("debt marker scan skipped (debt_scan.enabled = false)")
        return

    hits = changed_line_debt_hits(repo_root)
    if not hits:
        print("debt marker scan OK")
        return

    defer_body = explicit_defers_body(repo_root, contract)
    if has_tracked_defer(defer_body):
        print("debt marker scan OK (tracked defer recorded)")
        return

    print("Changed-line debt markers require action before stage close:", file=sys.stderr)
    for hit in hits[:20]:
        print(f"- {hit}", file=sys.stderr)
    if len(hits) > 20:
        print(f"- ... {len(hits) - 20} more", file=sys.stderr)
    print(
        "Fix the marker or create/update a Beads task and list the defer under ## Explicit defers.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", dest="stage_id")
    parser.add_argument("--level", required=True)
    command_source = parser.add_mutually_exclusive_group()
    command_source.add_argument("--command", action="append", default=[])
    command_source.add_argument("--commands-file")
    parser.add_argument(
        "--process-check",
        action="store_true",
        help="run repository process verification even when orchestration-owned files did not change",
    )
    parser.add_argument(
        "--receipt-suffix",
        help="write/reuse acceptance-receipt.<suffix>.json inside the exact stage directory",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = tomllib.loads((repo_root / ".codex" / "orchestrator.toml").read_text())
    level = normalize_orchestration_level(args.level, legacy_default=False)
    if level == "inner_loop" and args.stage_id:
        raise SystemExit("inner_loop is stage-less; omit --stage")
    artifacts = (
        []
        if level == "inner_loop" or not args.stage_id
        else load_stage_artifacts(repo_root, str(args.stage_id))
    )
    if level != "inner_loop" and not args.stage_id:
        raise SystemExit(f"--stage is required for orchestration level {level}")
    explicit_commands = (
        load_commands_file(repo_root, args.commands_file)
        if args.commands_file
        else list(args.command)
    )
    commands = select_acceptance_commands(
        contract,
        level,
        explicit_commands,
    )

    def run_selected_commands() -> list[dict[str, object]]:
        results: list[dict[str, object]] = []
        for command in commands:
            started = time.monotonic()
            started_wall = time.time()
            output = run_shell(command, repo_root, args.dry_run)
            entry: dict[str, object] = {
                "command": command,
                "result": "dry-run" if args.dry_run else "passed",
                "duration_seconds": round(time.monotonic() - started, 3),
            }
            counts = collect_result_counts(output)
            if counts:
                entry["result_counts"] = counts
            environment_gates = collect_environment_gates(output)
            environment_gates.extend(collect_jest_skips(repo_root, started_wall))
            if environment_gates:
                entry["environment_gates"] = environment_gates
            deprecations = collect_deprecations(output)
            if deprecations:
                entry["deprecations"] = deprecations
            results.append(entry)
        report_deprecations(results)
        return results

    if level == "inner_loop":
        run_selected_commands()
        print("inner_loop verification OK")
        return 0

    stage_id = str(args.stage_id)
    receipt_path = resolve_acceptance_receipt_path(
        repo_root, stage_id, args.receipt_suffix
    )
    with stage_closeout_lock(repo_root, stage_id):
        identity = acceptance_identity(
            repo_root,
            contract,
            stage_id,
            level,
            commands,
            receipt_path.name,
        )
        fingerprint = acceptance_fingerprint(identity)
        receipt = _load_acceptance_receipt(receipt_path, fingerprint)
        if receipt is not None:
            print(f"acceptance receipt reused: {fingerprint}")
            return 0

        baseline = contract.get("baseline")
        stage_state = contract.get("stage_state")
        ran_process_check = args.process_check or process_check_needed(
            artifacts, stage_changed_paths(repo_root, stage_id)
        )
        exact_state_enabled = (
            isinstance(baseline, dict)
            and baseline.get("profile") in {"balanced-v2.18", "balanced-v2.19", "balanced-v2.20"}
        ) or (
            isinstance(stage_state, dict)
            and stage_state.get("exact_identity_required") is True
        )
        if (
            ran_process_check
            and isinstance(baseline, dict)
            and baseline.get("profile") == "balanced-v2.20"
        ):
            sizing_linter = (
                repo_root / "scripts" / "orchestration" / "lint_stage_sizing.py"
            )
            if not sizing_linter.is_file():
                raise SystemExit(f"missing stage sizing linter: {sizing_linter}")
            sizing = subprocess.run(
                [sys.executable, str(sizing_linter), "--stage", stage_id],
                cwd=repo_root,
                text=True,
                capture_output=True,
                check=False,
            )
            if sizing.returncode != 0:
                detail = (sizing.stderr or sizing.stdout).strip()
                raise SystemExit(f"stage sizing mismatch:\n{detail}")
        if exact_state_enabled:
            state_errors = validate_stage_state(repo_root, contract, stage_id)
            if state_errors:
                raise SystemExit("stage state mismatch:\n- " + "\n- ".join(state_errors))
        check_pending_completion_events(
            repo_root,
            contract,
            stage_id,
            exact_identity=exact_state_enabled,
        )
        check_blocking_review_findings(repo_root, contract, stage_id)
        check_child_acceptance_cleanup(artifacts)
        check_project_index_review(repo_root, contract, stage_id)
        check_documentation_review(repo_root, stage_id)
        check_documentation_decision(repo_root, stage_id, artifacts)
        check_debt_markers(repo_root, contract)
        started_at = datetime.now(timezone.utc)
        results = run_selected_commands()

        if ran_process_check:
            enforcement = contract.get("enforcement", {})
            if not isinstance(enforcement, dict):
                enforcement = {}
            entrypoint = enforcement.get(
                "process_verification_entrypoint",
                "scripts/orchestration/run_process_verification.sh",
            )
            if not isinstance(entrypoint, str) or not entrypoint:
                raise SystemExit("Missing process_verification_entrypoint")
            cmd = [str(repo_root / entrypoint), "--stage", stage_id]
            print("$ " + " ".join(cmd))
            if not args.dry_run:
                subprocess.run(cmd, cwd=repo_root, check=True)

        check_pending_completion_events(
            repo_root,
            contract,
            stage_id,
            exact_identity=exact_state_enabled,
        )
        check_blocking_review_findings(repo_root, contract, stage_id)
        if not args.dry_run:
            _save_acceptance_receipt(
                receipt_path,
                {
                    "schema_version": "acceptance-receipt/v1",
                    "idempotency_key": fingerprint,
                    **identity,
                    "verification_fingerprint": fingerprint,
                    "result": "passed",
                    "started_at": started_at.isoformat(),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "command_results": results,
                    "process_check": "passed" if ran_process_check else "not-needed",
                },
            )
    print("stage closeout verification OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
