#!/usr/bin/env python3
"""Inspect and update the repo-local delegated completion inbox."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
import os
import pathlib
import subprocess
import sys
import tomllib
from datetime import datetime, timezone

ALLOWED_DECISIONS = {
    "accepted",
    "needs_rework_same_stream",
    "needs_new_stream",
    "blocked",
    "invalid_return",
}
ALLOWED_SEVERITIES = {"P0", "P1", "P2", "P3"}


def load_contract() -> dict:
    return tomllib.loads(pathlib.Path(".codex/orchestrator.toml").read_text())


def require_string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise SystemExit(f"missing required contract field: {name}")
    return value


def resolve_runtime_path(repo_root: pathlib.Path, inbox: dict, key: str) -> pathlib.Path:
    raw_path = pathlib.Path(require_string(inbox.get(key), f"completion_inbox.{key}"))
    scope = inbox.get("scope", "repo_root")
    if scope == "git_common_dir":
        common_dir_raw = subprocess.check_output(
            ["git", "rev-parse", "--git-common-dir"],
            cwd=repo_root,
            text=True,
        ).strip()
        common_dir = pathlib.Path(common_dir_raw)
        if not common_dir.is_absolute():
            common_dir = (repo_root / common_dir).resolve()
        return common_dir / raw_path
    return repo_root / raw_path


def exact_identity_required(contract: dict) -> bool:
    baseline = contract.get("baseline")
    stage_state = contract.get("stage_state")
    return (
        isinstance(baseline, dict)
        and baseline.get("profile") in {"balanced-v2.18", "balanced-v2.19", "balanced-v2.20"}
    ) or (
        isinstance(stage_state, dict)
        and stage_state.get("exact_identity_required") is True
    )


def parse_artifact_metadata(path: pathlib.Path) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SystemExit(f"cannot read event artifact {path}: {exc}") from exc
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise SystemExit(f"event artifact lacks YAML frontmatter: {path}")
    frontmatter = text[4 : text.find("\n---\n", 4)]
    values: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if line.startswith(" ") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        if value.strip():
            values[key.strip()] = value.strip()
    task_id = values.get("task_id", "")
    stage_id = values.get("stage_id", "")
    if not task_id or not stage_id:
        raise SystemExit(f"event artifact must declare task_id and stage_id: {path}")
    return values


def require_current_stream_aggregation(
    repo_root: pathlib.Path,
    contract: dict,
    artifact: pathlib.Path,
    metadata: dict[str, str],
) -> None:
    baseline = contract.get("baseline")
    if not isinstance(baseline, dict) or baseline.get("profile") != "balanced-v2.20":
        return
    stage_id = metadata["stage_id"]
    manifest_path = repo_root / ".codex" / "stages" / stage_id / "stage-manifest.json"
    sizing = contract.get("stage_sizing")
    legacy = sizing.get("legacy_active_stage_id") if isinstance(sizing, dict) else None
    if not manifest_path.is_file():
        if legacy == stage_id:
            return
        raise SystemExit(f"new v2.20 delegated stage {stage_id!r} requires a stage manifest")
    if metadata.get("schema_version") != "orchestration-artifact/v3":
        raise SystemExit("newly reported delegated artifacts in a v2.20 stage must use orchestration-artifact/v3")
    if metadata.get("stage_manifest") != f".codex/stages/{stage_id}/stage-manifest.json":
        raise SystemExit("event artifact stage_manifest does not match the owning stage")
    stream_owner = metadata.get("stream_owner")
    if not stream_owner:
        raise SystemExit("event v3 artifact must declare stream_owner")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read owning stage manifest: {exc}") from exc
    entries = manifest.get("stream_artifacts") if isinstance(manifest, dict) else None
    relative = artifact.relative_to(repo_root).as_posix()
    matching = [
        entry
        for entry in entries
        if isinstance(entry, dict)
        and entry.get("artifact_path") == relative
        and entry.get("task_id") == metadata.get("task_id")
        and entry.get("stream_owner") == stream_owner
    ] if isinstance(entries, list) else []
    if len(matching) != 1:
        raise SystemExit("event v3 artifact is unlisted or mismatched in the owning stage manifest")


def require_exact_events(
    repo_root: pathlib.Path,
    contract: dict,
    events: list[dict],
    events_file: pathlib.Path,
    state_file: pathlib.Path,
) -> str:
    workspace = contract.get("workspace")
    stage_id = workspace.get("current_stage_id") if isinstance(workspace, dict) else None
    if not isinstance(stage_id, str) or not stage_id:
        raise SystemExit("exact inbox review requires workspace.current_stage_id")
    for label, path in (
        ("completion_inbox.events_file", events_file),
        ("completion_inbox.review_state_file", state_file),
    ):
        if path.parent.name != stage_id or path.parent.parent.name != "stages":
            raise SystemExit(f"{label} is outside exact stage root for {stage_id}: {path}")
    artifacts_root = (
        repo_root / ".codex" / "stages" / stage_id / "artifacts"
    ).resolve()
    for event in events:
        event_id = event.get("event_id")
        task_id = event.get("task_id")
        if not isinstance(event_id, str) or not event_id:
            raise SystemExit("completion event is missing event_id")
        if not isinstance(task_id, str) or not task_id:
            raise SystemExit(f"completion event {event_id!r} is missing task_id")
        if event.get("stage_id") != stage_id:
            raise SystemExit(
                f"completion event {event_id!r} stage does not match {stage_id!r}"
            )
        raw_artifact = event.get("artifact_path")
        if not isinstance(raw_artifact, str) or not raw_artifact:
            raise SystemExit(f"completion event {event_id!r} is missing artifact_path")
        relative = pathlib.Path(raw_artifact)
        if relative.is_absolute() or ".." in relative.parts:
            raise SystemExit(
                f"completion event {event_id!r} artifact_path must be repo-relative"
            )
        candidate = repo_root / relative
        for component in (candidate, *candidate.parents):
            if component.is_symlink():
                raise SystemExit(
                    f"completion event {event_id!r} artifact_path traverses a symlink"
                )
            if component == repo_root:
                break
        try:
            artifact = candidate.resolve(strict=True)
        except OSError as exc:
            raise SystemExit(
                f"completion event {event_id!r} artifact does not exist"
            ) from exc
        if artifact.parent != artifacts_root:
            raise SystemExit(
                f"completion event {event_id!r} artifact escapes exact stage root"
            )
        metadata = parse_artifact_metadata(artifact)
        artifact_task = metadata["task_id"]
        artifact_stage = metadata["stage_id"]
        if artifact_task != task_id or artifact_stage != stage_id:
            raise SystemExit(
                f"completion event {event_id!r} task/stage does not match artifact frontmatter"
            )
        require_current_stream_aggregation(repo_root, contract, artifact, metadata)
    return stage_id


def load_events(path: pathlib.Path) -> list[dict]:
    if not path.exists():
        return []
    events: list[dict] = []
    for raw_line in path.read_text().splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        events.append(json.loads(raw_line))
    return events


def load_state(path: pathlib.Path) -> dict:
    if not path.exists():
        return {"reviewed": {}}
    try:
        state = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read review state {path}: {exc}") from exc
    if not isinstance(state, dict) or not isinstance(state.get("reviewed"), dict):
        raise SystemExit(f"review state {path} must contain a reviewed object")
    return state


def save_state(path: pathlib.Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(state, indent=2, ensure_ascii=True) + "\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def state_lock(path: pathlib.Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def correction_limit(contract: dict) -> int | None:
    limits = contract.get("stage_limits")
    if not isinstance(limits, dict):
        return None
    value = limits.get("max_correction_loops")
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def prior_p2_corrections(reviewed: dict[str, dict], event: dict) -> int:
    return sum(
        1
        for entry in reviewed.values()
        if entry.get("task_id") == event.get("task_id")
        and entry.get("stage_id") == event.get("stage_id")
        and entry.get("decision") == "needs_rework_same_stream"
        and entry.get("severity", "P2") not in {"P0", "P1"}
    )


def print_text(events: list[dict], reviewed: dict[str, dict]) -> None:
    pending = [event for event in events if event["event_id"] not in reviewed]
    print(f"total_events: {len(events)}")
    print(f"pending_events: {len(pending)}")
    if not pending:
        print("pending: none")
        return
    print("pending:")
    for event in pending:
        print(
            "- "
            f"{event['event_id']} | task={event['task_id']} | stage={event['stage_id']} | "
            f"status={event['status']} | verify={event['verify']} | artifact={event['artifact_path']}"
        )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--task")
    parser.add_argument("--mark-reviewed")
    parser.add_argument("--decision", choices=sorted(ALLOWED_DECISIONS))
    parser.add_argument("--severity", choices=sorted(ALLOWED_SEVERITIES))
    parser.add_argument("--resolves-review", action="append", default=[])
    parser.add_argument("--note", default="")
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = load_contract()
    inbox = contract.get("completion_inbox")
    if not isinstance(inbox, dict):
        raise SystemExit("missing [completion_inbox] section in .codex/orchestrator.toml")

    events_file = resolve_runtime_path(repo_root, inbox, "events_file")
    state_file = resolve_runtime_path(repo_root, inbox, "review_state_file")

    events = load_events(events_file)
    if exact_identity_required(contract):
        require_exact_events(repo_root, contract, events, events_file, state_file)
    if args.task:
        events = [event for event in events if event.get("task_id") == args.task]

    if args.mark_reviewed:
        with state_lock(state_file):
            state = load_state(state_file)
            reviewed = state["reviewed"]
            if not args.decision:
                raise SystemExit("--decision is required with --mark-reviewed")
            matching = [event for event in events if event.get("event_id") == args.mark_reviewed]
            if not matching:
                raise SystemExit(f"event not found: {args.mark_reviewed}")
            if args.mark_reviewed in reviewed:
                raise SystemExit(f"event already reviewed and immutable: {args.mark_reviewed}")
            if args.decision == "accepted" and args.severity:
                raise SystemExit("accepted correction events must omit --severity and link resolved findings")
            if args.decision == "accepted" and (
                matching[0].get("status") != "returned" or matching[0].get("verify") != "passed"
            ):
                raise SystemExit("accepted correction events require returned status and passed verification")

            event_links = matching[0].get("resolves_review", [])
            if not isinstance(event_links, list) or not all(isinstance(link, str) and link for link in event_links):
                raise SystemExit("event resolves_review must be a list of non-empty event ids")
            resolution_links = list(dict.fromkeys([*event_links, *args.resolves_review]))
            if args.decision != "accepted" and resolution_links:
                raise SystemExit("--resolves-review is allowed only with --decision accepted")
            for finding_id in resolution_links:
                finding = reviewed.get(finding_id)
                if not isinstance(finding, dict):
                    raise SystemExit(f"resolved review finding is not reviewed: {finding_id}")
                if finding.get("stage_id") != matching[0].get("stage_id"):
                    raise SystemExit(f"resolved review finding is outside this stage: {finding_id}")

            severity = args.severity or ("P2" if args.decision == "needs_rework_same_stream" else "")
            limit = correction_limit(contract)
            if (
                args.decision == "needs_rework_same_stream"
                and severity not in {"P0", "P1"}
                and limit is not None
                and prior_p2_corrections(reviewed, matching[0]) >= limit
            ):
                raise SystemExit(
                    "P2+ correction loop cap reached; use needs_new_stream and replan the next stage"
                )
            reviewed[args.mark_reviewed] = {
                "decision": args.decision,
                "severity": severity,
                "resolves_review": resolution_links,
                "correction_round": prior_p2_corrections(reviewed, matching[0]) + 1
                if args.decision == "needs_rework_same_stream" and severity not in {"P0", "P1"}
                else 0,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "note": args.note,
                "task_id": matching[0].get("task_id"),
                "stage_id": matching[0].get("stage_id"),
                "artifact_path": matching[0].get("artifact_path"),
                "verify": matching[0].get("verify"),
            }
            save_state(state_file, state)
    else:
        state = load_state(state_file)
        reviewed = state["reviewed"]

    payload = {
        "events": events,
        "reviewed": reviewed,
        "pending": [event for event in events if event["event_id"] not in reviewed],
    }

    if args.as_json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        print_text(events, reviewed)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
