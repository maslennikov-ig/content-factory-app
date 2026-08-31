#!/usr/bin/env python3
"""Record a delegated child completion event in the repo-local inbox."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import tomllib
import uuid
from datetime import datetime, timezone

ALLOWED_STATUS = {"returned", "blocked"}
ALLOWED_VERIFY = {"passed", "failed", "blocked"}
ALLOWED_CLEAN = {"yes", "no"}


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
        raise SystemExit(f"cannot read artifact {path}: {exc}") from exc
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise SystemExit(f"artifact lacks YAML frontmatter: {path}")
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
        raise SystemExit(f"artifact must declare task_id and stage_id: {path}")
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
    expected_manifest = f".codex/stages/{stage_id}/stage-manifest.json"
    if metadata.get("stage_manifest") != expected_manifest:
        raise SystemExit("artifact stage_manifest does not match the owning stage")
    stream_owner = metadata.get("stream_owner")
    if not stream_owner:
        raise SystemExit("v3 artifact must declare stream_owner")
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
        raise SystemExit("v3 artifact is unlisted or mismatched in the owning stage manifest")


def require_exact_artifact(
    repo_root: pathlib.Path,
    contract: dict,
    task_id: str,
    stage_id: str,
    raw_artifact: str,
) -> pathlib.Path:
    workspace = contract.get("workspace")
    current_stage = workspace.get("current_stage_id") if isinstance(workspace, dict) else None
    if current_stage != stage_id:
        raise SystemExit(
            f"reported stage {stage_id!r} does not match workspace.current_stage_id {current_stage!r}"
        )
    stage_root = (repo_root / ".codex" / "stages" / stage_id).resolve()
    artifacts_root = stage_root / "artifacts"
    candidate = pathlib.Path(raw_artifact)
    if not candidate.is_absolute():
        candidate = repo_root / candidate
    for component in (candidate, *candidate.parents):
        if component.is_symlink():
            raise SystemExit(f"artifact path may not traverse a symlink: {raw_artifact}")
        if component == repo_root:
            break
    try:
        artifact = candidate.resolve(strict=True)
    except OSError as exc:
        raise SystemExit(f"artifact path does not exist: {raw_artifact}") from exc
    if artifact.parent != artifacts_root:
        raise SystemExit(
            f"artifact must be a direct file in configured stage root {artifacts_root}: {artifact}"
        )
    metadata = parse_artifact_metadata(artifact)
    artifact_task = metadata["task_id"]
    artifact_stage = metadata["stage_id"]
    if artifact_task != task_id or artifact_stage != stage_id:
        raise SystemExit(
            "completion identity mismatch: "
            f"CLI task/stage={task_id}/{stage_id}, "
            f"artifact task/stage={artifact_task}/{artifact_stage}"
        )
    require_current_stream_aggregation(repo_root, contract, artifact, metadata)
    return artifact


def require_stage_runtime_path(path: pathlib.Path, stage_id: str, label: str) -> None:
    parent = path.parent
    if parent.name != stage_id or parent.parent.name != "stages":
        raise SystemExit(
            f"{label} must be inside the exact configured stage root for {stage_id}: {path}"
        )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--status", required=True, choices=sorted(ALLOWED_STATUS))
    parser.add_argument("--commit", default="n/a")
    parser.add_argument("--verify", required=True, choices=sorted(ALLOWED_VERIFY))
    parser.add_argument("--clean", required=True, choices=sorted(ALLOWED_CLEAN))
    parser.add_argument("--sender", default="codex-subagent")
    parser.add_argument("--note", default="")
    parser.add_argument("--agent-type", default="")
    parser.add_argument("--model", default="")
    parser.add_argument("--reasoning-effort", default="")
    parser.add_argument("--write-zone", action="append", default=[])
    parser.add_argument("--selected-asset", action="append", default=[])
    parser.add_argument("--resolves-review", action="append", default=[])
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = load_contract()
    inbox = contract.get("completion_inbox")
    if not isinstance(inbox, dict):
        raise SystemExit("missing [completion_inbox] section in .codex/orchestrator.toml")

    events_file = resolve_runtime_path(repo_root, inbox, "events_file")
    if exact_identity_required(contract):
        artifact_path = require_exact_artifact(
            repo_root, contract, args.task, args.stage, args.artifact
        )
        require_stage_runtime_path(
            events_file, args.stage, "completion_inbox.events_file"
        )
        artifact_display = artifact_path.relative_to(repo_root).as_posix()
    else:
        artifact_path = pathlib.Path(args.artifact)
        if not artifact_path.exists():
            raise SystemExit(f"artifact path does not exist: {artifact_path}")
        artifact_display = str(artifact_path)

    events_file.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "event_id": str(uuid.uuid4()),
        "reported_at": datetime.now(timezone.utc).isoformat(),
        "task_id": args.task,
        "stage_id": args.stage,
        "stream_id": args.task,
        "status": args.status,
        "artifact_path": artifact_display,
        "commit": args.commit,
        "verify": args.verify,
        "clean": args.clean,
        "sender": args.sender,
        "note": args.note,
        "agent_type": args.agent_type,
        "model": args.model,
        "reasoning_effort": args.reasoning_effort,
        "write_zone": args.write_zone,
        "selected_assets": args.selected_asset,
        "resolves_review": args.resolves_review,
    }

    with events_file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")

    print(
        "completion event recorded: "
        f"{payload['event_id']} {payload['task_id']} {payload['status']} {payload['artifact_path']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
